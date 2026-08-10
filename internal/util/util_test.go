package util

import (
	"strings"
	"testing"
)

func TestDetectAndDecode_UTF8WithBOM(t *testing.T) {
	bom := []byte{0xEF, 0xBB, 0xBF}
	text := []byte("中文测试")
	got, enc, err := DetectAndDecode(append(bom, text...))
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if enc != "UTF-8" {
		t.Errorf("enc=%s 期望 UTF-8", enc)
	}
	if got != string(text) {
		t.Errorf("got=%q 期望 %q", got, string(text))
	}
}

func TestDetectAndDecode_UTF8Plain(t *testing.T) {
	text := []byte("中文")
	got, enc, _ := DetectAndDecode(text)
	if enc != "UTF-8" || got != string(text) {
		t.Errorf("got=%q enc=%s", got, enc)
	}
}

func TestDetectAndDecode_GBK(t *testing.T) {
	// "中文" 在 GBK 是 D6 D0 CE C4。
	gbkBytes := []byte{0xD6, 0xD0, 0xCE, 0xC4}
	got, enc, err := DetectAndDecode(gbkBytes)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if enc != "GBK" {
		t.Errorf("enc=%s 期望 GBK", enc)
	}
	if got != "中文" {
		t.Errorf("got=%q 期望 '中文'", got)
	}
}

func TestDetectAndDecode_UTF16LE(t *testing.T) {
	bom := []byte{0xFF, 0xFE}
	// "中" UTF-16LE = 2D 4E, "文" = 87 65
	body := []byte{0x2D, 0x4E, 0x87, 0x65}
	got, enc, err := DetectAndDecode(append(bom, body...))
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if enc != "UTF-16LE" {
		t.Errorf("enc=%s", enc)
	}
	if got != "中文" {
		t.Errorf("got=%q", got)
	}
}

func TestNormalizeEOL(t *testing.T) {
	cases := map[string]string{
		"a\r\nb":        "a\nb",
		"a\rb":          "a\nb",
		"a\r\nb\r\nc":   "a\nb\nc",
		"a\nb":          "a\nb",
	}
	for in, want := range cases {
		if got := NormalizeEOL(in); got != want {
			t.Errorf("NormalizeEOL(%q)=%q 期望 %q", in, got, want)
		}
	}
}

func TestEscapeText(t *testing.T) {
	got := EscapeText("a<b>c\"d'e&f")
	// html.EscapeString 默认转 < > & " '。
	for _, sub := range []string{"&lt;", "&gt;", "&amp;", "&#34;", "&#39;"} {
		if !strings.Contains(got, sub) {
			t.Errorf("EscapeText 结果 %q 缺少 %q", got, sub)
		}
	}
	// 全角空格保留。
	if got := EscapeText("\u3000\u3000"); got != "\u3000\u3000" {
		t.Errorf("全角空格被破坏: %q", got)
	}
}

func TestEscapeForXMLAttr(t *testing.T) {
	got := EscapeForXMLAttr("a<b\"c&d'e>")
	want := "a&lt;b&quot;c&amp;d&apos;e&gt;"
	if got != want {
		t.Errorf("got %q 期望 %q", got, want)
	}
}
