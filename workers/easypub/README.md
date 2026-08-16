# easypub-worker（Cloudflare Workers + R2）

TXT → EPUB 的 Cloudflare Workers 部署形态，与 Go 版（`cmd/easypub` / Docker）功能对齐，**仅生成 EPUB，无 MOBI / kindlegen**。

- 前端：复用 Go WebUI 工作台布局（拖拽上传 → 识别章节 → 排版 → 转换下载）
- 核心逻辑：TypeScript 移植 `internal/txt`（章节识别）、`internal/epub`（EPUB 2.0 打包）、`internal/css`（中文排版样式）
- 存储：R2 存临时 TXT 与生成的 EPUB，产物 24h 过期（bucket lifecycle）
- 大文件：小文件同步转换；超过阈值走异步 job（`waitUntil` 后台转换 + 前端轮询 `/api/jobs/:id`）

## 目录结构

```
workers/easypub/
  wrangler.toml        # Worker 配置：R2 binding、vars、静态资源
  package.json
  src/
    index.ts           # Worker 入口：路由 + 可选 Token 鉴权
    env.ts             # Env 类型与数字解析
    routes/
      detect.ts        # POST /api/detect  章节预览
      convert.ts       # POST /api/convert 转换（同步/异步）+ GET /api/jobs/:id
      download.ts      # GET /api/download/:id 产物下载（jobId 白名单）
    lib/
      encoding.ts      # 编码探测：UTF-8(BOM)/UTF-16(BE/LE)/GBK/GB18030/Big5
      txt-parse.ts     # 章节识别（AutoMark 默认正则、防误切、按字数、整本一章）
      epub-build.ts    # EPUB 2.0 zip（mimetype store、BOM+CRLF 对齐 Go）
      css.ts           # 中文排版 style.css（行高/字号/段前距/对齐/缩进）
      convert-core.ts  # 转换编排
      names.ts         # 下载展示名净化 + jobId 白名单
      r2.ts            # R2 对象键与读写
      form.ts          # multipart 解析、JSON 响应、安全头
    static/            # 前端（index.html / app.js / style.css / _headers）
  test/                # vitest 单元 + 集成测试（本地 R2 桩点）
```

## 本地开发

要求：Node.js ≥ 22，已安装 `wrangler`（本项目 devDependency）。

```bash
cd workers/easypub
npm install
npm run dev        # wrangler dev，默认 http://localhost:8787
```

`wrangler dev` 使用 Miniflare 本地模拟 R2，无需先建桶。

测试与类型检查：

```bash
npm test           # vitest run（157 测试，单元 + 集成）
npm run typecheck  # tsc --noEmit
npm run lint       # 同 typecheck（tsc --noEmit）
```

集成测试用内存 Map 桩点模拟 R2，覆盖：

- detect → convert（同步）→ download
- detect → convert（异步 job）→ 轮询 /api/jobs/:id 直到 done
- download Range 请求 206
- 非法 download id 400、不存在但合法的 id 404、MOBI 路径 400
- ACCESS_TOKEN 启用后无 token / 错 token / 正确 token 的 401 / 200

## 部署

### 1. 创建 R2 桶

```bash
npx wrangler r2 bucket create easypub
```

### 2. 配置 R2 lifecycle（24h 过期）

```bash
npx wrangler r2 bucket lifecycle add easypub uploads-expire uploads/ --expire-days 1
npx wrangler r2 bucket lifecycle add easypub outputs-expire outputs/ --expire-days 1
npx wrangler r2 bucket lifecycle add easypub jobs-expire jobs/ --expire-days 1
```

`wrangler.toml` 中 `bucket_name = "easypub"` 需与上面创建的桶名一致；R2 不支持对象级 TTL，过期完全由 lifecycle 规则负责。

### 3. 配置 ACCESS_TOKEN（可选，**强烈建议公网部署启用**）

**推荐用 secret，不要写进 `wrangler.toml`**（明文会进 git 历史）：

```bash
npx wrangler secret put ACCESS_TOKEN
# 提示输入时粘贴一个随机长字符串，例如 openssl rand -hex 32
```

启用后所有 `/api/*` 请求都要求请求头 `X-EasyPub-Token` 匹配，前端通过 URL 参数 `?token=<值>` 注入后自动从地址栏抹掉。

更彻底的方案：把 Worker 放在 Cloudflare Access 后面，零信任登录后再访问。Token + Access 双重保护是公网部署的最佳实践。

### 4. 发布

```bash
npx wrangler deploy
```

输出会给出 `https://easypub.<子域>.workers.dev`。

### 5. 绑定自定义域

```bash
npx wrangler deployments list          # 查看当前部署
# 在 Cloudflare 控制台 → Workers → easypub → Settings → Domains & Routes 添加自定义域，
# 或取消注释 wrangler.toml 中的 routes：
# routes = [{ pattern = "epub.example.com/*", zone_name = "example.com" }]
# 然后重新 npx wrangler deploy
```

## API

