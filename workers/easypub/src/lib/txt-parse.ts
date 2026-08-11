/** 移植 internal/txt/txt.go 的章节识别逻辑 */

import { escapeText, normalizeEOL } from "./encoding";

export interface Chapter {
  title: string;
  body: string[];
}

export interface TxtOptions {
  splitMode: number;
  splitCount: number;
  fullReg: string;
  simpleRegP1: string;
  simpleRegP2: number;
  simpleRegP3: string;
  simpleRegExt: string;
  simpleRegLeadingSpace: boolean;
  additionalReg: string[];
  autoMark: boolean;
  removeBlankLine: boolean;
  addSpace: boolean;
  addSpaceCount: number;
  forceEmptyChapter: boolean;
}

export function defaultTxtOptions(partial?: Partial<TxtOptions>): TxtOptions {
  return {
    splitMode: 0,
    splitCount: 0,
    fullReg: "",
    simpleRegP1: "",
    simpleRegP2: 0,
    simpleRegP3: "",
    simpleRegExt: "",
    simpleRegLeadingSpace: false,
    additionalReg: [],
    autoMark: true,
    removeBlankLine: true,
    addSpace: false,
    addSpaceCount: 1,
    forceEmptyChapter: true,
    ...partial,
  };
}

const CN_NUM = `0-9零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟`;

/** AutoMark 默认正则（与 Go DefaultRegExps 对齐） */
export const DEFAULT_REGEXPS: string[] = [
  `^\\s*[【\\[\\(（「『]?[☆★※◆■●▲▼＊*]*\\s*(内容简介|作品简介|作品简评|作品相关|作品强推|作者简介|编辑推荐|编辑评价|文案|简介|导读|楔子|引子|引言|前言|自序|代序|序章|序言?|序曲|序[0-9${CN_NUM}]|正文|后记|尾声|终章|终卷|结局|番外篇?|外传|特别篇|加笔|感言|完结感言|作者的话|写在前面|写在后面|写在最后|附录|卷首语?|卷末|上部|中部|下部|上篇|中篇|下篇|第一部|第二部|第三部|第四部|第五部)\\s*[】\\]\\)）」』]?[☆★※◆■●▲▼＊*]*([:：、．.·—\\-~\\s　].{0,40})?$`,
  `^\\s*[【\\[\\(（「『]?第\\s*[${CN_NUM}]+\\s*[章话篇][】\\]\\)）」』]?([:：、．.·—\\-~\\s　].{0,40}|[^。！？!?；;\\n]{0,30})?$`,
  `^\\s*[【\\[\\(（「『]?第\\s*[${CN_NUM}]+\\s*[回节部集卷幕讲][】\\]\\)）」』]?([:：、．.·—\\-~\\s　].{0,40})?$`,
  `^\\s*[【\\[\\(（「『]?第\\s*[${CN_NUM}]+\\s*部分[】\\]\\)）」』]?([:：、．.·—\\-~\\s　].{0,40})?$`,
  `^\\s*[【\\[\\(（「『]?卷\\s*[${CN_NUM}]+[】\\]\\)）」』]?([:：、．.·—\\-~\\s　].{0,40})?$`,
  `^\\s*[【\\[\\(（「『]?[章节卷]\\s*之\\s*[${CN_NUM}]+[】\\]\\)）」』]?([:：、．.·—\\-~\\s　].{0,40})?$`,
  `^\\s*Chapter\\s+[0-9IVXLCDMivxlcdm]+([:：.·—\\-~\\s].{0,60})?$`,
  `^\\s*Ch\\.?\\s*[0-9IVXLCDMivxlcdm]+([:：.·—\\-~\\s].{0,60})?$`,
  `^\\s*Part\\s+[0-9IVXLCDMivxlcdm]+([:：.·—\\-~\\s].{0,60})?$`,
  `^\\s*(Volume|Vol\\.?)\\s*[0-9IVXLCDMivxlcdm]+([:：.·—\\-~\\s].{0,60})?$`,
  `^\\s*(Prologue|Epilogue|Interlude|Afterword|Preface|Foreword|Appendix|Introduction|Postscript|Extra|Side\\s*Story)([:：.·—\\-~\\s].{0,60})?$`,
];

