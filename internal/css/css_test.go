package css

import (
	"strings"
	"testing"
)

func TestGenerate_DefaultMatchesSample(t *testing.T) {
	fontSrcs := []string{
		"res:///system/fonts/DroidSansFallback.ttf",
		"res:///ebook/fonts/../../system/fonts/DroidSansFallback.ttf",
	}
	got := Generate(Default(fontSrcs))
	// 与样例 epub style.css 关键片段对照。
	mustContain := []string{
		`font-family: "easypub";`,
		"url(res:///system/fonts/DroidSansFallback.ttf)",
		"font-size: 100%;",
		"line-height: 120%;",
		"margin-top: 5px;",
		`.a {`,
		"text-indent: 0em;",
		".booktitle",
		".titlel2std",
		".tocl2",
		".toc a { text-decoration: none; color: #000000; }",
	}
	for _, s := range mustContain {
		if !strings.Contains(got, s) {
			t.Errorf("CSS 缺少片段: %q", s)
		}
	}
}

func TestGenerate_LineHeightAndFontSize(t *testing.T) {
	got := Generate(Options{
		FontFamily: "customfont",
		LineHeight: 180,
		FontSize:   120,
		MarginTop:  8,
	})
	if !strings.Contains(got, "line-height: 180%;") {
		t.Errorf("期望 line-height 180%%")
	}
	if !strings.Contains(got, "font-size: 120%;") {
		t.Errorf("期望 font-size 120%%")
	}
	if !strings.Contains(got, "margin-top: 8px;") {
		t.Errorf("期望 margin-top 8px")
	}
}

func TestGenerate_TextAlign(t *testing.T) {
	cases := []struct {
		align int
		want  string
	}{
		{0, "justify"},
		{1, "left"},
		{2, "center"},
		{3, "right"},
	}
	for _, c := range cases {
		got := Generate(Options{TextAlign: c.align})
		if !strings.Contains(got, "text-align: "+c.want) {
			t.Errorf("align=%d 期望含 'text-align: %s'", c.align, c.want)
		}
	}
}

func TestGenerate_Indent(t *testing.T) {
	got := Generate(Options{Indent: 2})
	if !strings.Contains(got, "text-indent: 2rem;") {
		t.Errorf("期望 text-indent 2rem")
	}
}

func TestGenerate_NoFontSrc(t *testing.T) {
	got := Generate(Options{})
	if !strings.Contains(got, "local(sans-serif)") {
		t.Errorf("无字体路径时应用 local(sans-serif)")
	}
}
