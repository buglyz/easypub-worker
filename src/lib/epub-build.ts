/** EPUB 2.0 生成，对齐 internal/epub */

import { strToU8 } from "fflate";
import { StreamingZipWriter } from "./zip-writer";
import type { Chapter } from "./txt-parse";
import type { CoverImage } from "./cover";
import { coverExtFromMediaType } from "./cover";
import { escapeForXmlAttr, escapeText } from "./encoding";

export interface Book {
  title: string;
  author: string;
  language: string;
  date: string;
  uid: string;
  css: string;
  chapters: Chapter[];
  /** 可选封面图片；未传时保持与 Go 版纯文字封面完全一致 */
  coverImage?: CoverImage;
}

export type BuildProgressCallback = (percent: number, stage: "build" | "zip") => void;

const HTML_DOCTYPE = `<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8" />
<meta name="generator" content="EasyPub v1.50" />
<title>
%s
</title>
<link rel="stylesheet" href="style.css" type="text/css"/>
</head>
<body>
%s
</body>
</html>
`;

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

function randomId(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function fmt(tpl: string, ...args: string[]): string {
  let i = 0;
  return tpl.replace(/%s/g, () => args[i++] ?? "");
}

function coverHref(b: Book): string | null {
  if (!b.coverImage) return null;
  return `cover.${coverExtFromMediaType(b.coverImage.mediaType)}`;
}

function coverHtml(b: Book): string {
  const imgHref = coverHref(b);
  if (imgHref) {
    const body = `<div class="centeredimage" style="margin:0;padding:0;text-align:center;">\n<img src="${imgHref}" alt="${escapeForXmlAttr(b.title)}" style="max-width:100%;max-height:100%;height:auto;"/>\n</div>`;
    return fmt(HTML_DOCTYPE, "Cover", body);
  }
  const body = `<div>\n<h1 class="booktitle">${escapeText(b.title)}</h1>\n<h3 class="bookauthor">${escapeText(b.author)}</h3>\n</div>`;
  return fmt(HTML_DOCTYPE, "Cover", body);
}

function bookTocHtml(b: Book): string {
  const parts: string[] = ["<dl>\n"];
  for (let i = 0; i < b.chapters.length; i++) {
    const c = b.chapters[i];
    if (!c.title.trim()) continue;
    parts.push(`<dt class="tocl2"><a href="chapter${i}.html">${escapeText(c.title)}</a></dt>\n`);
  }
  parts.push("</dl>\n");
  const body = `<h2 class="titletoc">\n目录\n</h2>\n<div class="toc">\n${parts.join("")}</div>`;
  return fmt(HTML_DOCTYPE, "Table Of Contents", body);
}

function chapterHtml(b: Book, idx: number): string {
  const c = b.chapters[idx];
  const parts: string[] = [];
  if (c.title.trim()) {
    parts.push(`<h2 id="title" class="titlel2std">${escapeText(c.title)}</h2>\n`);
  }
  for (const p of c.body) {
    if (!p.trim()) {
      parts.push(`<p class="a"></p>\n`);
    } else {
      parts.push(`<p class="a">${p}</p>\n`);
    }
  }
  const body = parts.join("").replace(/\n$/, "");
  return fmt(HTML_DOCTYPE, `chapter ${idx} - 0`, body);
}

function opfXml(b: Book): string {
  const imgHref = coverHref(b);
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="utf-8" standalone="no"?>\n\n`);
  parts.push(`<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">\n`);
  parts.push(`<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">\n`);
  parts.push(`<dc:identifier id="bookid">${escapeForXmlAttr(b.uid)}</dc:identifier>\n`);
  parts.push(`<dc:title>${escapeText(b.title)}</dc:title>\n`);
  parts.push(`<dc:date>${escapeText(b.date)}</dc:date>\n`);
  parts.push(`<dc:rights>Created with EasyPub v1.50</dc:rights>\n`);
  parts.push(`<dc:language>${escapeText(b.language)}</dc:language>\n`);
  if (b.author) parts.push(`<dc:creator>${escapeText(b.author)}</dc:creator>\n`);
  if (imgHref) parts.push(`<meta name="cover" content="cover-image"/>\n`);
  parts.push(`</metadata>\n`);
  parts.push(`<manifest>\n`);
  parts.push(`<item id="ncxtoc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n`);
  parts.push(`<item id="htmltoc"  href="book-toc.html" media-type="application/xhtml+xml"/>\n`);
  parts.push(`<item id="css" href="style.css" media-type="text/css"/>\n`);
  parts.push(`<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>\n`);
  if (imgHref && b.coverImage) {
    parts.push(`<item id="cover-image" href="${imgHref}" media-type="${b.coverImage.mediaType}"/>\n`);
  }
  for (let i = 0; i < b.chapters.length; i++) {
    parts.push(`<item id="chapter${i}" href="chapter${i}.html" media-type="application/xhtml+xml"/>\n`);
  }
  parts.push(`</manifest>\n`);
  parts.push(`<spine toc="ncxtoc">\n`);
  parts.push(`<itemref idref="cover" linear="no"/>\n`);
  parts.push(`<itemref idref="htmltoc" linear="yes"/>\n`);
  for (let i = 0; i < b.chapters.length; i++) {
    parts.push(`<itemref idref="chapter${i}" linear="yes"/>\n`);
  }
  parts.push(`</spine>\n`);
  parts.push(`<guide>\n`);
  parts.push(`<reference href="cover.html" type="cover" title="Cover"/>\n`);
  parts.push(`<reference href="book-toc.html" type="toc" title="Table Of Contents"/>\n`);
  if (b.chapters.length > 0) {
    parts.push(`<reference href="chapter0.html" type="text" title="Beginning"/>\n`);
  }
  parts.push(`</guide>\n`);
  parts.push(`</package>\n`);
  return parts.join("");
}

function ncxXml(b: Book): string {
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="utf-8" standalone="no"?>\n`);
  parts.push(`<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n`);
  parts.push(`<ncx xmlns="http://www.daisy.org/2005/ncx/" version="2005-1">\n`);
  parts.push(`<head>\n`);
  parts.push(`<meta name="cover" content="cover"/>\n`);
  parts.push(`<meta name="dtb:uid" content="${escapeForXmlAttr(b.uid)}" />\n`);
  parts.push(`<meta name="dtb:depth" content="1"/>\n`);
  parts.push(`<meta name="dtb:generator" content="EasyPub v1.50"/>\n`);
  parts.push(`<meta name="dtb:totalPageCount" content="0"/>\n`);
  parts.push(`<meta name="dtb:maxPageNumber" content="0"/>\n`);
  parts.push(`</head>\n\n`);
  parts.push(`<docTitle>\n`);
  parts.push(`<text>${escapeText(b.title)}</text>\n`);
  parts.push(`</docTitle>\n`);
  parts.push(`<docAuthor>\n`);
  parts.push(`<text>${escapeText(b.author)}</text>\n`);
  parts.push(`</docAuthor>\n\n`);
  parts.push(`<navMap>\n`);
  let playOrder = 1;
  parts.push(`<navPoint id="cover" playOrder="${playOrder}">\n`);
  parts.push(`<navLabel><text>封面</text></navLabel>\n`);
  parts.push(`<content src="cover.html"/>\n`);
  parts.push(`</navPoint>\n\n`);
  playOrder++;
  parts.push(`<navPoint id="htmltoc" playOrder="${playOrder}">\n`);
  parts.push(`<navLabel><text>目录</text></navLabel>\n`);
  parts.push(`<content src="book-toc.html"/>\n`);
  parts.push(`</navPoint>\n\n`);
  playOrder++;
  for (let i = 0; i < b.chapters.length; i++) {
    const c = b.chapters[i];
    if (!c.title.trim()) continue;
    parts.push(`<navPoint id="chapter${i}" playOrder="${playOrder}">\n`);
    parts.push(`<navLabel><text>${escapeText(c.title)}</text></navLabel>\n`);
    parts.push(`<content src="chapter${i}.html"/>\n`);
    parts.push(`</navPoint>\n\n`);
    playOrder++;
  }
  parts.push(`</navMap>\n`);
  parts.push(`</ncx>\n`);
  return parts.join("");
}

function toCrlf(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function withBom(s: string): Uint8Array {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const body = strToU8(toCrlf(s));
  if (body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    return body;
  }
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}

export function ensureBook(
  partial: Partial<Book> & { title: string; chapters: Chapter[]; css: string }
): Book {
  return {
    title: partial.title,
    author: partial.author ?? "",
    language: partial.language || "zh-CN",
    date: partial.date || String(new Date().getFullYear()),
    uid: partial.uid || "easypub-" + randomId(4),
    css: partial.css,
    chapters: partial.chapters,
    coverImage: partial.coverImage,
  };
}

/**
 * 流式逐章构建 EPUB zip 字节：
 * - mimetype 置顶且 store（level 0）
 * - 所有条目固定 mtime 为 1980-01-01 UTC 保证字节确定性
 * - 逐章压缩写入并立即释放未压缩 XHTML 缓冲，大幅降低大文件内存峰值
 */
export function buildEpub(
  bookIn: Partial<Book> & { title: string; chapters: Chapter[]; css: string },
  onProgress?: BuildProgressCallback
): Uint8Array {
  const book = ensureBook(bookIn);
  const zip = new StreamingZipWriter();

  zip.add("mimetype", strToU8("application/epub+zip"), false);
  zip.add("META-INF/container.xml", strToU8(toCrlf(CONTAINER_XML)), true);
  zip.add("OEBPS/style.css", strToU8(toCrlf(book.css)), true);
  zip.add("OEBPS/cover.html", withBom(coverHtml(book)), true);
  const imgHref = coverHref(book);
  if (imgHref && book.coverImage) {
    // JPG/PNG/WebP 本身已压缩，store 直存省去无效 deflate CPU 开销
    zip.add(`OEBPS/${imgHref}`, book.coverImage.bytes, false);
  }
  zip.add("OEBPS/book-toc.html", withBom(bookTocHtml(book)), true);

  const totalChapters = book.chapters.length;
  const progressStep = Math.max(1, Math.floor(totalChapters / 25));
  for (let i = 0; i < totalChapters; i++) {
    zip.add(`OEBPS/chapter${i}.html`, withBom(chapterHtml(book, i)), true);
    if (onProgress && (i % progressStep === 0 || i === totalChapters - 1)) {
      const pct = 45 + Math.round(((i + 1) / totalChapters) * 45);
      onProgress(pct, "zip");
    }
  }

  zip.add("OEBPS/content.opf", withBom(opfXml(book)), true);
  zip.add("OEBPS/toc.ncx", withBom(ncxXml(book)), true);

  if (onProgress) onProgress(95, "zip");
  return zip.finish();
}

/** 推断书名：仅扫描前 8KB / 前 30 行，避免对大文本全量 split 产生巨额内存峰值 */
export function inferTitle(text: string, fileName: string): string {
  const head = text.length > 8192 ? text.slice(0, 8192) : text;
  const lines = head.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines.slice(0, 30)) {
    const t = line.trim();
    if (!t) continue;
    const prefix = t.match(/^(?:书名|Title)\s*[:：]\s*(.*)$/i);
    if (prefix) {
      const v = prefix[1].trim();
      if (v) return v;
      return t;
    }
  }
  const base = (fileName || "book").replace(/\\/g, "/").split("/").pop() || "book";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : dot === -1 ? base : "book") || "untitled";
}

/** 列出 epub 内关键路径（测试用） */
export function listEpubPaths(epubBytes: Uint8Array): string[] {
  const names: string[] = [];
  let i = 0;
  const view = epubBytes;
  while (i + 30 < view.length) {
    if (view[i] !== 0x50 || view[i + 1] !== 0x4b) break;
    if (view[i + 2] === 0x01 && view[i + 3] === 0x02) break;
    if (view[i + 2] !== 0x03 || view[i + 3] !== 0x04) break;
    const nameLen = view[i + 26] | (view[i + 27] << 8);
    const extraLen = view[i + 28] | (view[i + 29] << 8);
    const compSize =
      (view[i + 18] | (view[i + 19] << 8) | (view[i + 20] << 16) | (view[i + 21] << 24)) >>> 0;
    const nameBytes = view.subarray(i + 30, i + 30 + nameLen);
    names.push(new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(nameBytes));
    i += 30 + nameLen + extraLen + compSize;
  }
  return names;
}
