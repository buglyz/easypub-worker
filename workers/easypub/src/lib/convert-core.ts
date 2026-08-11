import { generateCss, type CssOptions } from "./css";
import { buildEpub, inferTitle } from "./epub-build";
import { parseTxt, type TxtOptions } from "./txt-parse";

export interface ConvertInput {
  text: string;
  fileName: string;
  title: string;
  author: string;
  encoding: string;
  txtOpt: TxtOptions;
  cssOpt: CssOptions;
}

export interface ConvertOutput {
  epub: Uint8Array;
  chapters: number;
  title: string;
  encoding: string;
}

export function runConvert(input: ConvertInput): ConvertOutput {
  const chapters = parseTxt(input.text, input.txtOpt);
  const title = input.title || inferTitle(input.text, input.fileName);
  const css = generateCss(input.cssOpt);
  const epub = buildEpub({
    title,
    author: input.author,
    css,
    chapters,
  });
  return {
    epub,
    chapters: chapters.length,
    title,
    encoding: input.encoding,
  };
}
