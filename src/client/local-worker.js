import { detectAndDecode } from "../lib/encoding";
import { parseCoverBytes } from "../lib/cover";
import { buildEpub, inferTitle } from "../lib/epub-build";
import { generateCss, cssOptionsFromFields } from "../lib/css";
import { isInputError } from "../lib/form";
import { displayNameFromUpload } from "../lib/names";
import {
  extractSamplePreview,
  optionsFromForm,
  parseTxt,
  titledChapters,
} from "../lib/txt-parse";

/** 缓存最近一次文件的解码结果，detect 后点 convert 无需重复读取和全量解码 */
let cachedDecode = null;

function fileSignature(req) {
  if (req.file && typeof req.file.size === "number") {
    return `${req.file.name || ""}:${req.file.size}:${req.file.lastModified || 0}`;
  }
  return null;
}

function errorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  return String(err || "本地转换失败");
}

function sendProgress(id, stage, percent) {
  self.postMessage({ id, type: "progress", stage, percent });
}

async function decodeRequest(req) {
  const sig = fileSignature(req);
  if (sig && cachedDecode && cachedDecode.sig === sig) {
    sendProgress(req.id, "decode", 15);
    return cachedDecode.decoded;
  }
  sendProgress(req.id, "decode", 8);
  const bytes =
    req.file && req.file.arrayBuffer
      ? new Uint8Array(await req.file.arrayBuffer())
      : new Uint8Array(req.bytes || []);
  const decoded = detectAndDecode(bytes);
  if (sig) {
    cachedDecode = { sig, decoded };
  }
  sendProgress(req.id, "decode", 20);
  return decoded;
}

self.onmessage = async function (event) {
  const req = event.data || {};
  if (req.action === "clearCache") {
    cachedDecode = null;
    return;
  }
  try {
    const fields = req.fields || {};
    const txtOpt = optionsFromForm(fields);
    const decoded = await decodeRequest(req);
    const fileName = req.fileName || "upload.txt";

    if (req.action === "detect") {
      sendProgress(req.id, "parse", 45);
      const chapters = parseTxt(decoded.text, txtOpt);
      const titles = titledChapters(chapters);
      const preview = extractSamplePreview(chapters, 2);
      sendProgress(req.id, "done", 100);
      self.postMessage({
        id: req.id,
        ok: true,
        result: {
          count: titles.length,
          titles,
          preview,
          encoding: decoded.encoding,
          local: true,
        },
      });
      return;
    }

    if (req.action !== "convert") throw new Error("不支持的本地操作");

    sendProgress(req.id, "parse", 30);
    const chapters = parseTxt(decoded.text, txtOpt);

    let coverImage;
    if (req.cover && req.cover.arrayBuffer && req.cover.size > 0) {
      const coverBytes = new Uint8Array(await req.cover.arrayBuffer());
      coverImage = parseCoverBytes(coverBytes);
    }

    sendProgress(req.id, "render", 42);
    const title = fields.title || inferTitle(decoded.text, fileName);
    const css = generateCss(cssOptionsFromFields(fields));
    const epub = buildEpub(
      {
        title,
        author: fields.author || "",
        css,
        chapters,
        coverImage,
      },
      (percent, stage) => sendProgress(req.id, stage, percent)
    );

    const epubName = displayNameFromUpload(fileName, ".epub");
    const transferBuf =
      epub.byteOffset === 0 && epub.byteLength === epub.buffer.byteLength
        ? epub.buffer
        : epub.slice().buffer;

    sendProgress(req.id, "done", 100);
    self.postMessage(
      {
        id: req.id,
        ok: true,
        result: {
          epub: transferBuf,
          epubName,
          chapters: chapters.length,
          encoding: decoded.encoding,
          local: true,
        },
      },
      [transferBuf]
    );
  } catch (err) {
    const msg = errorMessage(err);
    const code = isInputError(msg) ? "INVALID_INPUT" : "LOCAL_ERROR";
    self.postMessage({ id: req.id, ok: false, error: msg, code });
  }
};
