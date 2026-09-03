'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ReferenceSummary {
  id: string;
  name: string;
  sourceProjectTitle: string;
  sceneCount: number;
  anchorImages: string[];
}

export function NewProjectButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [references, setReferences] = useState<ReferenceSummary[]>([]);

  useEffect(() => {
    fetch('/api/reference')
      .then((r) => r.json())
      .then((d) => setReferences(d.references ?? []))
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, referenceId: referenceId || undefined }),
      });
      const data = await res.json();
      if (data.project?.id) {
        router.push(`/story?project=${encodeURIComponent(data.project.id)}`);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        + 새 책 만들기
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <label className="block text-xs text-gray-500">
            책 제목 (나중에 바꿀 수 있어요)
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 없는 동화책"
              className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
              autoFocus
            />
          </label>
          <label className="mt-3 block text-xs text-gray-500">
            스타일 레퍼런스 (선택 — 저장한 책의 화풍·분위기·조판으로 시작)
            <select
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
            >
              <option value="">없음 — 처음부터</option>
              {references.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.sceneCount}장면 · {r.sourceProjectTitle})
                </option>
              ))}
            </select>
          </label>
          {referenceId && (
            <div className="mt-2 flex gap-1.5">
              {references
                .find((r) => r.id === referenceId)
                ?.anchorImages.slice(0, 3)
                .map((name) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={name}
                    src={`/api/reference/asset?id=${encodeURIComponent(referenceId)}&name=${encodeURIComponent(name)}`}
                    alt={name}
                    className="h-14 w-14 rounded border border-gray-200 object-cover"
                  />
                ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-400">
            레퍼런스로 시작하면 스타일은 그대로, 스토리와 인물만 새로 만들면 됩니다.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-3 w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {creating ? '만드는 중…' : '만들기'}
          </button>
        </div>
      )}
    </div>
  );
}
