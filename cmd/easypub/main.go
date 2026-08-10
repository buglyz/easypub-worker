// Package main 是 EasyPub 命令行入口。
//
// 用法:
//
//	easypub -i book.txt -o output.epub
//	easypub -i book.txt -o output.epub --title "书名" --author "作者"
//	easypub -i book.txt -o output.epub --config config.xml
//	easypub -i book.txt -o output.epub --mobi
//	easypub serve -addr :8080
//	easypub -version
//
// 不带参数时打印帮助。
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/easypub/go-easypub/internal/converter"
	"github.com/easypub/go-easypub/internal/webui"
)

// version 通过 -ldflags "-X main.version=..." 注入，默认 dev。
var version = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "serve" {
		if err := serveCmd(os.Args[2:]); err != nil {
			log.Fatalf("easypub serve: %v", err)
		}
		return
	}
	if err := run(); err != nil {
		log.Fatalf("easypub: %v", err)
	}
}

// serveCmd 启动 WebUI。
func serveCmd(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", ":8080", "监听地址,如 :8080 或 127.0.0.1:9000")
	workdir := fs.String("dir", "", "工作目录(用于查找 config.xml/ereaders.xml,默认当前目录)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "easypub serve - 启动 WebUI")
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "用法: easypub serve [-addr :8080] [-dir workdir]")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	dir := *workdir
	if dir == "" {
		if cwd, err := os.Getwd(); err == nil {
			dir = cwd
		}
	}
	srv, err := webui.New(webui.Config{Addr: *addr, WorkDir: dir, Version: version})
	if err != nil {
		return err
	}
	return srv.Run()
}

func run() error {
	var (
		input       = flag.String("i", "", "输入 TXT 文件路径(必填)")
		output      = flag.String("o", "", "输出 EPUB 路径(默认: 与输入同目录、同名 .epub)")
		title       = flag.String("title", "", "书名(默认从 TXT 首个非空行或文件名推断)")
		author      = flag.String("author", "", "作者")
		configP     = flag.String("config", "", "config.xml 路径(可选,默认使用内建默认配置)")
		ereaders    = flag.String("ereaders", "", "ereaders.xml 路径(默认随 config 目录)")
		fontIdx     = flag.Int("font", -1, "ereaders.xml 中阅读器字体方案索引(从 0 开始,-1=用第一个)")
		enableMobi  = flag.Bool("mobi", false, "同时输出 MOBI(调用本机 kindlegen)")
		quiet       = flag.Bool("quiet", false, "静默模式:不打印进度")
		showVersion = flag.Bool("version", false, "打印版本并退出")
	)
	flag.Usage = printUsage
	flag.Parse()

	if *showVersion {
		fmt.Printf("easypub %s\n", version)
		return nil
	}
	if *input == "" {
		printUsage()
		return fmt.Errorf("缺少必填参数 -i")
	}

	res, err := converter.Convert(converter.Options{
		Input:        *input,
		Output:       *output,
		Title:        *title,
		Author:       *author,
		ConfigPath:   *configP,
		EReadersPath: *ereaders,
		FontIndex:    *fontIdx,
		EnableMobi:   *enableMobi,
	})
	if err != nil {
		return err
	}
	if !*quiet {
		log.Printf("编码: %s | 章节: %d | 已生成: %s", res.Encoding, res.ChapterCount, res.EpubPath)
		if res.MobiPath != "" {
			log.Printf("已生成 MOBI: %s", res.MobiPath)
		}
	}
	return nil
}

func printUsage() {
	fmt.Fprintln(os.Stderr, "EasyPub - TXT 转 EPUB 命令行工具 (Go 重写版)")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "用法:")
	fmt.Fprintln(os.Stderr, "  easypub -i <input.txt> [options]     转换 TXT→EPUB")
	fmt.Fprintln(os.Stderr, "  easypub serve [-addr :8080] [-dir d] 启动 WebUI")
	fmt.Fprintln(os.Stderr, "  easypub -version                      打印版本")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "转换选项:")
	flag.PrintDefaults()
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "示例:")
	fmt.Fprintln(os.Stderr, "  easypub -i book.txt")
	fmt.Fprintln(os.Stderr, "  easypub -i book.txt -o out.epub --title \"书名\" --author \"作者\"")
	fmt.Fprintln(os.Stderr, "  easypub -i book.txt --config config.xml --mobi")
}
