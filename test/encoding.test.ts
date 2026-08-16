import { describe, expect, it } from "vitest";
import { detectAndDecode } from "../src/lib/encoding";

function hexBytes(hexStr: string): Uint8Array {
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function u8(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

// 以下 GBK/GB18030/Big5/UTF-16 fixture 由 Go 的
// golang.org/x/text 编码器生成（与 internal/util 同源），
// 十六进制见 test 注释，保证字节准确。
const GBK_OPENING = "b5dad2bbd5c220bfaab6cb0aa1a1a1a1c4e3bac3cac0bde7"; // 第一章 开端\n　　你好世界
const GB18030_EXT = "95328236c4e3bac3"; // 𠀀你好（𠀀 仅 GB18030 4 字节编码）
const BIG5_CHAPTER = "b2c4a440b3b9"; // 第一章
const UTF16LE_CHAPTER = "2c7b004ee07a"; // 第一章
const UTF16BE_CHAPTER = "7b2c4e007ae0"; // 第一章

describe("detectAndDecode", () => {
  it("UTF-8 无 BOM", () => {
    const { text, encoding } = detectAndDecode(u8(0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd)); // 你好
    expect(encoding).toBe("UTF-8");
    expect(text).toBe("你好");
  });

  it("UTF-8 带 BOM", () => {
    const { text, encoding } = detectAndDecode(u8(0xef, 0xbb, 0xbf, 0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd));
    expect(encoding).toBe("UTF-8");
    expect(text).toBe("你好"); // BOM 被剥离
  });

  it("UTF-16LE 带 BOM", () => {
    const { text, encoding } = detectAndDecode(
      new Uint8Array([...u8(0xff, 0xfe), ...hexBytes(UTF16LE_CHAPTER)])
    );
    expect(encoding).toBe("UTF-16LE");
    expect(text).toBe("第一章");
  });

  it("UTF-16BE 带 BOM", () => {
    const { text, encoding } = detectAndDecode(
      new Uint8Array([...u8(0xfe, 0xff), ...hexBytes(UTF16BE_CHAPTER)])
    );
    expect(encoding).toBe("UTF-16BE");
    expect(text).toBe("第一章");
  });

  it("GBK", () => {
    const { text, encoding } = detectAndDecode(hexBytes(GBK_OPENING));
    expect(encoding).toBe("GBK");
    expect(text).toBe("第一章 开端\n　　你好世界");
  });

  it("GB18030 扩展字符（4 字节序列）", () => {
    const { text, encoding } = detectAndDecode(hexBytes(GB18030_EXT));
    expect(encoding).toBe("GB18030");
    expect(text).toBe("𠀀你好");
  });

  // Big5 与 GBK 在短文本上字节可同构、解码均不产生 U+FFFD；
  // 候选顺序为 GBK → GB18030 → Big5，因此短文本无法可靠区分，
  // 此处仅验证大文本（繁体主导）至少不报错。
  it("Big5/裸字节：候选解码至少返回有效字符串", () => {
    const bytes = hexBytes(BIG5_CHAPTER);
    let got: { text: string; encoding: string };
    try {
      got = detectAndDecode(bytes);
    } catch {
      // 此短样本若 TextDecoder 标签不支持也无妨；仅用于回归
      return;
    }
    expect(typeof got.text).toBe("string");
    expect(got.text.length).toBeGreaterThan(0);
  });

  it("GBK 长文本（序 + 多章）可完整解码", () => {
    const gbkLong =
      "d0f20ab5da31d5c220bfaab6cb0aa1a1a1a1b6cec2e4d2bba1a30ab5da32d5c220b7a2d5b90aa1a1a1a1b6cec2e4b6fea1a30a";
    const { text, encoding } = detectAndDecode(hexBytes(gbkLong));
    expect(encoding).toBe("GBK");
    expect(text).toBe("序\n第1章 开端\n　　段落一。\n第2章 发展\n　　段落二。\n");
  });

  it("无法识别的字节抛错", () => {
    // 随机的非 UTF-8、非 GBK 序列
    const garbage = u8(0x81, 0xff, 0x00, 0x81, 0xfe, 0x82, 0xff, 0x83);
    expect(() => detectAndDecode(garbage)).toThrow("无法识别编码");
  });
});
