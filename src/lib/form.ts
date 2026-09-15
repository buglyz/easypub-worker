import { detectAndDecode } from "./encoding";
import { optionsFromForm, type TxtOptions } from "./txt-parse";
import { cssOptionsFromFields, type CssOptions } from "./css";

export interface UploadParse {
  text: string;
  encoding: string;
  fileName: string;
  rawBytes: number;
  txtOpt: TxtOptions;
  cssOpt: CssOptions;
  title: string;
  author: string;
  fields: Record<string, string>;
}

export async function parseMultipart(
  request: Request,
  maxUploadBytes: number
): Promise<UploadParse> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("需要 multipart/form-data 上传");
  }

  // 入口预校验：声称的 Content-Length 直接超限就 413，避免被巨大 chunked / 虚标
  // 小 CL 但实流式大 body 把 Workers 内存吃满
  const clHeader = request.headers.get("content-length");
  if (clHeader) {
    const cl = parseInt(clHeader, 10);
    if (Number.isFinite(cl) && cl > maxUploadBytes) {
      throw new Error(`文件超过 ${maxUploadBytes >> 20} MB 限制`);
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new Error("解析上传失败: 文件过大或格式错误");
  }

  // 忽略客户端 configPath
  void form.get("configPath");

  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    throw new Error("缺少文件字段");
  }

  if (file.size > maxUploadBytes) {
    throw new Error(`文件超过 ${maxUploadBytes >> 20} MB 限制`);
  }

  const ab = await file.arrayBuffer();
  if (ab.byteLength > maxUploadBytes) {
    throw new Error(`文件超过 ${maxUploadBytes >> 20} MB 限制`);
  }

  const bytes = new Uint8Array(ab);
  let decoded: { text: string; encoding: string };
  try {
    decoded = detectAndDecode(bytes);
  } catch {
    throw new Error("编码识别失败");
  }

  let fileName = "upload.txt";
  if (file.name) {
    const base = file.name.replace(/\\/g, "/").split("/").pop() || "";
    if (base && base !== "." && base !== "..") fileName = base;
  }

  const txtOpt = optionsFromForm(fields);
  const cssOpt = cssOptionsFromFields(fields);

  return {
    text: decoded.text,
    encoding: decoded.encoding,
    fileName,
    rawBytes: bytes.length,
    txtOpt,
    cssOpt,
    title: (fields.title || "").trim(),
    author: (fields.author || "").trim(),
    fields,
  };
}

export function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

export type ErrorStage = "request" | "input" | "convert" | "storage";

export interface PublicError {
  code: "INVALID_INPUT" | "RESOURCE_LIMIT" | "STORAGE_ERROR" | "CONVERT_ERROR";
  message: string;
  status: 400 | 500 | 503;
}

function compactErrorMessage(err: unknown): string {
  if (err == null) return "未知错误";
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.replace(/\s+/g, " ").trim();
  if (!message) return "未知错误";
  // 只返回 message，不返回 stack；同时隐藏常见本地路径，避免泄露运行环境信息。
  const withoutPath = message.replace(/(?:[A-Za-z]:\\|\\\\)[^ ]+/g, "[内部路径]");
  return withoutPath.length > 240 ? withoutPath.slice(0, 240) + "…" : withoutPath;
}

function isInputError(message: string): boolean {
  return /multipart|解析上传|缺少文件字段|文件超过|编码|无法识别编码|正则编译失败|P3 编译失败|invalid SplitMode/i.test(
    message
  );
}

function isResourceError(message: string): boolean {
  return /exceeded resource limits|exceeded memory|memory limit|cpu time|out of memory|heap out of memory/i.test(
    message
  );
}

function storageMessage(message: string): string {
  if (/accessdenied|unauthorized|permission|forbidden/i.test(message)) {
    return "EPUB 已生成，但 R2 写入被拒绝，请检查 BUCKET 绑定和存储桶权限。";
  }
  if (/nosuchbucket|bucket.*not found|not found/i.test(message)) {
    return "EPUB 已生成，但找不到 R2 存储桶，请检查 BUCKET 绑定和 bucket_name 配置。";
  }
  if (/undefined.*put|cannot read.*put|BUCKET/i.test(message)) {
    return "EPUB 已生成，但 R2 绑定不可用，请检查变量名是否为 BUCKET。";
  }
  return `EPUB 已生成，但保存到 R2 失败：${message}`;
}

function inputMessage(message: string): string {
  return `后台任务读取输入文件失败：${message}`;
}

/** 将内部异常转换为可展示的错误，不返回堆栈、密钥或服务器路径。 */
export function toPublicError(err: unknown, stage: ErrorStage = "request"): PublicError {
  const detail = compactErrorMessage(err);
  if (isInputError(detail)) {
    return { code: "INVALID_INPUT", message: detail, status: 400 };
  }
  if (isResourceError(detail)) {
    return {
      code: "RESOURCE_LIMIT",
      message: `Worker 资源不足，转换未完成：${detail}`,
      status: 503,
    };
  }
  if (stage === "input") {
    return { code: "STORAGE_ERROR", message: inputMessage(detail), status: 503 };
  }
  if (stage === "storage") {
    return { code: "STORAGE_ERROR", message: storageMessage(detail), status: 503 };
  }
  return { code: "CONVERT_ERROR", message: `转换失败：${detail}`, status: 500 };
}

export function safeErr(err: unknown): string {
  return toPublicError(err).message;
}

export function securityHeaders(h: Headers): void {
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "no-referrer");
  h.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // 注意:style-src 需 'unsafe-inline' 以兼容前端内联样式与 JS 动态样式
  // (页面大量 style="..." 属性 / element.style.xxx / 动态注入 <style>,
  //  见 index.html / auth.html / app.js)。script-src 保持 'self',XSS 主防线不变。
  h.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
  );
}

export function withSecurity(res: Response): Response {
  const headers = new Headers(res.headers);
  securityHeaders(headers);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
