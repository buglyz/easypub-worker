import { runConvert } from "../lib/convert-core";
import { detectAndDecode } from "../lib/encoding";
import { cssOptionsFromFields } from "../lib/css";
import { displayNameFromUpload } from "../lib/names";
import { optionsFromForm, parseTxt, titledChapters } from "../lib/txt-parse";

function errorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  return String(err || "本地转换失败");
}

function sendProgress(id, stage) {
  self.postMessage({ id, type: "progress", stage });
}

self.onmessage = async function (event) {
  const req = event.data || {};
  try {
    sendProgress(req.id, "decode");
    const decoded = detectAndDecode(new Uint8Array(req.bytes));
    const fields = req.fields || {};
    const txtOpt = optionsFromForm(fields);

    if (req.action === "detect") {
      sendProgress(req.id, "parse");
      const titles = titledChapters(parseTxt(decoded.text, txtOpt));
      self.postMessage({
        id: req.id,
        ok: true,
        result: { count: titles.length, titles, encoding: decoded.encoding, local: true },
      });
      return;
    }

    if (req.action !== "convert") throw new Error("不支持的本地操作");
    sendProgress(req.id, "convert");
    const result = runConvert({
      text: decoded.text,
      fileName: req.fileName || "upload.txt",
      title: fields.title || "",
      author: fields.author || "",
      encoding: decoded.encoding,
      txtOpt,
      cssOpt: cssOptionsFromFields(fields),
    });
    sendProgress(req.id, "zip");
    const epubName = displayNameFromUpload(req.fileName || "upload.txt", ".epub");
    self.postMessage(
      {
        id: req.id,
        ok: true,
        result: {
          epub: result.epub.buffer,
          epubName,
          chapters: result.chapters,
          encoding: result.encoding,
          local: true,
        },
      },
      [result.epub.buffer]
    );
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: errorMessage(err) });
  }
};
