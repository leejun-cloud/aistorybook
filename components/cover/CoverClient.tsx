'use client';

// 표지 편집 페이지 — 랩 표지(뒤+책등+앞) 실시간 미리보기 + 텍스트·위치 편집.
// 미리보기 geometry는 lib/cover/wrap.ts와 동일 (profiles/spine은 순수 모듈이라 클라이언트에서 계산).

import Link from 'next/link';
import { useState } from 'react';
import { useProject } from '../../lib/useProject';
import type { CoverTextLayout } from '../../lib/types';
import { getProfile, getInteriorPaper, type Binding } from '../../lib/cover/profiles';
import { calculateSpine } from '../../lib/cover/spine';

const PROFILE_CHOICES = [
  ['bookk-1', '부크크1 · A5 148×210'],
  ['bookk-2', '부크크2 · B5 182×257 (그림책 추천)'],
  ['bookk-3', '부크크3 · A4 210×297'],
  ['bookk-4', '부크크4 · 46판 127×188'],
  ['kyobo-1', '교보1 · A5 148×210'],
  ['kyobo-2', '교보2 · B5 182×257'],
  ['kyobo-3', '교보3 · 신국판 152×225'],
] as const;

const BINDING_CHOICES = [
  ['perfect', '무선제본 (POD 표준)'],
  ['saddle', '중철'],
  ['hardcover', '양장'],
  ['board', '보드북'],
] as const;

const PAPER_CHOICES = ['백색모조 80g', '백색모조 100g', '이라이트 80g', '스노우지 100g', '아트지 150g'];

