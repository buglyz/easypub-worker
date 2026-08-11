package webui

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	s, err := New(Config{Addr: "127.0.0.1:0", WorkDir: dir})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return s
}

// buildMultipart 构造 multipart 请求体(字段+单个文件),返回 body 与对应的
// Content-Type(boundary 不同,所以需要回传)。
func buildMultipart(t *testing.T, fields map[string]string, fileField, fileName, content string) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			t.Fatalf("WriteField: %v", err)
		}
	}
	fw, err := w.CreateFormFile(fileField, fileName)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := fw.Write([]byte(content)); err != nil {
		t.Fatalf("Write: %v", err)
	}
	ct := w.FormDataContentType()
	w.Close()
	return &buf, ct
}

func TestIndex_ServesHTML(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	s.handleIndex(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "EasyPub") {
		t.Errorf("页面不含 EasyPub")
	}
}

func TestIndex_ServesStaticCSS(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/style.css", nil)
	rec := httptest.NewRecorder()
	s.handleIndex(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "dropzone") {
		t.Errorf("style.css 内容异常")
	}
}

func TestIndex_NotFound(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/missing", nil)
	rec := httptest.NewRecorder()
	s.handleIndex(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d 期望 404", rec.Code)
	}
}

func TestDetect_ReturnsChapterTitles(t *testing.T) {
	s := newTestServer(t)
	content := "序\n　　书名：测试\n第1章 开端\n　　段落。\n"

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("splitMode", "0")
	_ = w.WriteField("fullReg", "")
	_ = w.WriteField("removeBlank", "true")
	_ = w.WriteField("autoMark", "true")
	fw, _ := w.CreateFormFile("file", "book.txt")
	_, _ = fw.Write([]byte(content))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/detect", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	s.handleDetect(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "第1章 开端") {
		t.Errorf("response 缺章节: %s", rec.Body.String())
	}
}

