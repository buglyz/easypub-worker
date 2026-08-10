// Package converter 封装一次完整的 TXT→EPUB(可选 MOBI) 转换流程，
// 供命令行 CLI 与 WebUI 复用。
package converter

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/easypub/go-easypub/internal/config"
	"github.com/easypub/go-easypub/internal/css"
	"github.com/easypub/go-easypub/internal/epub"
	"github.com/easypub/go-easypub/internal/mobi"
	"github.com/easypub/go-easypub/internal/txt"
)

// Options 描述一次转换所需的所有输入。
type Options struct {
	// Input TXT 文件绝对路径。
	Input string
	// Output 输出 EPUB 路径；为空时与 Input 同名同目录。
	Output string
	// Title/Author 书名与作者；Title 为空时自动推断。
	Title  string
	Author string
	// ConfigPath 可选的 config.xml 路径；为空自动探测。
	ConfigPath string
	// EReadersPath 可选的 ereaders.xml 路径；为空随 config 目录。
	EReadersPath string
	// FontIndex 阅读器字体方案索引；<0 用第一个。
	FontIndex int
	// EnableMobi 是否调用 kindlegen 生成 MOBI。
	EnableMobi bool
	// TXTOverrides 可选的逐项覆盖(WebUI 传入)。为 nil 时全部读 config 或默认。
	TXTOverrides *txt.Options
	// CSSOverrides 可选的 CSS 排版覆盖(WebUI 传入)。
	CSSOverrides  *CSSOverrides
	// BaseDir 独立于 Input 的配置查找基准目录(如 WebUI 的工作目录)。
	BaseDir string
}

// CSSOverrides 覆盖 CSS 排版参数(零值表示不使用该覆盖)。
type CSSOverrides struct {
	LineHeight int
	FontSize   int
	MarginTop  int
	TextAlign  int // 0=justify 1=left 2=center 3=right
	Indent     float64
}

// Result 描述一次转换的产物。
type Result struct {
	EpubPath    string
	MobiPath    string
	ChapterCount int
	Encoding    string
	OutputDir   string
}

// EpubResult 是 Result 的精简别名(WebUI 未生成 MOBI 时复用)。
type EpubResult = Result

// Convert 执行完整转换，返回产物信息。
func Convert(opt Options) (*Result, error) {
	if !fileExists(opt.Input) {
		return nil, fmt.Errorf("输入文件不存在: %s", opt.Input)
	}

	outPath := opt.Output
	if outPath == "" {
		ext := filepath.Ext(opt.Input)
		outPath = strings.TrimSuffix(opt.Input, ext) + ".epub"
	}

	// 配置与基准目录。
	baseDir := opt.BaseDir
	if baseDir == "" {
		baseDir = filepath.Dir(opt.Input)
	}
	var cfg *config.Root
	cfgDir := baseDir
	if opt.ConfigPath != "" {
		c, err := config.Load(opt.ConfigPath)
		if err != nil {
			return nil, fmt.Errorf("读取 config 失败: %w", err)
		}
		cfg = c
		cfgDir = filepath.Dir(opt.ConfigPath)
	} else {
		for _, cand := range []string{filepath.Join(baseDir, "config.xml"), "config.xml"} {
			if fileExists(cand) {
				if c, err := config.Load(cand); err == nil {
					cfg = c
				}
				break
			}
		}
	}

	// 解析 TXT。
	text, enc, err := txt.ReadFileEncoded(opt.Input)
	if err != nil {
		return nil, fmt.Errorf("读取 TXT 失败: %w", err)
	}

	txtOpt := buildTxtOptions(cfg)
	if opt.TXTOverrides != nil {
		txtOpt = *opt.TXTOverrides
	}
	chapters, err := txt.Parse(text, txtOpt)
	if err != nil {
		return nil, fmt.Errorf("解析 TXT 失败: %w", err)
	}

	// 书名。
	bookTitle := opt.Title
	if bookTitle == "" {
		bookTitle = inferTitle(text, opt.Input)
	}

	// 字体方案。
	fontSrcs := resolveFontSrcs(cfg, cfgDir, opt.EReadersPath, opt.FontIndex)

	// CSS。
	cssOpts := css.Default(fontSrcs)
	if cfg != nil && opt.CSSOverrides == nil {
		applyCSSOverrides(&cssOpts, cfg)
	}
	if opt.CSSOverrides != nil {
		applyCSSOverrideValues(&cssOpts, *opt.CSSOverrides)
	}
	cssContent := css.Generate(cssOpts)

	// 组装并生成 EPUB。
	book := &epub.Book{
		Title:    bookTitle,
		Author:   opt.Author,
		Language: "zh-CN",
		CSS:      cssContent,
		Chapters: chapters,
	}
	gen := epub.New(book)
	if err := gen.Build(outPath); err != nil {
		return nil, fmt.Errorf("生成 EPUB 失败: %w", err)
	}

	res := &Result{
		EpubPath:     outPath,
		ChapterCount: len(chapters),
		Encoding:     enc,
		OutputDir:    filepath.Dir(outPath),
	}

	// 可选 MOBI。
	if opt.EnableMobi {
		mobiOpt := buildMobiOptions(cfg)
		mobiPath, merr := mobi.Convert(mobiOpt, baseDir, outPath)
		if merr != nil {
			return res, fmt.Errorf("EPUB 已生成但 MOBI 失败: %w", merr)
		}
		res.MobiPath = mobiPath
	}

	return res, nil
}

