import { describe, expect, it } from "vitest";
import {
  buildSimplePattern,
  matchDefaultTitle,
  parseTxt,
  titledChapters,
  defaultTxtOptions,
  type TxtOptions,
} from "../src/lib/txt-parse";

const baseOpt = (partial: Partial<TxtOptions> = {}): TxtOptions =>
  defaultTxtOptions({
    removeBlankLine: true,
    forceEmptyChapter: true,
    ...partial,
  });

describe("parseTxt: 基础切章", () => {
  it("简单章节：序 + 第N章", () => {
    const text =
      "序\n　　书名：测试\n　　作者：测试者\n第1章 开端\n　　段落一。\n第2章 发展\n　　段落二。\n";
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    expect(chs.length).toBe(3);
    expect(chs[0].title).toBe("序");
    expect(chs[1].title).toBe("第1章 开端");
    expect(chs[2].title).toBe("第2章 发展");
    expect(chs[1].body.length).toBe(1);
    expect(chs[1].body[0]).toContain("段落一");
  });

  it("无标记：整本回退为 1 章", () => {
    const chs = parseTxt(
      "　　这是一段没有章节标记的文本。\n　　第二行。\n",
      baseOpt({ autoMark: false })
    );
    expect(chs.length).toBe(1);
    expect(chs[0].body.length).toBe(2);
  });

  it("整本一章（SplitMode=2）", () => {
    const chs = parseTxt(
      "第1章 开端\n正文一\n第2章 结尾\n正文二\n",
      baseOpt({ splitMode: 2 })
    );
    expect(chs.length).toBe(1);
    expect(chs[0].body.length).toBe(4);
  });

  it("删除空行", () => {
    const text = "第1章 测试\n　　段落一。\n\n　　段落二。\n";
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    expect(chs.length).toBe(1);
    expect(chs[0].body.length).toBe(2);
  });

  it("段间加空行（AddSpaceCount=2）", () => {
    const text = "第1章 测试\n　　段落一。\n\n　　段落二。\n";
    const chs = parseTxt(
      text,
      defaultTxtOptions({
        autoMark: true,
        removeBlankLine: false,
        addSpace: true,
        addSpaceCount: 2,
        forceEmptyChapter: true,
      })
    );
    // 2 正文段 + 每段间隔 2 空段 = 4 段
    expect(chs[0].body.length).toBe(4);
  });

  it("保留首行全角空格缩进", () => {
    const text = "第1章 测试\n　　段落一。\n";
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    expect(chs[0].body.length).toBe(1);
    expect(chs[0].body[0].startsWith("\u3000\u3000")).toBe(true);
  });

  it("HTML 特殊字符转义", () => {
    const text = "第1章 测试\n　　含<标签>的段落。\n";
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    const got = chs[0].body[0];
    expect(got).not.toContain("<标签>");
    expect(got).toContain("&lt;标签&gt;");
  });

  it("非法 SplitMode 抛错", () => {
    expect(() => parseTxt("正文\n", defaultTxtOptions({ splitMode: 3 }))).toThrow();
    expect(() => parseTxt("正文\n", defaultTxtOptions({ splitMode: -1 }))).toThrow();
  });

  it("按字数切章", () => {
    const text = "段落一二三四五\n段落六七八九十\n段落甲乙丙丁戊\n";
    const chs = parseTxt(
      text,
      defaultTxtOptions({
        splitMode: 1,
        splitCount: 10,
        removeBlankLine: true,
        forceEmptyChapter: true,
      })
    );
    expect(chs.length).toBeGreaterThanOrEqual(2);
  });

  it("ForceEmptyChapter=false 丢弃空章", () => {
    const text = "第1章 空章\n第2章 有正文\n　　段落。\n";
    const chs = parseTxt(
      text,
      defaultTxtOptions({ autoMark: true, removeBlankLine: true, forceEmptyChapter: false })
    );
    expect(chs.length).toBe(1);
    expect(chs[0].title).toBe("第2章 有正文");
  });

  it("正文句子不误切：第三回合开始", () => {
    const text = "第一段\n第三回合开始\n第二段\n";
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    expect(chs.length).toBe(1);
  });
});

describe("buildSimplePattern", () => {
  it("简易三段式：阿拉伯数字", () => {
    const p = buildSimplePattern(
      defaultTxtOptions({
        simpleRegP1: "[第卷]",
        simpleRegP2: 0,
        simpleRegP3: "[章回卷节集部]",
        simpleRegLeadingSpace: true,
      })
    );
    expect(p).not.toBeNull();
    const cases: Array<[string, boolean]> = [
      ["第1章 开端", true],
      ["第2章", true],
      ["Chapter 1", false],
      ["  第3章 缩进", true],
      ["随便一行", false],
    ];
    for (const [line, want] of cases) {
      expect(p!.test(line)).toBe(want);
    }
  });

  it("简易三段式：中文数字", () => {
    const text = "第一章 开端\n　　段一。\n";
    const chs = parseTxt(
      text,
      defaultTxtOptions({
        simpleRegP1: "[第卷]",
        simpleRegP2: 1,
        simpleRegP3: "[章回卷节集部]",
        simpleRegLeadingSpace: true,
        autoMark: false,
        removeBlankLine: true,
        forceEmptyChapter: true,
      })
    );
    expect(chs.length).toBe(1);
    expect(chs[0].title).toBe("第一章 开端");
  });
});

