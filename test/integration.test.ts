/**
 * 端到端集成测试：detect → convert（同步）→ download + 无效 id 400 + 无 MOBI。
 * 同时覆盖异步任务路径与 ACCESS_TOKEN 鉴权。
 * 用内存 Map 桩点模拟 R2 Bucket，不依赖 wrangler dev / 真实 R2。
 */
import { describe, expect, it } from "vitest";
import worker from "../src/index";

/** 收集 ctx.waitUntil 的 promise，便于测试里同步等待异步任务完成 */
function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      pending.push(p);
    },
  } as unknown as ExecutionContext;
  return { ctx, drain: () => Promise.all(pending) };
}

function makeEnv(store: Map<string, unknown>, overrides: Partial<Record<string, string>> = {}) {
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
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(value));
              controller.close();
            },
          });
          return {
            text: async () => value,
            json: async () => JSON.parse(value),
            arrayBuffer: async () =>
              new TextEncoder().encode(value).buffer as ArrayBuffer,
            customMetadata: undefined,
            httpEtag: "etag-1",
            size: value.length,
            body: stream,
            writeHttpMetadata: () => {},
          };
        }
        if (value instanceof Uint8Array) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(value);
              controller.close();
            },
          });
          return {
            text: async () => new TextDecoder("utf-8").decode(value),
            json: async () => {
              throw new Error("not json");
            },
            arrayBuffer: async () => value.slice().buffer as ArrayBuffer,
            customMetadata: { epubName: "测试书.epub" },
            httpEtag: "etag-1",
            size: value.byteLength,
            body: stream,
            writeHttpMetadata: () => {},
          };
        }
        return null;
      },
      delete: async (key: string) => {
        store.delete(key);
        return {};
      },
    },
    ASSETS: {
      fetch: async () => new Response("not found", { status: 404 }),
    },
    // 同步阈值 1KB，大于此即触发异步任务（便于测试）
    SYNC_MAX_BYTES: "1024",
    MAX_UPLOAD_BYTES: "33554432",
    OUTPUT_TTL_SECONDS: "86400",
    ACCESS_TOKEN: "",
    ...overrides,
  } as unknown as Parameters<typeof worker.fetch>[1];
}

