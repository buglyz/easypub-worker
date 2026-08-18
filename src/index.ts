import type { Env } from "./env";
import { handleDetect } from "./routes/detect";
import { handleConvert, handleJob } from "./routes/convert";
import { handleDownload } from "./routes/download";
import { withSecurity, jsonResponse } from "./lib/form";
import { isValidJobId } from "./lib/names";

/** 常时字符串比较，防止时序侧信道。Workers 无 node:crypto，手写实现 */
function timingSafeCompare(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // 始终走完 max(len) 次异或，避免长度差异可观测
  const max = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < max; i++) {
    const x = i < ea.length ? ea[i] : 0;
    const y = i < eb.length ? eb[i] : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function checkAccess(request: Request, env: Env): Response | null {
  const token = env.ACCESS_TOKEN;
  if (!token) return null;
  const got = request.headers.get("X-EasyPub-Token") || "";
  if (!timingSafeCompare(got, token)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // 规范化：去掉末尾冗余斜杠，避免 /api/detect/ 落 404
    // 注意保留根路径 "/"
    let path = url.pathname;
    if (path.length > 1) {
      path = path.replace(/\/+$/g, "");
      if (path === "") path = "/";
    }

    if (path.startsWith("/api/")) {
      // 显式响应 OPTIONS 预检，20 4 No Content
      // 同源 SPA 不需要，但保留方便未来开放跨域 API
      if (request.method === "OPTIONS") {
        return withSecurity(
          new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Methods": "GET, POST, HEAD",
              "Access-Control-Allow-Headers": "Content-Type, X-EasyPub-Token",
              "Access-Control-Max-Age": "600",
            },
          })
        );
      }

      const denied = checkAccess(request, env);
      if (denied) return withSecurity(denied);

      try {
        if (path === "/api/auth/verify") {
          // 登录页验证 Token：已配置 ACCESS_TOKEN 时校验头；未配置直接返回 200
          // （登录页据此区分"未启用鉴权"与"token 错"两种场景）
          // 只接受 GET(主页自检)/ POST(登录页验证)/ HEAD,其余方法 405
          if (request.method !== "GET" && request.method !== "POST" && request.method !== "HEAD") {
            return withSecurity(jsonResponse({ error: "method not allowed" }, 405));
          }
          if (!env.ACCESS_TOKEN) {
            return withSecurity(jsonResponse({ ok: true, enabled: false }, 200));
          }
          const denied = checkAccess(request, env);
          if (denied) return withSecurity(denied);
          return withSecurity(jsonResponse({ ok: true, enabled: true }, 200));
        }
        if (path === "/api/detect") {
          return withSecurity(await handleDetect(request, env));
        }
        if (path === "/api/convert") {
          return withSecurity(await handleConvert(request, env, ctx));
        }
        if (path.startsWith("/api/jobs/")) {
          const jobId = path.slice("/api/jobs/".length);
          if (!isValidJobId(jobId)) {
            return withSecurity(jsonResponse({ error: "invalid job id" }, 400));
          }
          return withSecurity(await handleJob(request, env, jobId));
        }
        if (path.startsWith("/api/download/")) {
          // download 路径含 .epub 后缀，单独走下载 handler 内裁剪
          const raw = path.slice("/api/download/".length);
          if (!raw) {
            return withSecurity(jsonResponse({ error: "invalid download id" }, 400));
          }
          return withSecurity(await handleDownload(request, env, raw));
        }
        return withSecurity(jsonResponse({ error: "not found" }, 404));
      } catch (err) {
        console.error(err);
        return withSecurity(jsonResponse({ error: "internal error" }, 500));
      }
    }

    // 静态资源走 Assets binding（run_worker_first = ["/api/*"] 下不可达，保留兜底）
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      return withSecurity(res);
    }
    return withSecurity(new Response("Not found", { status: 404 }));
  },
};
