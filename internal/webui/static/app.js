(function () {
  "use strict";

  var MAX_FILE_SIZE = 64 * 1024 * 1024;
  var PREVIEW_LIMIT = 80;

  var fileInput = document.getElementById("file");
  var chooseBtn = document.getElementById("chooseBtn");
  var changeFileBtn = document.getElementById("changeFileBtn");
  var dropzone = document.getElementById("dropzone");
  var dropzoneBody = document.getElementById("dropzoneBody");
  var fileCard = document.getElementById("fileCard");
  var fileName = document.getElementById("fileName");
  var fileMeta = document.getElementById("fileMeta");
  var resetBtn = document.getElementById("resetBtn");
  var chapterMode = document.getElementById("chapterMode");
  var fullRegField = document.getElementById("fullRegField");
  var fullReg = document.getElementById("fullReg");
  var splitCountField = document.getElementById("splitCountField");
  var splitCount = document.getElementById("splitCount");
  var addSpace = document.getElementById("addSpace");
  var addSpaceCountField = document.getElementById("addSpaceCountField");
  var addSpaceCount = document.getElementById("addSpaceCount");
  var removeBlank = document.getElementById("removeBlank");
  var detectBtn = document.getElementById("detectBtn");
  var convertBtn = document.getElementById("convertBtn");
  var preview = document.getElementById("preview");
  var actionTitle = document.getElementById("actionTitle");
  var progress = document.getElementById("progress");
  var serviceState = document.getElementById("serviceState");
  var chapterCount = document.getElementById("chapterCount");
  var result = document.getElementById("result");
  var resultKicker = document.getElementById("resultKicker");
  var resultTitle = document.getElementById("resultTitle");
  var resultMeta = document.getElementById("resultMeta");
  var resultActions = document.getElementById("resultActions");
  var summaryPlaceholder = document.getElementById("summaryPlaceholder");
  var fileSummary = document.getElementById("fileSummary");

  var selectedFile = null;
  var dragDepth = 0;
  var busy = false;
  var previewStale = false;

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function setServiceState(text, tone) {
    serviceState.textContent = text;
    serviceState.setAttribute("data-tone", tone || "ready");
  }

  function setFlow(name, state, detail) {
    var item = document.querySelector('[data-flow="' + name + '"]');
    var detailNode = document.getElementById(
      "flow" + name.charAt(0).toUpperCase() + name.slice(1)
    );
    if (!item) return;
    item.classList.remove("active", "done");
    if (state) item.classList.add(state);
    if (detailNode && detail) detailNode.textContent = detail;
  }

  function showMessage(container, message, isError) {
    container.textContent = "";
    var node = document.createElement("div");
    node.className = isError ? "error-message" : "preview-message";
    node.textContent = message;
    container.appendChild(node);
  }

  function clearResult() {
    result.hidden = true;
    result.classList.remove("is-error");
    resultActions.textContent = "";
    resultKicker.textContent = "转换完成";
    resultTitle.textContent = "电子书已准备好";
    resultMeta.textContent = "-";
  }

  function clearPreview() {
    preview.textContent = "";
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = selectedFile
      ? "点击「识别章节」查看目录预览。"
      : "选择文件后点击「识别章节」，这里会显示目录预览。";
    preview.appendChild(empty);
    chapterCount.textContent = "0 章";
    document.getElementById("summaryEncoding").textContent = "待识别";
    previewStale = false;
    setFlow("chapter", selectedFile ? "active" : "", selectedFile ? "等待识别" : "尚未识别");
  }

  function markPreviewStale() {
    if (!selectedFile || busy) return;
    if (preview.querySelector(".chapter-list")) {
      previewStale = true;
      setFlow("chapter", "active", "参数已变更，建议重新识别");
      progress.textContent = "分章参数已修改，建议重新识别后再转换。";
    }
  }

  function updateSummary(file) {
    if (!file) {
      summaryPlaceholder.hidden = false;
      fileSummary.hidden = true;
      return;
    }
    summaryPlaceholder.hidden = true;
    fileSummary.hidden = false;
    document.getElementById("summaryName").textContent = file.name;
    document.getElementById("summarySize").textContent = formatSize(file.size);
  }

  function setFile(file) {
    if (!file) return;
    var lowerName = file.name.toLowerCase();
    var validExtension = [".txt", ".utf8", ".gbk", ".utf-8"].some(function (ext) {
      return lowerName.endsWith(ext);
    });
    if (!validExtension && file.type !== "text/plain") {
      setError("请选择 TXT、UTF-8 或 GBK 文本文件。");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("文件超过 64 MB 限制，请先拆分文本。");
      return;
    }

    selectedFile = file;
    dropzone.classList.add("has-file");
    dropzoneBody.hidden = true;
    fileCard.hidden = false;
    fileName.textContent = file.name;
    fileMeta.textContent = formatSize(file.size);
    detectBtn.disabled = false;
    convertBtn.disabled = false;
    actionTitle.textContent = "文件已就绪";
    progress.textContent = "可以识别章节或直接开始转换。";
    setServiceState("文件已选择", "ready");
    setFlow("source", "done", file.name);
    setFlow("chapter", "active", "等待识别");
    setFlow("layout", "", "使用默认参数");
    setFlow("convert", "", "等待转换");
    updateSummary(file);
    clearPreview();
    clearResult();
  }

  function setError(message) {
    setServiceState("需要处理", "error");
    actionTitle.textContent = "操作未完成";
    progress.textContent = message;
  }

  function setBusy(value, message) {
    busy = value;
    detectBtn.disabled = value || !selectedFile;
    convertBtn.disabled = value || !selectedFile;
    resetBtn.disabled = value;
    chooseBtn.disabled = value;
    if (changeFileBtn) changeFileBtn.disabled = value;
    chapterMode.disabled = value;
    fullReg.disabled = value || chapterMode.value !== "custom";
    splitCount.disabled = value;
    addSpace.disabled = value;
    addSpaceCount.disabled = value;
    removeBlank.disabled = value;
    if (message) progress.textContent = message;
  }

  function buildFormData() {
    var mode = chapterMode.value;
    var form = new FormData();
    form.append("file", selectedFile);
    form.append("title", document.getElementById("title").value.trim());
    form.append("author", document.getElementById("author").value.trim());

    if (mode === "whole") {
      form.append("splitMode", "2");
      form.append("autoMark", "false");
      form.append("fullReg", "");
      form.append("splitCount", "0");
    } else if (mode === "count") {
      form.append("splitMode", "1");
      form.append("autoMark", "false");
      form.append("fullReg", "");
      form.append("splitCount", String(splitCount.value || "10000"));
    } else if (mode === "custom") {
      form.append("splitMode", "0");
      form.append("autoMark", "false");
      form.append("fullReg", fullReg.value.trim());
      form.append("splitCount", "0");
    } else {
      form.append("splitMode", "0");
      form.append("autoMark", "true");
      form.append("fullReg", "");
      form.append("splitCount", "0");
    }

    form.append("removeBlank", removeBlank.checked ? "true" : "false");
    form.append("addSpace", addSpace.checked ? "true" : "false");
    form.append("addSpaceCount", addSpace.checked ? String(addSpaceCount.value || "1") : "0");
    form.append("lineHeight", document.getElementById("lineHeight").value);
    form.append("fontSize", document.getElementById("fontSize").value);
    form.append("marginTop", document.getElementById("marginTop").value);
    form.append("textAlign", document.getElementById("textAlign").value);
    form.append("indent", document.getElementById("indent").value);
    form.append("enableMobi", document.getElementById("enableMobi").checked ? "true" : "false");
    return form;
  }

  function handleResponse(response) {
    return response.text().then(function (text) {
      var data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        throw new Error("服务器返回了无法识别的响应。");
      }
      if (!response.ok) {
        throw new Error(data.error || ("请求失败（HTTP " + response.status + "）"));
      }
      return data;
    });
  }

  function renderPreview(data) {
    preview.textContent = "";
    var header = document.createElement("div");
    header.className = "preview-header";
    var title = document.createElement("strong");
    title.textContent = "章节预览";
    var meta = document.createElement("span");
    meta.textContent = (data.count || 0) + " 章 · 编码 " + (data.encoding || "-");
    header.appendChild(title);
    header.appendChild(meta);
    preview.appendChild(header);

    var list = document.createElement("ol");
    list.className = "chapter-list";
    var titles = Array.isArray(data.titles) ? data.titles : [];
    titles.slice(0, PREVIEW_LIMIT).forEach(function (chapterTitle) {
      var item = document.createElement("li");
      item.textContent = chapterTitle || "(无标题章节)";
      list.appendChild(item);
    });
    if (titles.length > PREVIEW_LIMIT) {
      var more = document.createElement("li");
      more.className = "more";
      more.textContent = "其余 " + (titles.length - PREVIEW_LIMIT) + " 章未展开";
      list.appendChild(more);
    }
    preview.appendChild(list);

    chapterCount.textContent = (data.count || 0) + " 章";
    document.getElementById("summaryEncoding").textContent = data.encoding || "-";
    previewStale = false;
    setFlow("chapter", "done", "已识别 " + (data.count || 0) + " 章");
    setFlow("layout", "active", "使用当前参数");
  }

  function createDownloadLink(label, url, secondary) {
    var link = document.createElement("a");
    link.className = secondary ? "download-link secondary" : "download-link";
    link.href = url;
    link.setAttribute("download", "");
    var text = document.createElement("span");
    text.textContent = label;
    var arrow = document.createElement("span");
    arrow.textContent = "下载";
    link.appendChild(text);
    link.appendChild(arrow);
    return link;
  }

  function renderResult(data) {
    result.hidden = false;
    result.classList.remove("is-error");
    resultKicker.textContent = "转换完成";
    resultTitle.textContent = "电子书已准备好";
    resultMeta.textContent = (data.chapters || 0) + " 章 · 编码 " + (data.encoding || "-");
    resultActions.textContent = "";
    if (data.download) {
      resultActions.appendChild(createDownloadLink("EPUB 文件", data.download, false));
    }
    if (data.mobi) {
      resultActions.appendChild(
        createDownloadLink(
          "MOBI 文件",
          "/api/download/" + encodeURIComponent(data.mobi),
          true
        )
      );
    }
    setFlow("convert", "done", "文件已生成");
    setServiceState("转换完成", "done");
  }

  function renderConvertError(message) {
    result.hidden = false;
    result.classList.add("is-error");
    resultKicker.textContent = "转换失败";
    resultTitle.textContent = "未能生成电子书";
    resultMeta.textContent = "请检查文件与分章参数后重试。";
    resultActions.textContent = "";
    var error = document.createElement("div");
    error.className = "error-message";
    error.textContent = message;
    resultActions.appendChild(error);
  }

  function detectChapters() {
    if (!selectedFile || busy) return;
    if (chapterMode.value === "custom" && !fullReg.value.trim()) {
      setError("自定义正则不能为空。");
      showMessage(preview, "请先填写章节正则。", true);
      return;
    }
    if (chapterMode.value === "count") {
      var count = parseInt(splitCount.value, 10);
      if (!count || count < 100) {
        setError("按字数分章时，每章字数至少为 100。");
        showMessage(preview, "请填写有效的每章字数。", true);
        return;
      }
    }

    setBusy(true, "正在读取文本并识别章节...");
    setServiceState("正在识别", "busy");
    setFlow("chapter", "active", "识别中");
    showMessage(preview, "正在识别章节，请稍候。", false);

    fetch("/api/detect", { method: "POST", body: buildFormData() })
      .then(handleResponse)
      .then(function (data) {
        renderPreview(data);
        actionTitle.textContent = "章节已确认";
        progress.textContent = "可以调整排版，或直接开始转换。";
        setServiceState("识别完成", "ready");
      })
      .catch(function (err) {
        setFlow("chapter", "active", "识别失败");
        showMessage(preview, err.message, true);
        setError("章节识别失败：" + err.message);
      })
      .then(function () {
        setBusy(false);
        updateChapterMode();
      });
  }

  function convertBook() {
    if (!selectedFile || busy) return;
    if (chapterMode.value === "custom" && !fullReg.value.trim()) {
      setError("自定义正则不能为空。");
      return;
    }
    if (chapterMode.value === "count") {
      var count = parseInt(splitCount.value, 10);
      if (!count || count < 100) {
        setError("按字数分章时，每章字数至少为 100。");
        return;
      }
    }

    setBusy(true, "正在生成 EPUB，请稍候...");
    setServiceState("正在转换", "busy");
    setFlow("layout", "done", "参数已提交");
    setFlow("convert", "active", "生成中");
    clearResult();

    fetch("/api/convert", { method: "POST", body: buildFormData() })
      .then(handleResponse)
      .then(function (data) {
        renderResult(data);
        actionTitle.textContent = "转换完成";
        progress.textContent = "可在右侧下载生成的文件。";
      })
      .catch(function (err) {
        setFlow("convert", "active", "生成失败");
        setServiceState("转换失败", "error");
        actionTitle.textContent = "转换未完成";
        progress.textContent = err.message;
        renderConvertError(err.message);
      })
      .then(function () {
        setBusy(false);
        updateChapterMode();
      });
  }

  function updateChapterMode() {
    var mode = chapterMode.value;
    var isCustom = mode === "custom";
    var isCount = mode === "count";
    var isWhole = mode === "whole";

    fullRegField.hidden = isCount || isWhole;
    splitCountField.hidden = !isCount;
    fullReg.disabled = busy || !isCustom;

    if (isCustom) {
      fullReg.placeholder = "例如：^\\s*第\\s*[0-9]+\\s*章";
    } else if (!isCount && !isWhole) {
      fullReg.placeholder = "切换为自定义正则后填写";
    }
  }

  function updateAddSpace() {
    addSpaceCountField.hidden = !addSpace.checked;
  }

  function resetAll() {
    if (busy) return;
    selectedFile = null;
    fileInput.value = "";
    dropzone.classList.remove("has-file", "dragover");
    dropzoneBody.hidden = false;
    fileCard.hidden = true;
    fileName.textContent = "-";
    fileMeta.textContent = "-";
    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    chapterMode.value = "auto";
    fullReg.value = "";
    splitCount.value = "10000";
    removeBlank.checked = true;
    addSpace.checked = false;
    addSpaceCount.value = "1";
    document.getElementById("lineHeight").value = "120";
    document.getElementById("fontSize").value = "100";
    document.getElementById("marginTop").value = "5";
    document.getElementById("indent").value = "0";
    document.getElementById("textAlign").value = "0";
    document.getElementById("enableMobi").checked = false;
    updateChapterMode();
    updateAddSpace();
    updateSummary(null);
    clearPreview();
    clearResult();
    detectBtn.disabled = true;
    convertBtn.disabled = true;
    actionTitle.textContent = "准备开始";
    progress.textContent = "请选择一个 TXT 文件。";
    setServiceState("服务就绪", "ready");
    setFlow("source", "active", "等待文件");
    setFlow("chapter", "", "尚未识别");
    setFlow("layout", "", "使用默认参数");
    setFlow("convert", "", "等待转换");
  }

  function openFilePicker(event) {
    if (event) event.stopPropagation();
    if (!busy) fileInput.click();
  }

  dropzone.addEventListener("click", function (event) {
    if (busy) return;
    if (event.target.closest("button")) return;
    fileInput.click();
  });
  chooseBtn.addEventListener("click", openFilePicker);
  if (changeFileBtn) changeFileBtn.addEventListener("click", openFilePicker);

  dropzone.addEventListener("keydown", function (event) {
    if ((event.key === "Enter" || event.key === " ") && !busy) {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragenter", function (event) {
    event.preventDefault();
    dragDepth += 1;
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragover", function (event) {
    event.preventDefault();
  });
  dropzone.addEventListener("dragleave", function (event) {
    event.preventDefault();
    dragDepth -= 1;
    if (dragDepth <= 0) {
      dragDepth = 0;
      dropzone.classList.remove("dragover");
    }
  });
  dropzone.addEventListener("drop", function (event) {
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove("dragover");
    if (busy) return;
    if (event.dataTransfer.files.length) setFile(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files.length) setFile(fileInput.files[0]);
  });

  chapterMode.addEventListener("change", function () {
    updateChapterMode();
    markPreviewStale();
  });
  fullReg.addEventListener("input", markPreviewStale);
  splitCount.addEventListener("input", markPreviewStale);
  removeBlank.addEventListener("change", markPreviewStale);
  addSpace.addEventListener("change", function () {
    updateAddSpace();
    markPreviewStale();
  });
  addSpaceCount.addEventListener("input", markPreviewStale);

  detectBtn.addEventListener("click", detectChapters);
  convertBtn.addEventListener("click", convertBook);
  resetBtn.addEventListener("click", resetAll);

  updateChapterMode();
  updateAddSpace();
  clearPreview();
})();
