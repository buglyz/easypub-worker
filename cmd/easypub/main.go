// Package main 是 EasyPub 命令行入口。
//
// 用法:
//
//	easypub -i book.txt -o output.epub
//	easypub -i book.txt -o output.epub --title "书名" --author "作者"
//	easypub -i book.txt -o output.epub --config config.xml
//	easypub -i book.txt -o output.epub --mobi
//
// 不带参数时打印帮助。
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/easypub/go-easypub/internal/config"
	"github.com/easypub/go-easypub/internal/css"
	"github.com/easypub/go-easypub/internal/epub"
	"github.com/easypub/go-easypub/internal/mobi"
	"github.com/easypub/go-easypub/internal/txt"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("easypub: %v", err)
	}
}

func run() error {
	var (
		input    = flag.String("i", "", "输入 TXT 文件路径(必填)")
		output   = flag.String("o", "", "输出 EPUB 路径(默认: 与输入同目录、同名 .epub)")
		title    = flag.String("title", "", "书名(默认从 TXT 首个非空行或文件名推断)")
		author   = flag.String("author", "", "作者")
		configP  = flag.String("config", "", "config.xml 路径(可选,默认使用内建默认配置)")
		ereaders = flag.String("ereaders", "", "ereaders.xml 路径(默认随 config 目录)")
		fontIdx  = flag.Int("font", -1, "ereaders.xml 中阅读器字体方案索引(从 0 开始,-1=用第一个)")
		enableMobi = flag.Bool("mobi", false, "同时输出 MOBI(调用本机 kindlegen)")
		quiet    = flag.Bool("quiet", false, "静默模式:不打印进度")
	)
	flag.Usage = printUsage
	flag.Parse()

	if *input == "" {
		printUsage()
		return fmt.Errorf("缺少必填参数 -i")
	}
	if !fileExists(*input) {
		return fmt.Errorf("输入文件不存在: %s", *input)
	}

	outPath := *output
	if outPath == "" {
		ext := filepath.Ext(*input)
		outPath = strings.TrimSuffix(*input, ext) + ".epub"
	}

	// 加载配置(可选)。
	var cfg *config.Root
	baseDir := filepath.Dir(*input)
	if *configP != "" {
		c, err := config.Load(*configP)
		if err != nil {
			return fmt.Errorf("读取 config 失败: %w", err)
		}
		cfg = c
		baseDir = filepath.Dir(*configP)
	} else {
		// 尝试从输入同目录或当前工作目录加载 config.xml。
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
	text, err := txt.ReadFile(*input)
	if err != nil {
		return fmt.Errorf("读取 TXT 失败: %w", err)
	}
	opt := buildTxtOptions(cfg)
	chapters, err := txt.Parse(text, opt)
	if err != nil {
		return fmt.Errorf("解析 TXT 失败: %w", err)
	}
	if !*quiet {
		log.Printf("解析完成: %d 章", len(chapters))
	}

	// 书名推断。
	bookTitle := *title
	if bookTitle == "" {
		bookTitle = inferTitle(text, *input)
	}

	// 字体方案。
	var fontSrcs []string
	if cfg != nil {
		erPath := *ereaders
		if erPath == "" {
			erPath = filepath.Join(baseDir, "ereaders.xml")
		}
		if fileExists(erPath) {
			if er, err := cfg.LoadEReaders(baseDir); err == nil && len(er.Models) > 0 {
				idx := *fontIdx
				if idx < 0 || idx >= len(er.Models) {
					idx = 0
				}
				fontSrcs = er.Models[idx].Fonts
			}
		}
	}
	if len(fontSrcs) == 0 {
		// 默认 Nook 字体路径(与样例 ereaders.xml 第一项一致)。
		fontSrcs = []string{
			"res:///system/fonts/DroidSansFallback.ttf",
			"res:///ebook/fonts/../../system/fonts/DroidSansFallback.ttf",
		}
	}

	// 生成 CSS。
	cssOpts := css.Default(fontSrcs)
	if cfg != nil {
		applyCSSOverrides(&cssOpts, cfg)
	}
	cssContent := css.Generate(cssOpts)

	// 拼装 Book。
	book := &epub.Book{
		Title:    bookTitle,
		Author:   *author,
		Language: "zh-CN",
		CSS:      cssContent,
		Chapters: chapters,
	}

	// 生成 EPUB。
	gen := epub.New(book)
	if err := gen.Build(outPath); err != nil {
		return fmt.Errorf("生成 EPUB 失败: %w", err)
	}
	if !*quiet {
		log.Printf("已生成: %s", outPath)
	}

	// 可选 MOBI。
	if *enableMobi {
		mobiOpt := buildMobiOptions(cfg)
		mobiPath, err := mobi.Convert(mobiOpt, baseDir, outPath)
		if err != nil {
			log.Printf("MOBI 生成失败(已保留 EPUB): %v", err)
		} else if !*quiet {
			log.Printf("已生成: %s", mobiPath)
		}
	}

	return nil
}

// buildTxtOptions 从 config 构造 txt.Options。
func buildTxtOptions(cfg *config.Root) txt.Options {
	if cfg == nil {
		return txt.Options{
			AutoMark:           true,
			RemoveBlankLine:    true,
			ForceEmptyChapter:  true,
		}
	}
	r := cfg.Recent
	opt := txt.Options{
		SplitMode:            r.SplitMode,
		SplitCount:           r.SplitCount,
		FullReg:             r.FullReg,
		SimpleRegP1:         r.SimpleRegP1,
		SimpleRegP2:         r.SimpleRegP2,
		SimpleRegP3:         r.SimpleRegP3,
		SimpleRegExt:        r.SimpleRegExt,
		SimpleRegLeadingSpace: r.SimpleRegLeadSpace == 1,
		AdditionalReg:      cfg.MyRegExp.AdditionalReg,
		AutoMark:           r.AutoMark == 1,
		RemoveBlankLine:    r.RemoveBlankLine == 1,
		AddSpace:           r.AddSpace == 1,
		AddSpaceCount:      r.AddSpaceCount,
		ForceEmptyChapter:  cfg.Advanced.ForceEmptyChapter == 1,
	}
	return opt
}

// applyCSSOverrides 用 config 中的排版参数覆盖 css 默认值。
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

// buildMobiOptions 从 config 构造 mobi.Options。
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

// inferTitle 从文本首行或文件名推断书名。
func inferTitle(text, path string) string {
	// 优先取首非空行作为书名(与样例 epub 一致:首段常含"书名:XXX")。
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		// 去掉"书名:"等前缀。
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

func printUsage() {
	fmt.Fprintln(os.Stderr, "EasyPub - TXT 转 EPUB 命令行工具 (Go 重写版)")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "用法:")
	fmt.Fprintln(os.Stderr, "  easypub -i <input.txt> [options]")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "选项:")
	flag.PrintDefaults()
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "示例:")
	fmt.Fprintln(os.Stderr, "  easypub -i book.txt")
	fmt.Fprintln(os.Stderr, "  easypub -i book.txt -o out.epub --title \"书名\" --author \"作者\"")
	fmt.Fprintln(os.Stderr, "  easypub -i book.txt --config config.xml --mobi")
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
