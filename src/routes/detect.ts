import type { Env } from "../env";
import { numEnv } from "../env";
import { parseMultipart, jsonResponse, safeErr } from "../lib/form";
import { parseTxt, titledChapters } from "../lib/txt-parse";

export async function handleDetect(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }
  const maxUpload = numEnv(env.MAX_UPLOAD_BYTES, 100 << 20);
  try {
    const up = await parseMultipart(request, maxUpload);
    const chapters = parseTxt(up.text, up.txtOpt);
    const titles = titledChapters(chapters);
    return jsonResponse({
      count: titles.length,
      titles,
      encoding: up.encoding.toLowerCase() === "utf-8" ? "utf-8" : up.encoding,
    });
  } catch (err) {
    return jsonResponse({ error: safeErr(err) }, 400);
  }
}
