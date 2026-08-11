package txt

import (
	"regexp"
	"strings"
	"testing"
)

func TestParse_SimpleChapters(t *testing.T) {
	text := "序\n" +
		"　　书名：测试\n" +
		"　　作者：测试者\n" +
		"第1章 开端\n" +
		"　　段落一。\n" +
		"第2章 发展\n" +
		"　　段落二。\n"
	opt := Options{AutoMark: true, RemoveBlankLine: true, ForceEmptyChapter: true}
	chs, err := Parse(text, opt)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(chs) != 3 {
		t.Fatalf("期望 3 章,得到 %d", len(chs))
	}
	if chs[0].Title != "序" {
		t.Errorf("第1章标题: 期望 '序',得到 '%s'", chs[0].Title)
	}
	if chs[1].Title != "第1章 开端" {
		t.Errorf("第2章标题: 期望 '第1章 开端',得到 '%s'", chs[1].Title)
	}
	if chs[2].Title != "第2章 发展" {
		t.Errorf("第3章标题: 期望 '第2章 发展',得到 '%s'", chs[2].Title)
	}
	if len(chs[1].Body) != 1 {
		t.Errorf("第2章正文段数: 期望 1,得到 %d", len(chs[1].Body))
	}
	if !strings.Contains(chs[1].Body[0], "段落一") {
		t.Errorf("第2章正文: 期望含 '段落一',得到 '%s'", chs[1].Body[0])
	}
}

func TestParse_NoMarks_FallsBackToOneChapter(t *testing.T) {
	text := "　　这是一段没有章节标记的文本。\n　　第二行。\n"
	chs, err := Parse(text, Options{AutoMark: false})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(chs) != 1 {
		t.Fatalf("期望 1 章(无标记),得到 %d", len(chs))
	}
	if len(chs[0].Body) != 2 {
		t.Errorf("正文段数: 期望 2,得到 %d", len(chs[0].Body))
	}
}

func TestParse_WholeBookMode(t *testing.T) {
	text := "第1章 开端\n正文一\n第2章 结尾\n正文二\n"
	chs, err := Parse(text, Options{
		SplitMode:         2,
		RemoveBlankLine:   true,
		ForceEmptyChapter: true,
	})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(chs) != 1 {
		t.Fatalf("整本一章期望 1 章,得到 %d", len(chs))
	}
	if len(chs[0].Body) != 4 {
		t.Fatalf("整本一章正文期望 4 段,得到 %d", len(chs[0].Body))
	}
}

func TestParse_RemoveBlankLine(t *testing.T) {
	text := "第1章 测试\n"
	text += "　　段落一。\n"
	text += "\n"
	text += "　　段落二。\n"
	chs, _ := Parse(text, Options{AutoMark: true, RemoveBlankLine: true, ForceEmptyChapter: true})
	if len(chs) != 1 {
		t.Fatalf("期望 1 章,得到 %d", len(chs))
	}
	if len(chs[0].Body) != 2 {
		t.Errorf("去掉空行后期望 2 段,得到 %d", len(chs[0].Body))
	}
}

func TestParse_AddSpaceBetweenParagraphs(t *testing.T) {
	text := "第1章 测试\n"
	text += "　　段落一。\n"
	text += "\n"
	text += "　　段落二。\n"
	chs, _ := Parse(text, Options{
		AutoMark:          true,
		RemoveBlankLine:   false,
		AddSpace:          true,
		AddSpaceCount:     2,
		ForceEmptyChapter: true,
	})
	if len(chs[0].Body) != 4 {
		t.Errorf("段间加 2 空行后期望 4 段(2正文+2空),得到 %d", len(chs[0].Body))
	}
}

func TestParse_PreservesFullWidthSpaceIndent(t *testing.T) {
	text := "第1章 测试\n"
	text += "　　段落一。\n"
	chs, _ := Parse(text, Options{AutoMark: true, RemoveBlankLine: true, ForceEmptyChapter: true})
	if len(chs[0].Body) != 1 {
		t.Fatalf("期望 1 段,得到 %d", len(chs[0].Body))
	}
	if !strings.HasPrefix(chs[0].Body[0], "\u3000\u3000") {
		t.Errorf("期望保留首行全角空格缩进,得到 '%q'", chs[0].Body[0])
	}
}

