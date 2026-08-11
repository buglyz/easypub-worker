// Package webui 提供基于标准库 net/http 的本地 Web 界面，
// 复用 internal/converter 完成 TXT→EPUB 转换。
package webui

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/easypub/go-easypub/internal/converter"
	"github.com/easypub/go-easypub/internal/txt"
)

//go:embed static/*
var staticFS embed.FS

// maxUploadBytes 是上传文件的硬上限(64MB)。
const maxUploadBytes = 64 << 20

// maxConcurrentConverts 限制同时进行的转换数，避免 kindlegen/大文件 OOM。
const maxConcurrentConverts = 2

// downloadNameRe 限制下载文件名格式，与 outPath 命名一致。
var downloadNameRe = regexp.MustCompile(`^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}\.(epub|mobi)$`)

// Config 描述服务配置。
type Config struct {
	Addr    string // 监听地址,如 "127.0.0.1:8080"
	WorkDir string // 工作目录,用于查找 config.xml/ereaders.xml,也是默认输出目录
	Version string
}

// Server 是 WebUI 服务。
type Server struct {
	cfg     Config
	outputs string        // 输出/临时目录,保存生成的 epub 供下载
	sem     chan struct{} // 转换并发闸
}

// New 构造 Server。静默创建输出目录。
func New(cfg Config) (*Server, error) {
	if cfg.Addr == "" {
		// 默认仅绑定本机，避免局域网/公网无鉴权暴露。
		cfg.Addr = "127.0.0.1:8080"
	}
	if cfg.WorkDir == "" {
		if cwd, err := os.Getwd(); err == nil {
			cfg.WorkDir = cwd
		}
	}
	outputs := filepath.Join(cfg.WorkDir, ".easypub-output")
	if err := os.MkdirAll(outputs, 0o755); err != nil {
		return nil, fmt.Errorf("创建输出目录失败: %w", err)
	}
	return &Server{
		cfg:     cfg,
		outputs: outputs,
		sem:     make(chan struct{}, maxConcurrentConverts),
	}, nil
}

// Run 启动 HTTP 服务并阻塞(阻塞直至服务器被终止)。
func (s *Server) Run() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.withSecurityHeaders(s.handleIndex))
	mux.HandleFunc("/api/detect", s.withSecurityHeaders(s.handleDetect))
	mux.HandleFunc("/api/convert", s.withSecurityHeaders(s.handleConvert))
	mux.HandleFunc("/api/download/", s.withSecurityHeaders(s.handleDownload))

	log.Printf("EasyPub WebUI 已启动: http://%s", s.cfg.Addr)
	if s.cfg.Version != "" {
		log.Printf("版本: %s", s.cfg.Version)
	}
	log.Printf("输出目录: %s", s.outputs)
	log.Printf("提示: 默认仅本机可访问；若需局域网访问请显式指定 -addr 0.0.0.0:8080 并注意无鉴权风险")

	srv := &http.Server{
		Addr:              s.cfg.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       120 * time.Second,
		WriteTimeout:      180 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	return srv.ListenAndServe()
}

// withSecurityHeaders 为所有响应附加安全头。
func (s *Server) withSecurityHeaders(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
		next(w, r)
	}
}

// handleIndex 提供内嵌前端页面与静态资源。
func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		b, err := fs.ReadFile(staticFS, "static/index.html")
		if err != nil {
			http.Error(w, "前端页面缺失", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(b)
		return
	}
	// 其余静态资源(如 /style.css, /app.js)。
	name := strings.TrimPrefix(r.URL.Path, "/")
	b, err := fs.ReadFile(staticFS, "static/"+name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType(name))
	w.Write(b)
}

// detectReq 是 /api/detect 的请求体。
// 注意: 不接受客户端 ConfigPath，避免任意本地文件读取/二阶 RCE。
type detectReq struct {
	Title       string `json:"title"`
	Author      string `json:"author"`
	SplitMode   int    `json:"splitMode"`
	SplitCount  int    `json:"splitCount"`
	FullReg     string `json:"fullReg"`
	AutoMark    bool   `json:"autoMark"`
	RemoveBlank bool   `json:"removeBlank"`
	AddSpace    bool   `json:"addSpace"`
	AddSpaceCnt int    `json:"addSpaceCount"`
}

// detectHandler 内部:解析文本返回章节标题列表。由 handleDetect 调用。
func detectHandler(req *detectReq, text string) (map[string]interface{}, error) {
	opt := buildTxtOverrides(req)
	chapters, err := txt.Parse(text, opt)
	if err != nil {
		return nil, fmt.Errorf("解析失败")
	}
	titles := make([]string, 0, len(chapters))
	for _, c := range chapters {
		t := strings.TrimSpace(c.Title)
		if t == "" {
			// 空标题不展示（书衣/声明等前置段仍会进 EPUB spine，但不进目录预览）。
			continue
		}
		titles = append(titles, t)
	}
	return map[string]interface{}{
		// count 与预览目录一致：只计有标题的章。
		"count":    len(titles),
		"titles":   titles,
		"encoding": "utf-8",
	}, nil
}

