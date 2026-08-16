import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  buildEpub,
  inferTitle,
  listEpubPaths,
  type Book,
} from "../src/lib/epub-build";
import type { Chapter } from "../src/lib/txt-parse";
import { escapeText } from "../src/lib/encoding";

const BOM = [0xef, 0xbb, 0xbf];

function hasBom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === BOM[0] &&
    bytes[1] === BOM[1] &&
    bytes[2] === BOM[2]
  );
}

function text(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** 解析第一个 local file header 的压缩方法（offset 8-9, LE） */
function firstEntryMethod(epub: Uint8Array): { name: string; method: number } {
  const i = 0;
  expect(epub[i]).toBe(0x50); // P
  expect(epub[i + 1]).toBe(0x4b); // K
  expect(epub[i + 2]).toBe(0x03);
  expect(epub[i + 3]).toBe(0x04);
  const method = epub[i + 8] | (epub[i + 9] << 8);
  const nameLen = epub[i + 26] | (epub[i + 27] << 8);
  const name = new TextDecoder().decode(epub.subarray(i + 30, i + 30 + nameLen));
  return { name, method };
}

function sampleChapters(): Chapter[] {
  // buildEpub 接收预转义的段（与 parseTxt → assembleBody 的 escapeText 行为对齐；
  // Go 模板/epub-build 不会二次转义，本测试也按预转义输入）
  const raw1 = "　　含<标签>的段落。";
  const raw2 = '　　& 引号 " 测试。';
  return [
    // 空标题前置段：进 spine，但不应出现在 NCX / HTML 目录
    { title: "", body: ["　　版权声明段落。"] },
    { title: "第1章 开端", body: [escapeText(raw1), escapeText(raw2)] },
    { title: "第2章 发展", body: [] }, // 空正文但有标题（ForceEmptyChapter）
  ];
}

function sampleBook(over: Partial<Book> = {}): Book {
  return {
    title: "测试书名",
    author: "测试作者",
    language: "zh-CN",
    date: "",
    uid: "easypub-testuid",
    css: "/* test css */\n.a { text-indent: 2rem; }\n",
    chapters: sampleChapters(),
    ...over,
  };
}

describe("buildEpub: ZIP 结构", () => {
  it("mimetype 必须是第一个条目且 store（不压缩）、无 BOM", () => {
    const epub = buildEpub(sampleBook());
    const first = firstEntryMethod(epub);
    expect(first.name).toBe("mimetype");
    expect(first.method).toBe(0); // zip.Store

    const files = unzipSync(epub);
    const mt = files["mimetype"];
    expect(mt).toBeDefined();
    expect(hasBom(mt)).toBe(false);
    expect(text(mt)).toBe("application/epub+zip");
  });

  it("关键文件齐全且顺序符合规范", () => {
    const epub = buildEpub(sampleBook());
    const paths = listEpubPaths(epub);
    expect(paths[0]).toBe("mimetype");
    const required = [
      "META-INF/container.xml",
      "OEBPS/content.opf",
      "OEBPS/toc.ncx",
      "OEBPS/style.css",
      "OEBPS/cover.html",
      "OEBPS/book-toc.html",
      "OEBPS/chapter0.html",
      "OEBPS/chapter1.html",
      "OEBPS/chapter2.html",
    ];
    for (const p of required) {
      expect(paths).toContain(p);
    }
  });

  it("container.xml 无 BOM 且指向 OEBPS/content.opf", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    const c = files["META-INF/container.xml"];
    expect(hasBom(c)).toBe(false);
    expect(text(c)).toContain('full-path="OEBPS/content.opf"');
  });

  it("style.css 无 BOM，XHTML 带 BOM + CRLF", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    expect(hasBom(files["OEBPS/style.css"])).toBe(false);
    expect(hasBom(files["OEBPS/cover.html"])).toBe(true);
    expect(hasBom(files["OEBPS/book-toc.html"])).toBe(true);
    expect(hasBom(files["OEBPS/chapter1.html"])).toBe(true);
    expect(hasBom(files["OEBPS/content.opf"])).toBe(true);
    expect(hasBom(files["OEBPS/toc.ncx"])).toBe(true);
    // CRLF 规范化：所有换行均为 \r\n（不存在未被 \r 前导的孤立 \n）
    const ch = text(files["OEBPS/chapter1.html"]);
    expect(ch).not.toMatch(/(?<!\r)\n/);
    expect(ch).toContain("\r\n");
  });
});

