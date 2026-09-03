// 프로젝트 저장소 (MVP, PRD §5).
// projects/<id>/project.json 에 프로젝트 전체를 저장한다.
// 실제 파일 I/O는 lib/storage.ts가 담당 — 로컬은 파일시스템, Vercel 배포는 Blob.

import path from 'path';
import { Project, ProjectSummary, currentPart, PART_ORDER, partApproved } from './types';
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
  return {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    approvedParts: PART_ORDER.filter((p) => partApproved(project, p)),
    currentPart: currentPart(project),
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
  const project: Project = {
    ...demoProject(),
    id,
    title: title || '제목 없는 동화책',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveProject(project);
  return project;
}
