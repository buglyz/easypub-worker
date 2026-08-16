/* 登录页：验证 Token → 存 sessionStorage → 跳转主页 */
(function () {
  "use strict";

  var form = document.getElementById("authForm");
  var input = document.getElementById("tokenInput");
  var btn = document.getElementById("authBtn");
  var err = document.getElementById("authError");

  function showError(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var token = input.value.trim();
    if (!token) {
      showError("请输入 Token");
      return;
    }
    btn.disabled = true;
    btn.textContent = "验证中…";

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-EasyPub-Token": token },
    })
      .then(function (res) {
        if (res.status === 200) {
          try { sessionStorage.setItem("easypub_token", token); } catch (e) {}
          // 跳回主页，不带 token 参数避免泄漏到 Referer / 历史
          var next = new URLSearchParams(location.search).get("next") || "/";
          location.replace(next);
          return;
        }
        if (res.status === 401) {
          showError("Token 无效，请检查后重试");
        } else if (res.status === 404) {
          // 未启用 ACCESS_TOKEN：直接进主页
          location.replace("/");
        } else {
          showError("验证失败（HTTP " + res.status + "），请稍后重试");
        }
      })
      .catch(function () {
        showError("网络错误，请检查连接后重试");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "进入";
      });
  });

  input.focus();
})();
