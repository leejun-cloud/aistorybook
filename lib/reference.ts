// 스타일 레퍼런스 — 완성한 책을 "참조자료"로 저장해, 스토리·인물만 바꿔
// 같은 스타일(그림 화풍 + 분위기 + 조판)로 새 책을 시작할 수 있게 한다.
//
// 저장 위치: references/<id>/reference.json + 앵커 이미지 (프로젝트 assets에서 복사).
// 새 프로젝트에 적용하면 앵커 이미지가 새 프로젝트의 스타일 참고 그림(style-ref-*)으로
// 복사되어, 기존 업로드-스타일 파이프라인(스타일 컨디셔닝 + 의상 누출 방지 절)을
// 그대로 재사용한다.

import fs from 'fs';
import path from 'path';
import type { Project } from './types';
import { readCharacterAsset } from './ai/character';
import { assetNameFromUrl } from './render/upscale';

export interface StyleReference {
  id: string;
  name: string;
  createdAt: string;
  sourceProjectId: string;
  sourceProjectTitle: string;
  /** 이미지 생성 프롬프트용 스타일 서술 */
  styleDescription: string;
  /** references/<id>/ 안의 앵커 이미지 파일명 (1~3장 — 표지 + 확정 페이지) */
  anchorImages: string[];
  /** 분위기·연령·분량 기본값 (새 책의 제안값) */
  desiredMood: string;
  targetAge: string;
  sceneCount: number;
  /** 조판 분위기: 그림 위 글 처리 기본값 */
  textBoxDefault: 'box' | 'none';
}

const referencesRoot = () => path.join(process.cwd(), 'references');
const referenceDir = (id: string) => path.join(referencesRoot(), path.basename(id));
const referenceFile = (id: string) => path.join(referenceDir(id), 'reference.json');

export function listReferences(): StyleReference[] {
  const root = referencesRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadReference(d.name))
    .filter((r): r is StyleReference => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function loadReference(id: string): StyleReference | null {
  const file = referenceFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as StyleReference;
  } catch {
    return null;
  }
}

export function readReferenceAsset(id: string, name: string): Buffer | null {
  const file = path.join(referenceDir(id), path.basename(name));
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

/** 프로젝트에서 앵커로 삼을 이미지 URL들: 선택된 표지 + 앞쪽 확정 페이지 2장. */
function pickAnchorUrls(project: Project): string[] {
  const urls: string[] = [];
  const cover = project.publish.coverOptions.find(
    (c) => c.id === project.publish.selectedCoverId && c.imageUrl,
  );
  if (cover?.imageUrl) urls.push(cover.imageUrl);
  const pages = [...project.layout.pages].sort((a, b) => a.sceneNumber - b.sceneNumber);
  for (const page of pages) {
    if (urls.length >= 3) break;
    const url = page.slots.find((s) => s.slotId === 'image-1')?.imageUrl;
    if (url) urls.push(url);
  }
  return urls.slice(0, 3);
}

/**
 * 완성(진행) 중인 프로젝트를 스타일 레퍼런스로 저장한다.
 * 실패 사유가 있으면 문자열 반환, 성공이면 StyleReference.
 */
export function saveReferenceFromProject(project: Project, name?: string): StyleReference | string {
  const anchors = pickAnchorUrls(project);
  if (anchors.length === 0) return '확정된 그림이 없어 레퍼런스로 저장할 수 없습니다 (파트 3에서 그림을 확정하세요)';
  if (!project.character.style.description) return '스타일 서술이 없습니다 (파트 2에서 스타일을 정하세요)';

  const id = `ref-${Date.now().toString(36)}`;
  const dir = referenceDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const anchorImages: string[] = [];
  anchors.forEach((url, i) => {
    const buf = readCharacterAsset(project.id, url);
    if (!buf) return;
    const ext = (assetNameFromUrl(url) ?? '').match(/\.(jpe?g)$/i) ? 'jpg' : 'png';
    const fileName = `anchor-${i}.${ext}`;
    fs.writeFileSync(path.join(dir, fileName), buf);
    anchorImages.push(fileName);
  });
  if (anchorImages.length === 0) return '앵커 이미지 파일을 읽을 수 없습니다';

  const reference: StyleReference = {
    id,
    name: name?.trim() || `${project.title} 스타일`,
    createdAt: new Date().toISOString(),
    sourceProjectId: project.id,
    sourceProjectTitle: project.title,
    styleDescription: project.character.style.description,
    anchorImages,
    desiredMood: project.story.desiredMood,
    targetAge: project.story.targetAge,
    sceneCount: project.story.sceneCount,
    textBoxDefault: project.layout.textBoxDefault ?? 'box',
  };
  fs.writeFileSync(referenceFile(id), JSON.stringify(reference, null, 2), 'utf-8');
  return reference;
}

/**
 * 레퍼런스를 새 프로젝트에 적용한다 (project는 mutable, 저장은 호출자 책임).
 * - 앵커 이미지를 새 프로젝트 assets의 style-ref-*로 복사 → 업로드-스타일 경로 재사용
 * - 스타일 서술·분위기·연령·분량·조판 기본값 복제
 * - 스토리·캐릭터는 비워 둔다 — 사용자가 새로 만든다 (레퍼런스의 목적)
 */
export function applyReferenceToProject(project: Project, reference: StyleReference): void {
  const assetsDir = path.join(process.cwd(), 'projects', path.basename(project.id), 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const urls: string[] = [];
  reference.anchorImages.forEach((fileName, i) => {
    const buf = readReferenceAsset(reference.id, fileName);
    if (!buf) return;
    const ext = fileName.endsWith('.jpg') ? 'jpg' : 'png';
    const target = `style-ref-${i}.${ext}`;
    fs.writeFileSync(path.join(assetsDir, target), buf);
    urls.push(
      `/api/character/asset?projectId=${encodeURIComponent(project.id)}&name=${encodeURIComponent(target)}`,
    );
  });

  project.character.style = {
    source: 'upload',
    referenceImageUrls: urls,
    description: reference.styleDescription,
    copyrightAcknowledged: true, // 자기 프로젝트에서 만든 그림
  };
  project.character.characters = []; // 인물은 새로 만든다
  project.story.desiredMood = reference.desiredMood;
  project.story.targetAge = reference.targetAge;
  project.story.sceneCount = reference.sceneCount;
  project.layout.textBoxDefault = reference.textBoxDefault;
}
