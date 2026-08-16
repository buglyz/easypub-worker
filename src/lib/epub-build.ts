/** EPUB 2.0 生成，对齐 internal/epub */

import { zipSync, strToU8 } from "fflate";
import type { Zippable, ZipOptions } from "fflate";
import type { Chapter } from "./txt-parse";
import { escapeForXmlAttr, escapeText } from "./encoding";

export interface Book {
  title: string;
  author: string;
  language: string;
  date: string;
  uid: string;
  css: string;
  chapters: Chapter[];
}

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

function coverHtml(b: Book): string {
  const body = `<div>\n<h1 class="booktitle">${escapeText(b.title)}</h1>\n<h3 class="bookauthor">${escapeText(b.author)}</h3>\n</div>`;
  return fmt(HTML_DOCTYPE, "Cover", body);
}

function bookTocHtml(b: Book): string {
  let dl = "<dl>\n";
  for (let i = 0; i < b.chapters.length; i++) {
    const c = b.chapters[i];
    if (!c.title.trim()) continue;
    dl += `<dt class="tocl2"><a href="chapter${i}.html">${escapeText(c.title)}</a></dt>\n`;
  }
  dl += "</dl>\n";
  const body = `<h2 class="titletoc">\n目录\n</h2>\n<div class="toc">\n${dl}</div>`;
  return fmt(HTML_DOCTYPE, "Table Of Contents", body);
}

function chapterHtml(b: Book, idx: number): string {
  const c = b.chapters[idx];
  let body = "";
  if (c.title.trim()) {
    body += `<h2 id="title" class="titlel2std">${escapeText(c.title)}</h2>\n`;
  }
  for (const p of c.body) {
    if (!p.trim()) {
      body += `<p class="a"></p>\n`;
      continue;
    }
    body += `<p class="a">${p}</p>\n`;
  }
  body = body.replace(/\n$/, "");
  return fmt(HTML_DOCTYPE, `chapter ${idx} - 0`, body);
}

function opfXml(b: Book): string {
  let sb = "";
  sb += `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n\n`;
  sb += `<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">\n`;
  sb += `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">\n`;
  sb += `<dc:identifier id="bookid">${escapeForXmlAttr(b.uid)}</dc:identifier>\n`;
  sb += `<dc:title>${escapeText(b.title)}</dc:title>\n`;
  sb += `<dc:date>${escapeText(b.date)}</dc:date>\n`;
  sb += `<dc:rights>Created with EasyPub v1.50</dc:rights>\n`;
  sb += `<dc:language>${escapeText(b.language)}</dc:language>\n`;
  if (b.author) sb += `<dc:creator>${escapeText(b.author)}</dc:creator>\n`;
  sb += `</metadata>\n`;
  sb += `<manifest>\n`;
  sb += `<item id="ncxtoc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n`;
  sb += `<item id="htmltoc"  href="book-toc.html" media-type="application/xhtml+xml"/>\n`;
  sb += `<item id="css" href="style.css" media-type="text/css"/>\n`;
  sb += `<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>\n`;
  for (let i = 0; i < b.chapters.length; i++) {
    sb += `<item id="chapter${i}" href="chapter${i}.html" media-type="application/xhtml+xml"/>\n`;
  }
  sb += `</manifest>\n`;
  sb += `<spine toc="ncxtoc">\n`;
  sb += `<itemref idref="cover" linear="no"/>\n`;
  sb += `<itemref idref="htmltoc" linear="yes"/>\n`;
  for (let i = 0; i < b.chapters.length; i++) {
    sb += `<itemref idref="chapter${i}" linear="yes"/>\n`;
  }
  sb += `</spine>\n`;
  sb += `<guide>\n`;
  sb += `<reference href="cover.html" type="cover" title="Cover"/>\n`;
  sb += `<reference href="book-toc.html" type="toc" title="Table Of Contents"/>\n`;
  if (b.chapters.length > 0) {
    sb += `<reference href="chapter0.html" type="text" title="Beginning"/>\n`;
  }
  sb += `</guide>\n`;
  sb += `</package>\n`;
  return sb;
}

function ncxXml(b: Book): string {
  let sb = "";
  sb += `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n`;
  sb += `<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n`;
  sb += `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n`;
  sb += `<head>\n`;
  sb += `<meta name="cover" content="cover"/>\n`;
  sb += `<meta name="dtb:uid" content="${escapeForXmlAttr(b.uid)}" />\n`;
  sb += `<meta name="dtb:depth" content="1"/>\n`;
  sb += `<meta name="dtb:generator" content="EasyPub v1.50"/>\n`;
  sb += `<meta name="dtb:totalPageCount" content="0"/>\n`;
  sb += `<meta name="dtb:maxPageNumber" content="0"/>\n`;
  sb += `</head>\n\n`;
  sb += `<docTitle>\n`;
  sb += `<text>${escapeText(b.title)}</text>\n`;
  sb += `</docTitle>\n`;
  sb += `<docAuthor>\n`;
  sb += `<text>${escapeText(b.author)}</text>\n`;
  sb += `</docAuthor>\n\n`;
  sb += `<navMap>\n`;
  let playOrder = 1;
  sb += `<navPoint id="cover" playOrder="${playOrder}">\n`;
  sb += `<navLabel><text>封面</text></navLabel>\n`;
  sb += `<content src="cover.html"/>\n`;
  sb += `</navPoint>\n\n`;
  playOrder++;
  sb += `<navPoint id="htmltoc" playOrder="${playOrder}">\n`;
  sb += `<navLabel><text>目录</text></navLabel>\n`;
  sb += `<content src="book-toc.html"/>\n`;
  sb += `</navPoint>\n\n`;
  playOrder++;
  for (let i = 0; i < b.chapters.length; i++) {
    const c = b.chapters[i];
    if (!c.title.trim()) continue;
    sb += `<navPoint id="chapter${i}" playOrder="${playOrder}">\n`;
    sb += `<navLabel><text>${escapeText(c.title)}</text></navLabel>\n`;
    sb += `<content src="chapter${i}.html"/>\n`;
    sb += `</navPoint>\n\n`;
    playOrder++;
  }
  sb += `</navMap>\n`;
  sb += `</ncx>\n`;
  return sb;
}

