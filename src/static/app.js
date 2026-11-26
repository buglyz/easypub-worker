/* EasyPub WebUI 应用引擎 */
(function () {
  "use strict";

  var MAX_UPLOAD_BYTES = 1 << 30;
  var POLL_MAX_TICKS = 150;
  var FILE_EXT_RE = /\.(txt|utf8|gbk|utf-8)$/i;
  var PREFS_KEY = "easypub_prefs_v2";
  var DEFAULT_PARAGRAPHS = [
    "导入 TXT 文件后，此处将展示真实章节的首段内容。调整左侧字号、行高、段前距或自定义 CSS，效果将实时同步。",
    "EasyPub 自动识别中文编码与章节结构，生成标准 EPUB 2.0 电子书，兼容主流电纸书与阅读器。",
  ];

  var TOKEN = (function () {
    try {
      var u = new URL(location.href);
      var t = u.searchParams.get("token");
      if (t) {
        history.replaceState(null, "", u.pathname + u.hash);
        try { sessionStorage.setItem("easypub_token", t); } catch (e) {}
        return t;
      }
      return sessionStorage.getItem("easypub_token") || "";
    } catch (e) {
      return "";
    }
  })();

  function redirectToAuth() {
    try { sessionStorage.removeItem("easypub_token"); } catch (e) {}
    var next = location.pathname + location.search + location.hash;
    location.replace("/auth.html?next=" + encodeURIComponent(next));
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

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    serviceState: $("serviceState"),
    resetBtn: $("resetBtn"),
    resetPrefsBtn: $("resetPrefsBtn"),
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
    regexHint: $("regexHint"),
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
    readerHeaderBook: $("readerHeaderBook"),
    readerDevice: $("readerDevice"),
    readerViewTabs: $("readerViewTabs"),
    readerPageView: $("readerPageView"),
    readerCoverView: $("readerCoverView"),
    paperSwitcher: $("paperSwitcher"),
    flowLayout: $("flowLayout"),
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

  var state = {
    file: null,
    fileName: "",
    fileSize: 0,
    detecting: false,
    converting: false,
    pollTimer: null,
    detectDebounce: null,
    operationId: 0,
    lastTitles: [],
    lastEncoding: "utf-8",
    chapterFilter: "",
    paper: "warm",
  };

  function invalidateOperation() {
    state.operationId += 1;
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
    if (state.detectDebounce) { clearTimeout(state.detectDebounce); state.detectDebounce = null; }
    state.detecting = false;
    state.converting = false;
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + " MB";
    if (bytes >= 1 << 10) return (bytes / (1 << 10)).toFixed(1) + " KB";
    return bytes + " B";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function numValue(el, fallback) {
    var n = parseInt(el.value, 10);
    return Number.isNaN(n) ? fallback : n;
  }

  function floatValue(el, fallback) {
    var n = parseFloat(el.value);
    return Number.isNaN(n) ? fallback : n;
  }

  function setServiceState(tone, text) {
    if (!els.serviceState) return;
    var statusText = els.serviceState.querySelector(".status-text");
    if (statusText) statusText.textContent = text || "本机优先就绪";
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
      escapeHtml(message || "操作失败，请重试") + "</div>";
    setServiceState("error", "操作出错");
  }

  function updateFlowBadge() {
    if (!els.flowLayout) return;
    var tags = [];
    if (els.customCss && els.customCss.value.trim()) tags.push("自定义 CSS");
    if (window.easyPubCover && window.easyPubCover.hasActiveCover()) tags.push("含封面图");
    els.flowLayout.textContent = tags.length > 0 ? tags.join(" · ") : "默认排版";
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        lineHeight: els.lineHeight.value,
        fontSize: els.fontSize.value,
        marginTop: els.marginTop.value,
        indent: els.indent.value,
        textAlign: els.textAlign.value,
        customCss: els.customCss.value,
        removeBlank: els.removeBlank.checked,
        addSpace: els.addSpace.checked,
        addSpaceCount: els.addSpaceCount.value,
        paper: state.paper,
        cover: window.easyPubCover ? window.easyPubCover.getPrefs() : null,
      }));
    } catch (e) {}
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p.lineHeight != null) els.lineHeight.value = p.lineHeight;
      if (p.fontSize != null) els.fontSize.value = p.fontSize;
      if (p.marginTop != null) els.marginTop.value = p.marginTop;
      if (p.indent != null) els.indent.value = p.indent;
      if (p.textAlign != null) els.textAlign.value = p.textAlign;
      if (typeof p.customCss === "string") els.customCss.value = p.customCss;
      if (typeof p.removeBlank === "boolean") els.removeBlank.checked = p.removeBlank;
      if (typeof p.addSpace === "boolean") {
        els.addSpace.checked = p.addSpace;
        els.addSpaceCountField.hidden = !p.addSpace;
      }
      if (p.addSpaceCount != null) els.addSpaceCount.value = p.addSpaceCount;
      if (p.paper) setPaperTheme(p.paper, false);
      if (p.cover && window.easyPubCover) window.easyPubCover.applyPrefs(p.cover);
    } catch (e) {}
  }

  function resetPrefs() {
    els.lineHeight.value = "120";
    els.fontSize.value = "100";
    els.marginTop.value = "5";
    els.indent.value = "2";
    els.textAlign.value = "0";
    els.customCss.value = "";
    els.removeBlank.checked = true;
    els.addSpace.checked = false;
    els.addSpaceCount.value = "1";
    els.addSpaceCountField.hidden = true;
    setPaperTheme("warm", false);
    if (window.easyPubCover) window.easyPubCover.reset();
    try { localStorage.removeItem(PREFS_KEY); } catch (e) {}
    syncLiveReaderPreview();
  }

  function setPaperTheme(paper, persist) {
    if (paper !== "warm" && paper !== "white" && paper !== "ink") paper = "warm";
    state.paper = paper;
    if (els.readerDevice) els.readerDevice.dataset.paper = paper;
    if (els.paperSwitcher) {
      els.paperSwitcher.querySelectorAll(".paper-dot").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.paper === paper);
      });
    }
    if (persist !== false) savePrefs();
  }

  function setReaderView(view) {
    var showCover = view === "cover";
    if (els.readerPageView) els.readerPageView.hidden = showCover;
    if (els.readerCoverView) els.readerCoverView.hidden = !showCover;
    if (els.readerViewTabs) {
      els.readerViewTabs.querySelectorAll(".reader-tab").forEach(function (tab) {
        var active = tab.dataset.view === view;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
  }

  function syncLiveReaderPreview() {
    var titleVal = els.title.value.trim() || state.fileName.replace(/\.[^/.]+$/, "") || "未命名图书";
    var authorVal = els.author.value.trim() || "未知作者";
    els.simTitle.textContent = titleVal;
    els.simAuthor.textContent = authorVal;
    if (els.readerHeaderBook) els.readerHeaderBook.textContent = titleVal;
    if (window.easyPubCover) window.easyPubCover.syncMeta(titleVal, els.author.value.trim());

    var lh = numValue(els.lineHeight, 120);
    var fs = numValue(els.fontSize, 100);
    var mt = numValue(els.marginTop, 5);
    var ind = floatValue(els.indent, 0);
    var alignVal = ["justify", "left", "center", "right"][numValue(els.textAlign, 0)] || "justify";

    els.valLineHeight.textContent = lh + "%";
    els.valFontSize.textContent = fs + "%";
    els.valMarginTop.textContent = mt + "px";
    els.valIndent.textContent = ind + "rem";

    [els.simParagraph1, els.simParagraph2].forEach(function (p) {
      if (!p) return;
      p.style.lineHeight = String(lh / 100);
      p.style.fontSize = fs / 100 + "rem";
      p.style.marginTop = mt + "px";
      p.style.textIndent = ind > 0 ? ind + "rem" : "0em";
      p.style.textAlign = alignVal;
    });

    var styleTag = document.getElementById("sim-custom-css");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "sim-custom-css";
      document.head.appendChild(styleTag);
    }
    var rawCss = els.customCss ? els.customCss.value : "";
    var scopedCss = "";
    if (rawCss && rawCss.trim()) {
      scopedCss = rawCss
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .split("}")
        .map(function (rule) {
          var parts = rule.split("{");
          if (parts.length < 2) return "";
          var selectors = parts[0].trim();
          var body = parts.slice(1).join("{").trim();
          if (!selectors || !body || selectors.startsWith("@")) return "";
          var scoped = selectors
            .split(",")
            .map(function (s) { return "#readerDevice " + s.trim(); })
            .join(", ");
          return scoped + " { " + body + " }";
        })
        .join("\n");
    }
    styleTag.textContent = scopedCss;
    updateFlowBadge();
  }

  function buildFormData(coverBlob) {
    var form = new FormData();
    if (state.file) form.append("file", state.file);
    if (coverBlob) form.append("cover", coverBlob, coverBlob.name || "cover.png");
    form.append("title", els.title.value.trim());
    form.append("author", els.author.value.trim());

    var mode = els.chapterMode.value;
    var splitMode = mode === "count" ? 1 : mode === "whole" ? 2 : 0;
    var autoMark = mode === "auto";
    form.append("splitMode", String(splitMode));
    form.append("autoMark", autoMark ? "true" : "false");
    form.append("fullReg", mode === "custom" ? els.fullReg.value.trim() : "");
    form.append("splitCount", String(mode === "count" ? numValue(els.splitCount, 10000) : 0));
    form.append("removeBlank", els.removeBlank.checked ? "true" : "false");
    form.append("addSpace", els.addSpace.checked ? "true" : "false");
    form.append("addSpaceCount", String(Math.max(1, numValue(els.addSpaceCount, 1))));
    form.append("lineHeight", els.lineHeight.value);
    form.append("fontSize", els.fontSize.value);
    form.append("marginTop", els.marginTop.value);
    form.append("indent", els.indent.value);
    form.append("textAlign", els.textAlign.value);
    form.append("customCss", els.customCss ? els.customCss.value : "");
    return form;
  }

  function renderChapterList() {
    var titles = state.lastTitles || [];
    var keyword = state.chapterFilter.trim().toLowerCase();
    if (titles.length === 0) {
      els.preview.innerHTML =
        '<div class="preview-empty-msg">未识别到结构化章节，可尝试切换自定义正则或按字数切分</div>';
      return;
    }

    var filtered = [];
    for (var i = 0; i < titles.length; i++) {
      if (!keyword || titles[i].toLowerCase().indexOf(keyword) !== -1) {
        filtered.push({ idx: i + 1, title: titles[i] });
      }
    }

    var listHtml = "";
    if (filtered.length === 0) {
      listHtml = '<li class="chapter-item chapter-divider">未找到匹配章节</li>';
    } else if (!keyword && filtered.length > 120) {
      for (var a = 0; a < 100; a++) {
        listHtml += '<li class="chapter-item"><span class="chapter-num">' + filtered[a].idx +
          '</span><span>' + escapeHtml(filtered[a].title) + "</span></li>";
      }
      listHtml += '<li class="chapter-item chapter-divider">已折叠中间 ' + (filtered.length - 120) +
        " 章（可用右上搜索框检索）</li>";
      for (var b = filtered.length - 20; b < filtered.length; b++) {
        listHtml += '<li class="chapter-item"><span class="chapter-num">' + filtered[b].idx +
          '</span><span>' + escapeHtml(filtered[b].title) + "</span></li>";
      }
    } else {
      var cap = Math.min(filtered.length, 200);
      for (var k = 0; k < cap; k++) {
        listHtml += '<li class="chapter-item"><span class="chapter-num">' + filtered[k].idx +
          '</span><span>' + escapeHtml(filtered[k].title) + "</span></li>";
      }
      if (filtered.length > cap) {
        listHtml += '<li class="chapter-item chapter-divider">仅显示前 ' + cap + " 条匹配结果</li>";
      }
    }

    var existingList = els.preview.querySelector(".chapter-scroll-list");
    if (existingList) {
      existingList.innerHTML = listHtml;
      return;
    }

    els.preview.innerHTML =
      '<div class="preview-header">' +
        '<span>共 <span class="mono">' + titles.length + '</span> 章 · <span class="mono">' +
        escapeHtml(state.lastEncoding.toUpperCase()) + "</span></span>" +
        '<input type="search" class="preview-search" id="chapterSearchInput" placeholder="搜索章节…" value="' +
        escapeHtml(state.chapterFilter) + '">' +
      "</div>" +
      '<ul class="chapter-scroll-list">' + listHtml + "</ul>";

    var searchInput = $("chapterSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.chapterFilter = searchInput.value;
        renderChapterList();
      });
    }
  }

  function renderChapterPreview(data) {
    state.lastTitles = data.titles || [];
    state.lastEncoding = data.encoding || "utf-8";
    state.chapterFilter = "";
    els.chapterCount.textContent = state.lastTitles.length + " 章";
    els.summaryEncoding.textContent = state.lastEncoding.toUpperCase();

    if (data.preview && data.preview.paragraphs && data.preview.paragraphs.length > 0) {
      els.simChapterTitle.textContent = data.preview.title || state.lastTitles[0] || "正文预览";
      els.simParagraph1.textContent = data.preview.paragraphs[0];
      els.simParagraph2.textContent = data.preview.paragraphs[1] || DEFAULT_PARAGRAPHS[1];
    } else {
      els.simChapterTitle.textContent = state.lastTitles[0] || "第一章 预览章节";
      els.simParagraph1.textContent = DEFAULT_PARAGRAPHS[0];
      els.simParagraph2.textContent = DEFAULT_PARAGRAPHS[1];
    }
    renderChapterList();
  }

  function validateCustomRegex() {
    if (els.chapterMode.value !== "custom") return true;
    var val = els.fullReg.value.trim();
    if (!val) {
      els.fullReg.classList.remove("is-invalid");
      els.regexHint.classList.remove("is-error");
      els.regexHint.textContent = "留空时回退自动识别";
      return true;
    }
    try {
      new RegExp(val);
      els.fullReg.classList.remove("is-invalid");
      els.regexHint.classList.remove("is-error");
      els.regexHint.textContent = "正则有效";
      return true;
    } catch (e) {
      els.fullReg.classList.add("is-invalid");
      els.regexHint.classList.add("is-error");
      els.regexHint.textContent = "语法有误";
      return false;
    }
  }

  function detectChapters() {
    if (!state.file || state.detecting || !validateCustomRegex()) return;
    var operationId = state.operationId;
    state.detecting = true;
    els.detectBtn.disabled = true;
    els.preview.innerHTML = '<div class="preview-empty-msg">正在识别章节…</div>';
    setServiceState("busy", "识别中");

    fetch("/api/detect", { method: "POST", headers: apiHeaders(), body: buildFormData(null) })
      .then(readApiResponse)
      .then(function (r) {
        if (operationId !== state.operationId) return;
        if (r.status === 401) { redirectToAuth(); return; }
        if (!r.ok) throw new Error(r.data.error || "识别失败");
        renderChapterPreview(r.data);
        var src = r.data.local ? "本机解析完成，文件未上传" : "云端解析完成，可调整排版后生成";
        updateAction("目录已就绪", "识别到 " + (r.data.titles || []).length + " 章 · " + src, false);
        setServiceState("ready", r.data.local ? "本机优先就绪" : "云端回退模式");
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

  function scheduleDetect() {
    if (!state.file) return;
    if (state.detectDebounce) clearTimeout(state.detectDebounce);
    state.detectDebounce = setTimeout(function () {
      state.detectDebounce = null;
      detectChapters();
    }, 360);
  }

  function hideResult() {
    if (window.easyPubClearLocalOutput) window.easyPubClearLocalOutput();
    els.result.hidden = true;
    els.resultActions.innerHTML = "";
    els.progressWrap.hidden = true;
    els.progressBarFill.classList.remove("indeterminate");
    els.progressBarFill.style.width = "0%";
  }

  function setFile(file) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      showError("文件过大（" + formatSize(file.size) + "），超过前端 1 GB 保护上限");
      return;
    }
    if (!FILE_EXT_RE.test(file.name)) {
      showError("仅支持 .txt / .utf8 / .gbk 文本文件");
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
    els.summaryEncoding.textContent = "识别中";
    els.detectBtn.disabled = false;
    hideResult();
    els.chapterCount.textContent = "0 章";
    updateAction("准备开始", "已选择 " + file.name + "，正在识别章节", false);
    syncLiveReaderPreview();
    detectChapters();
  }

  function clearFile() {
    invalidateOperation();
    if (window.easyPubClearLocalCache) window.easyPubClearLocalCache();
    state.file = null;
    state.fileName = "";
    state.fileSize = 0;
    state.lastTitles = [];
    els.fileInput.value = "";
    els.dropzoneBody.hidden = false;
    els.fileCard.hidden = true;
    els.dropzone.classList.remove("has-file");
    els.detectBtn.disabled = true;
    els.convertBtn.disabled = true;
    els.summaryEncoding.textContent = "待识别";
    els.preview.innerHTML = '<div class="preview-empty-msg">选择 TXT 文件后自动提取章节目录</div>';
    els.chapterCount.textContent = "0 章";
    els.simChapterTitle.textContent = "第一章 预览章节";
    els.simParagraph1.textContent = DEFAULT_PARAGRAPHS[0];
    els.simParagraph2.textContent = DEFAULT_PARAGRAPHS[1];
    hideResult();
    updateAction("准备开始", "请选择一个 TXT 文件开始", false);
    setServiceState("ready", "本机优先就绪");
    syncLiveReaderPreview();
  }

  function showResult(data) {
    var dl = data.download || "";
    var isLocal = data.local === true && dl.indexOf("/api/local-download/") === 0;
    if (dl && dl.indexOf("/api/download/") !== 0 && !isLocal) throw new Error("下载链接非法");

    els.result.hidden = false;
    els.resultTitle.textContent = "EPUB 已生成";
    els.resultMeta.textContent =
      (data.epubName || "book.epub") + " · " + (data.chapters || 0) + " 章 · " +
      (data.encoding || "utf-8").toUpperCase();

    els.resultActions.innerHTML = "";
    var btn = document.createElement("button");
    btn.className = "download-btn-giant";
    btn.type = "button";
    btn.textContent = "下载 " + (data.epubName || "EPUB");

    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "正在准备下载…";
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
          btn.textContent = "下载 " + (data.epubName || "EPUB");
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "下载失败，点击重试";
        });
    });

    els.resultActions.appendChild(btn);
    els.progressWrap.hidden = true;
    updateAction("生成完毕", data.local ? "已使用本机完成转换，文件未上传" : "云端转换完成，可点击下载", false);
    setServiceState("ready", data.local ? "本机优先就绪" : "云端转换就绪");
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
        updateAction("转换超时", "请重试或拆分大文件", false);
        return;
      }
      fetch("/api/jobs/" + encodeURIComponent(jobId), { headers: apiHeaders() })
        .then(readApiResponse)
        .then(function (r) {
          if (operationId !== state.operationId) return;
          if (r.status === 401) { redirectToAuth(); return; }
          if (!r.ok) throw new Error(r.data.error || "任务查询失败");
          if (r.data.status === "done") { state.pollTimer = null; state.converting = false; showResult(r.data); return; }
          if (r.data.status === "error") { state.pollTimer = null; state.converting = false; throw new Error(r.data.error || "转换失败"); }
          updateAction("后台转换中", r.data.status === "running" ? "云端正在打包 EPUB…" : "任务排队中…", true);
          state.pollTimer = setTimeout(tick, 2000);
        })
        .catch(function (err) {
          if (operationId !== state.operationId) return;
          state.pollTimer = null;
          state.converting = false;
          showError(err.message);
          updateAction("转换失败", "请核对参数后重试", false);
        });
    };
    tick();
  }

  window.easyPubOnLocalProgress = function (stage, percent) {
    if (!els.progressWrap || els.progressWrap.hidden) return;
    var labels = {
      decode: "正在读取与识别编码…",
      parse: "正在切分章节…",
      render: "正在生成排版样式…",
      build: "正在组装 EPUB…",
      zip: "正在逐章压缩打包…",
      done: "打包完成",
    };
    var pct = Math.min(100, Math.max(0, Number(percent) || 0));
    els.progress.textContent = (labels[stage] || "正在转换…") + " " + pct + "%";
    var cur = parseFloat(els.progressBarFill.style.width) || 0;
    els.progressBarFill.style.width = Math.max(cur, pct) + "%";
  };

  function convertBook() {
    if (!state.file || state.converting || !validateCustomRegex()) return;
    var operationId = state.operationId;
    state.converting = true;
    els.convertBtn.disabled = true;
    hideResult();
    els.progressWrap.hidden = false;
    els.progressBarFill.classList.remove("indeterminate");
    els.progressBarFill.style.width = "4%";
    updateAction("正在生成", "准备转换数据…", true);
    setServiceState("busy", "转换中");

    var coverPromise = window.easyPubCover ? window.easyPubCover.getCoverBlob() : Promise.resolve(null);
    coverPromise
      .then(function (coverBlob) {
        if (operationId !== state.operationId) return null;
        return fetch("/api/convert", {
          method: "POST",
          headers: apiHeaders(),
          body: buildFormData(coverBlob),
        }).then(readApiResponse);
      })
      .then(function (r) {
        if (!r || operationId !== state.operationId) return;
        if (r.status === 401) { redirectToAuth(); return; }
        if (!r.ok) throw new Error(r.data.error || "转换失败");
        if (r.data.async) {
          els.progress.textContent = "文件较大，已转云端后台处理…";
          pollJob(r.data.jobId, operationId);
        } else {
          state.converting = false;
          showResult(r.data);
        }
      })
      .catch(function (err) {
        if (operationId !== state.operationId) return;
        state.converting = false;
        showError(err.message);
        updateAction("转换失败", "请核对参数后重试", false);
      });
  }

  // 事件绑定
  els.chooseBtn.addEventListener("click", function () { els.fileInput.click(); });
  els.changeFileBtn.addEventListener("click", function () { els.fileInput.click(); });
  els.fileInput.addEventListener("change", function () {
    if (els.fileInput.files && els.fileInput.files[0]) setFile(els.fileInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) { e.preventDefault(); els.dropzone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) { e.preventDefault(); els.dropzone.classList.remove("dragover"); });
  });
  els.dropzone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  els.dropzone.addEventListener("click", function (e) {
    if (e.target === els.chooseBtn || e.target === els.changeFileBtn) return;
    els.fileInput.click();
  });
  els.dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
  });

  if (els.modeSegments) {
    els.modeSegments.addEventListener("click", function (e) {
      var btn = e.target.closest(".segment-btn");
      if (!btn || !btn.dataset.value) return;
      var val = btn.dataset.value;
      els.modeSegments.querySelectorAll(".segment-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      els.chapterMode.value = val;
      els.fullRegField.hidden = val !== "custom";
      els.fullReg.disabled = val !== "custom";
      els.splitCountField.hidden = val !== "count";
      validateCustomRegex();
      if (state.file) detectChapters();
    });
  }

  els.fullReg.addEventListener("input", function () {
    if (validateCustomRegex()) scheduleDetect();
  });
  els.splitCount.addEventListener("input", scheduleDetect);
  els.removeBlank.addEventListener("change", savePrefs);
  els.addSpace.addEventListener("change", function () {
    els.addSpaceCountField.hidden = !els.addSpace.checked;
    savePrefs();
  });
  els.addSpaceCount.addEventListener("input", savePrefs);

  if (els.readerViewTabs) {
    els.readerViewTabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".reader-tab");
      if (tab && tab.dataset.view) setReaderView(tab.dataset.view);
    });
  }
  if (els.paperSwitcher) {
    els.paperSwitcher.addEventListener("click", function (e) {
      var dot = e.target.closest(".paper-dot");
      if (dot && dot.dataset.paper) setPaperTheme(dot.dataset.paper, true);
    });
  }

  els.detectBtn.addEventListener("click", detectChapters);
  els.convertBtn.addEventListener("click", convertBook);
  els.resetBtn.addEventListener("click", clearFile);
  if (els.resetPrefsBtn) els.resetPrefsBtn.addEventListener("click", resetPrefs);

  [els.title, els.author, els.lineHeight, els.fontSize, els.marginTop, els.indent, els.textAlign, els.customCss].forEach(
    function (input) {
      if (!input) return;
      input.addEventListener("input", function () {
        syncLiveReaderPreview();
        savePrefs();
      });
    }
  );

  if (window.easyPubCover) {
    window.easyPubCover.onChange(function () {
      updateFlowBadge();
      savePrefs();
      if (window.easyPubCover.getMode() !== "none") setReaderView("cover");
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.tagName === "INPUT" && e.target.type !== "search") {
      e.preventDefault();
    }
  });

  (function checkAuthOnBoot() {
    fetch("/api/auth/verify", { headers: apiHeaders() })
      .then(function (res) { if (res.status === 401) redirectToAuth(); })
      .catch(function () {});
  })();

  loadPrefs();
  syncLiveReaderPreview();
  updateAction("准备开始", "请选择一个 TXT 文件开始", false);
})();
