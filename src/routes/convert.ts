import type { Env } from "../env";
import { numEnv } from "../env";
import { parseMultipart, jsonResponse, safeErr } from "../lib/form";
import { runConvert } from "../lib/convert-core";
import { displayNameFromUpload, newJobId } from "../lib/names";
import {
  cleanupTempObjects,
  getJob,
  optsKey,
  putEpub,
  putJob,
  putTextUpload,
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
  // dev/prod 默认值对齐 wrangler.toml 的 SYNC_MAX_BYTES=20MB，避免 dev 行为漂移
  const syncMax = numEnv(env.SYNC_MAX_BYTES, 20 << 20);

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

    // 把已解码 text 透传进 waitUntil 闭包，避免异步路径再读一次 upload 对象
    ctx.waitUntil(runAsyncJob(env, jobId, up.text));

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

/**
 * 异步任务执行。text 已从 convert handler 透传过来，避免再读一次 R2 upload 对象。
 * 失败/成功统一清理 uploads 与 opts.json（产物 outputs/ 保留 24h 由 lifecycle 清）。
 */
async function runAsyncJob(env: Env, jobId: string, text: string): Promise<void> {
  let meta = await getJob(env, jobId);
  if (!meta) return;
  meta.status = "running";
  meta.startedAt = new Date().toISOString();
  meta.updatedAt = meta.startedAt;
  await putJob(env, meta);

  try {
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
    meta = await getJob(env, jobId);
    if (!meta) return;
    meta.status = "done";
    meta.chapters = result.chapters;
    meta.encoding = result.encoding;
    meta.updatedAt = new Date().toISOString();
    await putJob(env, meta);
  } catch (err) {
    console.error("async convert error", err);
    meta = await getJob(env, jobId);
    if (!meta) return;
    meta.status = "error";
    meta.error = "转换失败";
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
