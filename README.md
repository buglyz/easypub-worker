# easypub (Cloudflare Workers)

TXT → EPUB 发布工具，部署在 Cloudflare Workers + R2 上的仅 EPUB 形态（无 MOBI / kindlegen）。

源码、构建与部署说明见 [`workers/easypub/`](workers/easypub/)。

## 快速开始

```bash
cd workers/easypub
npm install
npm run dev          # 本地调试
npx wrangler deploy  # 部署
```

详细配置（R2 桶、lifecycle、`ACCESS_TOKEN` 等）见 [`workers/easypub/README.md`](workers/easypub/README.md)。

> Go CLI / Docker 形态位于 `master` 分支，本分支仅保留 Workers 部署。
