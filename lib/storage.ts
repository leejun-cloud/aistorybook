// 파일 저장소 추상화 — 로컬 개발은 파일시스템, Vercel 배포는 Vercel Blob.
//
// BLOB_READ_WRITE_TOKEN이 있으면 Blob 모드로 동작한다 (Vercel이 자동 주입).
// 경로 키는 두 모드에서 동일한 리포 루트 기준 상대 경로를 쓴다:
//   projects/<id>/project.json · projects/<id>/assets/<name> ·
//   projects/<id>/output/<pdf> · references/<id>/...
//
// Blob은 access:'private' — 파일은 항상 우리 API 라우트를 통해서만 서빙된다.
// project.json처럼 자주 덮어쓰는 파일의 read-after-write를 보장하기 위해
// 읽기는 useCache:false(원본 스토리지 직행)로 한다.

import fs from 'fs';
import path from 'path';

export function isCloudStorage(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// @vercel/blob은 Blob 모드에서만 동적 로드 (로컬 개발은 토큰 없이 동작)
let blobMod: typeof import('@vercel/blob') | null = null;
async function blob(): Promise<typeof import('@vercel/blob')> {
  return (blobMod ??= await import('@vercel/blob'));
}

const localPath = (p: string) => path.join(process.cwd(), p);

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 파일을 읽는다. 없으면 null. */
export async function readStoredFile(p: string): Promise<Buffer | null> {
  if (!isCloudStorage()) {
    const file = localPath(p);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  }
  try {
    const res = await (await blob()).get(p, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return streamToBuffer(res.stream);
  } catch {
    return null;
  }
}

/** 파일을 쓴다 (덮어쓰기 허용, 필요한 디렉터리 자동 생성). */
export async function writeStoredFile(p: string, data: Buffer | string): Promise<void> {
  if (!isCloudStorage()) {
    const file = localPath(p);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    return;
  }
  await (await blob()).put(p, data, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** 존재 여부. */
export async function storedFileExists(p: string): Promise<boolean> {
  if (!isCloudStorage()) return fs.existsSync(localPath(p));
  try {
    await (await blob()).head(p);
    return true;
  } catch {
    return false;
  }
}

/** 수정 시각(ms). 없으면 null — 업스케일 변형본 최신성 비교용. */
export async function storedFileMtime(p: string): Promise<number | null> {
  if (!isCloudStorage()) {
    const file = localPath(p);
    if (!fs.existsSync(file)) return null;
    return fs.statSync(file).mtimeMs;
  }
  try {
    const meta = await (await blob()).head(p);
    return new Date(meta.uploadedAt).getTime();
  } catch {
    return null;
  }
}

/** prefix 바로 아래의 "디렉터리" 이름 목록 (projects/, references/ 열람용). */
export async function listStoredDirs(prefix: string): Promise<string[]> {
  if (!isCloudStorage()) {
    const dir = localPath(prefix);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }
  const res = await (await blob()).list({ prefix: `${prefix}/`, mode: 'folded' });
  return (res.folders ?? []).map((f) => f.replace(`${prefix}/`, '').replace(/\/$/, '')).filter(Boolean);
}

/** 파일 삭제 (없으면 무시). */
export async function deleteStoredFile(p: string): Promise<void> {
  if (!isCloudStorage()) {
    const file = localPath(p);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  try {
    await (await blob()).del(p);
  } catch {
    /* 없는 파일 무시 */
  }
}