export function CoverClient() {
  const { project, setProject, loading, saving, isPersisted, save } = useProject();
  const [profileId, setProfileId] = useState('bookk-2');
  const [binding, setBinding] = useState<Binding>('perfect');
  const [paperName, setPaperName] = useState('백색모조 100g');
  const [pageCount, setPageCount] = useState<number>(32);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <div className="p-8 text-gray-400">불러오는 중…</div>;

  const layout: CoverTextLayout = project.publish.coverLayout ?? {};
  const selected =
    project.publish.coverOptions.find((c) => c.id === project.publish.selectedCoverId && c.imageUrl) ??
    project.publish.coverOptions.find((c) => c.imageUrl);

  const profile = getProfile(profileId)!;
  const paper = getInteriorPaper(profile, paperName);
  const spine = calculateSpine({
    binding,
    paperThickness: paper?.sheetThickness ?? 0.115,
    pageCount,
    formula: profile.spineFormula,
  });

  // ---- 편집 값 (기본값은 wrap.ts와 동일) ----
  const title = layout.titleText?.trim() || project.title;
  const author = layout.authorText?.trim() || '';
  const spineLabel = layout.spineText?.trim() || title;
  const blurb = layout.backBlurb?.trim() || project.story.scenes[0]?.text || '';
  const titleYPct = layout.titleYPct ?? 7;
  const authorYPct = layout.authorYPct ?? 88;
  const titleSizePt = layout.titleSizePt ?? 26;
  const authorSizePt = layout.authorSizePt ?? 12;
  const titleColor = layout.titleColor ?? '#3a2f21';

  const patchLayout = (patch: Partial<CoverTextLayout>) => {
    setProject((prev) => ({
      ...prev,
      publish: { ...prev.publish, coverLayout: { ...(prev.publish.coverLayout ?? {}), ...patch } },
    }));
  };

  const selectCover = (id: string) => {
    setProject((prev) => ({ ...prev, publish: { ...prev.publish, selectedCoverId: id } }));
  };

  const renderPdf = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await save(); // coverLayout·선택을 먼저 저장 — 렌더 라우트가 프로젝트에서 읽는다
      const res = await fetch('/api/cover/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          coverId: selected?.id,
          profileId,
          binding,
          paperName,
          pageCount,
          author: author || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setMessage(`렌더 실패: ${data.error ?? res.status}`);
      else
        setMessage(
          `랩 표지 PDF 완료 — 전체 ${data.dims.trimWidth}×${data.dims.trimHeight}mm, 책등 ${data.spine.spineMm}mm` +
            `${data.spine.canFitSpineText ? '' : ' (5mm 미만 — 책등 텍스트 자동 생략)'}`,
        );
    } catch (e) {
      setMessage(`렌더 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // ---- 미리보기 스케일: 전체 폭(뒤+책등+앞, mm) → 화면 px ----
  const totalW = profile.trim.width * 2 + spine.spineMm;
  const previewW = 760; // px
  const s = previewW / totalW; // px per mm
  const pt = (v: number) => v * 0.3528 * s; // pt → 미리보기 px
  const H = profile.trim.height * s;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/publish?project=${encodeURIComponent(project.id)}`}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-500 hover:border-gray-300"
          >
            ← 조절·인쇄로
          </Link>
          <span className="font-bold">표지 편집 · {project.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isPersisted && <span className="text-xs text-amber-600">목업 미리보기 — 저장되지 않습니다</span>}
          <button
            onClick={save}
            disabled={saving || !isPersisted}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-60"
          >
            {saving ? '저장 중…' : '편집 저장'}
          </button>
          <button
            onClick={renderPdf}
            disabled={busy || !isPersisted || !selected}
            title={selected ? undefined : '먼저 조절·인쇄에서 표지를 생성하세요'}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? '렌더 중…' : '랩 표지 PDF 렌더'}
          </button>
        </div>
      </div>

      {message && (
        <div className="border-b border-brand-100 bg-brand-50 px-6 py-2 text-xs text-gray-700">{message}</div>
      )}

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-4 overflow-hidden p-4">
        {/* ---- 미리보기 ---- */}
        <main className="flex flex-col items-center overflow-y-auto rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-3 text-xs text-gray-500">
            랩 표지 미리보기 (재단 후) — 뒤 {profile.trim.width} + 책등 {spine.spineMm} + 앞 {profile.trim.width} ={' '}
            {totalW.toFixed(1)}mm · 높이 {profile.trim.height}mm
          </div>
          <div
            className="relative flex overflow-hidden rounded shadow-md"
            style={{ width: previewW, height: H, background: '#f4ead9' }}
          >
            {/* 뒷표지 */}
            <div className="relative" style={{ width: profile.trim.width * s, height: H, background: '#efe3cf' }}>
              <div
                className="absolute font-bold"
                style={{ top: 16 * s, right: 18 * s, fontSize: Math.max(8, pt(13)), color: '#3a2f21' }}
              >
                {title}
              </div>
              <div
                className="absolute"
                style={{
                  top: 30 * s,
                  right: 18 * s,
                  width: (profile.trim.width - 40) * s,
                  fontSize: Math.max(7, pt(10.5)),
                  lineHeight: 2,
                  color: '#4a3f2f',
                }}
              >
                {blurb}
              </div>
            </div>
            {/* 책등 */}
            <div
              className="relative flex items-center justify-center overflow-hidden"
              style={{ width: Math.max(2, spine.spineMm * s), height: H, background: '#d9c9ad' }}
            >
              {spine.canFitSpineText && (
                <div
                  className="whitespace-nowrap font-bold"
                  style={{
                    writingMode: 'vertical-rl',
                    fontSize: Math.max(7, pt(Math.min(11, Math.max(6, (spine.spineMm - 1.5) * 2.2)))),
                    color: '#3a2f21',
                  }}
                >
                  {spineLabel}
                  {author && <span className="ml-2 font-normal opacity-80">{author}</span>}
                </div>
              )}
            </div>
            {/* 앞표지 */}
            <div className="relative overflow-hidden" style={{ width: profile.trim.width * s, height: H }}>
              {selected?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.imageUrl} alt="표지" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#e8dcc8] text-xs text-gray-500">
                  표지 이미지 없음 — 조절·인쇄에서 생성
                </div>
              )}
              <div
                className="absolute left-[8%] right-[8%] text-center font-bold"
                style={{
                  top: `${titleYPct}%`,
                  fontSize: pt(titleSizePt),
                  color: titleColor,
                  textShadow: '0 0 6px rgba(255,252,244,0.9), 0 0 12px rgba(255,252,244,0.7)',
                }}
              >
                {title}
              </div>
              {author && (
                <div
                  className="absolute left-[8%] right-[8%] text-center"
                  style={{
                    top: `${authorYPct}%`,
                    fontSize: pt(authorSizePt),
                    color: '#4a3f2f',
                    textShadow: '0 0 4px rgba(255,252,244,0.9)',
                  }}
                >
                  {author} 지음
                </div>
              )}
            </div>
          </div>
          {!spine.canFitSpineText && (
            <div className="mt-2 text-xs text-amber-600">
              ⚠ 책등 {spine.spineMm}mm — 5mm 미만이라 책등 텍스트는 인쇄에서 자동 생략됩니다 (페이지 수를 늘리면 넓어져요)
            </div>
          )}

          {/* 표지 이미지 선택 */}
          <div className="mt-5 w-full max-w-xl">
            <div className="mb-2 text-xs font-semibold text-gray-500">표지 이미지 선택</div>
            <div className="grid grid-cols-3 gap-3">
              {project.publish.coverOptions.map((c) => (
                <button
                  key={c.id}
                  onClick={() => c.imageUrl && selectCover(c.id)}
                  className={[
                    'flex aspect-square items-center justify-center overflow-hidden rounded-lg border text-xs',
                    selected?.id === c.id
                      ? 'border-brand-500 ring-2 ring-brand-300'
                      : c.imageUrl
                        ? 'border-gray-200 hover:border-gray-400'
                        : 'border-dashed border-gray-300 text-gray-400',
                  ].join(' ')}
                >
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt={c.concept} className="h-full w-full object-cover" />
                  ) : (
                    <span>{c.concept === 'character' ? '캐릭터 중심' : c.concept === 'scene' ? '장면' : '상징'}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* ---- 편집 패널 ---- */}
        <aside className="space-y-4 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 text-sm">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-500">표지 텍스트</h2>
            <label className="block text-xs text-gray-500">
              제목 (비우면 책 제목)
              <input
                type="text"
                value={layout.titleText ?? ''}
                onChange={(e) => patchLayout({ titleText: e.target.value })}
                placeholder={project.title}
                className="mt-1 w-full rounded border border-gray-300 p-1.5"
              />
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              작가명
              <input
                type="text"
                value={layout.authorText ?? ''}
                onChange={(e) => patchLayout({ authorText: e.target.value })}
                placeholder="예: 홍길동"
                className="mt-1 w-full rounded border border-gray-300 p-1.5"
              />
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              책등 글 (비우면 제목)
              <input
                type="text"
                value={layout.spineText ?? ''}
                onChange={(e) => patchLayout({ spineText: e.target.value })}
                placeholder={title}
                className="mt-1 w-full rounded border border-gray-300 p-1.5"
              />
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              뒷표지 문구 (비우면 첫 장면)
              <textarea
                value={layout.backBlurb ?? ''}
                onChange={(e) => patchLayout({ backBlurb: e.target.value })}
                rows={3}
                placeholder={project.story.scenes[0]?.text ?? ''}
                className="mt-1 w-full resize-none rounded border border-gray-300 p-1.5"
              />
            </label>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-500">글자 위치 · 크기</h2>
            <label className="block text-xs text-gray-500">
              제목 세로 위치 {titleYPct}%
              <input
                type="range" min={0} max={85} step={1} value={titleYPct}
                onChange={(e) => patchLayout({ titleYPct: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block text-xs text-gray-500">
              제목 크기 {titleSizePt}pt
              <input
                type="range" min={12} max={48} step={1} value={titleSizePt}
                onChange={(e) => patchLayout({ titleSizePt: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              제목 색
              <input type="color" value={titleColor} onChange={(e) => patchLayout({ titleColor: e.target.value })} />
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              작가명 세로 위치 {authorYPct}%
              <input
                type="range" min={0} max={88} step={1} value={authorYPct}
                onChange={(e) => patchLayout({ authorYPct: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block text-xs text-gray-500">
              작가명 크기 {authorSizePt}pt
              <input
                type="range" min={8} max={20} step={1} value={authorSizePt}
                onChange={(e) => patchLayout({ authorSizePt: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-500">규격 (책등 계산)</h2>
            <label className="block text-xs text-gray-500">
              출판 프로파일
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-1.5">
                {PROFILE_CHOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              제본 방식
              <select value={binding} onChange={(e) => setBinding(e.target.value as Binding)} className="mt-1 w-full rounded border border-gray-300 p-1.5">
                {BINDING_CHOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              내지 종이
              <select value={paperName} onChange={(e) => setPaperName(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-1.5">
                {PAPER_CHOICES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-xs text-gray-500">
              총 페이지 수
              <input
                type="number" min={4} value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value))}
                className="mt-1 w-full rounded border border-gray-300 p-1.5"
              />
            </label>
            <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
              책등 {spine.spineMm}mm · 책등 텍스트 {spine.canFitSpineText ? '가능' : '생략(5mm 미만)'}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
