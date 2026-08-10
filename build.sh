#!/usr/bin/env bash
# 构建脚本：编译 Linux(amd64/arm64) 与 Windows(amd64) 的 easypub 二进制。
# 用法:
#   ./build.sh            # 全部构建到 dist/
#   ./build.sh linux      # 仅 Linux
#   ./build.sh windows    # 仅 Windows
#   ./build.sh all
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="dist"
VERSION="${VERSION:-$(git describe --tags --always 2>/dev/null || echo dev)}"
LDFLAGS="-s -w -X main.version=${VERSION}"

mkdir -p "${OUT_DIR}"

build() {
  local os="$1" arch="$2" name="$3"
  echo "==> building ${os}/${arch} -> ${OUT_DIR}/${name}"
  CGO_ENABLED=0 GOOS="${os}" GOARCH="${arch}" \
    go build -trimpath -ldflags "${LDFLAGS}" -o "${OUT_DIR}/${name}" ./cmd/easypub
}

case "${1:-all}" in
  linux)
    build linux amd64 "easypub-linux-amd64"
    build linux arm64 "easypub-linux-arm64"
    ;;
  windows)
    build windows amd64 "easypub-windows-amd64.exe"
    ;;
  all|*)
    build linux amd64 "easypub-linux-amd64"
    build linux arm64 "easypub-linux-arm64"
    build windows amd64 "easypub-windows-amd64.exe"
    ;;
esac

echo "==> done. artifacts in ${OUT_DIR}/"