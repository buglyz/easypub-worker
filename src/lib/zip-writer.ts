/**
 * 极简标准 ZIP 构建器（单遍压缩 + 固定 1980-01-01 DOS 时间 + 无 Data Descriptor）：
 * - 逐条目压缩后立即释放原始未压缩字节，显著降低大 EPUB 内存峰值
 * - Local File Header 携带精确 crc32/compSize/uncompSize（bit 3 = 0），
 *   严格兼容 EPUB 2.0/3.0 OCF 对 mimetype 及老旧阅读器的要求
 */

import { deflateSync, strToU8 } from "fflate";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 固定 DOS 时间：1980-01-01 00:00:00 UTC，保证同输入字节级确定性 */
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800;

interface EntryRecord {
  nameBytes: Uint8Array;
  method: number;
  crc: number;
  compSize: number;
  uncompSize: number;
  offset: number;
}

export class StreamingZipWriter {
  private readonly chunks: Uint8Array[] = [];
  private readonly records: EntryRecord[] = [];
  private offset = 0;

  add(name: string, data: Uint8Array, compress: boolean): void {
    const nameBytes = strToU8(name);
    const crc = crc32(data);
    const uncompSize = data.byteLength;
    const method = compress ? 8 : 0;
    const payload = compress ? deflateSync(data, { level: 6 }) : data;
    const compSize = payload.byteLength;

    const lfh = new Uint8Array(30 + nameBytes.byteLength);
    const view = new DataView(lfh.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, method, true);
    view.setUint16(10, DOS_TIME, true);
    view.setUint16(12, DOS_DATE, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, compSize, true);
    view.setUint32(22, uncompSize, true);
    view.setUint16(26, nameBytes.byteLength, true);
    view.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    this.records.push({
      nameBytes,
      method,
      crc,
      compSize,
      uncompSize,
      offset: this.offset,
    });

    this.chunks.push(lfh, payload);
    this.offset += lfh.byteLength + compSize;
  }

  finish(): Uint8Array {
    const cdOffset = this.offset;
    let cdSize = 0;

    for (const rec of this.records) {
      const cd = new Uint8Array(46 + rec.nameBytes.byteLength);
      const view = new DataView(cd.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, UTF8_FLAG, true);
      view.setUint16(10, rec.method, true);
      view.setUint16(12, DOS_TIME, true);
      view.setUint16(14, DOS_DATE, true);
      view.setUint32(16, rec.crc, true);
      view.setUint32(20, rec.compSize, true);
      view.setUint32(24, rec.uncompSize, true);
      view.setUint16(28, rec.nameBytes.byteLength, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, rec.offset, true);
      cd.set(rec.nameBytes, 46);
      this.chunks.push(cd);
      cdSize += cd.byteLength;
    }

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, this.records.length, true);
    eocdView.setUint16(10, this.records.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, cdOffset, true);
    eocdView.setUint16(20, 0, true);
    this.chunks.push(eocd);

    const totalSize = cdOffset + cdSize + 22;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, pos);
      pos += chunk.byteLength;
    }
    return out;
  }
}
