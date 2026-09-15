import type { Env } from "../env";

export interface JobMeta {
  jobId: string;
  status: "pending" | "running" | "done" | "error";
  originalName: string;
  epubName: string;
  encoding?: string;
  chapters?: number;
  error?: string;
  errorCode?: "INVALID_INPUT" | "RESOURCE_LIMIT" | "STORAGE_ERROR" | "CONVERT_ERROR";
  errorStage?: "request" | "input" | "convert" | "storage";
  createdAt: string;
  updatedAt: string;
  /** 异步任务进入 running 的时间，用于 stale 检测 */
  startedAt?: string;
  async?: boolean;
}

export function uploadKey(jobId: string): string {
  return `uploads/${jobId}.txt`;
}

export function outputKey(jobId: string): string {
  return `outputs/${jobId}.epub`;
}

export function jobKey(jobId: string): string {
  return `jobs/${jobId}.json`;
}

/** 异步任务的转换参数 key（与 job meta 分开存以减少 job 体积） */
export function optsKey(jobId: string): string {
  return `jobs/${jobId}.opts.json`;
}

export async function putJob(env: Env, meta: JobMeta): Promise<void> {
  await env.BUCKET.put(jobKey(meta.jobId), JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      originalName: meta.originalName.slice(0, 200),
      status: meta.status,
      createdAt: meta.createdAt,
    },
    // R2 无对象级 TTL：过期由 bucket lifecycle 规则统一处理（见 README）
  });
}

export async function getJob(env: Env, jobId: string): Promise<JobMeta | null> {
  const obj = await env.BUCKET.get(jobKey(jobId));
  if (!obj) return null;
  try {
    return (await obj.json()) as JobMeta;
  } catch {
    return null;
  }
}

export async function putTextUpload(
  env: Env,
  jobId: string,
  text: string,
  originalName: string
): Promise<void> {
  await env.BUCKET.put(uploadKey(jobId), text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    customMetadata: {
      originalName: originalName.slice(0, 200),
      createdAt: new Date().toISOString(),
    },
  });
}

export async function putEpub(
  env: Env,
  jobId: string,
  bytes: Uint8Array,
  epubName: string
): Promise<void> {
  await env.BUCKET.put(outputKey(jobId), bytes, {
    httpMetadata: {
      contentType: "application/epub+zip",
      // 不再在这里写 Content-Disposition：下载路径由 ?name= 显式覆盖，
      // 写在 metadata 里实际不参与响应头，纯冗余。
    },
    customMetadata: {
      epubName: epubName.slice(0, 200),
      createdAt: new Date().toISOString(),
    },
  });
}

export async function getEpub(
  env: Env,
  jobId: string,
  range?: { offset: number; length?: number } | { suffix: number }
): Promise<R2ObjectBody | null> {
  // R2 GET 支持 range 参数，类型由 @cloudflare/workers-types 提供
  return range ? env.BUCKET.get(outputKey(jobId), { range }) : env.BUCKET.get(outputKey(jobId));
}

export async function headEpub(env: Env, jobId: string): Promise<R2Object | null> {
  return env.BUCKET.head(outputKey(jobId));
}

/** 删除临时 upload 与 opts 对象（异步任务结束后的清理）。失败忽略。 */
export async function cleanupTempObjects(env: Env, jobId: string): Promise<void> {
  await Promise.allSettled([
    env.BUCKET.delete(uploadKey(jobId)),
    env.BUCKET.delete(optsKey(jobId)),
  ]);
}
