/** 下载展示名净化，对齐 Go webui displayNameFromUpload / sanitize* */

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

/**
 * jobId 白名单：
 *  - 新格式 YYYYMMDD-HHMMSS-32hex（128 bit 熵，防枚举扫描）
 *  - 旧格式 YYYYMMDD-HHMMSS-8hex（向后兼容已生成的产物）
 *  - 纯 32 位 hex（兼容旧 32hex ID 形态）
 * 注意：{8,32} 区间匹配会接受 9/10/...31 hex 的中间长度，
 *       所以必须用交替分支 `8|32` 而非范围
 */
export const JOB_ID_RE =
  /^(?:[0-9]{8}-[0-9]{6}-(?:[0-9a-f]{8}|[0-9a-f]{32})|[0-9a-f]{32})$/;

export function isValidJobId(id: string): boolean {
  return JOB_ID_RE.test(id);
}

export function newJobId(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  // 16 字节 = 128 bit 熵，彻底封堵 enum 攻击（旧版仅 32 bit）
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${ts}-${hex}`;
}
