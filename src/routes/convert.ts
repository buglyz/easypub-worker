import type { Env } from "../env";
import { numEnv } from "../env";
import {
  parseMultipartRaw,
  jsonResponse,
  toPublicError,
  type ErrorStage,
} from "../lib/form";
import { detectAndDecode } from "../lib/encoding";
import { parseCoverBytes, type CoverImage } from "../lib/cover";
import { runConvert } from "../lib/convert-core";
import { displayNameFromUpload, newJobId } from "../lib/names";
import {
  cleanupTempObjects,
  coverUploadKey,
  getJob,
  optsKey,
  putCoverUpload,
  putEpub,
  putJob,
  putRawUpload,
  uploadKey,
  type JobMeta,
} from "../lib/r2";
import { defaultCss } from "../lib/css";
import { optionsFromForm } from "../lib/txt-parse";

/** 异步任务 stale 检测：running/pending 超过该秒数视为崩溃（Workers waitUntil 上限 ~30s，留容错） */
const ASYNC_TIMEOUT_SECONDS = 90;

export async function handleConvert(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const maxUpload = numEnv(env.MAX_UPLOAD_BYTES, 100 << 20);
  const syncMax = numEnv(env.SYNC_MAX_BYTES, 8 << 20);

  let raw;
  try {
    raw = await parseMultipartRaw(request, maxUpload);
  } catch (err) {
    const info = toPublicError(err, "request");
    return jsonResponse({ error: info.message, code: info.code }, info.status);
  }

  const jobId = newJobId();
  const epubName = displayNameFromUpload(raw.fileName, ".epub");
  const now = new Date().toISOString();

  // 大文件：先写原始字节到 R2，不在此处同步全量解码，降低入口请求内存/CPU 峰值
  if (raw.rawBytes > syncMax) {
    const meta: JobMeta = {
      jobId,
      status: "pending",
      originalName: raw.fileName,
      epubName,
      createdAt: now,
      updatedAt: now,
      async: true,
    };
    const uploads: Promise<unknown>[] = [
      putRawUpload(env, jobId, raw.rawData, raw.fileName),
      env.BUCKET.put(
        optsKey(jobId),
        JSON.stringify({
          title: raw.title,
          author: raw.author,
          txtOpt: raw.txtOpt,
          cssOpt: raw.cssOpt,
          fileName: raw.fileName,
          hasCover: Boolean(raw.coverImage),
        }),
        { httpMetadata: { contentType: "application/json" } }
      ),
    ];
    if (raw.coverImage) {
      uploads.push(putCoverUpload(env, jobId, raw.coverImage));
    }
    await Promise.all(uploads);
    await putJob(env, meta);

    ctx.waitUntil(runAsyncJob(env, jobId));

    return jsonResponse({
      async: true,
      jobId,
      status: "pending",
      job: `/api/jobs/${jobId}`,
      epubName,
      message: "文件较大，已创建异步任务，请轮询 /api/jobs/:id",
    });
  }

  // 小文件：同步解码与转换
  let decoded: { text: string; encoding: string };
  try {
    decoded = detectAndDecode(raw.rawData);
  } catch {
    return jsonResponse({ error: "编码识别失败", code: "INVALID_INPUT" }, 400);
  }

  let stage: ErrorStage = "convert";
  try {
    const result = runConvert({
      text: decoded.text,
      fileName: raw.fileName,
      title: raw.title,
      author: raw.author,
      encoding: decoded.encoding,
      txtOpt: raw.txtOpt,
      cssOpt: raw.cssOpt,
      coverImage: raw.coverImage,
    });
    stage = "storage";
    await putEpub(env, jobId, result.epub, epubName);
    const done: JobMeta = {
      jobId,
      status: "done",
      originalName: raw.fileName,
      epubName,
      encoding: result.encoding,
      chapters: result.chapters,
      createdAt: now,
      updatedAt: new Date().toISOString(),
      async: false,
    };
    await putJob(env, done);

    const download = `/api/download/${jobId}.epub?name=` + encodeURIComponent(epubName);
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
 * 异步任务执行：从 R2 读取原始字节 → 编码识别 → 转换 → 写入产物。
 * 无论成功/失败均清理临时上传、封面与 opts。
 */
async function runAsyncJob(env: Env, jobId: string): Promise<void> {
  let meta = await getJob(env, jobId);
  if (!meta) return;

  let stage: ErrorStage = "storage";
  try {
    meta.status = "running";
    meta.startedAt = new Date().toISOString();
    meta.updatedAt = meta.startedAt;
    await putJob(env, meta);

    stage = "input";
    const upload = await env.BUCKET.get(uploadKey(jobId));
    if (!upload) throw new Error("missing job upload");
    const optsObj = await env.BUCKET.get(optsKey(jobId));
    if (!optsObj) throw new Error("missing job opts");

    const opts = (await optsObj.json()) as {
      title: string;
      author: string;
      txtOpt: ReturnType<typeof optionsFromForm>;
      cssOpt: ReturnType<typeof defaultCss>;
      encoding?: string;
      fileName: string;
      hasCover?: boolean;
    };

    const rawBytes = new Uint8Array(await upload.arrayBuffer());
    stage = "convert";
    const decoded = detectAndDecode(rawBytes);

    let coverImage: CoverImage | undefined;
    if (opts.hasCover) {
      const coverObj = await env.BUCKET.get(coverUploadKey(jobId));
      if (coverObj) {
        coverImage = parseCoverBytes(new Uint8Array(await coverObj.arrayBuffer()));
      }
    }

    const result = runConvert({
      text: decoded.text,
      fileName: opts.fileName,
      title: opts.title,
      author: opts.author,
      encoding: decoded.encoding,
      txtOpt: opts.txtOpt,
      cssOpt: opts.cssOpt,
      coverImage,
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
    meta.errorCode = info.code;
    meta.errorStage = stage;
    meta.updatedAt = new Date().toISOString();
    await putJob(env, meta);
    throw err;
  } finally {
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

  if (meta.status === "running" && meta.startedAt) {
    const ageSeconds = (Date.now() - new Date(meta.startedAt).getTime()) / 1000;
    if (ageSeconds > ASYNC_TIMEOUT_SECONDS) {
      meta.status = "error";
      meta.error = "后台任务超时或异常退出";
      meta.errorCode = "RESOURCE_LIMIT";
      meta.errorStage = "convert";
      meta.updatedAt = new Date().toISOString();
      await putJob(env, meta);
    }
  } else if (meta.status === "pending" && meta.createdAt) {
    const ageSeconds = (Date.now() - new Date(meta.createdAt).getTime()) / 1000;
    if (ageSeconds > ASYNC_TIMEOUT_SECONDS) {
      meta.status = "error";
      meta.error = "后台任务未启动,请重试";
      meta.errorCode = "CONVERT_ERROR";
      meta.errorStage = "storage";
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
    if (meta.errorCode) body.code = meta.errorCode;
    if (meta.errorStage) body.stage = meta.errorStage;
  }
  return jsonResponse(body);
}
