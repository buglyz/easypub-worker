import type { Env } from "../env";
import { numEnv } from "../env";
import { parseMultipart, jsonResponse, safeErr } from "../lib/form";
import { runConvert } from "../lib/convert-core";
import { displayNameFromUpload, newJobId } from "../lib/names";
import { getJob, putEpub, putJob, putTextUpload, type JobMeta } from "../lib/r2";
import { defaultCss } from "../lib/css";
import { optionsFromForm } from "../lib/txt-parse";

export async function handleConvert(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const maxUpload = numEnv(env.MAX_UPLOAD_BYTES, 32 << 20);
  const syncMax = numEnv(env.SYNC_MAX_BYTES, 3 << 20);

  let up;
  try {
    up = await parseMultipart(request, maxUpload);
  } catch (err) {
    return jsonResponse({ error: safeErr(err) }, 400);
  }

  const jobId = newJobId();
  const epubName = displayNameFromUpload(up.fileName, ".epub");
  const now = new Date().toISOString();

  // 大文件：异步 job（waitUntil 后台转换）
  if (up.rawBytes > syncMax) {
    const meta: JobMeta = {
      jobId,
      status: "pending",
      originalName: up.fileName,
      epubName,
      encoding: up.encoding,
      createdAt: now,
      updatedAt: now,
      async: true,
    };
    await putTextUpload(env, jobId, up.text, up.fileName);
    // 把转换参数也存 job meta 扩展字段（序列化 options）
    await env.BUCKET.put(
      `jobs/${jobId}.opts.json`,
      JSON.stringify({
        title: up.title,
        author: up.author,
        txtOpt: up.txtOpt,
        cssOpt: up.cssOpt,
        encoding: up.encoding,
        fileName: up.fileName,
      }),
      { httpMetadata: { contentType: "application/json" } }
    );
    await putJob(env, meta);

    ctx.waitUntil(runAsyncJob(env, jobId));

    return jsonResponse({
      async: true,
      jobId,
      status: "pending",
      job: `/api/jobs/${jobId}`,
      epubName,
      encoding: up.encoding,
      message: "文件较大，已创建异步任务，请轮询 /api/jobs/:id",
    });
  }

  // 小文件：同步
  try {
    const result = runConvert({
      text: up.text,
      fileName: up.fileName,
      title: up.title,
      author: up.author,
      encoding: up.encoding,
      txtOpt: up.txtOpt,
      cssOpt: up.cssOpt,
    });
    await putEpub(env, jobId, result.epub, epubName);
    const done: JobMeta = {
      jobId,
      status: "done",
      originalName: up.fileName,
      epubName,
      encoding: result.encoding,
      chapters: result.chapters,
      createdAt: now,
      updatedAt: new Date().toISOString(),
      async: false,
    };
    await putJob(env, done);

    const download =
      `/api/download/${jobId}.epub?name=` + encodeURIComponent(epubName);
    return jsonResponse({
      async: false,
      download,
      epub: `${jobId}.epub`,
      epubName,
      chapters: result.chapters,
      encoding: result.encoding,
      jobId,
    });
  } catch (err) {
    console.error("convert error", err);
    return jsonResponse({ error: "转换失败" }, 500);
  }
}

async function runAsyncJob(env: Env, jobId: string): Promise<void> {
  const meta = await getJob(env, jobId);
  if (!meta) return;
  meta.status = "running";
  meta.updatedAt = new Date().toISOString();
  await putJob(env, meta);

  try {
    const upload = await env.BUCKET.get(`uploads/${jobId}.txt`);
    const optsObj = await env.BUCKET.get(`jobs/${jobId}.opts.json`);
    if (!upload || !optsObj) throw new Error("missing upload");

    const text = await upload.text();
    const opts = (await optsObj.json()) as {
      title: string;
      author: string;
      txtOpt: ReturnType<typeof optionsFromForm>;
      cssOpt: ReturnType<typeof defaultCss>;
      encoding: string;
      fileName: string;
    };

    const result = runConvert({
      text,
      fileName: opts.fileName,
      title: opts.title,
      author: opts.author,
      encoding: opts.encoding,
      txtOpt: opts.txtOpt,
      cssOpt: opts.cssOpt,
    });

    await putEpub(env, jobId, result.epub, meta.epubName);
    meta.status = "done";
    meta.chapters = result.chapters;
    meta.encoding = result.encoding;
    meta.updatedAt = new Date().toISOString();
    await putJob(env, meta);
  } catch (err) {
    console.error("async convert error", err);
    meta.status = "error";
    meta.error = "转换失败";
    meta.updatedAt = new Date().toISOString();
    await putJob(env, meta);
  }
}

export async function handleJob(request: Request, env: Env, jobId: string): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }
  const meta = await getJob(env, jobId);
  if (!meta) {
    return jsonResponse({ error: "job not found" }, 404);
  }
  const body: Record<string, unknown> = {
    jobId: meta.jobId,
    status: meta.status,
    epubName: meta.epubName,
    encoding: meta.encoding,
    chapters: meta.chapters,
    async: meta.async ?? true,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
  if (meta.status === "done") {
    body.download =
      `/api/download/${meta.jobId}.epub?name=` + encodeURIComponent(meta.epubName);
    body.epub = `${meta.jobId}.epub`;
  }
  if (meta.status === "error") {
    body.error = meta.error || "转换失败";
  }
  return jsonResponse(body);
}