function toCrlf(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function withBom(s: string): Uint8Array {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const body = strToU8(toCrlf(s));
  // 防御：如 s 已带 UTF-8 BOM，不再追加（对齐 Go if !bytes.HasPrefix(content, bom)）
  if (body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    return body;
  }
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}

function u8(s: string): Uint8Array {
  return strToU8(s);
}

export function ensureBook(partial: Partial<Book> & { title: string; chapters: Chapter[]; css: string }): Book {
  return {
    title: partial.title,
    author: partial.author ?? "",
    language: partial.language || "zh-CN",
    date: partial.date || String(new Date().getFullYear()),
    uid: partial.uid || "easypub-" + randomId(4),
    css: partial.css,
    chapters: partial.chapters,
  };
}

/** 生成 EPUB zip 字节（mimetype 第一项 store，全部条目固定 mtime 保证字节确定性） */
export function buildEpub(bookIn: Partial<Book> & { title: string; chapters: Chapter[]; css: string }): Uint8Array {
  const book = ensureBook(bookIn);

  // fflate zipSync 的 Zippable：每个条目 [bytes, ZipOptions]
  // mtime 固定为 1980-01-01 UTC（ZIP DOS time 起始年），保证同输入产出字节级一致
  // 对齐 Go fixedTime = time.Unix(0,0).UTC() 的"确定性"目标，但用 ZIP 合法最小时间
  // mimetype 必须 level:0 (store) 且为第一项；其他条目走默认 level:6 (deflate)
  const fixedTime: Date = new Date("1980-01-01T00:00:00Z");
  const fixedOpts: ZipOptions = { mtime: fixedTime };
  const mimetypeOpts: ZipOptions = { level: 0, mtime: fixedTime };
  const files: Zippable = {};

  files["mimetype"] = [u8("application/epub+zip"), mimetypeOpts];
  files["META-INF/container.xml"] = [u8(toCrlf(CONTAINER_XML)), fixedOpts];
  files["OEBPS/style.css"] = [u8(toCrlf(book.css)), fixedOpts];
  files["OEBPS/cover.html"] = [withBom(coverHtml(book)), fixedOpts];
  files["OEBPS/book-toc.html"] = [withBom(bookTocHtml(book)), fixedOpts];
  for (let i = 0; i < book.chapters.length; i++) {
    files[`OEBPS/chapter${i}.html`] = [withBom(chapterHtml(book, i)), fixedOpts];
  }
  files["OEBPS/content.opf"] = [withBom(opfXml(book)), fixedOpts];
  files["OEBPS/toc.ncx"] = [withBom(ncxXml(book)), fixedOpts];

  // fflate zipSync 对对象键顺序：现代 JS 字符串键按插入序
  return zipSync(files, { level: 6 });
}

/** 推断书名：首行非空或文件名 */
export function inferTitle(text: string, fileName: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines.slice(0, 30)) {
    const t = line.trim();
    if (!t) continue;
    // 「书名：X」或「Title: X」前缀
    const prefix = t.match(/^(?:书名|Title)\s*[:：]\s*(.*)$/i);
    if (prefix) {
      const v = prefix[1].trim();
      if (v) return v;
      // 前缀后无内容，原行整体作为书名兜底（与 Go 行为对齐）
      return t;
    }
  }
  const base = (fileName || "book").replace(/\\/g, "/").split("/").pop() || "book";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : dot === -1 ? base : "book") || "untitled";
}

/** 列出 epub 内关键路径（测试用） */
export function listEpubPaths(epubBytes: Uint8Array): string[] {
  // 简单解析 local file headers
  const names: string[] = [];
  let i = 0;
  const view = epubBytes;
  while (i + 30 < view.length) {
    if (view[i] !== 0x50 || view[i + 1] !== 0x4b) break;
    if (view[i + 2] === 0x01 && view[i + 3] === 0x02) break; // central dir
    if (view[i + 2] !== 0x03 || view[i + 3] !== 0x04) break;
    const nameLen = view[i + 26] | (view[i + 27] << 8);
    const extraLen = view[i + 28] | (view[i + 29] << 8);
    const compSize = view[i + 18] | (view[i + 19] << 8) | (view[i + 20] << 16) | (view[i + 21] << 24);
    const nameBytes = view.subarray(i + 30, i + 30 + nameLen);
    names.push(new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(nameBytes));
    i += 30 + nameLen + extraLen + compSize;
  }
  return names;
}