// buildTxtOverrides 从请求构造 txt.Options，并做范围校验。
func buildTxtOverrides(req *detectReq) txt.Options {
	splitMode := req.SplitMode
	if splitMode < 0 || splitMode > 2 {
		splitMode = 0
	}
	fullReg := req.FullReg
	if len(fullReg) > 200 {
		fullReg = fullReg[:200]
	}
	opt := txt.Options{
		AutoMark:          req.AutoMark,
		RemoveBlankLine:   req.RemoveBlank,
		SplitMode:         splitMode,
		SplitCount:        req.SplitCount,
		FullReg:           fullReg,
		AddSpace:          req.AddSpace,
		AddSpaceCount:     req.AddSpaceCnt,
		ForceEmptyChapter: true,
	}
	if opt.FullReg == "" && opt.SplitMode == 0 {
		opt.AutoMark = true
	}
	if opt.AddSpace && opt.AddSpaceCount <= 0 {
		opt.AddSpaceCount = 1
	}
	return opt
}

// handleDetect 上传 TXT 并返回章节识别预览(不写文件)。
func (s *Server) handleDetect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	req, text, err := parseUpload(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": safeErr(err)})
		return
	}
	res, err := detectHandler(req, text)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": safeErr(err)})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// convertReq 是 /api/convert 的排版与输出选项。
type convertReq struct {
	LineHeight int
	FontSize   int
	MarginTop  int
	TextAlign  int
	Indent     float64
	EnableMobi bool
}

// handleConvert 上传 TXT 并转换,将 EPUB 写入输出目录,返回下载标识。
func (s *Server) handleConvert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// 并发闸：满了直接 429。
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	default:
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "服务器忙，请稍后重试"})
		return
	}

	req, text, fileName, err := parseUploadWithName(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": safeErr(err)})
		return
	}
	creq := &convertReq{
		LineHeight: clampInt(atoi(r.FormValue("lineHeight")), 50, 300, 120),
		FontSize:   clampInt(atoi(r.FormValue("fontSize")), 50, 300, 100),
		MarginTop:  clampInt(atoi(r.FormValue("marginTop")), 0, 50, 5),
		TextAlign:  clampInt(atoi(r.FormValue("textAlign")), 0, 3, 0),
		Indent:     clampFloat(atof(r.FormValue("indent")), 0, 4, 0),
		EnableMobi: parseBool(r.FormValue("enableMobi")),
	}

	// 读取文件到临时输入(转换器需要文件路径)。
	ext := filepath.Ext(fileName)
	if !isSupportedExt(ext) {
		ext = ".txt"
	}
	// 仅保留扩展名，丢弃原始文件名中的路径成分，防穿越。
	ext = strings.ToLower(filepath.Ext(ext))
	if ext == "" {
		ext = ".txt"
	}
	base := time.Now().Format("20060102-150405") + "-" + randSuffix()
	inPath := filepath.Join(s.outputs, base+ext)
	if err := os.WriteFile(inPath, []byte(text), 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "写入临时文件失败"})
		return
	}
	defer os.Remove(inPath)

	outPath := filepath.Join(s.outputs, base+".epub")
	// 仅使用 WorkDir 下的 config.xml（若存在），绝不接受客户端 configPath。
	cfgPath := ""
	if p := filepath.Join(s.cfg.WorkDir, "config.xml"); fileExists(p) {
		cfgPath = p
	}
	txtOpt := buildTxtOverrides(req)
	co := converter.Options{
		Input:        inPath,
		Output:       outPath,
		Title:        req.Title,
		Author:       req.Author,
		BaseDir:      s.cfg.WorkDir,
		ConfigPath:   cfgPath,
		EnableMobi:   creq.EnableMobi,
		TXTOverrides: &txtOpt,
		CSSOverrides: &converter.CSSOverrides{
			LineHeight: creq.LineHeight,
			FontSize:   creq.FontSize,
			MarginTop:  creq.MarginTop,
			TextAlign:  creq.TextAlign,
			Indent:     creq.Indent,
		},
	}

	res, err := converter.Convert(co)
	if err != nil {
		log.Printf("convert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "转换失败"})
		return
	}
	// 磁盘文件用随机名防冲突；下载展示名保留上传原文件名。
	dlName := filepath.Base(res.EpubPath)
	epubDisplay := displayNameFromUpload(fileName, ".epub")
	mobiName := ""
	mobiDisplay := ""
	if res.MobiPath != "" {
		mobiName = filepath.Base(res.MobiPath)
		mobiDisplay = displayNameFromUpload(fileName, ".mobi")
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"download":     "/api/download/" + dlName + "?name=" + url.QueryEscape(epubDisplay),
		"epub":         dlName,
		"epubName":     epubDisplay,
		"mobi":         mobiName,
		"mobiName":     mobiDisplay,
		"chapters":     res.ChapterCount,
		"encoding":     res.Encoding,
	})
}

