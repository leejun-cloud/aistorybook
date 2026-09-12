'use client';

import { useState } from 'react';

// 대시보드 프로젝트 카드의 "레퍼런스로 저장" 버튼.
// 확정 그림·스타일이 있는 프로젝트를 스타일 레퍼런스(참조자료)로 저장한다.
export function SaveReferenceButton({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault(); // 카드 링크 이동 방지
    e.stopPropagation();
    const name = window.prompt('레퍼런스 이름', `${projectTitle} 스타일`);
    if (name === null) return;
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? String(res.status));
        setState('idle');
        return;
      }
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  };

  return (
    <span className="flex flex-col items-end">
      <button
        onClick={handleSave}
        disabled={state !== 'idle'}
        title="이 책의 화풍·분위기·조판을 참조자료로 저장 — 새 책에서 스토리·인물만 바꿔 재사용"
        className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:border-sunset-400 hover:text-sunset-600 disabled:opacity-60"
      >
        {state === 'done' ? '레퍼런스 저장됨 ✓' : state === 'saving' ? '저장 중…' : '레퍼런스로 저장'}
      </button>
      {error && <span className="mt-1 text-[10px] text-red-500">{error}</span>}
    </span>
  );
}
