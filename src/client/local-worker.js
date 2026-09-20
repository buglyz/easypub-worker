import { detectAndDecode } from "../lib/encoding";
import { buildEpub, inferTitle } from "../lib/epub-build";
import { generateCss, cssOptionsFromFields } from "../lib/css";
import { displayNameFromUpload } from "../lib/names";
import { optionsFromForm, parseTxt, titledChapters } from "../lib/txt-parse";

function errorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  return String(err || "本地转换失败");
}

// stage + percent 双维度进度：本地转换在 Worker 线程内读文件并分阶段执行，
// 每阶段向主线程回报进度，主线程通过 window.easyPubOnLocalProgress 更新 UI。
function sendProgress(id, stage, percent) {
  self.postMessage({ id, type: "progress", stage, percent });
}

self.onmessage = async function (event) {
  const req = event.data || {};
  try {
    // 文件在 Worker 线程内读取（File 结构化克隆进 Worker），主线程不阻塞在
    // 大 ArrayBuffer 的分配/拷贝上。req.file 优先；req.bytes 兼容旧调用。
    const bytes = req.file && req.file.arrayBuffer
      ? new Uint8Array(await req.file.arrayBuffer())
      : new Uint8Array(req.bytes || []);
    const fields = req.fields || {};
    const txtOpt = optionsFromForm(fields);

    sendProgress(req.id, "decode", 5);
    const decoded = detectAndDecode(bytes);
    const fileName = req.fileName || "upload.txt";

    if (req.action === "detect") {
      sendProgress(req.id, "parse", 30);
      const titles = titledChapters(parseTxt(decoded.text, txtOpt));
      sendProgress(req.id, "done", 100);
      self.postMessage({
        id: req.id,
        ok: true,
        result: { count: titles.length, titles, encoding: decoded.encoding, local: true },
      });
      return;
    }

    if (req.action !== "convert") throw new Error("不支持的本地操作");

    // 分阶段执行（与 convert-core.runConvert 编排一致，拆开以便回报进度）
    sendProgress(req.id, "parse", 30);
    const chapters = parseTxt(decoded.text, txtOpt);
    sendProgress(req.id, "render", 55);
    const title = fields.title || inferTitle(decoded.text, fileName);
    const css = generateCss(cssOptionsFromFields(fields));
    sendProgress(req.id, "build", 70);
    const epub = buildEpub({
      title,
      author: fields.author || "",
      css,
      chapters,
    });

    sendProgress(req.id, "zip", 90);
    const epubName = displayNameFromUpload(fileName, ".epub");
    sendProgress(req.id, "done", 100);
    self.postMessage(
      {
        id: req.id,
        ok: true,
        result: {
          epub: epub.buffer,
          epubName,
          chapters: chapters.length,
          encoding: decoded.encoding,
          local: true,
        },
      },
      [epub.buffer]
    );
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: errorMessage(err) });
  }
};