func buildTxtOptions(cfg *config.Root) txt.Options {
	if cfg == nil {
		return txt.Options{AutoMark: true, RemoveBlankLine: true, ForceEmptyChapter: true}
	}
	r := cfg.Recent
	return txt.Options{
		SplitMode:              r.SplitMode,
		SplitCount:             r.SplitCount,
		FullReg:                r.FullReg,
		SimpleRegP1:            r.SimpleRegP1,
		SimpleRegP2:            r.SimpleRegP2,
		SimpleRegP3:            r.SimpleRegP3,
		SimpleRegExt:           r.SimpleRegExt,
		SimpleRegLeadingSpace:  r.SimpleRegLeadSpace == 1,
		AdditionalReg:          cfg.MyRegExp.AdditionalReg,
		AutoMark:               r.AutoMark == 1,
		RemoveBlankLine:        r.RemoveBlankLine == 1,
		AddSpace:               r.AddSpace == 1,
		AddSpaceCount:          r.AddSpaceCount,
		ForceEmptyChapter:      cfg.Advanced.ForceEmptyChapter == 1,
	}
}

func applyCSSOverrides(o *css.Options, cfg *config.Root) {
	r := cfg.Recent
	if r.LineHeight > 0 {
		o.LineHeight = r.LineHeight
	}
	if r.FontSize > 0 {
		o.FontSize = r.FontSize
	}
	if r.MarginTop > 0 {
		o.MarginTop = r.MarginTop
	}
	if r.TextAlign >= 0 && r.TextAlign <= 3 {
		o.TextAlign = r.TextAlign
	}
	if r.Indent > 0 {
		o.Indent = float64(r.Indent) / 10.0
	}
}

func applyCSSOverrideValues(o *css.Options, c CSSOverrides) {
	if c.LineHeight > 0 {
		o.LineHeight = c.LineHeight
	}
	if c.FontSize > 0 {
		o.FontSize = c.FontSize
	}
	if c.MarginTop > 0 {
		o.MarginTop = c.MarginTop
	}
	if c.TextAlign >= 0 && c.TextAlign <= 3 {
		o.TextAlign = c.TextAlign
	}
	if c.Indent > 0 {
		o.Indent = c.Indent
	}
}

func buildMobiOptions(cfg *config.Root) mobi.Options {
	if cfg == nil {
		return mobi.Options{ExeName: "kindlegen_v2.9.exe", SearchDirs: []string{"bin"}}
	}
	a := cfg.Advanced
	return mobi.Options{
		ExeName:      a.KindleGenExe,
		Compress:     a.KindleGenCompress,
		ExtraOptions: a.KindleGenOption,
		SearchDirs:   []string{"bin"},
	}
}

func resolveFontSrcs(cfg *config.Root, cfgDir, erPath string, fontIdx int) []string {
	var fontSrcs []string
	if cfg != nil {
		p := erPath
		if p == "" {
			p = filepath.Join(cfgDir, "ereaders.xml")
		}
		if fileExists(p) {
			if er, err := cfg.LoadEReaders(cfgDir); err == nil && len(er.Models) > 0 {
				idx := fontIdx
				if idx < 0 || idx >= len(er.Models) {
					idx = 0
				}
				fontSrcs = er.Models[idx].Fonts
			}
		}
	}
	if len(fontSrcs) == 0 {
		fontSrcs = []string{
			"res:///system/fonts/DroidSansFallback.ttf",
			"res:///ebook/fonts/../../system/fonts/DroidSansFallback.ttf",
		}
	}
	return fontSrcs
}

func inferTitle(text, path string) string {
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		if i := strings.IndexAny(t, ":："); i > 0 {
			v := strings.TrimSpace(t[i+1:])
			if v != "" {
				return v
			}
		}
		return t
	}
	b := filepath.Base(path)
	ext := filepath.Ext(b)
	return strings.TrimSuffix(b, ext)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
