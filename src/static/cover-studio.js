/* 电子书封面工作台：支持纯文字默认 / Canvas 自动生成文字封面 / 自定义图片上传 */
(function () {
  "use strict";

  var MAX_COVER_BYTES = 5 << 20;
  var THEMES = {
    emerald: {
      bg: "#1f4d3a",
      band: "#183d2e",
      frame: "rgba(236, 224, 198, 0.42)",
      accent: "#d6b984",
      title: "#f7f3e8",
      sub: "#c9d9d0",
      author: "#e5decb",
      stampBg: "#2c654d",
    },
    parchment: {
      bg: "#f3ede0",
      band: "#e7decb",
      frame: "rgba(44, 58, 50, 0.28)",
      accent: "#1f4d3a",
      title: "#1d2520",
      sub: "#5a665f",
      author: "#3a4740",
      stampBg: "#e3d8c2",
    },
    indigo: {
      bg: "#1e293b",
      band: "#162030",
      frame: "rgba(218, 226, 238, 0.28)",
      accent: "#cbd5e1",
      title: "#f8fafc",
      sub: "#94a3b8",
      author: "#cbd5e1",
      stampBg: "#283549",
    },
    vermilion: {
      bg: "#7f2a22",
      band: "#672019",
      frame: "rgba(248, 232, 206, 0.4)",
      accent: "#e8c488",
      title: "#fdf6ea",
      sub: "#e8c7be",
      author: "#f3e2c6",
      stampBg: "#94352c",
    },
  };

  var $ = function (id) {
    return document.getElementById(id);
  };

  var els = {
    modeSegments: $("coverModeSegments"),
    modeHint: $("coverModeHint"),
    autoPanel: $("coverAutoPanel"),
    uploadPanel: $("coverUploadPanel"),
    swatches: $("coverThemeSwatches"),
    subtitle: $("coverSubtitle"),
    downloadBtn: $("downloadCoverBtn"),
    fileInput: $("coverFileInput"),
    chooseBtn: $("chooseCoverBtn"),
    uploadInfo: $("coverUploadInfo"),
    clearBtn: $("clearCoverBtn"),
    canvas: $("coverCanvas"),
    previewImg: $("coverPreviewImg"),
    textFallback: $("coverTextFallback"),
    fallbackTitle: $("coverFallbackTitle"),
    fallbackAuthor: $("coverFallbackAuthor"),
    caption: $("coverStageCaption"),
  };

  var state = {
    mode: "none", // none | auto | upload
    theme: "emerald",
    subtitle: "",
    title: "未命名图书",
    author: "",
    uploadFile: null,
    uploadUrl: "",
    onChange: null,
  };

  function wrapLines(ctx, text, maxWidth, maxLines) {
    var chars = Array.from(String(text || "").trim());
    if (chars.length === 0) return ["未命名图书"];
    var lines = [];
    var current = "";
    for (var i = 0; i < chars.length; i++) {
      var test = current + chars[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = chars[i];
        if (lines.length >= maxLines) break;
      } else {
        current = test;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines && chars.length > lines.join("").length) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
    }
    return lines;
  }

  function renderAutoCover() {
    if (!els.canvas) return;
    var ctx = els.canvas.getContext("2d");
    if (!ctx) return;

    var W = els.canvas.width;
    var H = els.canvas.height;
    var t = THEMES[state.theme] || THEMES.emerald;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    // 左侧装订脊带
    ctx.fillStyle = t.band;
    ctx.fillRect(0, 0, 36, H);

    // 外细框与内细框
    ctx.strokeStyle = t.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(56, 44, W - 96, H - 88);
    ctx.lineWidth = 1;
    ctx.strokeRect(66, 54, W - 116, H - 108);

    // 顶部细装饰横线
    ctx.fillStyle = t.accent;
    ctx.fillRect(96, 120, 48, 3);

    // 书名：根据字数自适应字号
    var titleText = state.title || "未命名图书";
    var len = Array.from(titleText).length;
    var titleSize = len <= 6 ? 68 : len <= 12 ? 56 : 46;
    ctx.fillStyle = t.title;
    ctx.font = '600 ' + titleSize + 'px "Songti SC", "SimSun", "STSong", "Noto Serif CJK SC", Georgia, serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    var lines = wrapLines(ctx, titleText, W - 210, 4);
    var lineHeight = Math.round(titleSize * 1.32);
    var startY = 160;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 96, startY + i * lineHeight);
    }

    // 副标题
    var subText = (state.subtitle || "").trim();
    if (subText) {
      var subY = startY + lines.length * lineHeight + 28;
      ctx.fillStyle = t.sub;
      ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif';
      var subLines = wrapLines(ctx, subText, W - 210, 2);
      for (var j = 0; j < subLines.length; j++) {
        ctx.fillText(subLines[j], 96, subY + j * 34);
      }
    }

    // 底部装帧底栏：作者名 + 出版标记
    ctx.strokeStyle = t.frame;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(96, H - 178);
    ctx.lineTo(W - 88, H - 178);
    ctx.stroke();

    var authorText = (state.author || "").trim();
    if (authorText) {
      ctx.fillStyle = t.author;
      ctx.font = '400 28px "Songti SC", "SimSun", "STSong", Georgia, serif';
      ctx.fillText(authorText + "  著", 96, H - 148);
    }

    // 底部印记
    ctx.fillStyle = t.stampBg;
    ctx.fillRect(W - 188, H - 146, 100, 32);
    ctx.fillStyle = t.accent;
    ctx.font = '500 14px "SF Mono", Consolas, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("EASYPUB", W - 138, H - 130);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  function updateUI() {
    if (els.modeSegments) {
      els.modeSegments.querySelectorAll(".segment-btn").forEach(function (btn) {
        var active = btn.dataset.coverMode === state.mode;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
    if (els.autoPanel) els.autoPanel.hidden = state.mode !== "auto";
    if (els.uploadPanel) els.uploadPanel.hidden = state.mode !== "upload";

    if (els.swatches) {
      els.swatches.querySelectorAll(".swatch-btn").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.theme === state.theme);
      });
    }

    if (els.fallbackTitle) els.fallbackTitle.textContent = state.title || "未命名图书";
    if (els.fallbackAuthor) els.fallbackAuthor.textContent = state.author || "未知作者";

    if (state.mode === "auto") {
      renderAutoCover();
      if (els.canvas) els.canvas.hidden = false;
      if (els.previewImg) els.previewImg.hidden = true;
      if (els.textFallback) els.textFallback.hidden = true;
      if (els.modeHint) els.modeHint.textContent = "自动文字封面（600×900 PNG）";
      if (els.caption) els.caption.textContent = "将随书打包为 EPUB 封面图";
    } else if (state.mode === "upload" && state.uploadUrl) {
      if (els.canvas) els.canvas.hidden = true;
      if (els.previewImg) {
        els.previewImg.src = state.uploadUrl;
        els.previewImg.hidden = false;
      }
      if (els.textFallback) els.textFallback.hidden = true;
      if (els.modeHint) els.modeHint.textContent = "已选择自定义封面图";
      if (els.caption) els.caption.textContent = state.uploadFile ? state.uploadFile.name : "自定义封面图";
    } else {
      if (els.canvas) els.canvas.hidden = true;
      if (els.previewImg) els.previewImg.hidden = true;
      if (els.textFallback) els.textFallback.hidden = false;
      if (els.modeHint) {
        els.modeHint.textContent = state.mode === "upload" ? "等待选择图片" : "纯文字封面（默认）";
      }
      if (els.caption) {
        els.caption.textContent =
          state.mode === "upload" ? "请选择图片文件（JPG / PNG / WebP）" : "当前为默认纯文字封面";
      }
    }

    if (typeof state.onChange === "function") state.onChange();
  }

  function clearUpload() {
    if (state.uploadUrl) {
      URL.revokeObjectURL(state.uploadUrl);
      state.uploadUrl = "";
    }
    state.uploadFile = null;
    if (els.fileInput) els.fileInput.value = "";
    if (els.uploadInfo) els.uploadInfo.textContent = "未选择图片（建议 2:3 比例，不超过 5 MB）";
    if (els.clearBtn) els.clearBtn.hidden = true;
  }

  function setUploadFile(file) {
    if (!file) return;
    if (file.size > MAX_COVER_BYTES) {
      if (els.uploadInfo) els.uploadInfo.textContent = "图片超过 5 MB 限制，请压缩后重试";
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      if (els.uploadInfo) els.uploadInfo.textContent = "仅支持 JPG / PNG / WebP 图片";
      return;
    }
    clearUpload();
    state.uploadFile = file;
    state.uploadUrl = URL.createObjectURL(file);
    if (els.uploadInfo) {
      els.uploadInfo.textContent = file.name + "（" + (file.size / 1024).toFixed(0) + " KB）";
    }
    if (els.clearBtn) els.clearBtn.hidden = false;
    updateUI();
  }

  if (els.modeSegments) {
    els.modeSegments.addEventListener("click", function (e) {
      var btn = e.target.closest(".segment-btn");
      if (!btn || !btn.dataset.coverMode) return;
      state.mode = btn.dataset.coverMode;
      updateUI();
    });
  }

  if (els.swatches) {
    els.swatches.addEventListener("click", function (e) {
      var btn = e.target.closest(".swatch-btn");
      if (!btn || !btn.dataset.theme) return;
      state.theme = btn.dataset.theme;
      updateUI();
    });
  }

  if (els.subtitle) {
    els.subtitle.addEventListener("input", function () {
      state.subtitle = els.subtitle.value;
      if (state.mode === "auto") renderAutoCover();
      if (typeof state.onChange === "function") state.onChange();
    });
  }

  if (els.chooseBtn && els.fileInput) {
    els.chooseBtn.addEventListener("click", function () {
      els.fileInput.click();
    });
    els.fileInput.addEventListener("change", function () {
      if (els.fileInput.files && els.fileInput.files[0]) {
        setUploadFile(els.fileInput.files[0]);
      }
    });
  }

  if (els.clearBtn) {
    els.clearBtn.addEventListener("click", function () {
      clearUpload();
      updateUI();
    });
  }

  if (els.downloadBtn) {
    els.downloadBtn.addEventListener("click", function () {
      if (!els.canvas) return;
      renderAutoCover();
      els.canvas.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = (state.title || "cover") + "-cover.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
      }, "image/png");
    });
  }

  window.easyPubCover = {
    syncMeta: function (title, author) {
      state.title = title || "未命名图书";
      state.author = author || "";
      if (els.fallbackTitle) els.fallbackTitle.textContent = state.title;
      if (els.fallbackAuthor) els.fallbackAuthor.textContent = state.author || "未知作者";
      if (state.mode === "auto") renderAutoCover();
    },
    getCoverBlob: function () {
      if (state.mode === "upload") {
        return Promise.resolve(state.uploadFile || null);
      }
      if (state.mode === "auto" && els.canvas) {
        renderAutoCover();
        return new Promise(function (resolve) {
          els.canvas.toBlob(function (blob) {
            resolve(blob || null);
          }, "image/png");
        });
      }
      return Promise.resolve(null);
    },
    hasActiveCover: function () {
      return state.mode === "auto" || (state.mode === "upload" && Boolean(state.uploadFile));
    },
    getMode: function () {
      return state.mode;
    },
    getPrefs: function () {
      return { mode: state.mode === "upload" ? "none" : state.mode, theme: state.theme, subtitle: state.subtitle };
    },
    applyPrefs: function (prefs) {
      if (!prefs) return;
      if (prefs.mode === "none" || prefs.mode === "auto") state.mode = prefs.mode;
      if (prefs.theme && THEMES[prefs.theme]) state.theme = prefs.theme;
      if (typeof prefs.subtitle === "string") {
        state.subtitle = prefs.subtitle;
        if (els.subtitle) els.subtitle.value = prefs.subtitle;
      }
      updateUI();
    },
    reset: function () {
      state.mode = "none";
      state.theme = "emerald";
      state.subtitle = "";
      if (els.subtitle) els.subtitle.value = "";
      clearUpload();
      updateUI();
    },
    onChange: function (fn) {
      state.onChange = fn;
    },
  };

  updateUI();
})();