- `POST /api/detect`：multipart 上传 `file` + 切分参数 → `{ count, titles[], encoding }`（空标题章不进 `titles`，`count` 只计有标题章）
- `POST /api/convert`：multipart 上传 → 小文件同步返回 `{ async:false, download, epubName, chapters, encoding }`；大文件返回 `{ async:true, jobId, job }`
- `GET /api/jobs/:id`：异步任务状态 `{ status: pending|running|done|error, ... }`，`done` 时含 `download`；`running` 超 90s 自动标 error（防 waitUntil 崩溃后前端死循环）
- `GET /api/download/:id.epub?name=展示名`：产物下载，`id` 必须是服务端生成的 jobId（白名单 `YYYYMMDD-HHMMSS-8hex` 旧格式 / `YYYYMMDD-HHMMSS-32hex` 新格式 / 32 位 hex），非法返回 400；支持 Range 请求返回 206

表单字段（对齐 Go WebUI）：`title`、`author`、`splitMode`(0正则/1按字数/2整本)、`splitCount`、`fullReg`、`autoMark`、`removeBlank`、`addSpace`、`addSpaceCount`、`lineHeight`、`fontSize`、`marginTop`、`textAlign`、`indent`。**不接受** `configPath` / `enableMobi`。

## 限制与降级策略

| 项 | 限制 | 说明 |
|---|---|---|
| 上传体积 | 32MB（`MAX_UPLOAD_BYTES`） | Worker 请求体上限约 100MB；前端也做了 32MB 校验 |
| 同步阈值 | 20MB（`SYNC_MAX_BYTES`） | 超过走异步 job |
| CPU 时间 | 免费档 10ms / 付费档 30s | 实测 14MB/1593 章同步转换约 1.9s，远低于上限 |
| 内存 | ~128MB | 转换全程在内存中：读入 → 解码 → 切章 → 打包 |
| 产物保留 | 24h | R2 lifecycle 规则，超时自动删除 |

超过 32MB 的 TXT 请先拆分。异步任务在 Workers 免费档下 `waitUntil` 最长约 30s，超大型文件建议：

1. 提高 Workers 付费计划；
2. 或改为 Queues / Workflows 做后台转换（本项目当前用 `waitUntil` 已覆盖实测 14MB 场景，作为扩展方向记录在 `src/routes/convert.ts`）。

## 安全说明

- **公网无鉴权有风险**：默认任何能访问该 Worker URL 的人都能用你的 R2 额度转换/下载。公网部署务必启用 `ACCESS_TOKEN`（用 `wrangler secret put`）或 Cloudflare Access。
- `ACCESS_TOKEN` 比较使用常时算法（手写 timingSafeCompare），防时序侧信道。
- jobId 随机段为 128 bit 熵（16 字节 hex），封堵枚举扫描；旧格式 8hex ID 仍兼容识别但不再生成。
- 入口预校验 `Content-Length`，防止虚标小 CL 实流式大 body 把 Worker 内存吃满。
- 下载路径只接受服务端生成的 jobId 白名单格式，`?name=` 仅用于 `Content-Disposition` 展示名，不参与对象寻址。
- 展示名净化：去路径成分、非法字符替换为 `_`、强制 `.epub` 扩展名。
- 不信任客户端提供的任何路径/configPath。
- 异步任务 stale 检测：`running` 超 90s 自动标记 `error`，避免 waitUntil 崩溃后前端轮询永不收敛。
- 静态资源与 API 均带安全头：`X-Content-Type-Options`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Strict-Transport-Security`、`Permissions-Policy`、CSP（含 `base-uri 'none'` / `form-action 'self'` / `object-src 'none'` / `frame-ancestors 'none'`）。见 `src/lib/form.ts` 与 `src/static/_headers`。
- 前端下载链接做同源校验，防后端异常返回外部 URL 被用作开放重定向/钓鱼。

## 与 Go 版的关系

Workers 版是**新增并行部署形态**，不替换 Go CLI/Docker。两者共用同一份章节识别/EPUB 打包语义（Worker 端为 TS 移植），满足同一份测试夹具；Go 版继续维护其字节级对齐目标。

Workers 版的关键对齐项：

- `escapeText` 双引号转 `&#34;`（对齐 Go `html.EscapeString`）
- EPUB zip 所有条目 `mtime` 固定为 `1980-01-01 UTC`，保证同输入产出字节级一致
- XHTML 文件 BOM + CRLF
- `mimetype` 文件 store（level 0）且为 zip 第一项

## 运维与监控

### 查看 Worker 日志

```bash
npx wrangler tail easypub
```

实时打印 `console.error` 输出（如异步任务失败、内部错误堆栈）。

### 查看 R2 用量

Cloudflare Dashboard → R2 → easypub → Metrics，监控：

- Class A 操作（PUT/DELETE/GET 列出）：免费 1M / 月
- Class B 操作（GET 对象）：免费 10M / 月
- 存储用量：免费 10GB

### 手动清理对象（lifecycle 失效时）

```bash
# 列出 uploads/ 下对象
npx wrangler r2 object list easypub --prefix "uploads/"

# 删除单个
npx wrangler r2 object delete easypub uploads/<jobId>.txt
```

### 更新 ACCESS_TOKEN

```bash
npx wrangler secret put ACCESS_TOKEN
# 重新输入新值即可，无需 redeploy
```

### 升级版本

```bash
git pull origin cloudflare
cd workers/easypub
npm install
npm test                # 跑测试确认 OK
npx wrangler deploy
```
