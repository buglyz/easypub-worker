import type { Env } from "../env";
import {
  contentDispositionAttachment,
  isValidJobId,
  sanitizeDownloadName,
} from "../lib/names";
import { getEpub } from "../lib/r2";
import { jsonResponse } from "../lib/form";

/** 解析 HTTP Range 头为 R2 GET 的 range 参数（仅支持 bytes 单区间） */
type R2Range =
  | { offset: number; length?: number }
  | { suffix: number };

function parseRange(rangeHeader: string, size?: number): R2Range | null {
  const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  const start = m[1] || "";
  const end = m[2] || "";
  if (start === "" && end === "") return null;
  if (start === "") {
    // suffix：取最后 N 字节
    const suffix = parseInt(end, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { suffix };
  }
  const offset = parseInt(start, 10);
  if (!Number.isFinite(offset) || offset < 0) return null;
  if (size != null && offset >= size) return null;
  if (end === "") return { offset };
  const endN = parseInt(end, 10);
  if (!Number.isFinite(endN) || endN < offset) return null;
  // Range end inclusive → length = end - offset + 1
  return { offset, length: endN - offset + 1 };
}

/** 计算 Content-Range 响应头中的 start/end 字节位置 */
function computeRangeBounds(range: R2Range, total: number): { start: number; end: number } {
  if ("suffix" in range) {
    return { start: Math.max(0, total - range.suffix), end: total - 1 };
  }
  const start = range.offset;
  const end = range.length != null ? Math.min(start + range.length - 1, total - 1) : total - 1;
  return { start, end };
}

export async function handleDownload(request: Request, env: Env, pathId: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  // pathId 形如 jobId.epub 或 jobId
  let jobId = pathId;
  if (jobId.endsWith(".epub")) jobId = jobId.slice(0, -5);
  if (jobId.endsWith(".mobi")) {
    return jsonResponse({ error: "mobi not supported" }, 400);
  }

  if (!jobId || !isValidJobId(jobId)) {
    return jsonResponse({ error: "invalid name" }, 400);
  }

  // Range 请求支持（大 EPUB 弱网分段下载）
  const rangeHeader = request.headers.get("Range") || "";
  const range = rangeHeader ? parseRange(rangeHeader) : null;

  const obj = range
    ? await getEpub(env, jobId, range)
    : await getEpub(env, jobId);
  if (!obj) {
    return jsonResponse({ error: "not found" }, 404);
  }

  const url = new URL(request.url);
  let display = sanitizeDownloadName(url.searchParams.get("name") || "", ".epub");
  if (!display) {
    display =
      sanitizeDownloadName(obj.customMetadata?.epubName || "", ".epub") || `${jobId}.epub`;
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/epub+zip");
  headers.set("Content-Disposition", contentDispositionAttachment(display));
  // X-Content-Type-Options 由 withSecurity 统一设置，不在此重复
  headers.set("Accept-Ranges", "bytes");

  if (range) {
    // 部分内容：计算 Content-Range + 206
    const total = obj.size ?? 0;
    const { start, end } = computeRangeBounds(range, total);
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    if (obj.size != null) {
      headers.set("Content-Length", String(end - start + 1));
    }
    if (request.method === "HEAD") {
      return new Response(null, { status: 206, headers });
    }
    return new Response(obj.body, { status: 206, headers });
  }

  if (obj.size != null) headers.set("Content-Length", String(obj.size));

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}
