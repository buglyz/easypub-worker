// Package txt 负责将原始 TXT 文本解析为章节列表。
//
// 切章逻辑与 EasyPub v1.50 一致：
//   - 支持三种正则来源：预定义(simple_reg_*)、完整正则(full_reg)、预定义标题附加(AdditionalReg)
//   - 支持自动识别(automark)：内建一组常见中文小说章节正则
//   - 支持删除空行(removeblankline)
//   - 段落保留首行全角空格(\u3000) 作为缩进
//   - 段间可加空行(addspace)
package txt

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/easypub/go-easypub/internal/util"
)

// Chapter 是切分后的一章。
type Chapter struct {
	// Title 章节标题，已去前后空白。若整章无标题则为空。
	Title string
	// Body 段落列表(已转义、已规范化)，每个元素对应一个 <p>。
	Body []string
}

// Options 控制解析行为。
type Options struct {
	// SplitMode: 0=按正则切, 1=按字数切, 2=不分章(整本一章)
	SplitMode int
	// SplitCount 按 SplitMode=1 时的每章字数。
	SplitCount int
	// FullReg 完整正则模式串。非空则优先使用。
	FullReg string
	// SimpleRegP1/P2/P3 简易正则三段式：第段(P1) + 数字(P2: 0=阿拉伯,1=中文) + 尾段(P3)
	SimpleRegP1  string
	SimpleRegP2  int
	SimpleRegP3  string
	SimpleRegExt string
	// SimpleRegLeadingSpace 简易正则是否允许行首空白。
	SimpleRegLeadingSpace bool
	// AdditionalReg 预定义标题附加表达式列表。
	AdditionalReg []string
	// AutoMark 自动识别开关。
	AutoMark bool
	// RemoveBlankLine 删除空行。
	RemoveBlankLine bool
	// AddSpace 段间加空行。
	AddSpace bool
	// AddSpaceCount 空行数量。
	AddSpaceCount int
	// ForceEmptyChapter 即使正文为空也保留章节。
	ForceEmptyChapter bool
}

// seg 是一个章节切分点。
type seg struct {
	title string
	start int
}

// cnNum 中文/阿拉伯章节数字字符类（含大写数字与〇）。
const cnNum = `0-9零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟`

// DefaultRegExps 是 AutoMark=true 时使用的内建章节识别正则列表。
// 设计原则：
//  1. 整行匹配（^...$），标题行通常较短；
//  2. 「回/节/部/集/卷/幕/讲」后须分隔符或行尾，避免「第三回合/第一节课」误切；
//  3. 「章/话/篇」允许无空格短标题（如「第1章开端」），但禁句末标点；
//  4. 覆盖网文/出版/英文常见格式，含装饰括号与固定特称。
var DefaultRegExps = []string{
	// —— 固定特称 / 书衣信息（可带短副标题）——
	`^\s*[【\[\(（「『]?[☆★※◆■●▲▼＊*]*\s*(内容简介|作品简介|作品简评|作品相关|作品强推|作者简介|编辑推荐|编辑评价|文案|简介|导读|楔子|引子|引言|前言|自序|代序|序章|序言?|序曲|序[0-9` + cnNum + `]|正文|后记|尾声|终章|终卷|结局|番外篇?|外传|特别篇|加笔|感言|完结感言|作者的话|写在前面|写在后面|写在最后|附录|卷首语?|卷末|上部|中部|下部|上篇|中篇|下篇|第一部|第二部|第三部|第四部|第五部)\s*[】\]\)）」』]?[☆★※◆■●▲▼＊*]*([:：、．.·—\-~\s　].{0,40})?$`,

	// —— 第N章 / 第N话 / 第N篇（允许无空格短标题，禁句号）——
	`^\s*[【\[\(（「『]?第\s*[` + cnNum + `]+\s*[章话篇][】\]\)）」』]?([:：、．.·—\-~\s　].{0,40}|[^。！？!?；;\n]{0,30})?$`,

	// —— 第N回/节/部/集/卷/幕/讲（必须分隔或行尾，防「回合/节课」）——
	`^\s*[【\[\(（「『]?第\s*[` + cnNum + `]+\s*[回节部集卷幕讲][】\]\)）」』]?([:：、．.·—\-~\s　].{0,40})?$`,

	// —— 第N部分 ——
	`^\s*[【\[\(（「『]?第\s*[` + cnNum + `]+\s*部分[】\]\)）」』]?([:：、．.·—\-~\s　].{0,40})?$`,

	// —— 卷N / 卷N 标题（无「第」）——
	`^\s*[【\[\(（「『]?卷\s*[` + cnNum + `]+[】\]\)）」』]?([:：、．.·—\-~\s　].{0,40})?$`,

	// —— 卷之一 / 章之一 等文言编号 ——
	`^\s*[【\[\(（「『]?[章节卷]\s*之\s*[` + cnNum + `]+[】\]\)）」』]?([:：、．.·—\-~\s　].{0,40})?$`,

	// —— 英文 Chapter / Ch. / CHAPTER + 阿拉伯或罗马数字 ——
	`(?i)^\s*Chapter\s+[0-9IVXLCDMivxlcdm]+([:：.·—\-~\s].{0,60})?$`,
	`(?i)^\s*Ch\.?\s*[0-9IVXLCDMivxlcdm]+([:：.·—\-~\s].{0,60})?$`,

	// —— 英文 Part / Volume / Vol. ——
	`(?i)^\s*Part\s+[0-9IVXLCDMivxlcdm]+([:：.·—\-~\s].{0,60})?$`,
	`(?i)^\s*(Volume|Vol\.?)\s*[0-9IVXLCDMivxlcdm]+([:：.·—\-~\s].{0,60})?$`,

	// —— 英文固定特称 ——
	`(?i)^\s*(Prologue|Epilogue|Interlude|Afterword|Preface|Foreword|Appendix|Introduction|Postscript|Extra|Side\s*Story)([:：.·—\-~\s].{0,60})?$`,
}

