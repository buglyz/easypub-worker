(function () {
  "use strict";

  // 本地 Worker 失败时仅对运行环境/不支持类故障回退 Cloudflare；
  // 输入校验类错误（如正则语法错、封面格式非法）直接返回 400，避免大文件无效上传。
  var nativeFetch = window.fetch.bind(window);
  var localWorker = null;
  var nextRequestId = 1;
  var pending = Object.create(null);
  var localOutputs = Object.create(null);
  var activeLocalOutputId = "";
  var localRequestEpoch = 0;

  function clearActiveLocalOutput() {
    if (!activeLocalOutputId) return;
    delete localOutputs[activeLocalOutputId];
    activeLocalOutputId = "";
  }

  window.easyPubClearLocalOutput = function () {
    localRequestEpoch += 1;
    clearActiveLocalOutput();
  };

  window.easyPubClearLocalCache = function () {
    if (localWorker) {
      try {
        localWorker.postMessage({ action: "clearCache" });
      } catch (e) {}
    }
  };

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map
      .call(bytes, function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  function workerFailure(message) {
    var err = new Error(message || "本地转换不可用");
    err.code = "LOCAL_ERROR";
    Object.keys(pending).forEach(function (id) {
      pending[id].reject(err);
      delete pending[id];
    });
    if (localWorker) localWorker.terminate();
    localWorker = null;
  }

  function getWorker() {
    if (!window.Worker || !window.File || !window.Blob) {
      var err = new Error("当前浏览器不支持本地转换");
      err.code = "UNSUPPORTED";
      throw err;
    }
    if (localWorker) return localWorker;
    localWorker = new Worker("/local-worker.js");
    localWorker.onmessage = function (event) {
      var data = event.data || {};
      var task = pending[data.id];
      if (!task) return;
      if (data.type === "progress") {
        if (task.progress) task.progress(data.stage, data.percent);
        if (window.easyPubOnLocalProgress) {
          window.easyPubOnLocalProgress(data.stage, data.percent);
        }
        return;
      }
      delete pending[data.id];
      if (data.ok) {
        task.resolve(data.result);
      } else {
        var err = new Error(data.error || "本地转换失败");
        err.code = data.code || "LOCAL_ERROR";
        task.reject(err);
      }
    };
    localWorker.onerror = function (event) {
      workerFailure(event.message || "本地转换线程异常");
    };
    return localWorker;
  }

  function fieldsFromForm(form) {
    var fields = {};
    for (var entry of form.entries()) {
      if (typeof entry[1] === "string") fields[entry[0]] = entry[1];
    }
    return fields;
  }

  function callLocal(action, file, cover, fields) {
    var worker = getWorker();
    return new Promise(function (resolve, reject) {
      var id = String(nextRequestId++);
      pending[id] = { resolve: resolve, reject: reject };
      try {
        worker.postMessage({
          id: id,
          action: action,
          file: file,
          cover: cover || null,
          fileName: file && file.name,
          fields: fields,
        });
      } catch (err) {
        delete pending[id];
        reject(err);
      }
    });
  }

  function interceptLocalDownload(url) {
    var prefix = "/api/local-download/";
    if (url.pathname.indexOf(prefix) !== 0) return null;
    var key = url.pathname.slice(prefix.length).replace(/\.epub$/, "");
    var output = localOutputs[key];
    if (!output) return new Response("本地文件已过期，请重新转换", { status: 410 });
    return new Response(output.blob, {
      status: 200,
      headers: { "Content-Type": "application/epub+zip" },
    });
  }

  function interceptConversion(url, init, action) {
    if (!init || !window.FormData || !(init.body instanceof FormData)) return null;
    try {
      var file = init.body.get("file");
      if (!(file instanceof File)) return null;
      var coverEntry = init.body.get("cover");
      var cover = coverEntry instanceof Blob && coverEntry.size > 0 ? coverEntry : null;
      var fields = fieldsFromForm(init.body);
      var requestEpoch = ++localRequestEpoch;

      return callLocal(action, file, cover, fields).then(function (result) {
        if (requestEpoch !== localRequestEpoch) {
          return jsonResponse({ local: true, stale: true });
        }
        if (action === "detect") return jsonResponse(result);

        var id = randomId();
        clearActiveLocalOutput();
        activeLocalOutputId = id;
        localOutputs[id] = {
          blob: new Blob([result.epub], { type: "application/epub+zip" }),
        };
        window.setTimeout(function () {
          delete localOutputs[id];
          if (activeLocalOutputId === id) activeLocalOutputId = "";
        }, 30 * 60 * 1000);
        return jsonResponse({
          async: false,
          local: true,
          download:
            "/api/local-download/" + id + ".epub?name=" + encodeURIComponent(result.epubName),
          epub: id + ".epub",
          epubName: result.epubName,
          chapters: result.chapters,
          encoding: result.encoding,
        });
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  window.fetch = function (input, init) {
    var rawUrl = typeof input === "string" ? input : input && input.url;
    if (!rawUrl) return nativeFetch(input, init);
    var url = new URL(rawUrl, window.location.href);
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();

    if (method === "GET") {
      var localDownload = interceptLocalDownload(url);
      if (localDownload) return Promise.resolve(localDownload);
    }
    if (method === "POST" && url.origin === window.location.origin) {
      var action =
        url.pathname === "/api/detect"
          ? "detect"
          : url.pathname === "/api/convert"
            ? "convert"
            : "";
      if (action) {
        var localRequest = interceptConversion(url, init, action);
        if (localRequest) {
          return localRequest.catch(function (err) {
            // 输入错误直接本地返回 400，无需无意义上传云端二次报错
            if (err && err.code === "INVALID_INPUT") {
              return jsonResponse(
                { error: err.message || "输入参数有误", code: "INVALID_INPUT", local: true },
                400
              );
            }
            return nativeFetch(input, init);
          });
        }
      }
    }
    return nativeFetch(input, init);
  };
})();