func TestDetect_SplitByCount(t *testing.T) {
	s := newTestServer(t)
	// 多行短文本，按字数切成多章。
	var b strings.Builder
	for i := 0; i < 40; i++ {
		b.WriteString("这是一行测试文本内容。\n")
	}
	body, ct := buildMultipart(t, map[string]string{
		"splitMode":   "1",
		"splitCount":  "50",
		"autoMark":    "false",
		"fullReg":     "",
		"removeBlank": "true",
	}, "file", "book.txt", b.String())
	req := httptest.NewRequest(http.MethodPost, "/api/detect", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	s.handleDetect(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"count"`) {
		t.Fatalf("response 缺 count: %s", rec.Body.String())
	}
	// 按字数应切出多于 1 章。
	if strings.Contains(rec.Body.String(), `"count":1,`) || strings.Contains(rec.Body.String(), `"count": 1`) {
		t.Fatalf("按字数分章应 >1 章: %s", rec.Body.String())
	}
}

func TestDetect_AddSpaceAccepted(t *testing.T) {
	s := newTestServer(t)
	body, ct := buildMultipart(t, map[string]string{
		"splitMode":     "0",
		"fullReg":       "",
		"autoMark":      "true",
		"removeBlank":   "true",
		"addSpace":      "true",
		"addSpaceCount": "2",
	}, "file", "book.txt", "第1章 开端\n　　段落。\n")
	req := httptest.NewRequest(http.MethodPost, "/api/detect", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	s.handleDetect(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "第1章 开端") {
		t.Fatalf("response 缺章节: %s", rec.Body.String())
	}
}

func TestConvert_ProducesEPUB(t *testing.T) {
	s := newTestServer(t)
	content := "序\n　　书名：测试书\n第1章 开端\n　　段落一。\n第2章 发展\n　　段落二。\n"

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("splitMode", "0")
	_ = w.WriteField("fullReg", "")
	_ = w.WriteField("removeBlank", "true")
	_ = w.WriteField("autoMark", "true")
	_ = w.WriteField("title", "测试书")
	_ = w.WriteField("author", "作者")
	_ = w.WriteField("lineHeight", "120")
	_ = w.WriteField("fontSize", "100")
	_ = w.WriteField("marginTop", "5")
	_ = w.WriteField("textAlign", "0")
	fw, _ := w.CreateFormFile("file", "我的小说.txt")
	_, _ = fw.Write([]byte(content))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/convert", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	s.handleConvert(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "download") {
		t.Fatalf("response 缺 download: %s", body)
	}
	if !strings.Contains(body, `"epubName":"我的小说.epub"`) {
		t.Fatalf("应返回原文件名 epubName, body=%s", body)
	}
	if !strings.Contains(body, "name=") {
		t.Fatalf("download URL 应带 name 查询参数, body=%s", body)
	}
	// 输出目录应存在 epub。
	files, _ := os.ReadDir(s.outputs)
	epubCount := 0
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".epub") {
			epubCount++
		}
	}
	if epubCount == 0 {
		t.Fatalf("输出目录无 epub: %v", files)
	}
}

func TestConvert_DownloadRoundTrip(t *testing.T) {
	s := newTestServer(t)
	content := "第1章 开端\n　　正文。\n"
	body, ct := buildMultipart(t, map[string]string{
		"splitMode": "0", "fullReg": "", "removeBlank": "true", "autoMark": "true",
		"title": "书", "author": "a", "lineHeight": "120", "fontSize": "100", "marginTop": "5", "textAlign": "0",
	}, "file", "book.txt", content)
	req := httptest.NewRequest(http.MethodPost, "/api/convert", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	s.handleConvert(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("convert status=%d", rec.Code)
	}
	// 提取 epub 文件名,走 download handler。
	files, _ := os.ReadDir(s.outputs)
	var epubName string
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".epub") {
			epubName = f.Name()
			break
		}
	}
	if epubName == "" {
		t.Fatal("无 epub 产物")
	}
	dreq := httptest.NewRequest(http.MethodGet, "/api/download/"+epubName+"?name="+url.QueryEscape("我的小说.epub"), nil)
	drec := httptest.NewRecorder()
	s.handleDownload(drec, dreq)
	if drec.Code != http.StatusOK {
		t.Fatalf("download status=%d", drec.Code)
	}
	if drec.Body.Len() == 0 {
		t.Fatal("下载内容为空")
	}
	cd := drec.Header().Get("Content-Disposition")
	if !strings.Contains(cd, "filename*") || !strings.Contains(cd, "我的小说") && !strings.Contains(cd, "%E6%88%91%E7%9A%84%E5%B0%8F%E8%AF%B4") {
		// filename* 应含 UTF-8 百分号编码的中文名。
		if !strings.Contains(cd, "%E6%88%91") {
			t.Errorf("Content-Disposition 应保留原文件名, got %q", cd)
		}
	}
	// 校验是 zip(mimetype 起始)。
	peek := drec.Body.Bytes()
	if !bytes.Contains(peek, []byte("PK\x03\x04")) {
		t.Error("不是有效的 zip 文件")
	}
}

func TestDisplayNameFromUpload(t *testing.T) {
	cases := []struct {
		in, ext, want string
	}{
		{"book.txt", ".epub", "book.epub"},
		{"我的小说.txt", ".epub", "我的小说.epub"},
		{`C:\foo\bar\小说.gbk`, ".mobi", "小说.mobi"},
		{"../../etc/passwd.txt", ".epub", "passwd.epub"},
		{"a<>b|c?.txt", ".epub", "a__b_c_.epub"},
		{"", ".epub", "book.epub"},
	}
	for _, c := range cases {
		got := displayNameFromUpload(c.in, c.ext)
		if got != c.want {
			t.Errorf("displayNameFromUpload(%q,%q)=%q, want %q", c.in, c.ext, got, c.want)
		}
	}
}

func TestSanitizeDownloadName_RejectsTraversal(t *testing.T) {
	if got := sanitizeDownloadName("../secret.epub", ".epub"); got != "secret.epub" {
		t.Errorf("路径应被剥离为 base, got %q", got)
	}
	if got := sanitizeDownloadName("ok.txt", ".epub"); got != "ok.epub" {
		t.Errorf("扩展名应强制为产物类型, got %q", got)
	}
	if got := sanitizeDownloadName("", ".epub"); got != "" {
		t.Errorf("空名应返回空, got %q", got)
	}
}

func TestDownload_PathTraversalBlocked(t *testing.T) {
	s := newTestServer(t)
	cases := []string{
		"..%2F..%2Fetc%2Fpasswd",
		"../../../etc/passwd",
		"..\\..\\windows\\system32",
		"C:Windows",
		"foo.epub", // 不符合命名白名单
	}
	for _, name := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/download/"+name, nil)
		rec := httptest.NewRecorder()
		s.handleDownload(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("跨目录/非法名 %q 应返回 400,得到 %d", name, rec.Code)
		}
	}
}

func TestConvert_IgnoresClientConfigPath(t *testing.T) {
	s := newTestServer(t)
	// 即便客户端塞 configPath，服务端也必须忽略，不能读任意路径。
	body, ct := buildMultipart(t, map[string]string{
		"splitMode": "0", "fullReg": "", "removeBlank": "true", "autoMark": "true",
		"title": "书", "author": "a", "lineHeight": "120", "fontSize": "100",
		"marginTop": "5", "textAlign": "0",
		"configPath": "/etc/passwd",
	}, "file", "book.txt", "第1章 开端\n　　正文。\n")
	req := httptest.NewRequest(http.MethodPost, "/api/convert", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	s.handleConvert(rec, req)
	// 应成功(忽略 configPath)，而非因读 /etc/passwd 失败。
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "outputDir") {
		t.Error("响应不应泄漏 outputDir 绝对路径")
	}
}

func TestConvert_ErrorDoesNotLeakPath(t *testing.T) {
	s := newTestServer(t)
	// 空文件字段 → 400，错误文案不含路径分隔符盘符。
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("title", "x")
	w.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/convert", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	s.handleConvert(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", rec.Code)
	}
	body := rec.Body.String()
	if strings.Contains(body, ":\\") || strings.Contains(body, "/Users/") || strings.Contains(body, "/home/") {
		t.Errorf("错误信息泄漏路径: %s", body)
	}
}

func TestNew_DefaultBindLocalhost(t *testing.T) {
	dir := t.TempDir()
	s, err := New(Config{WorkDir: dir})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if s.cfg.Addr != "127.0.0.1:8080" {
		t.Errorf("默认 Addr=%s 期望 127.0.0.1:8080", s.cfg.Addr)
	}
}
