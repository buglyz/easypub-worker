# easypub (Cloudflare Workers)

TXT → EPUB 发布工具，部署在 Cloudflare Workers + R2 上的仅 EPUB 形态（无 MOBI / kindlegen）。

源码、构建与部署说明见 [`workers/easypub/`](workers/easypub/)。

## 快速开始（本地调试）

```bash
cd workers/easypub
npm install
npm run dev          # http://localhost:8787
```

## 公网部署教程

> **前置要求**
> - Cloudflare 账号（免费档即可，付费档 CPU 上限更宽松）
> - Node.js ≥ 22
> - 已 `npm install`（项目自带 `wrangler` devDependency，无需全局安装）

### 1. 登录 Cloudflare

```bash
cd workers/easypub
npx wrangler login
```

浏览器会弹出授权页，同意后终端会显示 `Successfully logged in`。

### 2. 创建 R2 桶

```bash
npx wrangler r2 bucket create easypub
```

桶名必须与 `wrangler.toml` 中 `bucket_name = "easypub"` 一致。若想换名，同步改 `wrangler.toml` 与下一行的 lifecycle 命令。

### 3. 配置 R2 lifecycle（24h 自动过期）

R2 不支持对象级 TTL，必须用 lifecycle 规则清理临时上传与产物：

```bash
npx wrangler r2 bucket lifecycle add easypub uploads-expire  uploads/ --expire-days 1
npx wrangler r2 bucket lifecycle add easypub outputs-expire  outputs/ --expire-days 1
npx wrangler r2 bucket lifecycle add easypub jobs-expire     jobs/    --expire-days 1
```

可校验：

```bash
npx wrangler r2 bucket lifecycle list easypub
```

### 4. 设置 ACCESS_TOKEN（公网部署**强烈建议**启用）

**不要**明文写在 `wrangler.toml`（会进 git），用 secret：

```bash
npx wrangler secret put ACCESS_TOKEN
# 提示输入时粘贴一个随机长字符串，例如：
# openssl rand -hex 32
```

启用后：

- 所有 `/api/*` 请求要求 `X-EasyPub-Token` 请求头匹配
- 访问 `https://easypub.xxx.workers.dev/` 会自动跳转到 `/auth.html` 登录页
- 在登录页输入 token，前端调 `/api/auth/verify` 验证，成功后存入 `sessionStorage` 并跳回主页
- 关闭浏览器标签页后 token 失效，下次访问需重新登录
- 也支持通过 URL 参数 `?token=xxx` 直接进入（加载后自动从地址栏抹掉）
- 静态资源（HTML/CSS/JS）本身无需 token，但 API 调用必带

> **更彻底的方案**：把 Worker 放在 Cloudflare Access 后面，零信任登录后再访问。Token + Access 双重保护是公网部署的最佳实践。

### 5. 部署

```bash
npx wrangler deploy
```

输出示例：

```
Deployed easypub triggers (xxx sec)
  https://easypub.<你的子域>.workers.dev
```

首次部署后，访问该 URL 即可使用。如果配了 `ACCESS_TOKEN`，访问 `https://easypub.xxx.workers.dev/?token=<你的token>` 进入。

### 6. （可选）绑定自定义域

两种方式：

**A. 控制台**：Cloudflare Dashboard → Workers & Pages → `easypub` → Settings → Domains & Routes → Add Custom Domain

**B. wrangler.toml**：取消注释并修改：

```toml
routes = [{ pattern = "epub.yourdomain.com/*", zone_name = "yourdomain.com" }]
```

然后重新 `npx wrangler deploy`。自定义域需要该域名已托管在 Cloudflare。

### 7. （可选）调整容量参数

编辑 `wrangler.toml` 的 `[vars]`：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MAX_UPLOAD_BYTES` | `33554432`（32MB） | 上传硬上限 |
| `SYNC_MAX_BYTES` | `20971520`（20MB） | 超过即走异步任务 |
| `OUTPUT_TTL_SECONDS` | `86400` | 仅作展示提示，实际过期由 R2 lifecycle 决定 |

改完后重新 `npx wrangler deploy`。

### 8. 升级到 Workers 付费档（按需）

免费档限制：10ms CPU / 请求、`waitUntil` 最长 30s。实测 14MB / 1593 章 UTF-8 → EPUB 约 1.9s，远低于上限。

如果常处理 >20MB 文件，建议升级 Workers Paid（$5/月）：

- CPU 时间上限提到 30s
- `waitUntil` 更长
- R2 Class A 操作 1M → 月免费 + $4.5/百万

超过 32MB 的 TXT 请先拆分；超大文件可改造为 Queues / Workflows 后台转换（见 `src/routes/convert.ts` 注释）。

## 本地开发与测试

```bash
cd workers/easypub
npm install
npm run dev          # wrangler dev，本地 Miniflare 模拟 R2
npm test             # vitest run（157 测试）
npm run typecheck    # tsc --noEmit
```

## 详细文档

完整 API、限制、安全说明、目录结构见 [`workers/easypub/README.md`](workers/easypub/README.md)。

> Go CLI / Docker 形态位于 `master` 分支，本分支仅保留 Workers 部署。
