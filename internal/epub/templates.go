package epub

import (
	"fmt"
	"strings"

	"github.com/easypub/go-easypub/internal/txt"
	"github.com/easypub/go-easypub/internal/util"
)

// 与样例 EasyPub v1.50 输出严格对齐的 XHTML 头部。
const (
	htmlDoctype = `<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8" />
<meta name="generator" content="EasyPub v1.50" />
<title>
%s
</title>
<link rel="stylesheet" href="style.css" type="text/css"/>
</head>
<body>
%s
</body>
</html>
`
)

// coverHTML 生成 cover.html。
// 与样例对齐：<h1 class="booktitle">书名</h1> <h3 class="bookauthor">作者</h3>
func coverHTML(b *Book) string {
	body := fmt.Sprintf("<div>\n<h1 class=\"booktitle\">%s</h1>\n<h3 class=\"bookauthor\">%s</h3>\n</div>",
		util.EscapeText(b.Title), util.EscapeText(b.Author))
	return fmt.Sprintf(htmlDoctype, "Cover", body)
}

// bookTOCHTML 生成 book-toc.html 目录页。
func bookTOCHTML(b *Book) string {
	var dl strings.Builder
	dl.WriteString("<dl>\n")
	for i, c := range b.Chapters {
		title := c.Title
		if title == "" {
			title = fmt.Sprintf("第%d章", i)
		}
		dl.WriteString(fmt.Sprintf("<dt class=\"tocl2\"><a href=\"chapter%d.html\">%s</a></dt>\n",
			i, util.EscapeText(title)))
	}
	dl.WriteString("</dl>\n")
	body := fmt.Sprintf("<h2 class=\"titletoc\">\n目录\n</h2>\n<div class=\"toc\">\n%s</div>", dl.String())
	return fmt.Sprintf(htmlDoctype, "Table Of Contents", body)
}

// chapterHTML 生成 chapterN.html。
// 与样例对齐：<h2 id="title" class="titlel2std">标题</h2> 后接若干 <p class="a">段落</p>。
func chapterHTML(b *Book, idx int) string {
	c := b.Chapters[idx]
	var body strings.Builder
	if c.Title != "" {
		body.WriteString(fmt.Sprintf("<h2 id=\"title\" class=\"titlel2std\">%s</h2>\n", util.EscapeText(c.Title)))
	} else {
		body.WriteString("<h2 id=\"title\" class=\"titlel2std\"></h2>\n")
	}
	for _, p := range c.Body {
		// 空段：保持 <p class="a"></p> 形式。
		if strings.TrimSpace(p) == "" {
			body.WriteString("<p class=\"a\"></p>\n")
			continue
		}
		body.WriteString(fmt.Sprintf("<p class=\"a\">%s</p>\n", p))
	}
	// 去掉末尾换行以与样例 </p>\n</body> 对齐。
	s := body.String()
	s = strings.TrimSuffix(s, "\n")
	body.Reset()
	body.WriteString(s)
	title := fmt.Sprintf("chapter %d - 0", idx)
	return fmt.Sprintf(htmlDoctype, title, body.String())
}

// opfXML 生成 content.opf。
func opfXML(b *Book) string {
	var sb strings.Builder
	sb.WriteString("<?xml version=\"1.0\" encoding=\"utf-8\" standalone=\"no\"?>\n\n")
	sb.WriteString("<package version=\"2.0\" xmlns=\"http://www.idpf.org/2007/opf\" unique-identifier=\"bookid\">\n")
	sb.WriteString("<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:opf=\"http://www.idpf.org/2007/opf\">\n")
	sb.WriteString(fmt.Sprintf("<dc:identifier id=\"bookid\">%s</dc:identifier>\n", util.EscapeForXMLAttr(b.UID)))
	sb.WriteString(fmt.Sprintf("<dc:title>%s</dc:title>\n", util.EscapeText(b.Title)))
	sb.WriteString(fmt.Sprintf("<dc:date>%s</dc:date>\n", util.EscapeText(b.Date)))
	sb.WriteString("<dc:rights>Created with EasyPub v1.50</dc:rights>\n")
	sb.WriteString(fmt.Sprintf("<dc:language>%s</dc:language>\n", util.EscapeText(b.Language)))
	if b.Author != "" {
		sb.WriteString(fmt.Sprintf("<dc:creator>%s</dc:creator>\n", util.EscapeText(b.Author)))
	}
	sb.WriteString("</metadata>\n")

	// manifest
	sb.WriteString("<manifest>\n")
	sb.WriteString("<item id=\"ncxtoc\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>\n")
	sb.WriteString("<item id=\"htmltoc\"  href=\"book-toc.html\" media-type=\"application/xhtml+xml\"/>\n")
	sb.WriteString("<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>\n")
	sb.WriteString("<item id=\"cover\" href=\"cover.html\" media-type=\"application/xhtml+xml\"/>\n")
	for i := range b.Chapters {
		sb.WriteString(fmt.Sprintf("<item id=\"chapter%d\" href=\"chapter%d.html\" media-type=\"application/xhtml+xml\"/>\n", i, i))
	}
	sb.WriteString("</manifest>\n")

	// spine
	sb.WriteString("<spine toc=\"ncxtoc\">\n")
	sb.WriteString("<itemref idref=\"cover\" linear=\"no\"/>\n")
	sb.WriteString("<itemref idref=\"htmltoc\" linear=\"yes\"/>\n")
	for i := range b.Chapters {
		sb.WriteString(fmt.Sprintf("<itemref idref=\"chapter%d\" linear=\"yes\"/>\n", i))
	}
	sb.WriteString("</spine>\n")

	// guide
	sb.WriteString("<guide>\n")
	sb.WriteString("<reference href=\"cover.html\" type=\"cover\" title=\"Cover\"/>\n")
	sb.WriteString("<reference href=\"book-toc.html\" type=\"toc\" title=\"Table Of Contents\"/>\n")
	if len(b.Chapters) > 0 {
		sb.WriteString("<reference href=\"chapter0.html\" type=\"text\" title=\"Beginning\"/>\n")
	}
	sb.WriteString("</guide>\n")
	sb.WriteString("</package>\n")
	return sb.String()
}

