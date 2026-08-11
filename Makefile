# Makefile for go-easypub
# 用法:
#   make            # 默认构建当前平台二进制到 bin/
#   make all        # 构建 linux/windows/darwin 五平台到 dist/
#   make linux      # 仅 Linux amd64 + arm64 到 dist/
#   make windows    # 仅 Windows amd64 到 dist/
#   make darwin     # 仅 macOS amd64 + arm64 到 dist/
#   make test       # 运行所有测试
#   make run        # 构建并执行一次(示例)
#   make clean      # 清理构建产物
#   make webui      # 仅构建并启动 WebUI(本地测试)
#   make docker     # 构建本地 Docker 镜像（默认入口为 WebUI）
#   make docker-run # 运行本地 Docker WebUI

VERSION ?= $(shell git describe --tags --always 2>/dev/null || echo dev)
LDFLAGS  := -s -w -X main.version=$(VERSION)
PKG      := ./cmd/easypub

.PHONY: all linux windows darwin test run webui docker docker-run clean fmt vet

all: linux windows darwin

linux:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/easypub-linux-amd64 $(PKG)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/easypub-linux-arm64 $(PKG)
	@echo "==> Linux 二进制已构建至 dist/"

windows:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/easypub-windows-amd64.exe $(PKG)
	@echo "==> Windows 二进制已构建至 dist/"

darwin:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/easypub-darwin-amd64 $(PKG)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/easypub-darwin-arm64 $(PKG)
	@echo "==> Darwin 二进制已构建至 dist/"

bin:
	@mkdir -p bin
	go build -ldflags "$(LDFLAGS)" -o bin/easypub $(PKG)

run: bin
	./bin/easypub -i testdata/sample.txt -o testdata/sample.epub

webui: bin
	./bin/easypub serve -addr 127.0.0.1:8080

# 本地构建 Docker 镜像（默认启动 WebUI）
docker:
	docker build --build-arg VERSION=$(VERSION) -t easypub:$(VERSION) -t easypub:local .

# 运行本地镜像 WebUI: http://127.0.0.1:8080
docker-run:
	docker run --rm -p 8080:8080 -v "$(CURDIR)/.easypub-output:/data" easypub:local
test:
	go test ./... -count=1

fmt:
	go fmt ./...

vet:
	go vet ./...

clean:
	rm -rf bin
	rm -rf dist
	rm -f testdata/*.epub
	rm -rf .easypub-output
