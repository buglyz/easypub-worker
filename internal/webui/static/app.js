(function () {
  "use strict";

  var fileInput = document.getElementById("file");
  var dropzone = document.getElementById("dropzone");
  var fileinfo = document.getElementById("fileinfo");
  var splitMode = document.getElementById("splitMode");
  var fullReg = document.getElementById("fullReg");
  var detectBtn = document.getElementById("detectBtn");
  var convertBtn = document.getElementById("convertBtn");
  var removeBlank = document.getElementById("removeBlank");
  var preview = document.getElementById("preview");
  var progress = document.getElementById("progress");
  var result = document.getElementById("result");

  var selectedFile = null;

  function setFile(f) {
    selectedFile = f;
    if (f) {
      dropzone.classList.add("has-file");
      fileinfo.textContent = f.name + " (" + formatSize(f.size) + ")";
      detectBtn.disabled = false;
      convertBtn.disabled = false;
    } else {
      dropzone.classList.remove("has-file");
      fileinfo.textContent = "";
      detectBtn.disabled = true;
      convertBtn.disabled = true;
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", function () {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files.length) setFile(fileInput.files[0]);
  });

  function formData() {
    var fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("splitMode", splitMode.value);
    fd.append("fullReg", fullReg.value);
    fd.append("removeBlank", removeBlank.checked ? "true" : "false");
    fd.append("autoMark", splitMode.value === "0" ? "true" : "false");
    fd.append("title", document.getElementById("title").value);
    fd.append("author", document.getElementById("author").value);
    fd.append("lineHeight", document.getElementById("lineHeight").value);
    fd.append("fontSize", document.getElementById("fontSize").value);
    fd.append("marginTop", document.getElementById("marginTop").value);
    fd.append("textAlign", document.getElementById("textAlign").value);
    fd.append("indent", "");
    return fd;
  }

  detectBtn.addEventListener("click", function () {
    if (!selectedFile) return;
    preview.classList.remove("show");
    preview.textContent = "识别中...";
    preview.classList.add("show");
    detectBtn.disabled = true;
    fetch("/api/detect", { method: "POST", body: formData() })
      .then(function (r) { return handleResp(r); })
      .then(function (data) {
        var html = '<span class="badge">共 ' + data.count + ' 章</span>（编码 ' + data.encoding + '）<br>';
        html += data.titles.slice(0, 30).map(function (t) { return "· " + t; }).join("<br>");
        if (data.titles.length > 30) html += "<br>…（仅显示前 30 章）";
        preview.innerHTML = html;
        detectBtn.disabled = false;
      })
      .catch(function (err) {
        preview.textContent = "识别失败: " + err;
        detectBtn.disabled = false;
      });
  });

  convertBtn.addEventListener("click", function () {
    if (!selectedFile) return;
    convertBtn.disabled = true;
    result.classList.remove("show");
    progress.textContent = "转换中，请稍候...";
    fetch("/api/convert", { method: "POST", body: formData() })
      .then(function (r) { return handleResp(r); })
      .then(function (data) {
        progress.textContent = "完成！";
        result.classList.add("show");
        var html = "";
        if (data.download) {
          html += '<p><a href="' + data.download + '">⬇ 下载 EPUB</a></p>';
        }
        if (data.mobi) {
          html += '<p><a href="/api/download/' + data.mobi + '">⬇ 下载 MOBI</a></p>';
        }
        html += '<div class="meta">' + data.chapters + ' 章 · 编码 ' + (data.encoding || "-") + '</div>';
        result.innerHTML = html;
        convertBtn.disabled = false;
      })
      .catch(function (err) {
        progress.textContent = "";
        result.classList.add("show");
        result.innerHTML = '<span style="color:#c0392b">转换失败: ' + err + '</span>';
        convertBtn.disabled = false;
      });
  });

  function handleResp(r) {
    return r.json().then(function (data) {
      if (!r.ok) { throw new Error(data.error || ("HTTP " + r.status)); }
      return data;
    });
  }
})();
