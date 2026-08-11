import type { Env } from "../env";
import {
  contentDispositionAttachment,
  isValidJobId,
  sanitizeDownloadName,
} from "../lib/names";
import { getEpub } from "../lib/r2";

export async function handleDownload(request: Request, env: Env, pathId: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }

  // pathId 形如 jobId.epub 或 jobId
  let jobId = pathId;
  if (jobId.endsWith(".epub")) jobId = jobId.slice(0, -5);
  if (jobId.endsWith(".mobi")) {
    return new Response("mobi not supported", { status: 400 });
  }

  if (!jobId || !isValidJobId(jobId)) {
    return new Response("invalid name", { status: 400 });
  }

  const obj = await getEpub(env, jobId);
  if (!obj) {
    return new Response("not found", { status: 404 });
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
  headers.set("X-Content-Type-Options", "nosniff");
  if (obj.size != null) headers.set("Content-Length", String(obj.size));
  if (obj.httpEtag) headers.set("ETag", obj.httpEtag);

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}
