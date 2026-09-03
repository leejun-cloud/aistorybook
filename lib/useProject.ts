'use client';

// 4개 파트 페이지가 공유하는 프로젝트 로드/저장 훅.
// ?project=<id> 쿼리가 있으면 서버(파일시스템)에서 불러오고, 없으면 목업
// 프로젝트를 로컬 상태로만 보여준다 (저장 버튼을 눌러도 서버에 쓰지 않음).
//
// 이 훅이 UI와 스토리지/AI 연동 사이의 경계다. 다른 개발자가 실제 AI 호출을
// 붙일 때는 각 페이지 컴포넌트가 아니라 이 훅과 lib/ai/*, lib/store.ts만
// 건드리면 된다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Project } from './types';
import { demoProject } from './demo';

export interface UseProjectResult {
  project: Project;
  setProject: (updater: (prev: Project) => Project) => void;
  loading: boolean;
  saving: boolean;
  isPersisted: boolean; // 서버에 실제로 저장되는 프로젝트인지 (목업 미리보기 여부)
  save: () => Promise<void>;
  /** 서버가 프로젝트를 직접 변이하는 API(생성·게이트·확정 등) 호출 후 최신 상태 재로드 */
  reload: () => Promise<void>;
}

export function useProject(): UseProjectResult {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');

  const [project, setProjectState] = useState<Project>(() => demoProject());
  const [loading, setLoading] = useState<boolean>(!!projectId);
  const [saving, setSaving] = useState(false);
  // save()가 setProject 직후에도 최신 상태를 보내도록 ref에 동기 반영한다
  // (state 클로저만 쓰면 "승인 → 저장"이 승인 직전 상태를 PUT하는 버그가 있었다)
  const projectRef = useRef(project);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    const r = await fetch(`/api/project/${encodeURIComponent(projectId)}`);
    const d = await r.json();
    if (d.project) {
      projectRef.current = d.project;
      setProjectState(d.project);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      const demo = demoProject();
      projectRef.current = demo;
      setProjectState(demo);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchProject().finally(() => setLoading(false));
  }, [projectId, fetchProject]);

  const setProject = useCallback((updater: (prev: Project) => Project) => {
    setProjectState((prev) => {
      const next = updater(prev);
      projectRef.current = next;
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!projectId) return; // 목업 프리뷰는 저장하지 않음
    setSaving(true);
    try {
      await fetch(`/api/project/${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectRef.current }),
      });
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const reload = useCallback(async () => {
    await fetchProject();
  }, [fetchProject]);

  return { project, setProject, loading, saving, isPersisted: !!projectId, save, reload };
}
