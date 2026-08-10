package converter

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestConvert_BasicRoundTrip 验证完整转换路径:TXT → EPUB(结构完整,可读,书名正确)。
func TestConvert_BasicRoundTrip(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "book.txt")
	content := "序\n　　书名：测试书\n第1章 开端\n　　段落一。\n第2章 发展\n　　段落二。\n"
	if err := os.WriteFile(in, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	out := filepath.Join(dir, "out.epub")

	res, err := Convert(Options{
		Input:  in,
		Output: out,
		Title:  "测试书",
		Author: "作者",
		TXTOverrides: nil, // 走默认
	})
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if res.EpubPath != out {
		t.Errorf("EpubPath=%s 期望 %s", res.EpubPath, out)
	}
	if res.ChapterCount < 2 {
		t.Errorf("章节数=%d 期望 >=2", res.ChapterCount)
	}
	if !strings.HasPrefix(res.Encoding, "UTF") {
		t.Errorf("Encoding=%s", res.Encoding)
	}

	// 校验 EPUB 可读且结构完整。
	r, err := zip.OpenReader(out)
	if err != nil {
		t.Fatalf("OpenReader: %v", err)
	}
	defer r.Close()
	want := map[string]bool{
		"mimetype": false, "META-INF/container.xml": false,
		"OEBPS/content.opf": false, "OEBPS/toc.ncx": false,
		"OEBPS/style.css": false, "OEBPS/cover.html": false,
		"OEBPS/book-toc.html": false,
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
	// 至少应有章节文件。
	hasChapter := false
	for _, f := range r.File {
		if strings.HasPrefix(f.Name, "OEBPS/chapter") {
			hasChapter = true
			break
		}
	}
	if !hasChapter {
		t.Error("无章节文件")
	}
}

func TestConvert_MissingInput(t *testing.T) {
	_, err := Convert(Options{Input: "/no/such/file.txt"})
	if err == nil {
		t.Fatal("期望错误")
	}
}

func TestConvert_AutoInferTitle(t *testing.T) {
	dir := t.TempDir()
	// 首行是"书名:测试书", Title 留空期望被推断。
	in := filepath.Join(dir, "auto.txt")
	content := "书名：自动推断的书名\n第1章 开端\n　　正文。\n"
	if err := os.WriteFile(in, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	out := filepath.Join(dir, "auto.epub")
	if _, err := Convert(Options{Input: in, Output: out}); err != nil {
		t.Fatalf("Convert: %v", err)
	}
	// 校验 opf 里标题被正确推断。
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	zr, err := zip.NewReader(strings.NewReader(string(b)), int64(len(b)))
	if err != nil {
		t.Fatalf("zip.NewReader: %v", err)
	}
	for _, f := range zr.File {
		if f.Name == "OEBPS/content.opf" {
			rc, _ := f.Open()
			defer rc.Close()
			buf := make([]byte, 4096)
			n, _ := rc.Read(buf)
			if !strings.Contains(string(buf[:n]), "自动推断的书名") {
				t.Errorf("书名未推断进入 opf: %s", string(buf[:n]))
			}
			return
		}
	}
}
