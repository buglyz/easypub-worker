/** 对齐 Go util.DetectAndDecode：UTF-8/UTF-16/GBK/GB18030/Big5 */

/** 候选编码快筛样本大小（64 KB），避免大文件在失败编码上重复全量解码 */
const SAMPLE_PROBE_BYTES = 64 * 1024;

function hasPrefix(b: Uint8Array, prefix: number[]): boolean {
  if (b.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (b[i] !== prefix[i]) return false;
  }
  return true;
}

function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

function probeDecodeSample(bytes: Uint8Array, label: string): boolean {
  if (bytes.length <= SAMPLE_PROBE_BYTES) return true;
  const sample = bytes.subarray(0, SAMPLE_PROBE_BYTES);
  try {
    const dec = new TextDecoder(label, { fatal: true, ignoreBOM: false });
    const s = dec.decode(sample, { stream: true });
    return !s.includes("\uFFFD");
  } catch {
    try {
      const dec = new TextDecoder(label, { fatal: false, ignoreBOM: false });
      const s = dec.decode(sample, { stream: true });
      return !s.includes("\uFFFD");
    } catch {
      return false;
    }
  }
}

function tryDecodeLabel(bytes: Uint8Array, label: string): string | null {
  if (!probeDecodeSample(bytes, label)) return null;
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

/**
 * 检测字节流是否包含 GB18030 独有的 4 字节扩展序列（0x81-0xFE, 0x30-0x39, 0x81-0xFE, 0x30-0x39）。
 * WHATWG 规范中 TextDecoder("gbk") 是 gb18030 的别名，不同运行环境（如 Node 22 vs Node 24 / 浏览器）
 * 对 4 字节序列的处理存在差异；通过步进扫描可在所有运行时稳定区分 GBK 与 GB18030。
 */
function hasGb18030FourByteSeq(bytes: Uint8Array): boolean {
  const len = bytes.length;
  for (let i = 0; i < len; ) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      i += 1;
      continue;
    }
    if (b0 >= 0x81 && b0 <= 0xfe && i + 1 < len) {
      const b1 = bytes[i + 1];
      if (b1 >= 0x40 && b1 <= 0xfe && b1 !== 0x7f) {
        i += 2;
        continue;
      }
      if (
        b1 >= 0x30 &&
        b1 <= 0x39 &&
        i + 3 < len &&
        bytes[i + 2] >= 0x81 &&
        bytes[i + 2] <= 0xfe &&
        bytes[i + 3] >= 0x30 &&
        bytes[i + 3] <= 0x39
      ) {
        return true;
      }
    }
    i += 1;
  }
  return false;
}

function tryCandidates(bytes: Uint8Array): { text: string; enc: string } | null {
  const isGb18030Ext = hasGb18030FourByteSeq(bytes);
  const candidates: [string, string][] = isGb18030Ext
    ? [
        ["gb18030", "GB18030"],
        ["big5", "Big5"],
      ]
    : [
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
    const utf8 = tryDecodeUtf8(rest);
    if (utf8 == null) {
      const alt = tryCandidates(rest);
      if (alt) return { text: alt.text, encoding: alt.enc };
      throw new Error("UTF-8 BOM 后内容非法且候选编码均失败");
    }
    return { text: utf8, encoding: "UTF-8" };
  }
  const utf8 = tryDecodeUtf8(bytes);
  if (utf8 != null) {
    return { text: utf8, encoding: "UTF-8" };
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

export function unescapeText(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export function escapeForXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
