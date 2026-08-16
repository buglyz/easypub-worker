/** 对齐 Go util.DetectAndDecode：UTF-8/UTF-16/GBK/GB18030/Big5 */

function hasPrefix(b: Uint8Array, prefix: number[]): boolean {
  if (b.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (b[i] !== prefix[i]) return false;
  }
  return true;
}

function tryDecodeLabel(bytes: Uint8Array, label: string): string | null {
  const opts = { fatal: true, ignoreBOM: false } as const;
  try {
    const dec = new TextDecoder(label, opts);
    const s = dec.decode(bytes);
    if (s.includes("\uFFFD")) return null;
    return s;
  } catch {
    try {
      const dec = new TextDecoder(label, { fatal: false, ignoreBOM: false });
      const s = dec.decode(bytes);
      if (s.includes("\uFFFD")) return null;
      return s;
    } catch {
      return null;
    }
  }
}

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function tryCandidates(bytes: Uint8Array): { text: string; enc: string } | null {
  const candidates: [string, string][] = [
    ["gbk", "GBK"],
    ["gb18030", "GB18030"],
    ["big5", "Big5"],
  ];
  for (const [label, tag] of candidates) {
    const s = tryDecodeLabel(bytes, label);
    if (s != null) return { text: s, enc: tag };
  }
  return null;
}

export function detectAndDecode(bytes: Uint8Array): { text: string; encoding: string } {
  // 注意：UTF-32 BOM（FF FE 00 00 / 00 00 FE FF）会被误判为 UTF-16，
  // 与 Go 版同此缺陷，保持"语义对齐"；如需修复，在此处先做 UTF-32 探测
  if (hasPrefix(bytes, [0xff, 0xfe])) {
    const s = tryDecodeLabel(bytes.subarray(2), "utf-16le");
    if (s == null) throw new Error("UTF-16LE 解码失败");
    return { text: s, encoding: "UTF-16LE" };
  }
  if (hasPrefix(bytes, [0xfe, 0xff])) {
    const s = tryDecodeLabel(bytes.subarray(2), "utf-16be");
    if (s == null) throw new Error("UTF-16BE 解码失败");
    return { text: s, encoding: "UTF-16BE" };
  }
  if (hasPrefix(bytes, [0xef, 0xbb, 0xbf])) {
    const rest = bytes.subarray(3);
    if (!isValidUtf8(rest)) {
      const alt = tryCandidates(rest);
      if (alt) return { text: alt.text, encoding: alt.enc };
      throw new Error("UTF-8 BOM 后内容非法且候选编码均失败");
    }
    return { text: new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(rest), encoding: "UTF-8" };
  }
  if (isValidUtf8(bytes)) {
    return { text: new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(bytes), encoding: "UTF-8" };
  }
  const alt = tryCandidates(bytes);
  if (alt) return { text: alt.text, encoding: alt.enc };
  throw new Error("无法识别编码");
}

export function normalizeEOL(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&#34;")
    .replace(/'/g, "&#39;");
}

export function escapeForXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
