(function () {
  "use strict";

  var MAX_FILE_SIZE = 64 * 1024 * 1024;
  var fileInput = document.getElementById("file");
  var chooseBtn = document.getElementById("chooseBtn");
  var dropzone = document.getElementById("dropzone");
  var fileinfo = document.getElementById("fileinfo");
  var resetBtn = document.getElementById("resetBtn");
  var chapterMode = document.getElementById("chapterMode");
  var fullRegField = document.getElementById("fullRegField");
  var fullReg = document.getElementById("fullReg");
  var detectBtn = document.getElementById("detectBtn");
  var convertBtn = document.getElementById("convertBtn");
  var preview = document.getElementById("preview");
  var actionTitle = document.getElementById("actionTitle");
  var progress = document.getElementById("progress");
  var serviceState = document.getElementById("serviceState");
  var chapterCount = document.getElementById("chapterCount");
  var result = document.getElementById("result");
  var resultTitle = document.getElementById("resultTitle");
  var resultMeta = document.getElementById("resultMeta");
  var resultActions = document.getElementById("resultActions");
  var selectedFile = null;
  var dragDepth = 0;
  var busy = false;

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function setServiceState(text) {
    serviceState.textContent = text;
  }

  function setFlow(name, state, detail) {
    var item = document.querySelector('[data-flow="' + name + '"]');
    var detailNode = document.getElementById("flow" + name.charAt(0).toUpperCase() + name.slice(1));
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
    resultActions.textContent = "";
    resultTitle.textContent = "你的电子书已准备好";
    resultMeta.textContent = "-";
  }

  function clearPreview() {
    preview.textContent = "";
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = selectedFile
      ? "点击“识别章节”查看目录预览。"
      : "选择文件后点击“识别章节”，这里会显示目录预览。";
    preview.appendChild(empty);
    chapterCount.textContent = "0 章";
    document.getElementById("summaryEncoding").textContent = "待识别";
    setFlow("chapter", "", "尚未识别");
  }

  function updateSummary(file) {
    var placeholder = document.getElementById("summaryPlaceholder");
    var summary = document.getElementById("fileSummary");
    if (!file) {
      placeholder.hidden = false;
      summary.hidden = true;
      return;
    }
    placeholder.hidden = true;
    summary.hidden = false;
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
    fileinfo.hidden = false;
    fileinfo.textContent = file.name + " · " + formatSize(file.size);
    detectBtn.disabled = false;
    convertBtn.disabled = false;
    actionTitle.textContent = "文件已就绪";
    progress.textContent = "可以识别章节或直接开始转换。";
    setServiceState("文件已选择");
    setFlow("source", "done", file.name);
    setFlow("chapter", "active", "等待识别");
    updateSummary(file);
    clearPreview();
    clearResult();
  }

  function setError(message) {
    setServiceState("需要处理");
    actionTitle.textContent = "操作未完成";
    progress.textContent = message;
  }

  function setBusy(value, message) {
    busy = value;
    detectBtn.disabled = value || !selectedFile;
    convertBtn.disabled = value || !selectedFile;
    resetBtn.disabled = value;
    if (message) progress.textContent = message;
  }

  function buildFormData() {
    var mode = chapterMode.value;
    var form = new FormData();
    form.append("file", selectedFile);
    form.append("title", document.getElementById("title").value.trim());
    form.append("author", document.getElementById("author").value.trim());
    form.append("splitMode", mode === "whole" ? "2" : "0");
    form.append("fullReg", mode === "custom" ? fullReg.value.trim() : "");
    form.append("autoMark", mode === "auto" ? "true" : "false");
    form.append("removeBlank", document.getElementById("removeBlank").checked ? "true" : "false");
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
    titles.slice(0, 80).forEach(function (chapterTitle) {
      var item = document.createElement("li");
      item.textContent = chapterTitle || "(无标题章节)";
      list.appendChild(item);
    });
    if (titles.length > 80) {
      var more = document.createElement("li");
      more.textContent = "其余 " + (titles.length - 80) + " 章未展开";
      more.style.color = "var(--muted)";
      list.appendChild(more);
    }
    preview.appendChild(list);
    chapterCount.textContent = (data.count || 0) + " 章";
    document.getElementById("summaryEncoding").textContent = data.encoding || "-";
    setFlow("chapter", "done", "已识别 " + (data.count || 0) + " 章");
    setFlow("layout", "active", "使用当前参数");
  }

  function createDownloadLink(label, url) {
    var link = document.createElement("a");
    link.className = "download-link";
    link.href = url;
    link.setAttribute("download", "");
    link.textContent = label;
    var arrow = document.createElement("span");
    arrow.textContent = "下载 →";
    link.appendChild(arrow);
    return link;
  }

  function renderResult(data) {
    result.hidden = false;
    resultTitle.textContent = "你的电子书已准备好";
    resultMeta.textContent = (data.chapters || 0) + " 章 · 编码 " + (data.encoding || "-");
    resultActions.textContent = "";
    if (data.download) {
      resultActions.appendChild(createDownloadLink("EPUB 文件", data.download));
    }
    if (data.mobi) {
      resultActions.appendChild(createDownloadLink(
        "MOBI 文件",
        "/api/download/" + encodeURIComponent(data.mobi)
      ));
    }
    setFlow("convert", "done", "文件已生成");
    setServiceState("转换完成");
  }

  function detectChapters() {
    if (!selectedFile || busy) return;
    setBusy(true, "正在读取文本并识别章节...");
    setServiceState("正在识别");
    setFlow("chapter", "active", "识别中");
    showMessage(preview, "正在识别章节，请稍候。", false);
    fetch("/api/detect", { method: "POST", body: buildFormData() })
      .then(handleResponse)
      .then(function (data) {
        renderPreview(data);
        actionTitle.textContent = "章节已确认";
        progress.textContent = "可以调整排版，或直接开始转换。";
      })
      .catch(function (err) {
        setFlow("chapter", "active", "识别失败");
        showMessage(preview, err.message, true);
        setError("章节识别失败：" + err.message);
      })
      .then(function () {
        setBusy(false);
      });
  }

  function convertBook() {
    if (!selectedFile || busy) return;
    setBusy(true, "正在生成 EPUB，请稍候...");
    setServiceState("正在转换");
    setFlow("layout", "done", "参数已提交");
    setFlow("convert", "active", "生成中");
    clearResult();
    fetch("/api/convert", { method: "POST", body: buildFormData() })
      .then(handleResponse)
      .then(function (data) {
        renderResult(data);
        actionTitle.textContent = "转换完成";
        progress.textContent = "点击右侧下载文件。";
      })
      .catch(function (err) {
        setFlow("convert", "active", "生成失败");
        setServiceState("转换失败");
        actionTitle.textContent = "转换未完成";
        progress.textContent = err.message;
        result.hidden = false;
        resultActions.textContent = "";
        var error = document.createElement("div");
        error.className = "error-message";
        error.textContent = "转换失败：" + err.message;
        resultActions.appendChild(error);
      })
      .then(function () {
        setBusy(false);
      });
  }

  function resetAll() {
    if (busy) return;
    selectedFile = null;
    fileInput.value = "";
    dropzone.classList.remove("has-file", "dragover");
    fileinfo.hidden = true;
    fileinfo.textContent = "";
    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    chapterMode.value = "auto";
    fullReg.value = "";
    document.getElementById("removeBlank").checked = true;
    document.getElementById("lineHeight").value = "120";
    document.getElementById("fontSize").value = "100";
    document.getElementById("marginTop").value = "5";
    document.getElementById("indent").value = "0";
    document.getElementById("textAlign").value = "0";
    document.getElementById("enableMobi").checked = false;
    updateChapterMode();
    updateSummary(null);
    clearPreview();
    clearResult();
    detectBtn.disabled = true;
    convertBtn.disabled = true;
    actionTitle.textContent = "准备开始";
    progress.textContent = "请选择一个 TXT 文件。";
    setServiceState("服务就绪");
    setFlow("source", "active", "等待文件");
    setFlow("chapter", "", "尚未识别");
    setFlow("layout", "", "使用默认参数");
    setFlow("convert", "", "等待转换");
  }

  function updateChapterMode() {
    var custom = chapterMode.value === "custom";
    fullRegField.hidden = chapterMode.value === "whole";
    fullReg.disabled = !custom;
    if (custom) {
      fullReg.placeholder = "例如：^\\s*第\\s*[0-9]+\\s*章";
    } else {
      fullReg.placeholder = "切换为自定义正则后填写";
    }
  }

  dropzone.addEventListener("click", function () {
    if (!busy) fileInput.click();
  });
  chooseBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    if (!busy) fileInput.click();
  });
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
    if (event.dataTransfer.files.length) setFile(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files.length) setFile(fileInput.files[0]);
  });
  chapterMode.addEventListener("change", updateChapterMode);
  detectBtn.addEventListener("click", detectChapters);
  convertBtn.addEventListener("click", convertBook);
  resetBtn.addEventListener("click", resetAll);
  updateChapterMode();
  clearPreview();
})();
