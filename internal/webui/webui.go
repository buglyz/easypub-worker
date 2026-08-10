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
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/easypub/go-easypub/internal/converter"
	"github.com/easypub/go-easypub/internal/txt"
)

//go:embed static/*
var staticFS embed.FS

// Config 描述服务配置。
type Config struct {
	Addr    string // 监听地址,如 ":8080"
	WorkDir string // 工作目录,用于查找 config.xml/ereaders.xml,也是默认输出目录
	Version string
}

// Server 是 WebUI 服务。
type Server struct {
	cfg     Config
	outputs string // 输出/临时目录,保存生成的 epub 供下载
}

// New 构造 Server。静默创建输出目录。
func New(cfg Config) (*Server, error) {
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
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
	return &Server{cfg: cfg, outputs: outputs}, nil
}

// Run 启动 HTTP 服务并阻塞(阻塞直至服务器被终止)。
func (s *Server) Run() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/detect", s.handleDetect)
	mux.HandleFunc("/api/convert", s.handleConvert)
	mux.HandleFunc("/api/download/", s.handleDownload)

	log.Printf("EasyPub WebUI 已启动: http://%s", s.cfg.Addr)
	if s.cfg.Version != "" {
		log.Printf("版本: %s", s.cfg.Version)
	}
	log.Printf("输出目录: %s", s.outputs)

	srv := &http.Server{
		Addr:              s.cfg.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return srv.ListenAndServe()
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
type detectReq struct {
	Title       string   `json:"title"`
	Author      string   `json:"author"`
	ConfigPath  string   `json:"configPath"`
	SplitMode   int      `json:"splitMode"`
	FullReg     string   `json:"fullReg"`
	AutoMark    bool     `json:"autoMark"`
	RemoveBlank bool     `json:"removeBlank"`
}

// detectHandler 内部:解析文本返回章节标题列表。由 handleDetect 调用。
func detectHandler(req *detectReq, text string) (map[string]interface{}, error) {
	opt := txt.Options{
		AutoMark:        req.AutoMark,
		RemoveBlankLine: req.RemoveBlank,
		SplitMode:       req.SplitMode,
		FullReg:         req.FullReg,
		ForceEmptyChapter: true,
	}
	if req.FullReg == "" {
		opt.AutoMark = true
	}
	chapters, err := txt.Parse(text, opt)
	if err != nil {
		return nil, fmt.Errorf("解析失败: %w", err)
	}
	titles := make([]string, 0, len(chapters))
	for _, c := range chapters {
		t := c.Title
		if t == "" {
			t = "(无标题章节)"
		}
		titles = append(titles, t)
	}
	return map[string]interface{}{
		"count":  len(chapters),
		"titles": titles,
		"encoding": "utf-8",
	}, nil
}

// handleDetect 上传 TXT 并返回章节识别预览(不写文件)。
func (s *Server) handleDetect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	req, text, err := parseUpload(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	res, err := detectHandler(req, text)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// convertReq 是 /api/convert 的请求体(JSON 之外的表单字段也在 parseUpload 中合并)。
type convertReq struct {
	detectReq
	Title      string  `json:"title"`
	Author     string  `json:"author"`
	LineHeight int     `json:"lineHeight"`
	FontSize   int     `json:"fontSize"`
	MarginTop  int     `json:"marginTop"`
	TextAlign  int     `json:"textAlign"`
	Indent     float64 `json:"indent"`
	EnableMobi bool    `json:"enableMobi"`
}

// handleConvert 上传 TXT 并转换,将 EPUB 写入输出目录,返回下载标识。
func (s *Server) handleConvert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	req, text, fileName, err := parseUploadWithName(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	creq := &convertReq{detectReq: *req}

	// 读取文件到临时输入(转换器需要文件路径)。
	ext := filepath.Ext(fileName)
	if !isSupportedExt(ext) {
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
	co := converter.Options{
		Input:      inPath,
		Output:     outPath,
		Title:      creq.Title,
		Author:     creq.Author,
		BaseDir:    s.cfg.WorkDir,
		ConfigPath: creq.ConfigPath,
		EnableMobi: creq.EnableMobi,
		TXTOverrides: &txt.Options{
			AutoMark:         creq.AutoMark,
			RemoveBlankLine:  creq.RemoveBlank,
			SplitMode:        creq.SplitMode,
			FullReg:          creq.FullReg,
			ForceEmptyChapter: true,
		},
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// 下载标识 = 输出文件名。
	dlName := filepath.Base(res.EpubPath)
	mobiName := ""
	if res.MobiPath != "" {
		mobiName = filepath.Base(res.MobiPath)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"download":  "/api/download/" + dlName,
		"epub":      dlName,
		"mobi":      mobiName,
		"chapters":  res.ChapterCount,
		"encoding":  res.Encoding,
		"outputDir": s.outputs,
	})
}

// handleDownload 提供已生成文件的下载。
func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/download/")
	// 防目录穿越。
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
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
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	http.ServeFile(w, r, full)
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
