package webui

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/easypub/go-easypub/internal/util"
)

// parseUpload 解析 multipart 上传,返回 detectReq 与解码后的文本。
// 忽略客户端 configPath 字段(防任意文件读取)。
func parseUpload(r *http.Request) (*detectReq, string, error) {
	req, text, _, err := parseUploadWithName(r)
	return req, text, err
}

// parseUploadWithName 同 parseUpload,额外返回净化后的原始文件名(仅 base name)。
func parseUploadWithName(r *http.Request) (*detectReq, string, string, error) {
	// 硬限制 body 大小，防止超大上传撑爆内存。
	r.Body = http.MaxBytesReader(nil, r.Body, maxUploadBytes+1<<20) // 表单开销余量
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		return nil, "", "", fmt.Errorf("解析上传失败: 文件过大或格式错误")
	}
	// 显式忽略 configPath，即使客户端发送也不读取。
	_ = r.FormValue("configPath")
	req := &detectReq{
		Title:       r.FormValue("title"),
		Author:      r.FormValue("author"),
		SplitMode:   atoi(r.FormValue("splitMode")),
		SplitCount:  atoi(r.FormValue("splitCount")),
		FullReg:     r.FormValue("fullReg"),
		AutoMark:    r.FormValue("autoMark") == "true" || r.FormValue("autoMark") == "1",
		RemoveBlank: r.FormValue("removeBlank") == "true" || r.FormValue("removeBlank") == "1",
		AddSpace:    r.FormValue("addSpace") == "true" || r.FormValue("addSpace") == "1",
		AddSpaceCnt: atoi(r.FormValue("addSpaceCount")),
	}

	file, hdr, err := r.FormFile("file")
	if err != nil {
		return nil, "", "", fmt.Errorf("缺少文件字段")
	}
	defer file.Close()
	name := "upload.txt"
	if hdr != nil && hdr.Filename != "" {
		// 只保留 base name，剥离任何路径成分。
		name = filepath.Base(hdr.Filename)
		if name == "." || name == ".." || name == "" {
			name = "upload.txt"
		}
	}
	// 再限一次实际文件读取上限。
	limited := io.LimitReader(file, maxUploadBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", "", fmt.Errorf("读取文件失败")
	}
	if int64(len(data)) > maxUploadBytes {
		return nil, "", "", fmt.Errorf("文件超过 %d MB 限制", maxUploadBytes>>20)
	}
	text, _, err := util.DetectAndDecode(data)
	if err != nil {
		return nil, "", "", fmt.Errorf("编码识别失败")
	}
	return req, text, name, nil
}

func atoi(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

func atof(s string) float64 {
	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return n
}

func parseBool(s string) bool {
	switch s {
	case "true", "1", "on", "yes":
		return true
	default:
		return false
	}
}

func randSuffix() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "rand"
	}
	return hex.EncodeToString(b)
}
