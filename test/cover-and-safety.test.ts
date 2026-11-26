import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  MAX_COVER_BYTES,
  detectCoverMediaType,
  parseCoverBytes,
} from "../src/lib/cover";
import { buildEpub, listEpubPaths } from "../src/lib/epub-build";
import {
  defaultTxtOptions,
  extractSamplePreview,
  isUnsafeRegex,
  parseTxt,
} from "../src/lib/txt-parse";
import worker from "../src/index";

/** 最小合法 1x1 PNG 字节 */
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const TINY_WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function makeEnv(store: Map<string, unknown>, syncMax = "1024") {
  return {
    BUCKET: {
      put: async (key: string, value: unknown, opts?: unknown) => {
        store.set(key, { value, opts });
        return {};
      },
      get: async (key: string) => {
        const hit = store.get(key) as { value: unknown } | undefined;
        if (!hit) return null;
        if (typeof hit.value === "string") {
          return {
            text: async () => hit.value as string,
            json: async () => JSON.parse(hit.value as string),
            arrayBuffer: async () => new TextEncoder().encode(hit.value as string).buffer,
          };
        }
        if (hit.value instanceof Uint8Array) {
          const bytes = hit.value;
          return {
            text: async () => new TextDecoder("utf-8").decode(bytes),
            arrayBuffer: async () => bytes.slice().buffer,
            size: bytes.byteLength,
          };
        }
        return null;
      },
      delete: async (key: string) => {
        store.delete(key);
        return {};
      },
    },
    SYNC_MAX_BYTES: syncMax,
    MAX_UPLOAD_BYTES: "33554432",
    ACCESS_TOKEN: "",
  } as unknown as Parameters<typeof worker.fetch>[1];
}

describe("封面图片校验与 EPUB 打包", () => {
  it("按魔数准确识别 PNG / JPEG / WebP 并拒绝非法数据", () => {
    expect(detectCoverMediaType(TINY_PNG)).toBe("image/png");
    expect(detectCoverMediaType(TINY_JPEG)).toBe("image/jpeg");
    expect(detectCoverMediaType(TINY_WEBP)).toBe("image/webp");
    expect(detectCoverMediaType(new Uint8Array([1, 2, 3, 4]))).toBeNull();

    expect(() => parseCoverBytes(new Uint8Array())).toThrow("封面图片为空");
    expect(() => parseCoverBytes(new Uint8Array([1, 2, 3]))).toThrow("仅支持 JPG / PNG / WebP");
    const over = new Uint8Array(MAX_COVER_BYTES + 1);
    over.set(TINY_PNG, 0);
    expect(() => parseCoverBytes(over)).toThrow("封面图片超过");
  });

  it("buildEpub 传入封面图时打包 OEBPS/cover.png 且更新 OPF 与 cover.html", () => {
    const cover = parseCoverBytes(TINY_PNG);
    const epub = buildEpub({
      title: "带封面测试",
      author: "作者甲",
      uid: "easypub-fixed",
      date: "2026",
      css: ".a { text-indent: 2rem; }",
      chapters: [{ title: "第1章 开端", body: ["　　正文内容。"] }],
      coverImage: cover,
    });

    const paths = listEpubPaths(epub);
    expect(paths).toContain("OEBPS/cover.png");

    const files = unzipSync(epub);
    expect(files["OEBPS/cover.png"]).toEqual(TINY_PNG);

    const opf = new TextDecoder().decode(files["OEBPS/content.opf"]);
    expect(opf).toContain('<meta name="cover" content="cover-image"/>');
    expect(opf).toContain('<item id="cover-image" href="cover.png" media-type="image/png"/>');

    const coverHtml = new TextDecoder().decode(files["OEBPS/cover.html"]);
    expect(coverHtml).toContain('<img src="cover.png"');
  });

  it("buildEpub 相同输入产出字节级确定且支持单调进度回调", () => {
    const progress: number[] = [];
    const book = {
      title: "确定性测试",
      author: "作者",
      uid: "easypub-det",
      date: "2026",
      css: "p { font-size: 100%; }",
      chapters: [
        { title: "第1章", body: ["段落一"] },
        { title: "第2章", body: ["段落二"] },
      ],
    };
    const epub1 = buildEpub(book, (pct) => progress.push(pct));
    const epub2 = buildEpub(book);
    expect(epub1).toEqual(epub2);
    expect(progress.length).toBeGreaterThan(0);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });
});

