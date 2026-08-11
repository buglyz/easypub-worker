import { detectAndDecode } from "./encoding";
import { optionsFromForm, type TxtOptions } from "./txt-parse";
import { clampFloat, clampInt, defaultCss, type CssOptions } from "./css";

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
  const cssOpt = defaultCss({
    lineHeight: clampInt(parseInt(fields.lineHeight || "0", 10) || 0, 50, 300, 120),
    fontSize: clampInt(parseInt(fields.fontSize || "0", 10) || 0, 50, 300, 100),
    marginTop: clampInt(parseInt(fields.marginTop || "0", 10) || 0, 0, 50, 5),
    textAlign: clampInt(parseInt(fields.textAlign || "0", 10) || 0, 0, 3, 0),
    indent: clampFloat(parseFloat(fields.indent || "0") || 0, 0, 4, 0),
  });

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

export function safeErr(err: unknown): string {
  if (err == null) return "未知错误";
  const msg = err instanceof Error ? err.message : String(err);
  let m = msg.length > 200 ? msg.slice(0, 200) : msg;
  if (m.includes(":\\") || m.includes("/")) {
    if (m.includes("解析上传") || m.includes("multipart")) return "上传失败或文件过大";
    if (m.includes("编码")) return "编码识别失败";
    if (m.includes("文件")) return "文件处理失败";
    return "请求无效";
  }
  return m;
}

export function securityHeaders(h: Headers): void {
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "no-referrer");
  h.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );
}

export function withSecurity(res: Response): Response {
  const headers = new Headers(res.headers);
  securityHeaders(headers);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
