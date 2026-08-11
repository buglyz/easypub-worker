/**
 * 端到端集成测试：detect → convert（同步）→ download + 无效 id 400 + 无 MOBI。
 * 用内存 Map 桩点模拟 R2 Bucket，不依赖 wrangler dev / 真实 R2。
 */
import { describe, expect, it } from "vitest";
import worker from "../src/index";

function makeEnv(store: Map<string, unknown>) {
  return {
    BUCKET: {
      put: async (key: string, value: unknown, opts?: unknown) => {
        store.set(key, { value, opts });
        return {};
      },
      get: async (key: string) => {
        const hit = store.get(key);
        if (!hit) return null;
        const { value } = hit as { value: unknown };
        if (typeof value === "string") {
          return {
            text: async () => value,
            json: async () => JSON.parse(value),
            customMetadata: undefined,
            httpEtag: "etag-1",
            size: value.length,
            body: null,
          };
        }
        if (value instanceof Uint8Array) {
          return {
            text: async () => new TextDecoder("utf-8").decode(value),
            json: async () => {
              throw new Error("not json");
            },
            customMetadata: { epubName: "测试书.epub" },
            httpEtag: "etag-1",
            size: value.byteLength,
            body: null,
          };
        }
        return null;
      },
    },
    ASSETS: {
      fetch: async (request: Request) => new Response("not found", { status: 404 }),
    },
    SYNC_MAX_BYTES: "31457280",
    MAX_UPLOAD_BYTES: "33554432",
    OUTPUT_TTL_SECONDS: "86400",
    ACCESS_TOKEN: "",
  } as unknown as Parameters<typeof worker.fetch>[1];
}

function makeMultipartRequest(url: string, file: File, extra: Record<string, string>): Request {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new Request(url, { method: "POST", body: form });
}

const SAMPLE_TXT = `序
　　书名：当个星际猎人，怎么登上通缉令了
　　作者：剑屠雨
　　简介：这是一段简介文字。

第1章 初次见面
　　联邦历，7708年。
　　星际联邦，日暮星域。
　　这是一段测试正文。

第2章 希望与留恋
　　这一章是用来测试分章是否正确。
`;

describe("Worker 集成（本地 R2 桩点）", () => {
  it("detect 返回标题列表（空标题前置段不进 titles）", async () => {
    const store = new Map();
    const env = makeEnv(store);
    const file = new File([SAMPLE_TXT], "我的小说.txt", { type: "text/plain" });
    const req = makeMultipartRequest(
      "https://easypub.test/api/detect",
      file,
      { autoMark: "true", removeBlank: "true", title: "", author: "" }
    );
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { count: number; titles: string[]; encoding: string };
    // 序、简介：这是一段简介文字。、第1章、第2章 均有标题，共 4 个
    expect(data.count).toBe(4);
    expect(data.titles).toEqual([
      "序",
      "简介：这是一段简介文字。",
      "第1章 初次见面",
      "第2章 希望与留恋",
    ]);
    expect(data.encoding).toBe("utf-8");
  });

  it("convert 同步返回 download 链接，产物含 .epub（无 mobi 字段）", async () => {
    const store = new Map();
    const env = makeEnv(store);
    const file = new File([SAMPLE_TXT], "我的小说.txt", { type: "text/plain" });
    const req = makeMultipartRequest(
      "https://easypub.test/api/convert",
      file,
      { autoMark: "true", removeBlank: "true", title: "", author: "", lineHeight: "120" }
    );
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.async).toBe(false);
    expect(typeof data.download).toBe("string");
    expect(String(data.download)).toContain("/api/download/");
    expect(String(data.download)).toContain("name=" + encodeURIComponent("我的小说.epub"));
    expect(data.epubName).toBe("我的小说.epub");
    expect(data.mobi).toBeUndefined();
    expect(data.mobiName).toBeUndefined();
    expect(data.chapters).toBe(4); // 序 + 简介 + 2 章
    // 产物已写入 R2 桩点
    expect([...store.keys()].some((k) => k.startsWith("outputs/"))).toBe(true);
  });

  it("download 用合法 id 返回 application/epub+zip，展示名保留主名", async () => {
    const store = new Map();
    const env = makeEnv(store);
    const file = new File([SAMPLE_TXT], "我的小说.txt", { type: "text/plain" });
    const conv = await worker.fetch(
      makeMultipartRequest(
        "https://easypub.test/api/convert",
        file,
        { autoMark: "true", removeBlank: "true", title: "", author: "" }
      ),
      env,
      {} as ExecutionContext
    );
    const convData = (await conv.json()) as { download: string };
    const jobId = new URL(convData.download, "https://easypub.test").pathname
      .replace("/api/download/", "")
      .replace(".epub", "");
    expect(jobId).toMatch(/^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$/);

    const dl = await worker.fetch(new Request("https://easypub.test" + convData.download), env, {} as ExecutionContext);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Type")).toBe("application/epub+zip");
    const cd = dl.headers.get("Content-Disposition") || "";
    expect(cd).toContain("filename*=UTF-8''" + encodeURIComponent("我的小说.epub"));
  });

  it("非法 download id 返回 400（防穿越白名单）", async () => {
    const store = new Map();
    const env = makeEnv(store);
    // 编码的 ../ 不会被 URL 规范化，直接进入 download 路径 → 白名单拒绝
    const res = await worker.fetch(
      new Request("https://easypub.test/api/download/%2e%2e%2fetc%2fpasswd"),
      env,
      {} as ExecutionContext
    );
    expect(res.status).toBe(400);

    const res2 = await worker.fetch(
      new Request("https://easypub.test/api/download/20250101-120000-abcdef1z.epub"),
      env,
      {} as ExecutionContext
    );
    expect(res2.status).toBe(400);

    const res3 = await worker.fetch(
      new Request("https://easypub.test/api/download/nonexistent-123.epub"),
      env,
      {} as ExecutionContext
    );
    // 非法格式
    expect(res3.status).toBe(400);
  });

  it("不存在但格式合法的 id 返回 404", async () => {
    const store = new Map();
    const env = makeEnv(store);
    const res = await worker.fetch(
      new Request("https://easypub.test/api/download/20250101-120000-abcdef12.epub"),
      env,
      {} as ExecutionContext
    );
    expect(res.status).toBe(404);
  });

  it("MOBI 下载路径被拒绝", async () => {
    const store = new Map();
    const env = makeEnv(store);
    const res = await worker.fetch(
      new Request("https://easypub.test/api/download/20250101-120000-abcdef12.mobi"),
      env,
      {} as ExecutionContext
    );
    expect(res.status).toBe(400);
  });
});
