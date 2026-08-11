import type { Env } from "../env";

export interface JobMeta {
  jobId: string;
  status: "pending" | "running" | "done" | "error";
  originalName: string;
  epubName: string;
  encoding?: string;
  chapters?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
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
      contentDisposition: `attachment; filename="${epubName.replace(/[^\x20-\x7E]/g, "_")}"`,
    },
    customMetadata: {
      epubName: epubName.slice(0, 200),
      createdAt: new Date().toISOString(),
    },
  });
}

export async function getEpub(env: Env, jobId: string): Promise<R2ObjectBody | null> {
  return env.BUCKET.get(outputKey(jobId));
}