interface Seg {
  title: string;
  start: number;
}

function compileSafe(src: string, flags = ""): RegExp | null {
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
}

function stripClass(s: string): string {
  if (s.startsWith("[")) s = s.slice(1);
  if (s.endsWith("]")) s = s.slice(0, -1);
  return s;
}

function buildSimplePattern(opt: TxtOptions): RegExp | null {
  const p1 = opt.simpleRegP1;
  if (!p1) return null;
  let digits = "0123456789";
  if (opt.simpleRegP2 === 1) digits = "一二三四五六七八九十零〇百千两";
  let p3 = opt.simpleRegP3;
  if (opt.simpleRegExt) {
    p3 = "[" + stripClass(p3) + stripClass(opt.simpleRegExt) + "]";
  }
  const lead = opt.simpleRegLeadingSpace ? "\\s*" : "";
  const expr = `${lead}^\\s*${p1}[${digits}]+${p3}.*`;
  return compileSafe(expr);
}

function buildPatterns(opt: TxtOptions): RegExp[] {
  const pats: RegExp[] = [];
  if (opt.fullReg) {
    const p = compileSafe(opt.fullReg);
    if (p) pats.push(p);
  }
  if (opt.simpleRegP1 || opt.simpleRegP3) {
    const p = buildSimplePattern(opt);
    if (p) pats.push(p);
  }
  for (const s of opt.additionalReg) {
    if (!s) continue;
    const p = compileSafe(s);
    if (p) pats.push(p);
  }
  if (opt.autoMark || pats.length === 0) {
    for (const s of DEFAULT_REGEXPS) {
      // 英文模式用 i 标志（Go 用 (?i)）
      let f = "";
      if (
        s.includes("Chapter") ||
        s.includes("Ch\\.?") ||
        s.includes("Part") ||
        s.includes("Volume") ||
        s.includes("Prologue") ||
        s.includes("Epilogue") ||
        s.includes("Interlude") ||
        s.includes("Afterword") ||
        s.includes("Preface") ||
        s.includes("Foreword") ||
        s.includes("Appendix") ||
        s.includes("Introduction") ||
        s.includes("Postscript") ||
        s.includes("Extra") ||
        s.includes("Side")
      ) {
        f = "i";
      }
      const p = compileSafe(s, f);
      if (p) pats.push(p);
    }
  }
  return pats;
}

function dedupMarks(marks: Seg[]): Seg[] {
  if (marks.length === 0) return marks;
  const out: Seg[] = [marks[0]];
  for (let i = 1; i < marks.length; i++) {
    if (marks[i].start === out[out.length - 1].start) continue;
    out.push(marks[i]);
  }
  return out;
}

function assembleBody(lines: string[], start: number, end: number, opt: TxtOptions): string[] {
  if (start < 0) start = 0;
  if (end > lines.length) end = lines.length;
  const body: string[] = [];
  if (start >= end) return body;
  for (let i = start; i < end; i++) {
    const line = lines[i].replace(/\r$/, "");
    const trimmed = line.trim();
    if (trimmed === "") {
      if (opt.removeBlankLine) continue;
      if (opt.addSpace && body.length > 0) {
        let addCount = opt.addSpaceCount;
        if (addCount <= 0) addCount = 1;
        for (let j = 0; j < addCount; j++) body.push("");
        continue;
      }
      body.push("");
      continue;
    }
    body.push(escapeText(line));
  }
  while (body.length > 0 && body[body.length - 1].trim() === "") {
    body.pop();
  }
  return body;
}

function splitByCount(lines: string[], opt: TxtOptions): Chapter[] {
  const count = opt.splitCount;
  if (count <= 0) {
    return [{ title: "", body: assembleBody(lines, 0, lines.length, opt) }];
  }
  const chapters: Chapter[] = [];
  let curStart = 0;
  let curCount = 0;
  const flush = (end: number) => {
    const body = assembleBody(lines, curStart, end, opt);
    if (body.length > 0 || opt.forceEmptyChapter) {
      chapters.push({ title: "", body });
    }
    curStart = end;
    curCount = 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const stripped = trimmed.replace(/^[\u3000 ]+/, "");
    curCount += Array.from(stripped).length;
    if (curCount >= count && i + 1 < lines.length) {
      flush(i + 1);
    }
  }
  flush(lines.length);
  if (chapters.length === 0) {
    chapters.push({ title: "", body: assembleBody(lines, 0, lines.length, opt) });
  }
  return chapters;
}

