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
	"io"
	"os"
	"regexp"
	"strings"

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
	SimpleRegP1 string
	SimpleRegP2 int
	SimpleRegP3 string
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

// DefaultRegExps 是 AutoMark=true 时使用的内建章节识别正则列表。
// 与样例 epub 输出对照后整理得到。
var DefaultRegExps = []string{
	`^\s*(简介|作品简评|文案|楔子|第\s*[一二三四五六七八九十零〇百千两1234567890]+\s*卷|第\s*[1234567890一二三四五六七八九十零〇百千两]+\s*章|正文|后记|番外|引子|作品强推|内容简介|编辑评价|☆|编辑推荐|作者简介|文案|上部|下部)`,
	`^\s*[第卷][0123456789一二三四五六七八九十零〇百千两]*[章回部节集卷].*`,
	`^\s*Chapter\s*[0123456789]*`,
	`^\s*(序言?|序[1-9]|序曲|后记|尾声|前言|自序|附录|楔子|引子|番外)`,
	`^\s*(前言|自序|附录)`,
}

// Parse 解析 txt 文本，返回章节列表。
// text 应已是 UTF-8、行尾已规范化的文本。
func Parse(text string, opt Options) ([]Chapter, error) {
	text = util.NormalizeEOL(text)
	lines := strings.Split(text, "\n")

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
		if (len(body) > 0 || opt.ForceEmptyChapter) || m.title != "" {
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
	out := marks[:1]
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
func assembleBody(lines []string, start, end int, opt Options) []string {
	if start < 0 {
		start = 0
	}
	if end > len(lines) {
		end = len(lines)
	}
	if start >= end {
		return nil
	}
	var body []string
	for i := start; i < end; i++ {
		line := strings.TrimRight(lines[i], "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if opt.RemoveBlankLine {
				continue
			}
			if opt.AddSpace && len(body) > 0 {
				for j := 0; j < opt.AddSpaceCount; j++ {
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

// ScanLines 按行扫描大文件，避免一次性读入内存。
// 当前实现仍走 ReadFile，因为 EasyPub 单 TXT 通常 < 10MB。
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
