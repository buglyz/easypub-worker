import { describe, expect, it } from "vitest";
import { toPublicError } from "../src/lib/form";
import worker from "../src/index";

describe("公开错误信息", () => {
  it("非法正则返回可定位的 400 错误", () => {
    const result = toPublicError(
      new Error("完整正则正则编译失败：Invalid regular expression: /[/: Unterminated character class"),
      "convert"
    );

    expect(result.status).toBe(400);
    expect(result.code).toBe("INVALID_INPUT");
    expect(result.message).toContain("完整正则正则编译失败");
    expect(result.message).toContain("Unterminated character class");
  });

  it("R2 权限错误提示绑定和权限方向", () => {
    const result = toPublicError(new Error("AccessDenied: permission denied"), "storage");

    expect(result.status).toBe(503);
    expect(result.code).toBe("STORAGE_ERROR");
    expect(result.message).toContain("BUCKET");
  });

  it("内部路径不会出现在公开错误中", () => {
    const result = toPublicError(new Error("failed at C:\\secret\\worker.js:12"), "convert");

    expect(result.message).not.toContain("C:\\secret");
    expect(result.message).toContain("转换失败");
  });

  it("转换接口返回具体的用户输入错误", async () => {
    const form = new FormData();
    form.append("file", new File(["第1章\n正文"], "test.txt", { type: "text/plain" }));
    form.append("autoMark", "false");
    form.append("fullReg", "[");
    const request = new Request("https://easypub.test/api/convert", {
      method: "POST",
      body: form,
    });

    const response = await worker.fetch(
      request,
      { ACCESS_TOKEN: "", MAX_UPLOAD_BYTES: "33554432" } as never,
      {} as ExecutionContext
    );
    const body = (await response.json()) as { code: string; error: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("完整正则正则编译失败");
  });
});