describe("ReDoS 防护与真实正文预览", () => {
  it("拦截高危嵌套量词正则，放行常规章节正则", () => {
    expect(isUnsafeRegex("(a+)+$")).toBe(true);
    expect(isUnsafeRegex("(.*)*第")).toBe(true);
    expect(isUnsafeRegex("(\\d+){2,}")).toBe(true);
    expect(isUnsafeRegex("^\\s*第\\s*[0-9一二三四五六七八九十百千]+\\s*章")).toBe(false);

    expect(() =>
      parseTxt("第1章 标题\n正文", defaultTxtOptions({ autoMark: false, fullReg: "(a+)+$" }))
    ).toThrow("正则编译失败");
  });

  it("extractSamplePreview 提取反转义后的首章正文段落", () => {
    const chapters = parseTxt(
      '第1章 序幕\n　　第一段含<书名>与"引号"。\n　　第二段正文。\n　　第三段不展示。\n',
      defaultTxtOptions()
    );
    const preview = extractSamplePreview(chapters, 2);
    expect(preview).toEqual({
      title: "第1章 序幕",
      paragraphs: ['第一段含<书名>与"引号"。', "第二段正文。"],
    });
  });
});

describe("API 封面图、预览与安全集成", () => {
  it("detect 返回真实正文预览字段 preview", async () => {
    const form = new FormData();
    form.append("file", new File(["第1章 启程\n　　风起于青萍之末。\n"], "book.txt"));
    const res = await worker.fetch(
      new Request("https://easypub.test/api/detect", { method: "POST", body: form }),
      makeEnv(new Map()),
      {} as ExecutionContext
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      preview?: { title: string; paragraphs: string[] };
    };
    expect(data.preview?.title).toBe("第1章 启程");
    expect(data.preview?.paragraphs[0]).toContain("风起于青萍之末");
  });

  it("convert 异步任务支持封面图片并清理临时对象", async () => {
    const store = new Map<string, unknown>();
    const env = makeEnv(store, "100");
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;

    const form = new FormData();
    form.append(
      "file",
      new File(["第1章 开篇\n" + "正文段落测试内容。".repeat(30)], "novel.txt")
    );
    form.append("cover", new File([TINY_PNG], "cover.png", { type: "image/png" }));

    const res = await worker.fetch(
      new Request("https://easypub.test/api/convert", { method: "POST", body: form }),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { async: boolean; jobId: string };
    expect(body.async).toBe(true);
    await Promise.all(pending);

    const out = store.get(`outputs/${body.jobId}.epub`) as { value: Uint8Array } | undefined;
    expect(out).toBeDefined();
    expect(listEpubPaths(out!.value)).toContain("OEBPS/cover.png");
    expect(store.has(`uploads/${body.jobId}.txt`)).toBe(false);
    expect(store.has(`uploads/${body.jobId}.cover`)).toBe(false);
  });

  it("非法封面图片与 ReDoS 正则返回 400 INVALID_INPUT", async () => {
    const formBadCover = new FormData();
    formBadCover.append("file", new File(["第1章\n正文"], "a.txt"));
    formBadCover.append("cover", new File([new Uint8Array([0, 1, 2, 3])], "bad.png"));
    const r1 = await worker.fetch(
      new Request("https://easypub.test/api/convert", { method: "POST", body: formBadCover }),
      makeEnv(new Map()),
      {} as ExecutionContext
    );
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { code: string }).code).toBe("INVALID_INPUT");

    const formRedos = new FormData();
    formRedos.append("file", new File(["第1章\n正文"], "a.txt"));
    formRedos.append("autoMark", "false");
    formRedos.append("fullReg", "(a+)+$");
    const r2 = await worker.fetch(
      new Request("https://easypub.test/api/convert", { method: "POST", body: formRedos }),
      makeEnv(new Map()),
      {} as ExecutionContext
    );
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { code: string }).code).toBe("INVALID_INPUT");
  });
});
