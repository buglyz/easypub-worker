# go-easypub

将 TXT 转换为 EPUB 的工具，用 Go 重写自 [EasyPub](http://sourceforge.net/projects/easypub/)（v1.50）。
目标：与原工具生成的 EPUB 在结构与样式上**字节级对齐**，支持 Linux/Windows 跨平台、零运行时依赖、单文件分发，并自带 WebUI。

## 核心功能

- TXT → EPUB 2.0
  - `mimetype`（不压缩）+ `META-INF/container.xml`
  - `OEBPS/` 下完整生成 `content.opf`、`toc.ncx`、`style.css`、`cover.html`、`book-toc.html`、`chapterN.html`
- **两种使用形态**：
  - 命令行（CLI）：单文件二进制，脚本/批量场景
  - WebUI：`easypub serve`，浏览器里拖拽上传、配参、识别章节、生成下载
- 自动识别章节标题（中文小说"第N章"、"序"、"楔子"、"番外"等，英文 `Chapter N`）
- 支持三类正则来源：完整正则 / 简易三段式正则 / 预定义附加正则
- 编码自动检测：UTF-8(BOM/无 BOM)、UTF-16(BE/LE BOM)、GBK、GB18030、Big5
- 中文排版 CSS（参考老牛样式），参数可调：行高、字号、段间距、对齐、缩进
- 段落首行全角空格缩进保留
- 空行去除 / 段间加空行
- 阅读器字体路径（ereaders.xml），支持 Nook、SONY PRS-505、老牛方案等
- 可选调用本机 `kindlegen` 生成 MOBI（桌面/服务器）

## 平台支持

| 平台 | 架构 | 状态 |
|---|---|---|
| Linux | amd64 | ✅ 纯静态二进制（CGO_ENABLED=0） |
| Linux | arm64 | ✅（树莓派、ARM 服务器、Termux 均可） |
| Windows | amd64 | ✅ |
| macOS | amd64/arm64 | ✅（同 `make` 命令，未在 Makefile 列出但可手动 `GOOS=darwin go build`） |

Android 不在本项目支持范围。

## 安装

```bash
go build -o easypub ./cmd/easypub
```

或用 Makefile 交叉编译全部平台：

```bash
make all      # dist/ 下产出 linux-amd64, linux-arm64, windows-amd64
make linux    # 仅 Linux
make windows  # 仅 Windows
```

## 命令行用法

最简：

```bash
./easypub -i book.txt
# 产出 book.epub（与输入同目录、同名）
```

完整：

```bash
./easypub -i book.txt -o out.epub \
  --title "书名" --author "作者" \
  --config config.xml --ereaders ereaders.xml --font 0 \
  --mobi
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `-i` | （必填） | 输入 TXT 路径 |
| `-o` | 输入同名 `.epub` | 输出 EPUB 路径 |
| `--title` | TXT 首行或文件名 | 书名 |
| `--author` | 空 | 作者 |
| `--config` | 自动尝试 `config.xml` | EasyPub 风格 config.xml 路径 |
| `--ereaders` | 随 config 目录 | ereaders.xml 路径 |
| `--font` | 0 (-1=用第一个) | ereaders.xml 中阅读器字体方案索引 |
| `--mobi` | false | 同时调用 `kindlegen` 生成 MOBI |
| `--quiet` | false | 静默模式 |
| `-version` | | 打印版本 |

## WebUI 用法

```bash
./easypub serve -addr :8080
# 浏览器打开 http://localhost:8080
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `-addr` | `:8080` | 监听地址，如 `:8080` 或 `127.0.0.1:9000` |
| `-dir`  | 当前工作目录 | 工作目录，用于查找 `config.xml`/`ereaders.xml`，也是默认输出目录 |

WebUI 流程：
1. 拖拽或点击选择 TXT 文件（自动探测编码）
2. 填写书名、作者（可留空自动推断）
3. 设置分章方式（自动/按字数/整本），可填自定义正则，点"识别章节"预览切分结果
4. 调整排版参数（行高/字号/段前距/对齐）
5. 点"开始转换"，完成后直接下载 EPUB（如开启 MOBI 则一并下载）

生成的文件默认保存到 `<工作目录>/.easypub-output/`。

## 配置文件

可直接沿用原 EasyPub 的 `config.xml` / `ereaders.xml`。示例见 [`configs/`](configs/)。

`config.xml` 中已支持的选项：

- `RecentOptions.lineheight` / `fontsize` / `margintop` / `textalign` / `indent`：CSS 排版参数
- `RecentOptions.full_reg` / `simple_reg_p1/p2/p3` / `simple_reg_ext` / `simple_reg_leadingspace`：章节切分正则
- `RecentOptions.automark`：自动识别
- `RecentOptions.removeblankline` / `addspace` / `addspacecount`：段落处理
- `MyRegExp.AdditionalReg` / `FullReg`：预定义正则下拉
- `AdvancedOptions.kindlegenexe` / `kindlegencompress` / `kindlegenoption`：MOBI 生成参数
- `AdvancedOptions.forceemptychapter`：保留空章节

未支持的项（如字体嵌入子集、HTML 原始标签透传等冷门 GUI 项）会被忽略而不报错，详见 `internal/config/config.go`。

## MOBI 输出（仅桌面/服务器）

`kindlegen` 是亚马逊专有、已停止维护的工具，**只有 Windows/macOS/Linux x86 三种版本，没有 ARM/Android 版**。
本项目不重写其内部实现，仅调用。把 `kindlegen_v2.9.exe`（或 Linux/mac 上对应的可执行）放到：

1. `bin/` 子目录（与原工具一致），或
2. 输入文件同目录，或
3. 系统 `PATH`。

加 `--mobi` 后工具会自动定位并调用。Linux 上需自行下载并赋予执行权限的 `kindlegen` Linux x86 二进制。

## 与原工具对齐情况

以原 EasyPub v1.50 生成的样例 epub（含 350 章正文）为基准，下列文件**字节级一致**：

- `mimetype`
- `META-INF/container.xml`
- `OEBPS/style.css`（在默认配置下）
- `OEBPS/cover.html`（给定同书名同作者时）
- 各 `OEBPS/chapterN.html` 模板部分（XHTML 头、generator 元、CSS 引用、`titlel2std` 标题、`.a` 段落格式）

唯一可能不一致的：`dc:identifier`（UID）我们用随机生成，样例固定为某个；这是 EPUB 规范要求每书唯一，是设计差异而非 bug。

## 目录结构

```
go-easypub/
├── cmd/easypub/         CLI 入口（支持 serve 子命令）
├── internal/
│   ├── config/          config.xml / ereaders.xml 解析
│   ├── converter/       转换核心，CLI 与 WebUI 共用
│   ├── css/             style.css 模板生成
│   ├── txt/             TXT 解析与分章
│   ├── epub/            EPUB 2.0 打包
│   ├── mobi/            kindlegen 调用
│   ├── util/            编码探测、转义等
│   └── webui/           WebUI 服务（内嵌静态前端）
├── configs/             原版兼容的示例 config.xml / ereaders.xml
├── css/                 提取自原工具的样例 style.css
├── testdata/            测试样例 TXT
├── Makefile             交叉编译与常用任务
└── build.sh             POSIX shell 构建脚本（同 Makefile 逻辑的备份）
```

## 测试

```bash
make test    # 或 go test ./...
```

覆盖：分章（多正则、中阿数字、空行、加空行、缩进、HTML 转义），CSS 模板参数，EPUB 结构与 zip 方法，BOM 头，编码探测（UTF-8/GBK/UTF-16LE），config 往返，converter 集成，WebUI（HTTP 上传/转换/下载/路径穿越防护）。