// Parse 解析 txt 文本，返回章节列表。
// text 应已是 UTF-8、行尾已规范化的文本。
func Parse(text string, opt Options) ([]Chapter, error) {
	// SplitMode 校验：只允许 0/1/2。
	switch opt.SplitMode {
	case 0, 1, 2:
	default:
		return nil, fmt.Errorf("invalid SplitMode %d (允许 0=正则切, 1=按字数切, 2=整本一章)", opt.SplitMode)
	}

	text = util.NormalizeEOL(text)
	lines := strings.Split(text, "\n")

	if opt.SplitMode == 2 {
		return []Chapter{{
			Title: "",
			Body:  assembleBody(lines, 0, len(lines), opt),
		}}, nil
	}

	if opt.SplitMode == 1 {
		return splitByCount(lines, opt), nil
	}

	// 构建章节切分正则集合。
	pats := buildPatterns(opt)

	var marks []seg
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		for _, p := range pats {
			if p.MatchString(line) || p.MatchString(trim) {
				marks = append(marks, seg{title: trim, start: i})
				break
			}
		}
	}

	// 无标记：整本作为一章。
	if len(marks) == 0 {
		body := assembleBody(lines, 0, len(lines), opt)
		return []Chapter{{Title: "", Body: body}}, nil
	}

	// 去重相邻同标题(同一行被多个正则命中)。
	marks = dedupMarks(marks)

	var chapters []Chapter
	// 标题前的引子段落(若有)单独成章。
	if marks[0].start > 0 {
		body := assembleBody(lines, 0, marks[0].start, opt)
		if len(body) > 0 || opt.ForceEmptyChapter {
			chapters = append(chapters, Chapter{Title: "", Body: body})
		}
	}
	for i, m := range marks {
		end := len(lines)
		if i+1 < len(marks) {
			end = marks[i+1].start
		}
		body := assembleBody(lines, m.start+1, end, opt)
		// 标题行本身若非空也作为正文首段保留(如"序"作为正文首行)。
		// 与样例 epub 对照：chapter0.html 含 "序" 标题且 body 为"书名/作者/简介"，标题行不进 body。
		// 空章保留与否完全由 ForceEmptyChapter 决定，标题命中不再例外强留，
		// 避免 ForceEmptyChapter=false 时仍残留"有标题但 body 为空"的章节。
		if len(body) > 0 || opt.ForceEmptyChapter {
			chapters = append(chapters, Chapter{Title: m.title, Body: body})
		}
	}
	if len(chapters) == 0 {
		body := assembleBody(lines, 0, len(lines), opt)
		return []Chapter{{Title: "", Body: body}}, nil
	}
	return chapters, nil
}

func buildPatterns(opt Options) []*regexp.Regexp {
	var pats []*regexp.Regexp
	if opt.FullReg != "" {
		if p, err := regexp.Compile(opt.FullReg); err == nil {
			pats = append(pats, p)
		}
	}
	if opt.SimpleRegP1 != "" || opt.SimpleRegP3 != "" {
		p := buildSimplePattern(opt)
		if p != nil {
			pats = append(pats, p)
		}
	}
	for _, s := range opt.AdditionalReg {
		if s == "" {
			continue
		}
		if p, err := regexp.Compile(s); err == nil {
			pats = append(pats, p)
		}
	}
	if opt.AutoMark || len(pats) == 0 {
		for _, s := range DefaultRegExps {
			if p, err := regexp.Compile(s); err == nil {
				pats = append(pats, p)
			}
		}
	}
	return pats
}

