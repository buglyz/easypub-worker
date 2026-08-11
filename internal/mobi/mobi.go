// Package mobi 调用本机 kindlegen 将 EPUB 转为 MOBI。
//
// kindlegen 是亚马逊官方工具(已停止维护)，本包不重写其内部实现，
// 只负责定位可执行文件、构造命令行、捕获输出与退出码。
package mobi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

// Options 控制 kindlegen 调用。
type Options struct {
	// ExeName kindlegen 可执行文件名(如 "kindlegen_v2.9.exe")。
	ExeName string
	// SearchDirs 查找 ExeName 的目录列表(如 ["bin", 输入同目录, PATH])。
	SearchDirs []string
	// Compress 是否启用 -c0/-c1/-c2 压缩(对应 kindlegencompress: 0/1/2)。
	Compress int
	// ExtraOptions 透传给 kindlegen 的附加参数(空白切分；含引号语义的复杂参数请避免)。
	ExtraOptions string
	// Quiet 为 true 时丢弃 kindlegen 的 stdout/stderr。
	Quiet bool
}

// FindExe 返回 kindlegen 完整路径，找不到时返回错误。
func FindExe(opt Options, baseDir string) (string, error) {
	name := opt.ExeName
	if name == "" {
		name = "kindlegen"
	}
	// 1. 显式搜索目录。
	for _, d := range opt.SearchDirs {
		if d == "" {
			continue
		}
		if !filepath.IsAbs(d) {
			d = filepath.Join(baseDir, d)
		}
		p := filepath.Join(d, name)
		if fileExists(p) {
			return p, nil
		}
	}
	// 2. baseDir 本身。
	if p := filepath.Join(baseDir, name); fileExists(p) {
		return p, nil
	}
	// 3. PATH。
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	// 4. 兼容：去 .exe 后缀/加 .exe 后缀再试。
	alt := strings.TrimSuffix(name, ".exe")
	for _, suffix := range []string{".exe", ""} {
		candidate := alt + suffix
		if p, err := exec.LookPath(candidate); err == nil {
			return p, nil
		}
		if p := filepath.Join(baseDir, candidate); fileExists(p) {
			return p, nil
		}
	}
	return "", fmt.Errorf("kindlegen 未找到: %s (请在 bin/ 放置该可执行文件，或安装到 PATH)", name)
}

// Convert 调用 kindlegen 把 epubPath 转成 mobi。
// 输出文件路径与 epubPath 同目录、同主名、扩展名 .mobi。
func Convert(opt Options, baseDir, epubPath string) (string, error) {
	exePath, err := FindExe(opt, baseDir)
	if err != nil {
		return "", err
	}
	args := []string{epubPath}
	switch opt.Compress {
	case 1:
		args = append(args, "-c1")
	case 2:
		args = append(args, "-c2")
	}
	if opt.ExtraOptions != "" {
		extra, err := splitExtraOptions(opt.ExtraOptions)
		if err != nil {
			return "", fmt.Errorf("kindlegen 附加参数非法: %w", err)
		}
		args = append(args, extra...)
	}
	// 超时保护，避免 kindlegen 卡死占满工作线程。
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, exePath, args...)
	if opt.Quiet {
		cmd.Stdout = io.Discard
		cmd.Stderr = io.Discard
	} else {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}
	cmd.Stdin = nil
	if err := cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			// kindlegen 对非致命警告也会非零退出，仍可能生成 mobi。
			mobiPath := mobiPathFor(epubPath)
			if fileExistsNonEmpty(mobiPath) {
				return mobiPath, nil
			}
		}
		return "", fmt.Errorf("kindlegen 执行失败: %w", err)
	}
	mobiPath := mobiPathFor(epubPath)
	if !fileExistsNonEmpty(mobiPath) {
		return "", fmt.Errorf("kindlegen 退出成功但未生成有效 mobi: %s", mobiPath)
	}
	return mobiPath, nil
}

// splitExtraOptions 按空白切分附加参数，拒绝 shell 元字符以防注入。
// exec.Command 不经 shell，但拒绝 `;|&$`<>` 等可降低误用/配置污染风险。
func splitExtraOptions(s string) ([]string, error) {
	for _, r := range s {
		if strings.ContainsRune(";|&$`<>(){}", r) || r == '\n' || r == '\r' {
			return nil, fmt.Errorf("含非法字符 %q", r)
		}
		if !unicode.IsPrint(r) && !unicode.IsSpace(r) {
			return nil, fmt.Errorf("含不可打印字符")
		}
	}
	fields := strings.Fields(s)
	if len(fields) > 32 {
		return nil, fmt.Errorf("参数过多(%d)", len(fields))
	}
	return fields, nil
}

func mobiPathFor(epubPath string) string {
	ext := filepath.Ext(epubPath)
	return strings.TrimSuffix(epubPath, ext) + ".mobi"
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func fileExistsNonEmpty(p string) bool {
	info, err := os.Stat(p)
	if err != nil {
		return false
	}
	return !info.IsDir() && info.Size() > 0
}