describe("AutoMark 默认正则", () => {
  const positives = [
    "序", "序言", "序章", "序曲", "序1", "楔子", "引子", "前言", "自序", "代序",
    "后记", "尾声", "终章", "终卷", "番外", "番外篇", "外传", "特别篇",
    "简介", "内容简介", "文案", "作者简介", "编辑推荐", "正文", "附录",
    "上部", "中部", "下部", "上篇", "下篇", "第一部", "第三部",
    "第1章", "第1章 开端", "第1章开端", "第一章", "第一百零八章 大结局",
    "第01章", "【第1章】开端", "（第一章）初见", "第1 章 标题",
    "第1话", "第12话 标题", "第1篇", "第壹章",
    "第1回", "第一回 风云起", "第3节", "第2部 远征", "第5集", "第2卷",
    "第一幕", "第3讲", "第1部分", "第2部分 开始",
    "卷1", "卷二", "卷 3 远行", "章之一", "卷之一", "节之三",
    "Chapter 1", "Chapter 12: The End", "CHAPTER I", "Ch. 3", "Ch 4 Title",
    "Part 1", "Part II", "Volume 1", "Vol. 2", "Vol 3 Prologue",
    "Prologue", "Epilogue", "Afterword", "Side Story", "Interlude",
    "☆编辑推荐", "【楔子】", "写在前面", "作者的话",
  ];
  it.each(positives)("应识别为章节: %s", (line) => {
    expect(matchDefaultTitle(line)).toBe(true);
  });

  const negatives = [
    "第三回合开始",
    "第一节课就要迟到了",
    "这部小说很好看",
    "这一集很好看",
    "他打开了第一章的内容看了很久。",
    "随便一行",
    "Chapter of my life was hard", // 无数字
    "China is large",
  ];
  it.each(negatives)("不应识别为章节: %s", (line) => {
    expect(matchDefaultTitle(line)).toBe(false);
  });

  it("混合格式章节顺序", () => {
    const text = [
      "楔子",
      "　　引子正文。",
      "第一章 启程",
      "　　段一。",
      "第2回 风云",
      "　　段二。",
      "第3话",
      "　　段三。",
      "【第4章】决战",
      "　　段四。",
      "Chapter 5: Finale",
      "　　段五。",
      "番外",
      "　　段六。",
      "Prologue",
      "　　不应单独因正文误切。",
    ].join("\n");
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    const want = ["楔子", "第一章 启程", "第2回 风云", "第3话", "【第4章】决战", "Chapter 5: Finale", "番外", "Prologue"];
    expect(chs.map((c) => c.title)).toEqual(want);
  });
});

describe("titledChapters（detect 预览）", () => {
  it("空标题章不进 titles", () => {
    const text = "　　前置声明段落。\n第1章 开端\n　　正文。\n";
    const chs = parseTxt(text, baseOpt({ autoMark: true }));
    // 前置段成章（空标题），第1章成章（有标题）
    expect(chs.length).toBe(2);
    expect(chs[0].title).toBe("");
    const titles = titledChapters(chs);
    expect(titles).toEqual(["第1章 开端"]);
  });

  it("无标题时 titles 为空数组", () => {
    const chs = parseTxt("　　只有正文。\n", baseOpt({ autoMark: true }));
    expect(titledChapters(chs)).toEqual([]);
  });
});

describe("optionsFromForm", () => {
  it("默认值与自动识别兜底", async () => {
    const { optionsFromForm } = await import("../src/lib/txt-parse");
    const opt = optionsFromForm({});
    expect(opt.splitMode).toBe(0);
    expect(opt.autoMark).toBe(true);
    expect(opt.removeBlankLine).toBe(true);
    expect(opt.addSpace).toBe(false);
    expect(opt.addSpaceCount).toBe(1);
  });

  it("自定义正则模式关闭 AutoMark，超长截断", async () => {
    const { optionsFromForm } = await import("../src/lib/txt-parse");
    const long = "第[0-9]+章".padEnd(300, "x");
    const opt = optionsFromForm({ fullReg: long, autoMark: "false" });
    expect(opt.fullReg.length).toBe(200);
    expect(opt.autoMark).toBe(false);
  });
});
