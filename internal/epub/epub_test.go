package epub

import (
	"archive/zip"
	"strings"
	"testing"

	"github.com/easypub/go-easypub/internal/css"
	"github.com/easypub/go-easypub/internal/txt"
)

func mustParse(t *testing.T, text string, opt txt.Options) []txt.Chapter {
	t.Helper()
	chs, err := txt.Parse(text, opt)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	return chs
}

func sampleBook() *Book {
	chs := []txt.Chapter{
		{Title: "序", Body: []string{"　　书名：测试"}},
		{Title: "第1章 开端", Body: []string{"　　段落一。", "　　段落二。"}},
	}
	return &Book{
		Title:    "测试书",
		Author:   "测试者",
		Language: "zh-CN",
		Date:     "2025",
		UID:      "easypub-test",
		CSS:      css.Generate(css.Default(nil)),
		Chapters: chs,
	}
}

func TestBuild_ProducesAllExpectedEntries(t *testing.T) {
	dir := t.TempDir()
	out := dir + "/out.epub"
	g := New(sampleBook())
	if err := g.Build(out); err != nil {
		t.Fatalf("Build: %v", err)
	}

	r, err := zip.OpenReader(out)
	if err != nil {
		t.Fatalf("OpenReader: %v", err)
	}
	defer r.Close()

	want := map[string]bool{
		"mimetype":               false,
		"META-INF/container.xml": false,
		"OEBPS/content.opf":      false,
		"OEBPS/toc.ncx":          false,
		"OEBPS/style.css":        false,
		"OEBPS/cover.html":       false,
		"OEBPS/book-toc.html":    false,
		"OEBPS/chapter0.html":    false,
		"OEBPS/chapter1.html":    false,
	}
	for _, f := range r.File {
		if _, ok := want[f.Name]; ok {
			want[f.Name] = true
		}
	}
	for name, found := range want {
		if !found {
			t.Errorf("缺失文件: %s", name)
		}
	}
}

func TestBuild_MimetypeStoredNotCompressed(t *testing.T) {
	dir := t.TempDir()
	out := dir + "/out.epub"
	if err := New(sampleBook()).Build(out); err != nil {
		t.Fatalf("Build: %v", err)
	}
	r, err := zip.OpenReader(out)
	if err != nil {
		t.Fatalf("OpenReader: %v", err)
	}
	defer r.Close()
	for _, f := range r.File {
		if f.Name == "mimetype" {
			if f.Method != zip.Store {
				t.Errorf("mimetype 应 store(0),得到 method=%d", f.Method)
			}
			return
		}
	}
	t.Fatal("未找到 mimetype")
}

func TestBuild_OtherFilesDeflated(t *testing.T) {
	dir := t.TempDir()
	out := dir + "/out.epub"
	if err := New(sampleBook()).Build(out); err != nil {
		t.Fatalf("Build: %v", err)
	}
	r, err := zip.OpenReader(out)
	if err != nil {
		t.Fatalf("OpenReader: %v", err)
	}
	defer r.Close()
	for _, f := range r.File {
		if f.Name == "mimetype" {
			continue
		}
		if f.Method != zip.Deflate {
			t.Errorf("%s 应 deflate,得到 method=%d", f.Name, f.Method)
		}
	}
}

func TestCoverHTML_ContainsTitleAndAuthor(t *testing.T) {
	got := coverHTML(sampleBook())
	if !strings.Contains(got, `<h1 class="booktitle">测试书</h1>`) {
		t.Errorf("cover.html 缺书名")
	}
	if !strings.Contains(got, `<h3 class="bookauthor">测试者</h3>`) {
		t.Errorf("cover.html 缺作者")
	}
}

func TestChapterHTML_TemplateShape(t *testing.T) {
	got := chapterHTML(sampleBook(), 1)
	mustContain := []string{
		`<?xml version="1.0" encoding="utf-8" ?>`,
		`<!DOCTYPE html`,
		`<meta name="generator" content="EasyPub v1.50" />`,
		`<h2 id="title" class="titlel2std">第1章 开端</h2>`,
		`<p class="a">　　段落一。</p>`,
		`<p class="a">　　段落二。</p>`,
	}
	for _, s := range mustContain {
		if !strings.Contains(got, s) {
			t.Errorf("chapter1.html 缺片段: %q", s)
		}
	}
}