// ncxXML 生成 toc.ncx。
func ncxXML(b *Book) string {
	var sb strings.Builder
	sb.WriteString("<?xml version=\"1.0\" encoding=\"utf-8\" standalone=\"no\"?>\n")
	sb.WriteString("<!DOCTYPE ncx PUBLIC \"-//NISO//DTD ncx 2005-1//EN\" \"http://www.daisy.org/z3986/2005/ncx-2005-1.dtd\">\n")
	sb.WriteString("<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\">\n")
	sb.WriteString("<head>\n")
	sb.WriteString("<meta name=\"cover\" content=\"cover\"/>\n")
	sb.WriteString(fmt.Sprintf("<meta name=\"dtb:uid\" content=\"%s\" />\n", util.EscapeForXMLAttr(b.UID)))
	sb.WriteString("<meta name=\"dtb:depth\" content=\"1\"/>\n")
	sb.WriteString("<meta name=\"dtb:generator\" content=\"EasyPub v1.50\"/>\n")
	sb.WriteString("<meta name=\"dtb:totalPageCount\" content=\"0\"/>\n")
	sb.WriteString("<meta name=\"dtb:maxPageNumber\" content=\"0\"/>\n")
	sb.WriteString("</head>\n\n")
	sb.WriteString("<docTitle>\n")
	sb.WriteString(fmt.Sprintf("<text>%s</text>\n", util.EscapeText(b.Title)))
	sb.WriteString("</docTitle>\n")
	sb.WriteString("<docAuthor>\n")
	sb.WriteString(fmt.Sprintf("<text>%s</text>\n", util.EscapeText(b.Author)))
	sb.WriteString("</docAuthor>\n\n")
	sb.WriteString("<navMap>\n")

	playOrder := 1
	// cover
	sb.WriteString(fmt.Sprintf("<navPoint id=\"cover\" playOrder=\"%d\">\n", playOrder))
	sb.WriteString("<navLabel><text>封面</text></navLabel>\n")
	sb.WriteString("<content src=\"cover.html\"/>\n")
	sb.WriteString("</navPoint>\n\n")
	playOrder++
	// htmltoc
	sb.WriteString(fmt.Sprintf("<navPoint id=\"htmltoc\" playOrder=\"%d\">\n", playOrder))
	sb.WriteString("<navLabel><text>目录</text></navLabel>\n")
	sb.WriteString("<content src=\"book-toc.html\"/>\n")
	sb.WriteString("</navPoint>\n\n")
	playOrder++

	for i, c := range b.Chapters {
		title := c.Title
		if title == "" {
			title = fmt.Sprintf("第%d章", i)
		}
		sb.WriteString(fmt.Sprintf("<navPoint id=\"chapter%d\" playOrder=\"%d\">\n", i, playOrder))
		sb.WriteString(fmt.Sprintf("<navLabel><text>%s</text></navLabel>\n", util.EscapeText(title)))
		sb.WriteString(fmt.Sprintf("<content src=\"chapter%d.html\"/>\n", i))
		sb.WriteString("</navPoint>\n\n")
		playOrder++
	}
	sb.WriteString("</navMap>\n")
	sb.WriteString("</ncx>\n")
	return sb.String()
}

// 占位以保留 txt 引用，便于未来扩展段落级修正。
var _ = txt.Chapter{}