function makeMultipartRequest(
  url: string,
  file: File,
  extra: Record<string, string>,
  token?: string
): Request {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const headers: Record<string, string> = {};
  if (token) headers["X-EasyPub-Token"] = token;
  return new Request(url, { method: "POST", body: form, headers });
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

// 用于触发异步任务的大文本：重复 SAMPLE_TXT 多次直到 > 1KB
function makeLargeTxt(): string {
  let s = SAMPLE_TXT;
  while (s.length < 2048) s += "\n" + SAMPLE_TXT;
  return s;
}

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
    expect(data.epubName).toBe("我的小说.epub");
    expect(data.mobi).toBeUndefined();
    expect(data.mobiName).toBeUndefined();
    expect(data.chapters).toBe(4);
    expect([...store.keys()].some((k) => k.startsWith("outputs/"))).toBe(true);
  });

  it("大文件 convert 走异步任务，轮询直到 done", async () => {
    const store = new Map();
    const env = makeEnv(store);
    const { ctx, drain } = makeCtx();
    const largeTxt = makeLargeTxt();
    const file = new File([largeTxt], "我的小说.txt", { type: "text/plain" });
    const req = makeMultipartRequest(
      "https://easypub.test/api/convert",
      file,
      { autoMark: "true", removeBlank: "true", title: "", author: "" }
    );
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { async: boolean; jobId: string };
    expect(data.async).toBe(true);
    expect(data.jobId).toMatch(/^[0-9]{8}-[0-9]{6}-[0-9a-f]{32}$/);
    // jobId 含 128 bit 随机熵

    // 等异步任务完成
    await drain();

    const jobRes = await worker.fetch(
      new Request("https://easypub.test/api/jobs/" + data.jobId),
      env,
      {} as ExecutionContext
    );
    expect(jobRes.status).toBe(200);
    const job = (await jobRes.json()) as {
      status: string;
      download?: string;
      chapters?: number;
    };
    expect(job.status).toBe("done");
    expect(job.download).toContain("/api/download/" + data.jobId);
    expect(job.chapters).toBeGreaterThan(0);
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
    expect(jobId).toMatch(/^[0-9]{8}-[0-9]{6}-[0-9a-f]{8,32}$/);

    const dl = await worker.fetch(
      new Request("https://easypub.test" + convData.download),
      env,
      {} as ExecutionContext
    );
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Type")).toBe("application/epub+zip");
    const cd = dl.headers.get("Content-Disposition") || "";
    expect(cd).toContain("filename*=UTF-8''" + encodeURIComponent("我的小说.epub"));

    // 桩点 body 改为 ReadableStream 后，至少能拿到字节
    const buf = await dl.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(100);
    // EPUB 必须以 PK 头开始
    const view = new Uint8Array(buf);
    expect(view[0]).toBe(0x50); // P
    expect(view[1]).toBe(0x4b); // K
  });

  it("download 支持 Range 请求，返回 206", async () => {
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
    const dl = await worker.fetch(
      new Request("https://easypub.test" + convData.download, {
        headers: { Range: "bytes=0-9" },
      }),
      env,
      {} as ExecutionContext
    );
    expect(dl.status).toBe(206);
    expect(dl.headers.get("Content-Range")).toMatch(/^bytes 0-9\/\d+$/);
    expect(dl.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("非法 download id 返回 400（防穿越白名单）", async () => {
    const store = new Map();
    const env = makeEnv(store);
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

  it("启用 ACCESS_TOKEN 后无 token / 错 token 返回 401，正确 token 通过", async () => {
    const store = new Map();
    const token = "test-secret-token-12345";
    const env = makeEnv(store, { ACCESS_TOKEN: token });

    const file = new File([SAMPLE_TXT], "我的小说.txt", { type: "text/plain" });

    // 1. 无 token
    const noTokenReq = makeMultipartRequest(
      "https://easypub.test/api/detect",
      file,
      { autoMark: "true", removeBlank: "true", title: "", author: "" }
    );
    const r1 = await worker.fetch(noTokenReq, env, {} as ExecutionContext);
    expect(r1.status).toBe(401);

    // 2. 错 token
    const wrongReq = makeMultipartRequest(
      "https://easypub.test/api/detect",
      file,
      { autoMark: "true", removeBlank: "true", title: "", author: "" },
      "wrong-token"
    );
    const r2 = await worker.fetch(wrongReq, env, {} as ExecutionContext);
    expect(r2.status).toBe(401);

    // 3. 正确 token
    const okReq = makeMultipartRequest(
      "https://easypub.test/api/detect",
      file,
      { autoMark: "true", removeBlank: "true", title: "", author: "" },
      token
    );
    const r3 = await worker.fetch(okReq, env, {} as ExecutionContext);
    expect(r3.status).toBe(200);
  });

  it("/api/auth/verify：未配置 ACCESS_TOKEN 返回 200 enabled:false", async () => {
    const env = makeEnv(new Map(), { ACCESS_TOKEN: "" });
    const res = await worker.fetch(
      new Request("https://easypub.test/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      env,
      {} as ExecutionContext
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; enabled: boolean };
    expect(data.ok).toBe(true);
    expect(data.enabled).toBe(false);
  });

  it("/api/auth/verify：配置 ACCESS_TOKEN 后无 token 401、错 token 401、正确 token 200", async () => {
    const token = "verify-test-token-abc";
    const env = makeEnv(new Map(), { ACCESS_TOKEN: token });

    // 1. 无 token
    const r1 = await worker.fetch(
      new Request("https://easypub.test/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      env,
      {} as ExecutionContext
    );
    expect(r1.status).toBe(401);

    // 2. 错 token
    const r2 = await worker.fetch(
      new Request("https://easypub.test/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-EasyPub-Token": "wrong" },
      }),
      env,
      {} as ExecutionContext
    );
    expect(r2.status).toBe(401);

    // 3. 正确 token
    const r3 = await worker.fetch(
      new Request("https://easypub.test/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-EasyPub-Token": token },
      }),
      env,
      {} as ExecutionContext
    );
    expect(r3.status).toBe(200);
    const data = (await r3.json()) as { ok: boolean; enabled: boolean };
    expect(data.ok).toBe(true);
    expect(data.enabled).toBe(true);
  });
});
