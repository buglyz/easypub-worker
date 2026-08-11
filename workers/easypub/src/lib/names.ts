/** 下载展示名净化，对齐 Go webui displayNameFromUpload / sanitize* */

const ILLEGAL = /[<>:"/\\|?*]/g;

export function sanitizeFileStem(s: string): string {
  s = s.trim();
  if (!s) return "";
  let out = "";
  for (const r of s) {
    const code = r.codePointAt(0)!;
    if (code < 32 || code === 127) continue;
    if (`<>:"/\\|?*`.includes(r)) {
      out += "_";
      continue;
    }
    out += r;
  }
  out = out.trim().replace(/^[\s.]+|[\s.]+$/g, "");
  const runes = Array.from(out);
  if (runes.length > 120) {
    out = runes.slice(0, 120).join("").replace(/[\s.]+$/g, "");
  }
  if (out === "." || out === "..") return "";
  return out;
}

export function displayNameFromUpload(uploadName: string, wantExt = ".epub"): string {
  const base = uploadName.replace(/\\/g, "/").split("/").pop() || "upload.txt";
  const dot = base.lastIndexOf(".");
  // dot<0：无扩展名，stem=整名；dot===0：整名即扩展名（".txt"），stem 为空；dot>0：正常切分
  const stemRaw = dot === -1 ? base : dot > 0 ? base.slice(0, dot) : "";
  let stem = sanitizeFileStem(stemRaw);
  if (!stem) stem = "book";
  let ext = wantExt.toLowerCase();
  if (ext !== ".epub") ext = ".epub";
  return stem + ext;
}

export function sanitizeDownloadName(raw: string, wantExt = ".epub"): string {
  raw = raw.trim();
  if (!raw) return "";
  const base = raw.replace(/\\/g, "/").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  const stemRaw = dot === -1 ? base : dot > 0 ? base.slice(0, dot) : "";
  const stem = sanitizeFileStem(stemRaw);
  if (!stem) return "";
  let ext = wantExt.toLowerCase();
  if (ext !== ".epub") return "";
  return stem + ext;
}

export function contentDispositionAttachment(name: string): string {
  let fallback = "";
  for (const r of name) {
    const code = r.codePointAt(0)!;
    if (code < 128 && code >= 32 && r !== '"' && r !== "\\") fallback += r;
    else fallback += "_";
  }
  if (!fallback || fallback === "." || fallback === "..") fallback = "download";
  const encoded = encodeURIComponent(name).replace(/\+/g, "%20");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** jobId 白名单：YYYYMMDD-HHMMSS-xxxxxxxx 或 32 位 hex */
export const JOB_ID_RE = /^(?:[0-9]{8}-[0-9]{6}-[0-9a-f]{8}|[0-9a-f]{32})$/;

export function isValidJobId(id: string): boolean {
  return JOB_ID_RE.test(id);
}

export function newJobId(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${ts}-${hex}`;
}