// buildSimplePattern 由简易三段式参数合成正则。
// P1=前段字符类(如 [第卷])，P2=数字风格(0=阿拉伯,1=中文)，P3=尾段字符类(如 [章回卷节集部])。
// SimpleRegExt 为附加在尾段后的扩展字符。
func buildSimplePattern(opt Options) *regexp.Regexp {
	p1 := opt.SimpleRegP1
	if p1 == "" {
		return nil
	}
	digits := "0123456789"
	if opt.SimpleRegP2 == 1 {
		digits = "一二三四五六七八九十零〇百千两"
	}
	p3 := opt.SimpleRegP3
	if opt.SimpleRegExt != "" {
		p3 = "[" + stripClass(p3) + stripClass(opt.SimpleRegExt) + "]"
	}
	lead := ""
	if opt.SimpleRegLeadingSpace {
		lead = `\s*`
	}
	expr := lead + `^\s*` + p1 + "[" + digits + "]+" + p3 + `.*`
	p, err := regexp.Compile(expr)
	if err != nil {
		return nil
	}
	return p
}

// stripClass 从 "[章回卷节集部]" 形式提取内部字符。
func stripClass(s string) string {
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	return s
}

func dedupMarks(marks []seg) []seg {
	if len(marks) == 0 {
		return marks
	}
	// 使用独立底层数组，避免污染调用方切片(防御性)。
	out := make([]seg, 0, len(marks))
	out = append(out, marks[0])
	for _, m := range marks[1:] {
		if m.start == out[len(out)-1].start {
			continue
		}
		out = append(out, m)
	}
	return out
}

// assembleBody 把 lines[start:end] 收尾剪掉空行后，按段组装。
// 每个 <p> 对应一行(或合并连续非空行)。
// 返回 []string{} 而非 nil 以保持空集合语义一致(避免下游 JSON 序列化或 len 比较出现 null/[] 漂移)。
func assembleBody(lines []string, start, end int, opt Options) []string {
	if start < 0 {
		start = 0
	}
	if end > len(lines) {
		end = len(lines)
	}
	body := []string{}
	if start >= end {
		return body
	}
	for i := start; i < end; i++ {
		line := strings.TrimRight(lines[i], "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if opt.RemoveBlankLine {
				continue
			}
			if opt.AddSpace && len(body) > 0 {
				addCount := opt.AddSpaceCount
				if addCount <= 0 {
					addCount = 1
				}
				for j := 0; j < addCount; j++ {
					body = append(body, "")
				}
				continue
			}
			body = append(body, "")
			continue
		}
		body = append(body, util.EscapeText(line))
	}
	// 去掉末尾空段。
	for len(body) > 0 && strings.TrimSpace(body[len(body)-1]) == "" {
		body = body[:len(body)-1]
	}
	return body
}

// splitByCount 按 SplitCount 字数切章：累加每行有效字符数(排除空白行/全角空格)，
// 达到阈值即截断成新章。首段为前置引子，无标记标题。
// 与 EasyPub v1.50 "按字数分章" 行为对齐。
func splitByCount(lines []string, opt Options) []Chapter {
	count := opt.SplitCount
	if count <= 0 {
		// 未配置字数阈值：退化为整本一章，避免无意义切分。
		return []Chapter{{Title: "", Body: assembleBody(lines, 0, len(lines), opt)}}
	}
	var chapters []Chapter
	var curStart int
	var curCount int
	flush := func(end int) {
		body := assembleBody(lines, curStart, end, opt)
		if len(body) > 0 || opt.ForceEmptyChapter {
			chapters = append(chapters, Chapter{Title: "", Body: body})
		}
		curStart = end
		curCount = 0
	}
	for i := 0; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		// 有效字数：去全角空格首行缩进后的实际字符数。
		stripped := strings.TrimLeft(trimmed, "\u3000 ")
		curCount += utf8.RuneCountInString(stripped)
		if curCount >= count && i+1 < len(lines) {
			flush(i + 1)
		}
	}
	flush(len(lines))
	if len(chapters) == 0 {
		chapters = append(chapters, Chapter{Title: "", Body: assembleBody(lines, 0, len(lines), opt)})
	}
	return chapters
}

// ReadFile 便捷读取并自动探测编码。
func ReadFile(path string) (string, error) {
	b, err := readFile(path)
	if err != nil {
		return "", err
	}
	s, _, err := util.DetectAndDecode(b)
	return s, err
}

// ReadFileEncoded 读取文件并自动探测编码，额外返回编码名称。
func ReadFileEncoded(path string) (text, enc string, err error) {
	b, err := readFile(path)
	if err != nil {
		return "", "", err
	}
	return util.DetectAndDecode(b)
}

// ScanLines 按行返回文本。当前实现走 ReadFile 全量读入再按行切分，
// 适合 EasyPub 单 TXT 通常 <10MB 的场景；超大文件请用 ReadFileEncoded 配合流式处理。
func ScanLines(path string) ([]string, error) {
	s, err := ReadFile(path)
	if err != nil {
		return nil, err
	}
	s = util.NormalizeEOL(s)
	return strings.Split(s, "\n"), nil
}

// readFile 在 util 之外独立以便循环依赖最小。
func readFile(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var buf bytes.Buffer
	w := bufio.NewWriter(&buf)
	if _, err := io.Copy(w, f); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