export function parseTxt(text: string, opt: TxtOptions): Chapter[] {
  if (opt.splitMode < 0 || opt.splitMode > 2) {
    throw new Error(`invalid SplitMode ${opt.splitMode} (允许 0=正则切, 1=按字数切, 2=整本一章)`);
  }
  text = normalizeEOL(text);
  const lines = text.split("\n");

  if (opt.splitMode === 2) {
    return [{ title: "", body: assembleBody(lines, 0, lines.length, opt) }];
  }
  if (opt.splitMode === 1) {
    return splitByCount(lines, opt);
  }

  const pats = buildPatterns(opt);
  const marks: Seg[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();
    for (const p of pats) {
      p.lastIndex = 0;
      if (p.test(line) || p.test(trim)) {
        marks.push({ title: trim, start: i });
        break;
      }
    }
  }

  if (marks.length === 0) {
    return [{ title: "", body: assembleBody(lines, 0, lines.length, opt) }];
  }

  const deduped = dedupMarks(marks);
  const chapters: Chapter[] = [];
  if (deduped[0].start > 0) {
    const body = assembleBody(lines, 0, deduped[0].start, opt);
    if (body.length > 0 || opt.forceEmptyChapter) {
      chapters.push({ title: "", body });
    }
  }
  for (let i = 0; i < deduped.length; i++) {
    const m = deduped[i];
    const end = i + 1 < deduped.length ? deduped[i + 1].start : lines.length;
    const body = assembleBody(lines, m.start + 1, end, opt);
    if (body.length > 0 || opt.forceEmptyChapter) {
      chapters.push({ title: m.title, body });
    }
  }
  if (chapters.length === 0) {
    return [{ title: "", body: assembleBody(lines, 0, lines.length, opt) }];
  }
  return chapters;
}

/** 供 detect API：只返回有标题章 */
export function titledChapters(chapters: Chapter[]): string[] {
  const titles: string[] = [];
  for (const c of chapters) {
    const t = c.title.trim();
    if (t) titles.push(t);
  }
  return titles;
}

/** 从 form 字段构建 options（对齐 webui buildTxtOverrides） */
export function optionsFromForm(fields: Record<string, string>): TxtOptions {
  let splitMode = parseInt(fields.splitMode || "0", 10);
  if (Number.isNaN(splitMode) || splitMode < 0 || splitMode > 2) splitMode = 0;
  let fullReg = fields.fullReg || "";
  if (fullReg.length > 200) fullReg = fullReg.slice(0, 200);
  const autoMarkRaw = fields.autoMark;
  let autoMark = autoMarkRaw === "true" || autoMarkRaw === "1";
  const opt = defaultTxtOptions({
    autoMark,
    removeBlankLine: fields.removeBlank === undefined ? true : fields.removeBlank === "true" || fields.removeBlank === "1",
    splitMode,
    splitCount: parseInt(fields.splitCount || "0", 10) || 0,
    fullReg,
    addSpace: fields.addSpace === undefined ? false : fields.addSpace === "true" || fields.addSpace === "1",
    addSpaceCount:
      fields.addSpaceCount === undefined
        ? 1
        : parseInt(fields.addSpaceCount || "0", 10) || 0,
    forceEmptyChapter: true,
  });
  if (!opt.fullReg && opt.splitMode === 0) opt.autoMark = true;
  if (opt.addSpace && opt.addSpaceCount <= 0) opt.addSpaceCount = 1;
  return opt;
}

/** 测试导出 */
export { buildSimplePattern, buildPatterns, matchDefaultTitle };

function matchDefaultTitle(line: string): boolean {
  const pats = buildPatterns(defaultTxtOptions({ autoMark: true }));
  const trim = line.trim();
  for (const p of pats) {
    p.lastIndex = 0;
    if (p.test(line) || p.test(trim)) return true;
  }
  return false;
}
