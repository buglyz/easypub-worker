# syntax=docker/dockerfile:1

# ---- build ----
FROM golang:1.25-alpine AS builder

WORKDIR /src

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
# BuildKit 在 --platform 构建时会注入 TARGETOS / TARGETARCH
ARG TARGETOS=linux
ARG TARGETARCH=amd64

RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/easypub ./cmd/easypub

# 准备可写数据目录（distroless nonroot uid=65532）
RUN mkdir -p /data && chown 65532:65532 /data

# ---- runtime ----
# 纯静态二进制，使用 distroless 非 root 运行时。
FROM gcr.io/distroless/static-debian12:nonroot

ARG VERSION=dev
LABEL org.opencontainers.image.title="easypub" \
      org.opencontainers.image.description="TXT to EPUB converter with built-in WebUI" \
      org.opencontainers.image.source="https://github.com/buglyz/easypub" \
      org.opencontainers.image.version="${VERSION}"

WORKDIR /data
VOLUME ["/data"]

COPY --from=builder --chown=nonroot:nonroot /out/easypub /usr/local/bin/easypub
COPY --from=builder --chown=nonroot:nonroot /data /data

# 容器内必须监听 0.0.0.0，才能被宿主机端口映射访问。
# WebUI 默认无鉴权；公网暴露请自行加反向代理鉴权。
EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/usr/local/bin/easypub"]
CMD ["serve", "-addr", "0.0.0.0:8080", "-dir", "/data"]
