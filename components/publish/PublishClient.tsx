'use client';

import { useState } from 'react';
import { useProject } from '../../lib/useProject';
import { StepBar } from '../StepBar';

// 프로파일·종이 목록은 서버(lib/cover/profiles.ts)가 정본 — UI는 id·표시명만 하드코딩
// (클라이언트 번들에 fs 의존 모듈을 넣지 않기 위한 최소 사본).
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
  ['saddle', '중철 (16~32p, 책등 없음)'],
  ['hardcover', '양장 (하드커버)'],
  ['board', '보드북'],
] as const;

const PAPER_CHOICES = ['백색모조 80g', '백색모조 100g', '이라이트 80g', '스노우지 100g', '아트지 150g'];

export function PublishClient() {
  const { project, setProject, loading, saving, isPersisted, save } = useProject();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profileId, setProfileId] = useState('bookk-2');
  const [binding, setBinding] = useState('perfect');
  const [paperName, setPaperName] = useState('백색모조 100g');
  const [pageCount, setPageCount] = useState<number>(32);
  const [flaps, setFlaps] = useState(false);
  const [author, setAuthor] = useState('');
  // 규격 기본값(부크크2·무선제본·백색모조100g·32p)이 "그림책 표준" — 대부분은 안 건드리고
  // 바로 다음으로 넘어가도록 세부 설정을 접어둔다.
  const [showAdvancedSpec, setShowAdvancedSpec] = useState(false);
  const [spineInfo, setSpineInfo] = useState<{ spineMm: number; canFitSpineText: boolean; warnings: string[] } | null>(null);

  if (loading) return <div className="p-8 text-gray-400">불러오는 중…</div>;

  const call = async (label: string, url: string, body: object) => {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`${label} 실패: ${data.error ?? res.status}`);
        return null;
      }
      return data;
    } catch (e) {
      setMessage(`${label} 실패: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const generateCovers = async () => {
    const data = await call('표지 생성', '/api/cover/generate', {});
    if (data?.options) {
      setProject((prev) => ({
        ...prev,
        publish: {
          ...prev.publish,
          coverOptions: prev.publish.coverOptions.map((o) => {
            const updated = data.options.find((n: { concept: string }) => n.concept === o.concept);
            return updated ? { ...o, ...updated } : o;
          }),
        },
      }));
      setMessage(`표지 ${data.options.length}방향 생성 완료`);
    }
  };

  const renderCover = async () => {
    const data = await call('랩 표지 렌더', '/api/cover/render', {
      coverId: project.publish.selectedCoverId,
      profileId, binding, paperName, pageCount, flaps,
      author: author || undefined,
    });
    if (data?.spine) {
      setSpineInfo(data.spine);
      setProject((prev) => ({
        ...prev,
        publish: {
          ...prev.publish,
          outputs: { ...prev.publish.outputs, printCoverPdfUrl: data.printCoverPdfUrl },
        },
      }));
      setMessage(
        `랩 표지 완료 — 전체 ${data.dims.trimWidth}×${data.dims.trimHeight}mm (책등 ${data.spine.spineMm}mm${data.spine.canFitSpineText ? ', 책등 텍스트 포함' : ', 책등 텍스트 생략'})`,
      );
    }
  };

  const runPreflight = async () => {
    const data = await call('사전검사', '/api/preflight', { profileId });
    if (data?.preflight) {
      setProject((prev) => ({ ...prev, publish: { ...prev.publish, preflight: data.preflight } }));
    }
  };

  const renderBodyPdf = async () => {
    const data = await call('본문 PDF 렌더', '/api/render/pdf', {});
    if (data?.viewingPdfUrl) {
      setProject((prev) => ({
        ...prev,
        publish: {
          ...prev.publish,
          outputs: {
            ...prev.publish.outputs,
            viewingPdfUrl: data.viewingPdfUrl,
            printBodyPdfUrl: data.printBodyPdfUrl,
          },
        },
      }));
      setMessage('본문 PDF 2종(열람·인쇄) 렌더 완료');
    }
  };

  const selectCover = (id: string) => {
    setProject((prev) => ({ ...prev, publish: { ...prev.publish, selectedCoverId: id } }));
  };

  const approve = async () => {
    setProject((prev) => ({ ...prev, publish: { ...prev.publish, approved: true } }));
    await save();
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <StepBar project={project} active="publish" />
        <div className="flex items-center gap-2">
          {!isPersisted && (
            <span className="text-xs text-amber-600">목업 미리보기 — 대시보드에서 책을 만들면 저장됩니다</span>
          )}
          <button
            onClick={approve}
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {project.publish.approved ? '조절·인쇄 승인됨 ✓' : '조절·인쇄 승인'}
          </button>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        {message && (
          <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-gray-700">{message}</div>
        )}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">표지 — 3방향 제안</h1>
            <button
              onClick={generateCovers}
              disabled={busy !== null || !isPersisted}
              className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              {busy === '표지 생성' ? '생성 중… (수십 초)' : '표지 3방향 생성'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {project.publish.coverOptions.map((c) => (
              <button
                key={c.id}
                onClick={() => c.imageUrl && selectCover(c.id)}
                className={[
                  'flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-lg border text-xs',
                  project.publish.selectedCoverId === c.id
                    ? 'border-brand-500 ring-2 ring-brand-300'
                    : 'border-dashed border-gray-300 text-gray-400',
                ].join(' ')}
              >
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={c.concept} className="h-full w-full object-cover" />
                ) : (
                  <>
                    <span>{c.concept === 'character' ? '캐릭터 중심' : c.concept === 'scene' ? '장면' : '상징'}</span>
                    <span className="mt-1">이미지 생성 대기</span>
                  </>
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">그림은 AI, 제목·작가명은 랩 표지에서 HTML 텍스트로 얹힙니다.</p>
        </section>

        <section className="mb-6 rounded-xl border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">랩 표지 (앞+책등+뒤) · 책등 계산</h1>
            <a
              href={`/cover?project=${encodeURIComponent(project.id)}`}
              className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"
            >
              표지 상세 편집 (미리보기·책등 글·글자 위치) →
            </a>
          </div>

          {!showAdvancedSpec ? (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <span>
                <span className="font-semibold text-gray-700">그림책 표준</span> — 부크크2(B5) · 무선제본 · 백색모조
                100g · {pageCount}p
              </span>
              <button
                onClick={() => setShowAdvancedSpec(true)}
                className="rounded border border-gray-300 px-2 py-1 text-gray-600 hover:border-gray-400"
              >
                직접 설정
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="block text-xs text-gray-500">
                출판 프로파일
                <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-1.5">
                  {PROFILE_CHOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-500">
                제본 방식
                <select value={binding} onChange={(e) => setBinding(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-1.5">
                  {BINDING_CHOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-500">
                내지 종이
                <select value={paperName} onChange={(e) => setPaperName(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-1.5">
                  {PAPER_CHOICES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-500">
                총 페이지 수
                <input
                  type="number" min={4} value={pageCount}
                  onChange={(e) => setPageCount(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-gray-300 p-1.5"
                />
              </label>
              <label className="flex items-end gap-2 pb-1 text-xs text-gray-500">
                <input type="checkbox" checked={flaps} onChange={(e) => setFlaps(e.target.checked)} />
                날개 포함 (좌우 각 100mm)
              </label>
            </div>
          )}
          <label className="mt-3 block text-xs text-gray-500">
            작가명 (표지 텍스트)
            <input
              type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
              className="mt-1 w-full max-w-xs rounded border border-gray-300 p-1.5" placeholder="선택"
            />
          </label>
          {spineInfo && (
            <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              책등 {spineInfo.spineMm}mm · 책등 텍스트 {spineInfo.canFitSpineText ? '가능' : '생략(5mm 미만)'}
              {spineInfo.warnings.map((w) => <div key={w} className="mt-1 text-amber-600">⚠ {w}</div>)}
            </div>
          )}
          <button
            onClick={renderCover}
            disabled={busy !== null || !isPersisted}
            className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === '랩 표지 렌더' ? '렌더 중…' : '책등 계산 + 랩 표지 PDF 렌더'}
          </button>
        </section>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">사전검사 (Preflight)</h1>
            <button
              onClick={runPreflight}
              disabled={busy !== null || !isPersisted}
              className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              {busy === '사전검사' ? '검사 중…' : '사전검사 실행'}
            </button>
          </div>
          {project.publish.preflight ? (
            <ul className="space-y-1 text-sm">
              {project.publish.preflight.items.map((item) => (
                <li
                  key={item.label}
                  className={!item.passed ? 'text-red-500' : item.detail?.startsWith('WARN') ? 'text-amber-600' : 'text-green-600'}
                >
                  {item.passed ? (item.detail?.startsWith('WARN') ? '⚠' : '✓') : '✗'} {item.label}{' '}
                  {item.detail ? `— ${item.detail}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-xs text-gray-400">
              아직 실행되지 않았습니다. 페이지 누락·순서 / 글 넘침 / 안전영역 침범 / 이미지 실해상도 / 폰트 임베드를 검사합니다.
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">PDF 다운로드</h1>
            <button
              onClick={renderBodyPdf}
              disabled={busy !== null || !isPersisted}
              className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              {busy === '본문 PDF 렌더' ? '렌더 중…' : '본문 PDF 렌더'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['viewingPdfUrl', '열람용 PDF'],
              ['printBodyPdfUrl', '인쇄용 본문 PDF (재단선 포함)'],
              ['printCoverPdfUrl', '인쇄용 랩 표지 PDF'],
              ['webBookUrl', '웹북'],
            ].map(([key, label]) => {
              const url = project.publish.outputs[key as keyof typeof project.publish.outputs] as string | undefined;
              return (
                <div key={key} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <span>{label}</span>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                      다운로드
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">생성 대기</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
