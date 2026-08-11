import type { Env } from "./env";
import { handleDetect } from "./routes/detect";
import { handleConvert, handleJob } from "./routes/convert";
import { handleDownload } from "./routes/download";
import { withSecurity, jsonResponse } from "./lib/form";
import { isValidJobId } from "./lib/names";

function checkAccess(request: Request, env: Env): Response | null {
  const token = env.ACCESS_TOKEN;
  if (!token) return null;
  const got = request.headers.get("X-EasyPub-Token") || "";
  if (got !== token) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // API 鉴权（可选）
    if (path.startsWith("/api/")) {
      const denied = checkAccess(request, env);
      if (denied) return withSecurity(denied);

      try {
        if (path === "/api/detect") {
          return withSecurity(await handleDetect(request, env));
        }
        if (path === "/api/convert") {
          return withSecurity(await handleConvert(request, env, ctx));
        }
        if (path.startsWith("/api/jobs/")) {
          const jobId = path.slice("/api/jobs/".length).replace(/\/$/, "");
          if (!isValidJobId(jobId)) {
            return withSecurity(jsonResponse({ error: "invalid job id" }, 400));
          }
          return withSecurity(await handleJob(request, env, jobId));
        }
        if (path.startsWith("/api/download/")) {
          const id = path.slice("/api/download/".length);
          return withSecurity(await handleDownload(request, env, id));
        }
        return withSecurity(jsonResponse({ error: "not found" }, 404));
      } catch (err) {
        console.error(err);
        return withSecurity(jsonResponse({ error: "internal error" }, 500));
      }
    }

    // 静态资源走 Assets binding
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      return withSecurity(res);
    }
    return withSecurity(new Response("Not found", { status: 404 }));
  },
};