describe("buildEpub: 内容", () => {
  it("content.opf 的 manifest/spine 引用全部章节", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    const opf = text(files["OEBPS/content.opf"]);
    expect(opf).toContain('<item id="chapter0" href="chapter0.html"');
    expect(opf).toContain('<item id="chapter2" href="chapter2.html"');
    expect(opf).toContain('<itemref idref="cover" linear="no"/>');
    expect(opf).toContain('<itemref idref="htmltoc" linear="yes"/>');
    expect(opf).toContain('<itemref idref="chapter1" linear="yes"/>');
    expect(opf).toContain('<dc:title>测试书名</dc:title>');
    expect(opf).toContain('<dc:creator>测试作者</dc:creator>');
    expect(opf).toContain("easypub-testuid");
  });

  it("chapter1.html 含标题 h2 且正文已转义、空段保留", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    const ch = text(files["OEBPS/chapter1.html"]);
    expect(ch).toContain('<h2 id="title" class="titlel2std">第1章 开端</h2>');
    expect(ch).toContain("&lt;标签&gt;");
    expect(ch).not.toContain("<标签>");
    expect(ch).toContain("&amp; 引号 &#34; 测试。");
    // chapter2 空正文但有标题
    const ch2 = text(files["OEBPS/chapter2.html"]);
    expect(ch2).toContain('<h2 id="title" class="titlel2std">第2章 发展</h2>');
  });

  it("空标题章不进 NCX 导航，但章节文件仍在", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    const ncx = text(files["OEBPS/toc.ncx"]);
    // chapter0 是空标题前置段：不应有 navPoint
    expect(ncx).not.toContain('<content src="chapter0.html"/>');
    expect(ncx).toContain('<content src="chapter1.html"/>');
    expect(ncx).toContain('<content src="chapter2.html"/>');
    // playOrder 从 cover=1, htmltoc=2, chapter1=3, chapter2=4
    expect(ncx).toContain('playOrder="3"');
    expect(ncx).toContain('playOrder="4"');
    // 空标题章仍出现在 spine（manifest 有 chapter0）
    const opf = text(files["OEBPS/content.opf"]);
    expect(opf).toContain('<itemref idref="chapter0" linear="yes"/>');
  });

  it("book-toc.html 目录页不含空标题章", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    const toc = text(files["OEBPS/book-toc.html"]);
    expect(toc).not.toContain('href="chapter0.html"');
    expect(toc).toContain('href="chapter1.html"');
    expect(toc).toContain('href="chapter2.html"');
    expect(toc).toContain("目录");
  });

  it("cover.html 含书名/作者", () => {
    const files = unzipSync(buildEpub(sampleBook()));
    const cover = text(files["OEBPS/cover.html"]);
    expect(cover).toContain('<h1 class="booktitle">测试书名</h1>');
    expect(cover).toContain('<h3 class="bookauthor">测试作者</h3>');
  });

  it("日期/语言/UID 默认值", () => {
    const files = unzipSync(
      buildEpub({
        title: "t",
        author: "测试作者",
        chapters: [],
        css: "c",
        // 不指定 date / uid，触发动态默认
      })
    );
    const opf = text(files["OEBPS/content.opf"]);
    expect(opf).toContain("<dc:language>zh-CN</dc:language>");
    expect(opf).toContain(`<dc:date>${new Date().getFullYear()}</dc:date>`);
    expect(opf).toMatch(/<dc:identifier id="bookid">easypub-[0-9a-f]{8}<\/dc:identifier>/);
  });

  it("章节文件名与 spine 顺序对应（含空标题章）", () => {
    const paths = listEpubPaths(buildEpub(sampleBook()));
    const chapters = paths.filter((p) => /^OEBPS\/chapter\d+\.html$/.test(p));
    expect(chapters).toEqual([
      "OEBPS/chapter0.html",
      "OEBPS/chapter1.html",
      "OEBPS/chapter2.html",
    ]);
  });
});

describe("inferTitle", () => {
  it("识别「书名：」前缀", () => {
    expect(inferTitle("书名：我的小说\n正文", "a.txt")).toBe("我的小说");
    expect(inferTitle("Title: The Book\nbody", "a.txt")).toBe("The Book");
  });
  it("回退到文件名主名", () => {
    expect(inferTitle("随便一段正文。\n", "我的小说.txt")).toBe("我的小说");
  });
});
