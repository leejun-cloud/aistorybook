// 최소 ZIP 작성기 (저장 방식, 무압축).
//
// 패키지에 담는 것은 이미 압축된 PDF·JPEG이라 deflate를 걸어도 거의 줄지 않는다.
// 그래서 압축 없이 묶기만 하면 되고, 그 정도는 외부 의존성 없이 직접 쓰는 편이
// 가볍다 (lib/preflight/index.ts가 PNG/JPEG 헤더를 직접 파싱하는 것과 같은 판단).
//
// 형식: PKZIP APPNOTE 4.3 — 로컬 헤더 + 데이터 … + 중앙 디렉터리 + EOCD.
// 파일명은 UTF-8로 넣고 general purpose bit 11(0x0800)을 세운다.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export interface ZipEntry {
  /** ZIP 안에서의 경로 (예: "인쇄용/본문.pdf") */
  name: string;
  data: Buffer;
}

/** DOS 시각 형식 — 2초 단위, 1980년 기준 */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function createZip(entries: ZipEntry[], now: Date = new Date()): Buffer {
  const { time, date } = dosTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 로컬 파일 헤더 서명
    local.writeUInt16LE(20, 4); // 필요 버전 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 파일명
    local.writeUInt16LE(0, 8); // 무압축(store)
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 중앙 디렉터리 서명
    central.writeUInt16LE(20, 4); // 만든 버전
    central.writeUInt16LE(20, 6); // 필요 버전
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + size;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // 디스크 번호
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // 주석 길이

  return Buffer.concat([...locals, centralBuf, eocd]);
}
