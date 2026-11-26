import { generateCss, type CssOptions } from "./css";
import { buildEpub, inferTitle, type BuildProgressCallback } from "./epub-build";
import type { CoverImage } from "./cover";
import { parseTxt, type TxtOptions } from "./txt-parse";

export interface ConvertInput {
  text: string;
  fileName: string;
  title: string;
  author: string;
  encoding: string;
  txtOpt: TxtOptions;
  cssOpt: CssOptions;
  coverImage?: CoverImage;
  onProgress?: BuildProgressCallback;
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
  const epub = buildEpub(
    {
      title,
      author: input.author,
      css,
      chapters,
      coverImage: input.coverImage,
    },
    input.onProgress
  );
  return {
    epub,
    chapters: chapters.length,
    title,
    encoding: input.encoding,
  };
}
