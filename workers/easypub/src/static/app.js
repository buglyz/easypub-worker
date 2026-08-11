/* EasyPub Workers 前端：上传 → 识别章节 → 转换(同步/异步) → 下载 */
(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var els = {
    serviceState: $("serviceState"),
    resetBtn: $("resetBtn"),
    dropzone: $("dropzone"),
    fileInput: $("file"),
    dropzoneBody: $("dropzoneBody"),
    chooseBtn: $("chooseBtn"),
    fileCard: $("fileCard"),
    fileName: $("fileName"),
    fileMeta: $("fileMeta"),
    changeFileBtn: $("changeFileBtn"),
    title: $("title"),
    author: $("author"),
    chapterMode: $("chapterMode"),
    fullRegField: $("fullRegField"),
    fullReg: $("fullReg"),
    splitCountField: $("splitCountField"),
    splitCount: $("splitCount"),
    removeBlank: $("removeBlank"),
    addSpace: $("addSpace"),
    addSpaceCountField: $("addSpaceCountField"),
    addSpaceCount: $("addSpaceCount"),
    detectBtn: $("detectBtn"),
    preview: $("preview"),
    lineHeight: $("lineHeight"),
    fontSize: $("fontSize"),
    marginTop: $("marginTop"),
    indent: $("indent"),
    textAlign: $("textAlign"),
    chapterCount: $("chapterCount"),
    flowSource: $("flowSource"),
    flowChapter: $("flowChapter"),
    flowLayout: $("flowLayout"),
    flowConvert: $("flowConvert"),
    summaryPlaceholder: $("summaryPlaceholder"),
    fileSummary: $("fileSummary"),
    summaryName: $("summaryName"),
    summarySize: $("summarySize"),
    summaryEncoding: $("summaryEncoding"),
    result: $("result"),
    resultKicker: $("resultKicker"),
    resultTitle: $("resultTitle"),
    resultMeta: $("resultMeta"),
    resultActions: $("resultActions"),
    actionTitle: $("actionTitle"),
    progress: $("progress"),
    convertBtn: $("convertBtn"),
  };

  var state = {
    file: null,
    fileName: null,
    fileSize: 0,
    detecting: false,
    converting: false,
    pollTimer: null,
  };

  /* ---------- 工具 ---------- */

  function formatSize(bytes) {
    if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
    if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
    return bytes + " B";
  }

  function setService(tone, text) {
    els.serviceState.textContent = text || "服务就绪";
    els.serviceState.dataset.tone = tone || "ready";
  }

  function setStep(flow, done) {
    var items = document.querySelectorAll("#flowList .step-item");
    var seen = false;
    items.forEach(function (item) {
      if (item.dataset.flow === flow) seen = true;
      item.classList.toggle("done", done && seen);
      item.classList.toggle("active", seen && !(done && seen));
    });
  }

  function updateAction(title, progress, busy) {
    els.actionTitle.textContent = title;
    els.progress.textContent = progress;
    els.convertBtn.disabled = busy || !state.file;
  }

  function showError(message) {
    els.preview.innerHTML =
      '<div class="error-message" role="alert">' +
      escapeHtml(message || "操作失败，请重试") +
      "</div>";
    setService("error", "出错了");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- 表单组装 ---------- */

  function buildFormData() {
    var form = new FormData();
    if (state.file) form.append("file", state.file);
    form.append("title", els.title.value.trim());
    form.append("author", els.author.value.trim());

    var mode = els.chapterMode.value;
    var splitMode = 0;
    var autoMark = true;
    var fullReg = "";
    var splitCount = 0;
    if (mode === "custom") {
      autoMark = false;
      fullReg = els.fullReg.value.trim();
    } else if (mode === "count") {
      splitMode = 1;
      autoMark = false;
      splitCount = parseInt(els.splitCount.value, 10) || 10000;
    } else if (mode === "whole") {
      splitMode = 2;
      autoMark = false;
    }
    form.append("splitMode", String(splitMode));
    form.append("autoMark", autoMark ? "true" : "false");
    form.append("fullReg", fullReg);
    form.append("splitCount", String(splitCount));

    form.append("removeBlank", els.removeBlank.checked ? "true" : "false");
    form.append("addSpace", els.addSpace.checked ? "true" : "false");
    form.append(
      "addSpaceCount",
      String(parseInt(els.addSpaceCount.value, 10) || 1)
    );

    form.append("lineHeight", els.lineHeight.value);
    form.append("fontSize", els.fontSize.value);
    form.append("marginTop", els.marginTop.value);
    form.append("indent", els.indent.value);
    form.append("textAlign", els.textAlign.value);
    // 仅 EPUB：无 enableMobi / configPath
    return form;
  }

  /* ---------- 文件选择 ---------- */

  function setFile(file) {
    if (!file) return;
    state.file = file;
    state.fileName = file.name;
    state.fileSize = file.size;

    els.dropzoneBody.hidden = true;
    els.fileCard.hidden = false;
    els.fileName.textContent = file.name;
    els.fileMeta.textContent = formatSize(file.size);

    els.summaryPlaceholder.hidden = true;
    els.fileSummary.hidden = false;
    els.summaryName.textContent = file.name;
    els.summarySize.textContent = formatSize(file.size);
    els.summaryEncoding.textContent = "待识别";

    els.detectBtn.disabled = false;
    els.flowSource.textContent = file.name;
    els.flowChapter.textContent = "尚未识别";
    setStep("source", true);
    setStep("chapter", false);
    setStep("convert", false);

    hideResult();
    els.preview.innerHTML =
      '<div class="empty-state">文件已就绪，点击「识别章节」查看目录预览。</div>';
    els.chapterCount.textContent = "0 章";
    updateAction("准备开始", "已选择 " + file.name + "，可识别章节或直接转换。", false);
    setService("ready", "服务就绪");
  }

  function clearFile() {
    state.file = null;
    state.fileName = null;
    state.fileSize = 0;
    els.fileInput.value = "";
    els.dropzoneBody.hidden = false;
    els.fileCard.hidden = true;
    els.detectBtn.disabled = true;
    els.convertBtn.disabled = true;
    els.summaryPlaceholder.hidden = false;
    els.fileSummary.hidden = true;
    els.preview.innerHTML =
      '<div class="empty-state">选择文件后点击「识别章节」，这里会显示目录预览。</div>';
    els.chapterCount.textContent = "0 章";
    els.flowSource.textContent = "等待文件";
    els.flowChapter.textContent = "尚未识别";
    els.flowConvert.textContent = "等待转换";
    setStep("source", false);
    setStep("chapter", false);
    setStep("convert", false);
    hideResult();
    updateAction("准备开始", "请选择一个 TXT 文件。", false);
    setService("ready", "服务就绪");
  }

  function hideResult() {
    els.result.hidden = true;
    els.result.classList.remove("is-error");
    els.resultActions.innerHTML = "";
  }

  /* ---------- 章节识别 ---------- */

  function renderPreview(data) {
    var titles = data.titles || [];
    els.chapterCount.textContent = titles.length + " 章";
    els.summaryEncoding.textContent = data.encoding || "utf-8";

    if (titles.length === 0) {
      els.preview.innerHTML =
        '<div class="preview-message">未识别到有标题的章节。可能整本书只有一段，或需切换切分方式。</div>';
      return;
    }

    var html =
      '<div class="preview-header"><strong>目录预览</strong>' +
      "<span>共 " + titles.length + " 章 · 编码 " + escapeHtml(data.encoding || "utf-8") + "</span></div>";
    html += "<ol class=\"chapter-list\">";
    var shown = 0;
    var max = 100;
    for (var i = 0; i < titles.length; i++) {
      if (shown >= max) break;
      html += "<li>" + escapeHtml(titles[i]) + "</li>";
      shown++;
    }
    if (titles.length > max) {
      html += "<li class=\"more\">… 其余 " + (titles.length - max) + " 章省略</li>";
    }
    html += "</ol>";
    els.preview.innerHTML = html;
  }

  function detectChapters() {
    if (!state.file || state.detecting) return;
    state.detecting = true;
    els.detectBtn.disabled = true;
    els.preview.innerHTML = '<div class="preview-message">正在识别章节…</div>';
    setService("ready", "识别中");

    fetch("/api/detect", { method: "POST", body: buildFormData() })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(r.data.error || "识别失败");
        renderPreview(r.data);
        els.flowChapter.textContent = "已识别 " + (r.data.titles || []).length + " 章";
        setStep("chapter", true);
        updateAction("可以转换", "章节已识别，可调整排版后生成 EPUB。", false);
      })
      .catch(function (err) {
        showError(err.message);
        els.flowChapter.textContent = "识别失败";
      })
      .finally(function () {
        state.detecting = false;
        els.detectBtn.disabled = !state.file;
      });
  }

  /* ---------- 转换（同步 + 异步轮询） ---------- */

  function showResult(data) {
    els.result.hidden = false;
    els.result.classList.remove("is-error");
    els.resultKicker.textContent = "转换完成";
    els.resultTitle.textContent = "电子书已准备好";
    els.resultMeta.textContent =
      (data.epubName || "book.epub") +
      " · " + (data.chapters || 0) + " 章 · 编码 " + (data.encoding || "utf-8");
    els.resultActions.innerHTML = "";

    var a = document.createElement("a");
    a.className = "download-link";
    a.href = data.download || "";
    if (data.epubName) a.setAttribute("download", data.epubName);
    var span = document.createElement("span");
    span.textContent = "下载 " + (data.epubName || "EPUB");
    var arrow = document.createElement("span");
    arrow.textContent = "↓";
    a.appendChild(span);
    a.appendChild(arrow);
    els.resultActions.appendChild(a);

    els.flowConvert.textContent = "已生成 " + (data.epubName || "EPUB");
    setStep("convert", true);
    updateAction("完成", "点击「下载 " + (data.epubName || "EPUB") + "」保存文件。", false);
    setService("ready", "服务就绪");
  }

  function pollJob(jobId) {
    var tick = function () {
      fetch("/api/jobs/" + encodeURIComponent(jobId))
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (r) {
          if (!r.ok) throw new Error(r.data.error || "任务查询失败");
          var data = r.data;
          if (data.status === "done") {
            state.pollTimer = null;
            showResult(data);
            return;
          }
          if (data.status === "error") {
            state.pollTimer = null;
            throw new Error(data.error || "转换失败");
          }
          els.flowConvert.textContent =
            data.status === "running" ? "正在转换…" : "排队中…";
          updateAction("转换中", "文件较大，正在后台转换，请稍候…", true);
          state.pollTimer = setTimeout(tick, 2000);
        })
        .catch(function (err) {
          state.pollTimer = null;
          els.flowConvert.textContent = "转换失败";
          showError(err.message);
          updateAction("出错了", "请重试或更换文件。", false);
        });
    };
    tick();
  }

  function convertBook() {
    if (!state.file || state.converting) return;
    state.converting = true;
    els.convertBtn.disabled = true;
    hideResult();
    els.flowConvert.textContent = "正在转换…";
    setStep("convert", false);
    setStep("layout", true);
    els.flowLayout.textContent = "使用当前参数";
    updateAction("转换中", "正在生成 EPUB…", true);
    setService("ready", "转换中");

    fetch("/api/convert", { method: "POST", body: buildFormData() })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(r.data.error || "转换失败");
        var data = r.data;
        if (data.async) {
          // 大文件：异步任务，轮询 /api/jobs/:id
          els.progress.textContent = "文件较大，已创建异步任务（" + data.jobId + "）…";
          pollJob(data.jobId);
        } else {
          showResult(data);
        }
      })
      .catch(function (err) {
        els.flowConvert.textContent = "转换失败";
        showError(err.message);
        updateAction("出错了", "请重试或更换文件。", false);
        setService("error", "转换失败");
      })
      .finally(function () {
        state.converting = false;
      });
  }

  /* ---------- 事件绑定 ---------- */

  els.chooseBtn.addEventListener("click", function () {
    els.fileInput.click();
  });
  els.changeFileBtn.addEventListener("click", function () {
    els.fileInput.click();
  });
  els.fileInput.addEventListener("change", function () {
    if (els.fileInput.files && els.fileInput.files.length > 0) {
      setFile(els.fileInput.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
    });
  });
  els.dropzone.addEventListener("drop", function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) setFile(files[0]);
  });
  els.dropzone.addEventListener("click", function (e) {
    if (e.target === els.chooseBtn || e.target === els.changeFileBtn) return;
    els.fileInput.click();
  });

  els.detectBtn.addEventListener("click", detectChapters);
  els.convertBtn.addEventListener("click", convertBook);
  els.resetBtn.addEventListener("click", function () {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
    clearFile();
  });

  // 切分方式联动
  els.chapterMode.addEventListener("change", function () {
    var mode = els.chapterMode.value;
    els.fullRegField.hidden = mode !== "custom";
    els.fullReg.disabled = mode !== "custom";
    els.splitCountField.hidden = mode !== "count";
  });
  els.addSpace.addEventListener("change", function () {
    els.addSpaceCountField.hidden = !els.addSpace.checked;
  });

  // 排版改动后重置结果与步骤 4 状态
  [
    els.lineHeight,
    els.fontSize,
    els.marginTop,
    els.indent,
    els.textAlign,
    els.title,
    els.author,
    els.chapterMode,
    els.fullReg,
    els.splitCount,
    els.removeBlank,
    els.addSpace,
    els.addSpaceCount,
  ].forEach(function (el) {
    el.addEventListener("input", function () {
      els.flowLayout.textContent = "使用当前参数";
      setStep("layout", true);
      hideResult();
    });
  });

  // 回车不触发表单提交
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") {
      e.preventDefault();
    }
  });

  updateAction("准备开始", "请选择一个 TXT 文件。", false);
})();
