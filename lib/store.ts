// 프로젝트 저장소 (MVP, PRD §5).
// projects/<id>/project.json 에 프로젝트 전체를 저장한다.
// 실제 파일 I/O는 lib/storage.ts가 담당 — 로컬은 파일시스템, Vercel 배포는 Blob.

import path from 'path';
import { Project, ProjectSummary, currentPart, PART_ORDER, partApproved, projectStatus } from './types';
import { demoProject } from './demo';
import { listStoredDirs, readStoredFile, writeStoredFile } from './storage';

const projectFile = (id: string) => `projects/${path.basename(id)}/project.json`;

export async function listProjects(): Promise<ProjectSummary[]> {
  const ids = await listStoredDirs('projects');
  const projects = await Promise.all(ids.map((id) => loadProject(id)));
  return projects
    .filter((p): p is Project => p !== null)
    .map(toSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function toSummary(project: Project): ProjectSummary {
  const selected = project.publish.coverOptions.find((c) => c.id === project.publish.selectedCoverId);
  return {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    approvedParts: PART_ORDER.filter((p) => partApproved(project, p)),
    currentPart: currentPart(project),
    status: projectStatus(project),
    sceneCount: project.story.scenes.length,
    coverUrl: selected?.imageUrl,
    auditScore: project.publish.preflight?.score,
    unlockedAt: project.publish.unlockedAt,
  };
}

export async function loadProject(id: string): Promise<Project | null> {
  const buf = await readStoredFile(projectFile(id));
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf-8')) as Project;
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  const next = { ...project, updatedAt: new Date().toISOString() };
  await writeStoredFile(projectFile(project.id), JSON.stringify(next, null, 2));
}

export async function createProject(title: string): Promise<Project> {
  const id = `book-${Date.now().toString(36)}`;
  const demo = demoProject();
  const project: Project = {
    ...demo,
    id,
    title: title || '제목 없는 동화책',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // 목업 캐릭터(토토)는 ?project= 없는 미리보기 전용 — 실제 프로젝트는 빈 목록에서
    // 시작한다 (스토리 생성 cast 자동 시드 / 브레인스토밍 시드 / 수동 추가로 채움)
    character: { ...demo.character, characters: [] },
  };
  await saveProject(project);
  return project;
}
