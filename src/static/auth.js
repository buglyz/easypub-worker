/* 登录页：验证 Token → 存 sessionStorage → 安全同源跳转 */
(function () {
  "use strict";

  var form = document.getElementById("authForm");
  var input = document.getElementById("tokenInput");
  var btn = document.getElementById("authBtn");
  var err = document.getElementById("authError");

  /** 仅允许同源相对路径，阻断 //evil.com、https://evil.com、javascript: 等开放重定向 */
  function safeNextPath(raw) {
    if (!raw || typeof raw !== "string") return "/";
    var trimmed = raw.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
      return "/";
    }
    try {
      var parsed = new URL(trimmed, location.origin);
      if (parsed.origin !== location.origin) return "/";
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) {
      return "/";
    }
  }

  function showError(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var token = input.value.trim();
    if (!token) {
      showError("请输入访问令牌");
      return;
    }
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "验证中…";

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-EasyPub-Token": token },
    })
      .then(function (res) {
        if (res.status === 200) {
          try {
            sessionStorage.setItem("easypub_token", token);
          } catch (e) {}
          var next = safeNextPath(new URLSearchParams(location.search).get("next"));
          location.replace(next);
          return;
        }
        if (res.status === 401) {
          showError("令牌无效，请核对后重试");
        } else if (res.status === 404) {
          location.replace("/");
        } else {
          showError("验证失败（HTTP " + res.status + "），请稍后重试");
        }
      })
      .catch(function () {
        showError("网络连接异常，请稍后重试");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "进入工作台";
      });
  });

  input.focus();
})();
