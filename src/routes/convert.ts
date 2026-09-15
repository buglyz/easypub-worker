import type { Env } from "../env";
import { numEnv } from "../env";
import {
  parseMultipart,
  jsonResponse,
  toPublicError,
  type ErrorStage,
} from "../lib/form";
import { runConvert } from "../lib/convert-core";
import { displayNameFromUpload, newJobId } from "../lib/names";
import {
  cleanupTempObjects,
  getJob,
  optsKey,
  putEpub,
  putJob,
  putTextUpload,
  uploadKey,
  type JobMeta,
} from "../lib/r2";
import { defaultCss } from "../lib/css";
import { optionsFromForm } from "../lib/txt-parse";

/** 异步任务 stale 检测：running 超过该秒数视为崩溃（Workers waitUntil 上限 ~30s，留容错） */
const ASYNC_TIMEOUT_SECONDS = 90;

export async function handleConvert(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  // 入口预校验已在 parseMultipart 中完成（Content-Length + file.size）
  const maxUpload = numEnv(env.MAX_UPLOAD_BYTES, 32 << 20);
  // 大文本会同时占用上传内容、章节数组和 ZIP 产物内存，默认 8MB 走异步降低峰值。
  const syncMax = numEnv(env.SYNC_MAX_BYTES, 8 << 20);

  let up;
  try {
    up = await parseMultipart(request, maxUpload);
  } catch (err) {
    const info = toPublicError(err, "request");
    return jsonResponse({ error: info.message, code: info.code }, info.status);
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
    // 把转换参数也存 job opts 扩展对象（与 job meta 分开存）
    await env.BUCKET.put(
      optsKey(jobId),
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

    // 不把完整 text 放进闭包；任务开始后从 R2 读取，避免请求和转换同时持有全文。
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
  let stage: ErrorStage = "convert";
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
    stage = "storage";
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
    const info = toPublicError(err, stage);
    console.error("convert error", { stage, code: info.code, error: err });
    return jsonResponse({ error: info.message, code: info.code, stage }, info.status);
  }
}

/**
 * 异步任务执行。任务开始后从 R2 读取上传文本，避免请求闭包长期持有全文。
 * 失败/成功统一清理 uploads 与 opts.json（产物 outputs/ 保留 24h 由 lifecycle 清）。
 */
async function runAsyncJob(env: Env, jobId: string): Promise<void> {
  let meta = await getJob(env, jobId);
  if (!meta) return;
  meta.status = "running";
  meta.startedAt = new Date().toISOString();
  meta.updatedAt = meta.startedAt;
  await putJob(env, meta);

  let stage: ErrorStage = "storage";
  try {
    const upload = await env.BUCKET.get(uploadKey(jobId));
    if (!upload) throw new Error("missing job upload");
    const text = await upload.text();
    const optsObj = await env.BUCKET.get(optsKey(jobId));
    if (!optsObj) throw new Error("missing job opts");

    const opts = (await optsObj.json()) as {
      title: string;
      author: string;
      txtOpt: ReturnType<typeof optionsFromForm>;
      cssOpt: ReturnType<typeof defaultCss>;
      encoding: string;
      fileName: string;
    };

    stage = "convert";
    const result = runConvert({
      text,
      fileName: opts.fileName,
      title: opts.title,
      author: opts.author,
      encoding: opts.encoding,
      txtOpt: opts.txtOpt,
      cssOpt: opts.cssOpt,
    });

    stage = "storage";
    await putEpub(env, jobId, result.epub, meta.epubName);
    meta = await getJob(env, jobId);
    if (!meta) return;
    meta.status = "done";
    meta.chapters = result.chapters;
    meta.encoding = result.encoding;
    meta.updatedAt = new Date().toISOString();
    await putJob(env, meta);
  } catch (err) {
    const info = toPublicError(err, stage);
    console.error("async convert error", { stage, code: info.code, error: err });
    meta = await getJob(env, jobId);
    if (!meta) return;
    meta.status = "error";
    meta.error = info.message;
    meta.updatedAt = new Date().toISOString();
    await putJob(env, meta);
    // 抛出以便触发 ctx.waitUntil 失败日志（Workers 会记为 unhandled rejection）
    throw err;
  } finally {
    // 无论成功/失败都清掉临时上传与 opts，减小 R2 占用
    await cleanupTempObjects(env, jobId);
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

  // stale 检测：如果处于 running 状态但 startedAt 距今已超过 ASYNC_TIMEOUT_SECONDS，
  // 视为 waitUntil 崩溃/超时，自动标记为 error，防止前端轮询永不收敛
  if (meta.status === "running" && meta.startedAt) {
    const ageSeconds = (Date.now() - new Date(meta.startedAt).getTime()) / 1000;
    if (ageSeconds > ASYNC_TIMEOUT_SECONDS) {
      meta.status = "error";
      meta.error = "后台任务超时或异常退出";
      meta.updatedAt = new Date().toISOString();
      await putJob(env, meta);
    }
  } else if (meta.status === "pending" && meta.createdAt) {
    // pending 卡住(waitUntil 未启动/启动前崩溃)同样 stale 标记 error,防前端无限轮询
    const ageSeconds = (Date.now() - new Date(meta.createdAt).getTime()) / 1000;
    if (ageSeconds > ASYNC_TIMEOUT_SECONDS) {
      meta.status = "error";
      meta.error = "后台任务未启动,请重试";
      meta.updatedAt = new Date().toISOString();
      await putJob(env, meta);
    }
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