func TestBuildSimplePattern(t *testing.T) {
	p := buildSimplePattern(Options{
		SimpleRegP1:           "[第卷]",
		SimpleRegP2:           0,
		SimpleRegP3:           "[章回卷节集部]",
		SimpleRegLeadingSpace: true,
	})
	if p == nil {
		t.Fatal("buildSimplePattern 返回 nil")
	}
	cases := []struct {
		line string
		want bool
	}{
		{"第1章 开端", true},
		{"第2章", true},
		{"Chapter 1", false},
		{"  第3章 缩进", true},
		{"随便一行", false},
	}
	for _, c := range cases {
		got := p.MatchString(c.line)
		if got != c.want {
			t.Errorf("MatchString(%q)=%v,期望 %v", c.line, got, c.want)
		}
	}
}

func TestParse_CNumerals(t *testing.T) {
	// 简易正则 + 中文数字风格。
	text := "第一章 开端\n"
	text += "　　段一。\n"
	chs, _ := Parse(text, Options{
		SimpleRegP1:           "[第卷]",
		SimpleRegP2:           1,
		SimpleRegP3:           "[章回卷节集部]",
		SimpleRegLeadingSpace: true,
		AutoMark:              false,
		RemoveBlankLine:       true,
		ForceEmptyChapter:     true,
	})
	if len(chs) != 1 {
		t.Fatalf("期望 1 章,得到 %d", len(chs))
	}
	if chs[0].Title != "第一章 开端" {
		t.Errorf("标题: 期望 '第一章 开端',得到 '%s'", chs[0].Title)
	}
}

func TestParse_EscapeAngleBrackets(t *testing.T) {
	text := "第1章 测试\n"
	text += "　　含<标签>的段落。\n"
	chs, _ := Parse(text, Options{AutoMark: true, RemoveBlankLine: true, ForceEmptyChapter: true})
	if len(chs[0].Body) != 1 {
		t.Fatalf("期望 1 段,得到 %d", len(chs[0].Body))
	}
	got := chs[0].Body[0]
	if strings.Contains(got, "<标签>") {
		t.Errorf("未转义 <>: %q", got)
	}
	if !strings.Contains(got, "&lt;标签&gt;") {
		t.Errorf("期望转义后含 '&lt;标签&gt;',得到 %q", got)
	}
}

func TestParse_InvalidSplitMode(t *testing.T) {
	_, err := Parse("正文\n", Options{SplitMode: 3})
	if err == nil {
		t.Fatal("SplitMode=3 应返回 error")
	}
	_, err = Parse("正文\n", Options{SplitMode: -1})
	if err == nil {
		t.Fatal("SplitMode=-1 应返回 error")
	}
}

func TestParse_SplitByCount(t *testing.T) {
	// 每行约 5 字, SplitCount=10 应切成多章。
	text := "段落一二三四五\n段落六七八九十\n段落甲乙丙丁戊\n"
	chs, err := Parse(text, Options{
		SplitMode:         1,
		SplitCount:        10,
		RemoveBlankLine:   true,
		ForceEmptyChapter: true,
	})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(chs) < 2 {
		t.Fatalf("按字数切期望 >=2 章,得到 %d", len(chs))
	}
}

func TestParse_EmptyChapterDroppedWhenNotForced(t *testing.T) {
	// 第1章 后紧接第2章,中间无正文; ForceEmptyChapter=false 应丢弃空章。
	text := "第1章 空章\n第2章 有正文\n　　段落。\n"
	chs, err := Parse(text, Options{
		AutoMark:          true,
		RemoveBlankLine:   true,
		ForceEmptyChapter: false,
	})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	for _, c := range chs {
		if c.Title == "第1章 空章" {
			t.Fatalf("ForceEmptyChapter=false 时不应保留空章,得到 %v", chs)
		}
		if c.Body == nil {
			t.Error("Body 应为 []string{} 而非 nil")
		}
	}
	if len(chs) != 1 || chs[0].Title != "第2章 有正文" {
		t.Fatalf("期望仅保留第2章,得到 %v", chs)
	}
}

