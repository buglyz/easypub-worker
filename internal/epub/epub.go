// Package epub 生成 EPUB 2.0 包。
//
// 输出与 EasyPub v1.50 生成的结构一致：
//
//	mimetype
//	META-INF/container.xml
//	OEBPS/content.opf
//	OEBPS/toc.ncx
//	OEBPS/style.css
//	OEBPS/cover.html
//	OEBPS/book-toc.html
//	OEBPS/chapter0.html ... chapterN.html
package epub

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/easypub/go-easypub/internal/txt"
)

// Book 是待生成的 EPUB 元数据与章节。
type Book struct {
	Title    string
	Author   string
	Language string
	Date     string // 如 "2025"；为空则取当前年份。
	UID      string // 如 "easypub-6687cffa"；为空则随机生成。
	CSS      string // style.css 内容。
	Chapters []txt.Chapter
}

// Generator 收集产物并打包成 .epub。
type Generator struct {
	book *Book
	// entries 维护写入顺序：mimetype 必须第一且不压缩。
	entries []entry
}

type entry struct {
	name    string
	method  uint16
	content []byte
}

const (
	mimetypeContent = "application/epub+zip"
	containerXML    = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
)

// New 创建生成器。
func New(b *Book) *Generator {
	if b.Language == "" {
		b.Language = "zh-CN"
	}
	if b.Date == "" {
		b.Date = fmt.Sprintf("%d", time.Now().Year())
	}
	if b.UID == "" {
		b.UID = "easypub-" + randomID(8)
	}
	return &Generator{book: b}
}

// Build 生成 .epub 到 outPath。
func (g *Generator) Build(outPath string) error {
	g.entries = nil
	g.addMimetype()
	g.addContainer()
	g.addCSS()
	g.addCover()
	g.addBookTOC()
	g.addChapters()
	g.addOPF()
	g.addNCX()
	// 与样例对齐：所有 XHTML/XML 文本加 UTF-8 BOM 并使用 CRLF。
	g.normalizeTextEntries()
	return g.writeZip(outPath)
}

func (g *Generator) addMimetype() {
	g.entries = append(g.entries, entry{
		name:    "mimetype",
		method:  zip.Store, // EPUB 规范要求 mimetype 不压缩
		content: []byte(mimetypeContent),
	})
}

func (g *Generator) addContainer() {
	g.entries = append(g.entries, entry{
		name:    "META-INF/container.xml",
		method:  zip.Deflate,
		content: []byte(containerXML),
	})
}

func (g *Generator) addCSS() {
	css := g.book.CSS
	g.entries = append(g.entries, entry{
		name:    "OEBPS/style.css",
		method:  zip.Deflate,
		content: []byte(css),
	})
}

func (g *Generator) addCover() {
	html := coverHTML(g.book)
	g.entries = append(g.entries, entry{
		name:    "OEBPS/cover.html",
		method:  zip.Deflate,
		content: []byte(html),
	})
}

func (g *Generator) addBookTOC() {
	html := bookTOCHTML(g.book)
	g.entries = append(g.entries, entry{
		name:    "OEBPS/book-toc.html",
		method:  zip.Deflate,
		content: []byte(html),
	})
}

func (g *Generator) addChapters() {
	for i := range g.book.Chapters {
		html := chapterHTML(g.book, i)
		g.entries = append(g.entries, entry{
			name:    fmt.Sprintf("OEBPS/chapter%d.html", i),
			method:  zip.Deflate,
			content: []byte(html),
		})
	}
}

func (g *Generator) addOPF() {
	opf := opfXML(g.book)
	g.entries = append(g.entries, entry{
		name:    "OEBPS/content.opf",
		method:  zip.Deflate,
		content: []byte(opf),
	})
}

func (g *Generator) addNCX() {
	ncx := ncxXML(g.book)
	g.entries = append(g.entries, entry{
		name:    "OEBPS/toc.ncx",
		method:  zip.Deflate,
		content: []byte(ncx),
	})
}

func (g *Generator) writeZip(outPath string) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}
	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()
	w := zip.NewWriter(f)
	for _, e := range g.entries {
		hdr := &zip.FileHeader{Name: e.name, Method: e.method}
		fw, err := w.CreateHeader(hdr)
		if err != nil {
			return err
		}
		if _, err := fw.Write(e.content); err != nil {
			return err
		}
	}
	return w.Close()
}

// randomID 生成 n 字节的十六进制 ID，如 "6687cffa"。
func randomID(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "00000000"
	}
	return hex.EncodeToString(b)
}

// normalizeTextEntries 给文本类条目统一 CRLF 与(部分) UTF-8 BOM，
// 与 EasyPub v1.50 样例输出字节级对齐。
//   - mimetype：原样不动(无 BOM、无 CRLF)
//   - META-INF/container.xml：CRLF、无 BOM
//   - OEBPS/style.css：CRLF、无 BOM
//   - 其余 OEBPS/*.html|*.opf|*.ncx：CRLF、有 BOM
func (g *Generator) normalizeTextEntries() {
	bom := []byte{0xEF, 0xBB, 0xBF}
	for i, e := range g.entries {
		if e.name == "mimetype" {
			continue
		}
		s := string(e.content)
		// 统一 CRLF。
		s = strings.ReplaceAll(s, "\r\n", "\n")
		s = strings.ReplaceAll(s, "\n", "\r\n")
		switch e.name {
		case "META-INF/container.xml", "OEBPS/style.css":
			g.entries[i].content = []byte(s)
			continue
		}
		// 其余：加 BOM(若尚未有)。
		if !bytes.HasPrefix(e.content, bom) {
			g.entries[i].content = append(bom, []byte(s)...)
		} else {
			g.entries[i].content = []byte(s)
		}
	}
}
