// Package util 提供 TXT 编码探测、转换与 HTML 转义等通用工具。
package util

import (
	"bytes"
	"html"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

// DetectAndDecode 检测 b 的编码并返回 UTF-8 文本与编码名称。
// 支持 UTF-8 BOM/无 BOM、UTF-16 BE/LE(BOM)、GBK/GB18030(简体)、Big5(繁体)。
func DetectAndDecode(b []byte) (text, enc string, err error) {
	if bytes.HasPrefix(b, []byte{0xFF, 0xFE}) {
		return decodeWith(b[2:], unicode.UTF16(unicode.LittleEndian, unicode.UseBOM)), "UTF-16LE", nil
	}
	if bytes.HasPrefix(b, []byte{0xFE, 0xFF}) {
		return decodeWith(b[2:], unicode.UTF16(unicode.BigEndian, unicode.UseBOM)), "UTF-16BE", nil
	}
	if bytes.HasPrefix(b, []byte{0xEF, 0xBB, 0xBF}) {
		return string(b[3:]), "UTF-8", nil
	}
	if utf8.Valid(b) {
		return string(b), "UTF-8", nil
	}
	// 中英混排常用 GBK；先 GBK 再 GB18030 再 Big5。
	candidates := []struct {
		e   encoding.Encoding
		tag string
	}{
		{simplifiedchinese.GBK, "GBK"},
		{simplifiedchinese.GB18030, "GB18030"},
		{traditionalchinese.Big5, "Big5"},
	}
	for _, c := range candidates {
		if s, ok := tryDecode(b, c.e); ok {
			return s, c.tag, nil
		}
	}
	return string(b), "Unknown", nil
}

func decodeWith(b []byte, e encoding.Encoding) string {
	r := transform.NewReader(bytes.NewReader(b), e.NewDecoder())
	var out bytes.Buffer
	_, _ = out.ReadFrom(r)
	return out.String()
}

// tryDecode 用 e 解码 b；若结果含 U+FFFD 则视为解码失败。
func tryDecode(b []byte, e encoding.Encoding) (string, bool) {
	s := decodeWith(b, e)
	if strings.ContainsRune(s, '\uFFFD') {
		return "", false
	}
	return s, true
}

// EscapeText 将一段纯文本转义为可安全放进 XHTML 的字符串。
// 保留全角空格与换行；只转义 < > & " '。
func EscapeText(s string) string {
	return html.EscapeString(s)
}

// NormalizeEOL 将 \r\n / \r 统一为 \n。
func NormalizeEOL(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return s
}

// EscapeForXMLAttr 转义用于 XML 属性值的字符串。
func EscapeForXMLAttr(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}