func TestParse_AutoMark_DoesNotCutBodySentences(t *testing.T) {
	// "第三回合开始" 不应被误切成章节标题。
	text := "第一段\n第三回合开始\n第二段\n"
	chs, err := Parse(text, Options{AutoMark: true, RemoveBlankLine: true})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(chs) != 1 {
		t.Fatalf("正文句子不应被切章,期望 1 章,得到 %d titles=%v", len(chs), chapterTitles(chs))
	}
}

func TestDefaultRegExps_MatchCommonTitles(t *testing.T) {
	pats := make([]*regexp.Regexp, 0, len(DefaultRegExps))
	for _, s := range DefaultRegExps {
		p, err := regexp.Compile(s)
		if err != nil {
			t.Fatalf("Compile %q: %v", s, err)
		}
		pats = append(pats, p)
	}
	match := func(line string) bool {
		trim := strings.TrimSpace(line)
		for _, p := range pats {
			if p.MatchString(line) || p.MatchString(trim) {
				return true
			}
		}
		return false
	}

	positives := []string{
		"序", "序言", "序章", "序曲", "序1", "楔子", "引子", "前言", "自序", "代序",
		"后记", "尾声", "终章", "终卷", "番外", "番外篇", "外传", "特别篇",
		"简介", "内容简介", "文案", "作者简介", "编辑推荐", "正文", "附录",
		"上部", "中部", "下部", "上篇", "下篇", "第一部", "第三部",
		"第1章", "第1章 开端", "第1章开端", "第一章", "第一百零八章 大结局",
		"第01章", "【第1章】开端", "（第一章）初见", "第1 章 标题",
		"第1话", "第12话 标题", "第1篇", "第壹章",
		"第1回", "第一回 风云起", "第3节", "第2部 远征", "第5集", "第2卷",
		"第一幕", "第3讲", "第1部分", "第2部分 开始",
		"卷1", "卷二", "卷 3 远行", "章之一", "卷之一", "节之三",
		"Chapter 1", "Chapter 12: The End", "CHAPTER I", "Ch. 3", "Ch 4 Title",
		"Part 1", "Part II", "Volume 1", "Vol. 2", "Vol 3 Prologue",
		"Prologue", "Epilogue", "Afterword", "Side Story", "Interlude",
		"☆编辑推荐", "【楔子】", "写在前面", "作者的话",
	}
	for _, line := range positives {
		if !match(line) {
			t.Errorf("应识别为章节: %q", line)
		}
	}

	negatives := []string{
		"第三回合开始",
		"第一节课就要迟到了",
		"这部小说很好看",
		"这一集很好看",
		"他打开了第一章的内容看了很久。",
		"随便一行",
		"Chapter of my life was hard", // 无数字
		"China is large",
	}
	for _, line := range negatives {
		if match(line) {
			t.Errorf("不应识别为章节: %q", line)
		}
	}
}

func TestParse_AutoMark_RichFormats(t *testing.T) {
	text := strings.Join([]string{
		"楔子",
		"　　引子正文。",
		"第一章 启程",
		"　　段一。",
		"第2回 风云",
		"　　段二。",
		"第3话",
		"　　段三。",
		"【第4章】决战",
		"　　段四。",
		"Chapter 5: Finale",
		"　　段五。",
		"番外",
		"　　段六。",
		"Prologue", // 故意放后面测英文特称
		"　　不应单独因正文误切。",
	}, "\n")
	chs, err := Parse(text, Options{AutoMark: true, RemoveBlankLine: true, ForceEmptyChapter: true})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	want := []string{"楔子", "第一章 启程", "第2回 风云", "第3话", "【第4章】决战", "Chapter 5: Finale", "番外", "Prologue"}
	if len(chs) != len(want) {
		t.Fatalf("期望 %d 章,得到 %d titles=%v", len(want), len(chs), chapterTitles(chs))
	}
	for i, w := range want {
		if chs[i].Title != w {
			t.Errorf("第%d章标题: 期望 %q,得到 %q", i, w, chs[i].Title)
		}
	}
}

func chapterTitles(chs []Chapter) []string {
	out := make([]string, len(chs))
	for i, c := range chs {
		out[i] = c.Title
	}
	return out
}
