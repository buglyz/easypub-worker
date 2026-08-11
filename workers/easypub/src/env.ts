export interface Env {
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  SYNC_MAX_BYTES?: string;
  MAX_UPLOAD_BYTES?: string;
  OUTPUT_TTL_SECONDS?: string;
  ACCESS_TOKEN?: string;
}

export function numEnv(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