func TestOPF_ContainsMetadataAndSpine(t *testing.T) {
	got := opfXML(sampleBook())
	mustContain := []string{
		`<dc:identifier id="bookid">easypub-test</dc:identifier>`,
		`<dc:title>测试书</dc:title>`,
		`<dc:creator>测试者</dc:creator>`,
		`<spine toc="ncxtoc">`,
		`<itemref idref="cover" linear="no"/>`,
		`<itemref idref="htmltoc" linear="yes"/>`,
		`<itemref idref="chapter0" linear="yes"/>`,
		`<itemref idref="chapter1" linear="yes"/>`,
		`<reference href="cover.html" type="cover" title="Cover"/>`,
		`<reference href="book-toc.html" type="toc" title="Table Of Contents"/>`,
		`<reference href="chapter0.html" type="text" title="Beginning"/>`,
	}
	for _, s := range mustContain {
		if !strings.Contains(got, s) {
			t.Errorf("content.opf 缺片段: %q", s)
		}
	}
}

func TestNCX_ContainsNavMap(t *testing.T) {
	got := ncxXML(sampleBook())
	mustContain := []string{
		`<meta name="dtb:uid" content="easypub-test" />`,
		`<meta name="dtb:generator" content="EasyPub v1.50"/>`,
		`<navPoint id="cover" playOrder="1">`,
		`<navPoint id="htmltoc" playOrder="2">`,
		`<navPoint id="chapter0" playOrder="3">`,
		`<navPoint id="chapter1" playOrder="4">`,
		`<navLabel><text>封面</text></navLabel>`,
		`<navLabel><text>目录</text></navLabel>`,
		`<navLabel><text>序</text></navLabel>`,
		`<navLabel><text>第1章 开端</text></navLabel>`,
	}
	for _, s := range mustContain {
		if !strings.Contains(got, s) {
			t.Errorf("toc.ncx 缺片段: %q", s)
		}
	}
}

func TestBookTOC_ListsAllChapters(t *testing.T) {
	got := bookTOCHTML(sampleBook())
	if !strings.Contains(got, `<a href="chapter0.html">序</a>`) {
		t.Errorf("目录缺 chapter0 链接")
	}
	if !strings.Contains(got, `<a href="chapter1.html">第1章 开端</a>`) {
		t.Errorf("目录缺 chapter1 链接")
	}
}

func TestEmptyTitle_NotShownInTOCOrHeading(t *testing.T) {
	b := &Book{
		Title:    "测试书",
		Author:   "测试者",
		Language: "zh-CN",
		Date:     "2025",
		UID:      "easypub-test",
		CSS:      css.Generate(css.Default(nil)),
		Chapters: []txt.Chapter{
			{Title: "", Body: []string{"　　声明段落。"}},
			{Title: "作品简介", Body: []string{"　　简介。"}},
			{Title: "第1章 开端", Body: []string{"　　正文。"}},
		},
	}
	toc := bookTOCHTML(b)
	if strings.Contains(toc, "第0章") || strings.Contains(toc, "无标题") {
		t.Fatalf("目录不应伪造空标题: %s", toc)
	}
	if strings.Contains(toc, `href="chapter0.html"`) {
		t.Fatal("空标题章不应出现在 HTML 目录")
	}
	if !strings.Contains(toc, `href="chapter1.html">作品简介</a>`) {
		t.Fatal("有标题章应在目录中")
	}
	ch0 := chapterHTML(b, 0)
	if strings.Contains(ch0, `class="titlel2std"`) {
		t.Fatalf("空标题章不应渲染 h2: %s", ch0)
	}
	if !strings.Contains(ch0, `　　声明段落。`) {
		t.Fatal("空标题章正文仍应保留")
	}
	ncx := ncxXML(b)
	if strings.Contains(ncx, `id="chapter0"`) || strings.Contains(ncx, "第0章") {
		t.Fatalf("NCX 不应包含空标题导航: %s", ncx)
	}
	if !strings.Contains(ncx, `<navLabel><text>作品简介</text></navLabel>`) {
		t.Fatal("NCX 应包含有标题章")
	}
}

func TestBuild_HTMLHasBOM(t *testing.T) {
	dir := t.TempDir()
	out := dir + "/out.epub"
	if err := New(sampleBook()).Build(out); err != nil {
		t.Fatalf("Build: %v", err)
	}
	r, err := zip.OpenReader(out)
	if err != nil {
		t.Fatalf("OpenReader: %v", err)
	}
	defer r.Close()
	bom := []byte{0xEF, 0xBB, 0xBF}
	for _, f := range r.File {
		switch f.Name {
		case "mimetype", "META-INF/container.xml", "OEBPS/style.css":
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("Open %s: %v", f.Name, err)
		}
		buf := make([]byte, 3)
		n, _ := rc.Read(buf)
		rc.Close()
		if n < 3 || buf[0] != bom[0] || buf[1] != bom[1] || buf[2] != bom[2] {
			t.Errorf("%s 缺 UTF-8 BOM", f.Name)
		}
	}
}
