package webui

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"

	"github.com/easypub/go-easypub/internal/txt"
	"github.com/easypub/go-easypub/internal/util"
)

// parseUpload 解析 multipart 上传,返回 detectReq 与解码后的文本。
func parseUpload(r *http.Request) (*detectReq, string, error) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		return nil, "", fmt.Errorf("解析上传失败: %w", err)
	}
	req := &detectReq{
		Title:       r.FormValue("title"),
		Author:      r.FormValue("author"),
		ConfigPath:  r.FormValue("configPath"),
		SplitMode:   atoi(r.FormValue("splitMode")),
		FullReg:     r.FormValue("fullReg"),
		AutoMark:    r.FormValue("autoMark") == "true" || r.FormValue("autoMark") == "1",
		RemoveBlank: r.FormValue("removeBlank") == "true" || r.FormValue("removeBlank") == "1",
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, "", fmt.Errorf("缺少文件字段: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return nil, "", fmt.Errorf("读取文件失败: %w", err)
	}
	text, _, err := util.DetectAndDecode(data)
	if err != nil {
		return nil, "", fmt.Errorf("编码解码失败: %w", err)
	}
	return req, text, nil
}

// parseUploadWithName 同 parseUpload,额外返回原始文件名。
func parseUploadWithName(r *http.Request) (*detectReq, string, string, error) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		return nil, "", "", fmt.Errorf("解析上传失败: %w", err)
	}
	req := &detectReq{
		Title:       r.FormValue("title"),
		Author:      r.FormValue("author"),
		ConfigPath:  r.FormValue("configPath"),
		SplitMode:   atoi(r.FormValue("splitMode")),
		FullReg:     r.FormValue("fullReg"),
		AutoMark:    r.FormValue("autoMark") == "true" || r.FormValue("autoMark") == "1",
		RemoveBlank: r.FormValue("removeBlank") == "true" || r.FormValue("removeBlank") == "1",
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		return nil, "", "", fmt.Errorf("缺少文件字段: %w", err)
	}
	defer file.Close()
	name := "upload.txt"
	if hdr != nil && hdr.Filename != "" {
		name = hdr.Filename
	}
	data, err := io.ReadAll(file)
	if err != nil {
		return nil, "", "", fmt.Errorf("读取文件失败: %w", err)
	}
	text, _, err := util.DetectAndDecode(data)
	if err != nil {
		return nil, "", "", fmt.Errorf("编码解码失败: %w", err)
	}
	return req, text, name, nil
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func randSuffix() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "rand"
	}
	return hex.EncodeToString(b)
}

// 使 txt 包被导入(webui 中尚未直接引用,留占位避免误删)。
var _ = txt.Chapter{}
