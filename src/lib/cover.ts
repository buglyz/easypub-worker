/** 封面图片校验与格式识别（支持 JPEG / PNG / WebP） */

export type CoverMediaType = "image/jpeg" | "image/png" | "image/webp";

export interface CoverImage {
  bytes: Uint8Array;
  mediaType: CoverMediaType;
}

/** 封面图片体积上限：5 MB */
export const MAX_COVER_BYTES = 5 << 20;

/** 通过文件头魔数识别图片类型，不轻信客户端 Content-Type / 扩展名 */
export function detectCoverMediaType(bytes: Uint8Array): CoverMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function coverExtFromMediaType(mediaType: CoverMediaType): string {
  switch (mediaType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export function parseCoverBytes(bytes: Uint8Array): CoverImage {
  if (bytes.byteLength === 0) {
    throw new Error("封面图片为空");
  }
  if (bytes.byteLength > MAX_COVER_BYTES) {
    throw new Error(`封面图片超过 ${MAX_COVER_BYTES >> 20} MB 限制`);
  }
  const mediaType = detectCoverMediaType(bytes);
  if (!mediaType) {
    throw new Error("封面图片仅支持 JPG / PNG / WebP 格式");
  }
  return { bytes, mediaType };
}
