import { describe, expect, it } from "vitest";
import {
  contentDispositionAttachment,
  displayNameFromUpload,
  isValidJobId,
  newJobId,
  sanitizeDownloadName,
  sanitizeFileStem,
} from "../src/lib/names";

describe("displayNameFromUpload（下载展示名保留上传主名）", () => {
  it("我的小说.txt → 我的小说.epub", () => {
    expect(displayNameFromUpload("我的小说.txt")).toBe("我的小说.epub");
  });

  it("剥离路径成分（防穿越）", () => {
    expect(displayNameFromUpload("..\\..\\evil\\我的小说.txt")).toBe("我的小说.epub");
    expect(displayNameFromUpload("C:/tmp/我的小说.txt")).toBe("我的小说.epub");
  });

  it("非法字符替换为下划线", () => {
    expect(displayNameFromUpload('a<b>c:d"e|f?g*h.txt')).toBe("a_b_c_d_e_f_g_h.epub");
  });

  it("无扩展名 / 全点 / 空名回退", () => {
    expect(displayNameFromUpload("noext")).toBe("noext.epub");
    expect(displayNameFromUpload(".txt")).toBe("book.epub");
    expect(displayNameFromUpload("   ")).toBe("book.epub");
  });

  it("扩展名大小写不影响结果", () => {
    expect(displayNameFromUpload("我的小说.TXT")).toBe("我的小说.epub");
  });

  it("超长主名截断到 120 字符", () => {
    const long = "长".repeat(200) + ".txt";
    const out = displayNameFromUpload(long);
    expect(out.endsWith(".epub")).toBe(true);
    expect(Array.from(out).length).toBeLessThanOrEqual(125); // 120 stem + 5 ext
  });
});

describe("sanitizeDownloadName（客户端展示名净化）", () => {
  it("合法名保留主名 + 强制 .epub", () => {
    expect(sanitizeDownloadName("我的小说.txt", ".epub")).toBe("我的小说.epub");
  });

  it("拒绝非 .epub 扩展名要求", () => {
    expect(sanitizeDownloadName("我的小说.txt", ".mobi")).toBe("");
  });

  it("空名/非法路径返回空", () => {
    expect(sanitizeDownloadName("", ".epub")).toBe("");
    expect(sanitizeDownloadName("..\\..", ".epub")).toBe("");
    expect(sanitizeDownloadName(".", ".epub")).toBe("");
  });

  it("非法字符替换", () => {
    expect(sanitizeDownloadName("a<b>.txt", ".epub")).toBe("a_b_.epub");
  });
});

describe("sanitizeFileStem", () => {
  it("首尾空白与点裁剪", () => {
    expect(sanitizeFileStem("  a..  ")).toBe("a");
    expect(sanitizeFileStem(".")).toBe("");
    expect(sanitizeFileStem("..")).toBe("");
  });
  it("控制字符剔除", () => {
    expect(sanitizeFileStem("a\u0000b\u007fc")).toBe("abc");
  });
});

describe("contentDispositionAttachment（RFC 5987 filename*）", () => {
  it("中文名同时给出 ASCII 回退与 UTF-8 编码", () => {
    const cd = contentDispositionAttachment("我的小说.epub");
    expect(cd).toContain('filename="');
    expect(cd).toContain("filename*=UTF-8''");
    expect(cd).toContain("%E6%88%91"); // 我
    // ASCII 回退里非 ASCII 变 _
    expect(cd).toMatch(/filename="[^"]*_[^"]*"/);
  });
  it("空/点回退为 download", () => {
    expect(contentDispositionAttachment("..")).toContain('filename="download"');
  });
  it("空格编码为 %20", () => {
    expect(contentDispositionAttachment("my book.epub")).toContain("my%20book.epub");
  });
});

describe("jobId 白名单", () => {
  it("YYYYMMDD-HHMMSS-8hex 通过（向后兼容旧 ID）", () => {
    expect(isValidJobId("20250101-120000-abcdef12")).toBe(true);
  });
  it("YYYYMMDD-HHMMSS-32hex 通过（新格式，128 bit 熵）", () => {
    expect(isValidJobId("20250101-120000-abcdef0123456789abcdef0123456789")).toBe(true);
  });
  it("32 位 hex 通过", () => {
    expect(isValidJobId("0123456789abcdef0123456789abcdef")).toBe(true);
  });
  it("拒绝穿越/非法格式", () => {
    expect(isValidJobId("../etc/passwd")).toBe(false);
    expect(isValidJobId("20250101-120000-abcdef123")).toBe(false); // 9 hex
    expect(isValidJobId("20250101-120000-abcdef1z")).toBe(false);
    expect(isValidJobId("")).toBe(false);
    expect(isValidJobId("a/b")).toBe(false);
  });
  it("newJobId 生成符合白名单且唯一，使用 128 bit 熵", () => {
    const a = newJobId();
    const b = newJobId();
    expect(isValidJobId(a)).toBe(true);
    expect(isValidJobId(b)).toBe(true);
    expect(a).not.toBe(b);
    // 新 ID 格式：8 位日期-6 位时间-32 位 hex
    expect(a).toMatch(/^[0-9]{8}-[0-9]{6}-[0-9a-f]{32}$/);
  });
});
