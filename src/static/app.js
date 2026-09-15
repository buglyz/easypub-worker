/* ==========================================================================
   EasyPub Workers - Modern Frontend Application Engine
   ========================================================================== */

(function () {
  "use strict";

  // Constants
  var MAX_UPLOAD_BYTES = 32 << 20; // 32 MB
  var POLL_MAX_TICKS = 150; // 5 min timeout
  var FILE_EXT_RE = /\.(txt|utf8|gbk|utf-8)$/i;

  // Token Management
  var TOKEN = (function () {
    try {
      var u = new URL(location.href);
      var t = u.searchParams.get("token");
      if (t) {
        history.replaceState(null, "", u.pathname + u.hash);
        try { sessionStorage.setItem("easypub_token", t); } catch (e) {}
        return t;
      }
      var st = sessionStorage.getItem("easypub_token");
      if (st) return st;
    } catch (e) {}
    return "";
  })();

  function redirectToAuth() {
    var next = location.pathname + location.search + location.hash;
    var authUrl = "/auth.html?next=" + encodeURIComponent(next);
    location.replace(authUrl);
  }

  function apiHeaders(extra) {
    var h = extra || {};
    if (TOKEN) h["X-EasyPub-Token"] = TOKEN;
    return h;
  }

  function readApiResponse(res) {
    return res.text().then(function (body) {
      var data;
      try {
        data = body ? JSON.parse(body) : {};
      } catch (e) {
        // Cloudflare/WAF 错误页通常是 HTML；不要把 JSON 解析异常展示给用户。
        var preview = String(body || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);
        var message = "服务器返回了非 JSON 响应（HTTP " + res.status + "）";
        if (preview) message += "：" + preview;
        data = { error: message, code: "NON_JSON_RESPONSE" };
      }
      return { ok: res.ok, status: res.status, data: data };
    });
  }

  // DOM Helper
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
    modeSegments: $("modeSegments"),
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

    valLineHeight: $("valLineHeight"),
    valFontSize: $("valFontSize"),
    valMarginTop: $("valMarginTop"),
    valIndent: $("valIndent"),

    customCss: $("customCss"),
    
    chapterCount: $("chapterCount"),
    convertBtn: $("convertBtn"),
    actionTitle: $("actionTitle"),
    progress: $("progress"),
    progressWrap: $("progressWrap"),
    progressBarFill: $("progressBarFill"),
    
    result: $("result"),
    resultTitle: $("resultTitle"),
    resultMeta: $("resultMeta"),
    resultActions: $("resultActions"),
    summaryEncoding: $("summaryEncoding"),
    
    simTitle: $("simTitle"),
    simAuthor: $("simAuthor"),
    simChapterTitle: $("simChapterTitle"),
    simParagraph1: $("simParagraph1"),
    simParagraph2: $("simParagraph2"),
  };

  // State Management
  var state = {
    file: null,
    fileName: "",
    fileSize: 0,
    detecting: false,
    converting: false,
    pollTimer: null,
    operationId: 0,
  };

  function invalidateOperation() {
    state.operationId += 1;
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
    state.detecting = false;
    state.converting = false;
  }

  /* ---------- Utility Functions ---------- */

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
    if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
    return bytes + " B";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setServiceState(tone, text) {
    if (!els.serviceState) return;
    var statusText = els.serviceState.querySelector(".status-text");
    if (statusText) statusText.textContent = text || "服务就绪";
    els.serviceState.dataset.state = tone || "ready";
  }

  function updateAction(title, progress, busy) {
    els.actionTitle.textContent = title;
    els.progress.textContent = progress;
    els.convertBtn.disabled = busy || !state.file;
  }

  function showError(message) {
    els.preview.innerHTML =
      '<div class="preview-empty-msg" style="color: var(--danger);" role="alert">' +
      escapeHtml(message || "操作失败，请重试") +
      "</div>";
    setServiceState("error", "出错了");
  }

  /* ---------- Live Reader Simulator Synchronizer ---------- */

  function syncLiveReaderPreview() {
    // Sync Metadata
    var titleVal = els.title.value.trim() || state.fileName.replace(/\.[^/.]+$/, "") || "未命名图书";
    var authorVal = els.author.value.trim() || "未知作者";
    els.simTitle.textContent = titleVal;
    els.simAuthor.textContent = authorVal;

    // Apply Typography Styles to Simulated Paragraphs & Headings
    var lh = (parseInt(els.lineHeight.value, 10) || 120);
    var fs = (parseInt(els.fontSize.value, 10) || 100);
    var mt = (parseInt(els.marginTop.value, 10) || 5);
    var ind = (parseFloat(els.indent.value) || 0);
    var alignCode = parseInt(els.textAlign.value, 10) || 0;
    var alignMap = ["justify", "left", "center", "right"];
    var alignVal = alignMap[alignCode] || "justify";

    // Update Label Units
    els.valLineHeight.textContent = lh + "%";
    els.valFontSize.textContent = fs + "%";
    els.valMarginTop.textContent = mt + "px";
    els.valIndent.textContent = ind + "rem";

    var pElements = [els.simParagraph1, els.simParagraph2];
    pElements.forEach(function (p) {
      if (!p) return;
      p.style.lineHeight = (lh / 100);
      p.style.fontSize = (fs / 100) + "rem";
      p.style.marginTop = mt + "px";
      p.style.textIndent = ind > 0 ? ind + "rem" : "0em";
      p.style.textAlign = alignVal;
    });

    // 注入用户自定义 CSS 到模拟器预览（作用域限定在 .reader-device 内）
    var styleTag = document.getElementById("sim-custom-css");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "sim-custom-css";
      document.head.appendChild(styleTag);
    }
    var rawCss = els.customCss ? els.customCss.value : "";
    // 简单作用域隔离：每条规则前加 .reader-device 前缀
    // 只处理基本选择器，复杂 CSS 可能不完全准确，但足够预览
    var scopedCss = "";
    if (rawCss && rawCss.trim()) {
      scopedCss = rawCss
        .replace(/\/\*[\s\S]*?\*\//g, "") // 去注释
        .replace(/\s+/g, " ")
        .split("}")
        .map(function (rule) {
          var parts = rule.split("{");
          if (parts.length < 2) return "";
          var selectors = parts[0].trim();
          var body = parts.slice(1).join("{").trim();
          if (!selectors || !body) return "";
          var scoped = selectors
            .split(",")
            .map(function (s) { return ".reader-device " + s.trim(); })
            .join(", ");
          return scoped + " { " + body + " }";
        })
        .join("\n");
    }
    styleTag.textContent = scopedCss;
  }

  /* ---------- Form Data Assembler ---------- */

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
    form.append("addSpaceCount", String(parseInt(els.addSpaceCount.value, 10) || 1));

    form.append("lineHeight", els.lineHeight.value);
    form.append("fontSize", els.fontSize.value);
    form.append("marginTop", els.marginTop.value);
    form.append("indent", els.indent.value);
    form.append("textAlign", els.textAlign.value);
    form.append("customCss", els.customCss ? els.customCss.value : "");

    return form;
  }

  /* ---------- File Selection & Handling ---------- */

  function setFile(file) {
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      showError("文件不能超过 " + formatSize(MAX_UPLOAD_BYTES) + "（当前 " + formatSize(file.size) + "）");
      return;
    }
    if (!FILE_EXT_RE.test(file.name)) {
      showError("仅支持 .txt / .utf8 / .gbk 等文本文件");
      return;
    }

    invalidateOperation();
    state.file = file;
    state.fileName = file.name;
    state.fileSize = file.size;

    els.dropzoneBody.hidden = true;
    els.fileCard.hidden = false;
    els.dropzone.classList.add("has-file");
    els.fileName.textContent = file.name;
    els.fileMeta.textContent = formatSize(file.size);

    els.summaryEncoding.textContent = "待识别";
    els.detectBtn.disabled = false;

    hideResult();
    els.preview.innerHTML = '<div class="preview-empty-msg">正在自动识别章节目录…</div>';
    els.chapterCount.textContent = "0 章";
    updateAction("准备开始", "已选择 " + file.name + "，系统正在识别章节。", false);
    setServiceState("ready", "服务就绪");

    syncLiveReaderPreview();
    detectChapters();
  }

  function clearFile() {
    invalidateOperation();
    state.file = null;
    state.fileName = "";
    state.fileSize = 0;
    els.fileInput.value = "";
    els.dropzoneBody.hidden = false;
    els.fileCard.hidden = true;
    els.dropzone.classList.remove("has-file");
    els.detectBtn.disabled = true;
    els.convertBtn.disabled = true;
    
    els.summaryEncoding.textContent = "待识别";
    els.preview.innerHTML = '<div class="preview-empty-msg">选择 TXT 文件后将自动识别章节，这里会显示目录预览。</div>';
    els.chapterCount.textContent = "0 章";

    hideResult();
    updateAction("准备开始", "请选择一个 TXT 文件开始。", false);
    setServiceState("ready", "服务就绪");
    syncLiveReaderPreview();
  }

  function hideResult() {
    if (window.easyPubClearLocalOutput) window.easyPubClearLocalOutput();
    els.result.hidden = true;
    els.resultActions.innerHTML = "";
    els.progressWrap.hidden = true;
    els.progressBarFill.classList.remove("indeterminate");
    els.progressBarFill.style.width = "0%";
  }

  /* ---------- Chapter Detection ---------- */

  function renderChapterPreview(data) {
    var titles = data.titles || [];
    els.chapterCount.textContent = titles.length + " 章";
    els.summaryEncoding.textContent = (data.encoding || "utf-8").toUpperCase();

    if (titles.length > 0 && titles[0]) {
      els.simChapterTitle.textContent = titles[0];
    } else {
      els.simChapterTitle.textContent = "第一章 预览章节";
    }

    if (titles.length === 0) {
      els.preview.innerHTML =
        '<div class="preview-empty-msg">未识别到结构化章节。可能整文无明显标记，或需切换切分方式。</div>';
      return;
    }

    var html =
      '<div class="preview-header">' +
        '<span>目录提取结果</span>' +
        '<span>共 ' + titles.length + ' 章 · 编码 ' + escapeHtml(data.encoding || "utf-8") + '</span>' +
      '</div>';
    
    html += '<ul class="chapter-scroll-list">';
    var max = 120;
    for (var i = 0; i < titles.length && i < max; i++) {
      html += '<li class="chapter-item">' +
                '<span class="chapter-num">' + (i + 1) + '.</span>' +
                '<span>' + escapeHtml(titles[i]) + '</span>' +
              '</li>';
    }
    if (titles.length > max) {
      html += '<li class="chapter-item" style="color: var(--ink-muted); text-align: center;">' +
                '… 其余 ' + (titles.length - max) + ' 章省略显示' +
              '</li>';
    }
    html += '</ul>';
    els.preview.innerHTML = html;
  }

  function detectChapters() {
    if (!state.file || state.detecting) return;
    var operationId = state.operationId;
    state.detecting = true;
    els.detectBtn.disabled = true;
    els.preview.innerHTML = '<div class="preview-empty-msg">正在识别章节中…</div>';
    setServiceState("busy", "识别中");

    fetch("/api/detect", {
      method: "POST",
      headers: apiHeaders(),
      body: buildFormData(),
    })
      .then(readApiResponse)
      .then(function (r) {
        if (operationId !== state.operationId) return;
        if (r.status === 401) { redirectToAuth(); return; }
        if (!r.ok) throw new Error(r.data.error || "识别失败");
        renderChapterPreview(r.data);
        var detectSource = r.data.local ? "文件未上传，已在本机完成识别。" : "可调整排版后生成 EPUB。";
        updateAction("目录识别完成", "已为您解析 " + (r.data.titles || []).length + " 章，" + detectSource, false);
        setServiceState("ready", "服务就绪");
      })
      .catch(function (err) {
        if (operationId !== state.operationId) return;
        showError(err.message);
      })
      .finally(function () {
        if (operationId !== state.operationId) return;
        state.detecting = false;
        els.detectBtn.disabled = !state.file;
      });
  }

  /* ---------- Book Conversion & Polling ---------- */

  function showResult(data) {
    var dl = data.download || "";
    var localDownload = data.local === true && dl.indexOf("/api/local-download/") === 0;
    if (dl && dl.indexOf("/api/download/") !== 0 && !localDownload) {
      throw new Error("下载链接非法");
    }

    els.result.hidden = false;
    els.resultTitle.textContent = "EPUB 电子书已就绪";
    els.resultMeta.textContent =
      (data.epubName || "book.epub") +
      " · " + (data.chapters || 0) + " 章 · 编码 " + (data.encoding || "utf-8").toUpperCase();

    els.resultActions.innerHTML = "";
    var btn = document.createElement("button");
    btn.className = "download-btn-giant";
    btn.type = "button";
    btn.innerHTML = '<span>下载 ' + escapeHtml(data.epubName || "EPUB") + '</span> <span>↓</span>';

    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.innerHTML = '<span>正在获取文件…</span>';

      fetch(dl, { headers: apiHeaders() })
        .then(function (res) {
          if (res.status === 401) { redirectToAuth(); return null; }
          if (!res.ok) throw new Error("下载失败 (HTTP " + res.status + ")");
          return res.blob();
        })
        .then(function (blob) {
          if (!blob) return;
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = data.epubName || "book.epub";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          btn.disabled = false;
          btn.innerHTML = '<span>下载 ' + escapeHtml(data.epubName || "EPUB") + '</span> <span>↓</span>';
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.innerHTML = '<span>下载失败，点击重试</span>';
          setTimeout(function () {
            btn.innerHTML = '<span>下载 ' + escapeHtml(data.epubName || "EPUB") + '</span> <span>↓</span>';
          }, 3000);
        });
    });

    els.resultActions.appendChild(btn);

    els.progressWrap.hidden = true;
    updateAction(
      "生成完毕",
      data.local ? "已使用本机 CPU 完成转换，文件未上传。" : "可点击按钮下载 EPUB 电子书。",
      false
    );
    setServiceState("ready", "服务就绪");
  }

  function pollJob(jobId, operationId) {
    var ticks = 0;
    els.progressWrap.hidden = false;
    els.progressBarFill.classList.add("indeterminate");

    var tick = function () {
      if (operationId !== state.operationId) return;
      if (ticks++ >= POLL_MAX_TICKS) {
        state.pollTimer = null;
        state.converting = false;
        showError("转换超时，请重试或拆分超大文件");
        updateAction("转换超时", "请重试或拆分大文件。", false);
        return;
      }

      fetch("/api/jobs/" + encodeURIComponent(jobId), { headers: apiHeaders() })
        .then(readApiResponse)
        .then(function (r) {
          if (operationId !== state.operationId) return;
          if (r.status === 401) { redirectToAuth(); return; }
          if (!r.ok) throw new Error(r.data.error || "任务查询失败");
          var data = r.data;

          if (data.status === "done") {
            state.pollTimer = null;
            state.converting = false;
            showResult(data);
            return;
          }
          if (data.status === "error") {
            state.pollTimer = null;
            state.converting = false;
            throw new Error(data.error || "转换失败");
          }

          var msg = data.status === "running" ? "后台正在高效打包 EPUB..." : "任务已排队，请稍候...";
          updateAction("后台转换中", msg, true);
          state.pollTimer = setTimeout(tick, 2000);
        })
        .catch(function (err) {
          if (operationId !== state.operationId) return;
          state.pollTimer = null;
          state.converting = false;
          showError(err.message);
          updateAction("出错了", "请重试或更换文件。", false);
        });
    };
    tick();
  }

  function convertBook() {
    if (!state.file || state.converting) return;
    var operationId = state.operationId;
    state.converting = true;
    els.convertBtn.disabled = true;
    hideResult();

    els.progressWrap.hidden = false;
    els.progressBarFill.classList.remove("indeterminate");
    els.progressBarFill.style.width = "35%";
    updateAction("正在生成", "优先使用本机 CPU 构建 EPUB；本地不可用时自动切换云端。", true);
    setServiceState("busy", "转换中");

    fetch("/api/convert", {
      method: "POST",
      headers: apiHeaders(),
      body: buildFormData(),
    })
      .then(readApiResponse)
      .then(function (r) {
        if (operationId !== state.operationId) return;
        if (r.status === 401) { redirectToAuth(); return; }
        if (!r.ok) throw new Error(r.data.error || "转换失败");
        var data = r.data;

        if (data.async) {
          els.progress.textContent = "文件较大，已转为异步后台生成（Job ID: " + data.jobId + "）...";
          pollJob(data.jobId, operationId);
        } else {
          state.converting = false;
          showResult(data);
        }
      })
      .catch(function (err) {
        if (operationId !== state.operationId) return;
        state.converting = false;
        showError(err.message);
        updateAction("出错了", "请重试或更换文件。", false);
        setServiceState("error", "转换失败");
      });
  }

  /* ---------- Event Listeners & Bindings ---------- */

  // File Choice Buttons
  els.chooseBtn.addEventListener("click", function () { els.fileInput.click(); });
  els.changeFileBtn.addEventListener("click", function () { els.fileInput.click(); });
  
  els.fileInput.addEventListener("change", function () {
    if (els.fileInput.files && els.fileInput.files.length > 0) {
      setFile(els.fileInput.files[0]);
    }
  });

  // Drag and Drop Handling
  ["dragenter", "dragover"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropzone.classList.remove("dragover");
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

  els.dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  // Segmented Control Sync for Chapter Mode
  if (els.modeSegments) {
    var segmentBtns = els.modeSegments.querySelectorAll(".segment-btn");
    segmentBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.dataset.value;
        segmentBtns.forEach(function (b) { b.classList.toggle("active", b === btn); });
        els.chapterMode.value = val;
        
        els.fullRegField.hidden = val !== "custom";
        els.fullReg.disabled = val !== "custom";
        els.splitCountField.hidden = val !== "count";

        if (state.file) detectChapters();
      });
    });
  }

  // Checkbox Field Visibility Toggles
  els.addSpace.addEventListener("change", function () {
    els.addSpaceCountField.hidden = !els.addSpace.checked;
  });

  // Action Buttons
  els.detectBtn.addEventListener("click", detectChapters);
  els.convertBtn.addEventListener("click", convertBook);
  
  els.resetBtn.addEventListener("click", function () {
    clearFile();
  });

  // Real-time Inputs Sync for Reader Simulator
  [
    els.title, els.author, els.lineHeight, els.fontSize,
    els.marginTop, els.indent, els.textAlign, els.customCss
  ].forEach(function (input) {
    if (!input) return;
    input.addEventListener("input", syncLiveReaderPreview);
  });

  // Prevent Form Submit on Enter Key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") {
      e.preventDefault();
    }
  });

  // Initial Auth Verification Check
  (function checkAuthOnBoot() {
    fetch("/api/auth/verify", { headers: apiHeaders() })
      .then(function (res) {
        if (res.status === 401) redirectToAuth();
      })
      .catch(function () { /* Network error grace fallback */ });
  })();

  // Initial Sync
  syncLiveReaderPreview();
  updateAction("准备开始", "请选择一个 TXT 文件开始。", false);

})();
