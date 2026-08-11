package txt

import (
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

func chapterTitles(chs []Chapter) []string {
	out := make([]string, len(chs))
	for i, c := range chs {
		out[i] = c.Title
	}
	return out
}
