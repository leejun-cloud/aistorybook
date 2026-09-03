// 파일시스템 기반 프로젝트 저장소 (MVP, PRD §5).
// projects/<id>/project.json 에 프로젝트 전체를 저장한다.
// 후속: PostgreSQL로 교체 — 이 파일의 함수 시그니처만 유지하면 API 라우트는
// 그대로 둘 수 있다.

import fs from 'fs';
import path from 'path';
import { Project, ProjectSummary, currentPart, PART_ORDER, partApproved } from './types';
import { demoProject } from './demo';

const projectsRoot = () => path.join(process.cwd(), 'projects');
const projectDir = (id: string) => path.join(projectsRoot(), id);
const projectFile = (id: string) => path.join(projectDir(id), 'project.json');

export function listProjects(): ProjectSummary[] {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadProject(d.name))
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

export function loadProject(id: string): Project | null {
  const safeId = path.basename(id);
  const file = projectFile(safeId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Project;
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  const safeId = path.basename(project.id);
  fs.mkdirSync(projectDir(safeId), { recursive: true });
  const next = { ...project, updatedAt: new Date().toISOString() };
  fs.writeFileSync(projectFile(safeId), JSON.stringify(next, null, 2), 'utf-8');
}

export function createProject(title: string): Project {
  const id = `book-${Date.now().toString(36)}`;
  const project: Project = {
    ...demoProject(),
    id,
    title: title || '제목 없는 동화책',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveProject(project);
  return project;
}