// handleDownload 提供已生成文件的下载。
// 路径段必须是服务端生成的随机名；?name= 仅影响 Content-Disposition 展示名，不参与路径解析。
func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/download/")
	// 白名单文件名格式 + 防目录穿越。
	if name == "" || !downloadNameRe.MatchString(name) {
		http.Error(w, "invalid name", http.StatusBadRequest)
		return
	}
	full := filepath.Join(s.outputs, name)
	if !safeJoin(s.outputs, full) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	if !fileExists(full) {
		http.NotFound(w, r)
		return
	}
	ext := strings.ToLower(filepath.Ext(name))
	ct := "application/octet-stream"
	if ext == ".epub" {
		ct = "application/epub+zip"
	} else if ext == ".mobi" {
		ct = "application/x-mobipocket-ebook"
	}
	display := sanitizeDownloadName(r.URL.Query().Get("name"), ext)
	if display == "" {
		display = name
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", contentDispositionAttachment(display))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, full)
}

// displayNameFromUpload 由上传文件名生成下载展示名（主名 + 目标扩展名）。
func displayNameFromUpload(uploadName, wantExt string) string {
	base := filepath.Base(strings.ReplaceAll(uploadName, "\\", "/"))
	stem := strings.TrimSuffix(base, filepath.Ext(base))
	stem = sanitizeFileStem(stem)
	if stem == "" {
		stem = "book"
	}
	wantExt = strings.ToLower(wantExt)
	if wantExt != ".epub" && wantExt != ".mobi" {
		wantExt = ".epub"
	}
	return stem + wantExt
}

// sanitizeFileStem 去掉路径分隔与 Windows 非法字符，保留可读主名。
func sanitizeFileStem(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r < 32 || r == 127:
			continue
		case strings.ContainsRune(`<>:"/\|?*`, r):
			b.WriteByte('_')
		case unicode.IsSpace(r):
			// 保留普通空格，折叠由 Trim 处理两端。
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	out = strings.Trim(out, ". ")
	// 限制长度，避免超长 Content-Disposition。
	const maxRunes = 120
	if rs := []rune(out); len(rs) > maxRunes {
		out = string(rs[:maxRunes])
		out = strings.TrimRight(out, ". ")
	}
	if out == "." || out == ".." {
		return ""
	}
	return out
}

// sanitizeDownloadName 校验客户端传入的展示名：只允许安全字符，扩展名必须匹配产物。
func sanitizeDownloadName(raw, wantExt string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	base := filepath.Base(strings.ReplaceAll(raw, "\\", "/"))
	stem := strings.TrimSuffix(base, filepath.Ext(base))
	stem = sanitizeFileStem(stem)
	if stem == "" {
		return ""
	}
	wantExt = strings.ToLower(wantExt)
	if wantExt != ".epub" && wantExt != ".mobi" {
		return ""
	}
	return stem + wantExt
}

// contentDispositionAttachment 生成兼容中文的 Content-Disposition。
func contentDispositionAttachment(name string) string {
	// ASCII 回退名：非 ASCII 替换为 _，供旧客户端使用。
	var ascii strings.Builder
	for _, r := range name {
		if r < 128 && r >= 32 && r != '"' && r != '\\' {
			ascii.WriteByte(byte(r))
		} else {
			ascii.WriteByte('_')
		}
	}
	fallback := ascii.String()
	if fallback == "" || fallback == "." || fallback == ".." {
		fallback = "download"
	}
	// RFC 5987 filename*
	encoded := url.PathEscape(name)
	// PathEscape 保留部分字符，对 Content-Disposition 再把空格编成 %20。
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, fallback, encoded)
}

// safeErr 返回不泄漏绝对路径/系统细节的错误文案。
func safeErr(err error) string {
	if err == nil {
		return "未知错误"
	}
	msg := err.Error()
	// 截断过长错误，去掉可能的盘符/绝对路径片段。
	if len(msg) > 200 {
		msg = msg[:200]
	}
	if strings.Contains(msg, ":\\") || strings.Contains(msg, "/") {
		// 常见 os 错误含路径，统一脱敏。
		if strings.Contains(msg, "解析上传") {
			return "上传失败或文件过大"
		}
		if strings.Contains(msg, "编码") {
			return "编码识别失败"
		}
		if strings.Contains(msg, "文件") {
			return "文件处理失败"
		}
		return "请求无效"
	}
	return msg
}

func clampInt(v, min, max, def int) int {
	if v == 0 && def != 0 {
		// 表单缺省时 atoi 得 0；对 lineHeight/fontSize 用默认。
		if min > 0 && v < min {
			return def
		}
	}
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func clampFloat(v, min, max, def float64) float64 {
	if v < min {
		if v == 0 && def != 0 {
			return def
		}
		return min
	}
	if v > max {
		return max
	}
	return v
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func contentType(name string) string {
	switch {
	case strings.HasSuffix(name, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(name, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(name, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(name, ".svg"):
		return "image/svg+xml"
	}
	return "application/octet-stream"
}

func isSupportedExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".txt", ".utf8", ".gbk":
		return true
	}
	return false
}

func safeJoin(base, p string) bool {
	rel, err := filepath.Rel(base, p)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
