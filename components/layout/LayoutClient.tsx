'use client';

import { useEffect, useRef, useState } from 'react';
import { useProject } from '../../lib/useProject';
import { StepBar } from '../StepBar';
import { ThreePane } from '../ThreePane';
import type { PageLayout } from '../../lib/types';

interface GenerateResponse {
  candidates?: { id: string; url: string }[];
  consistency?: { candidateId: string; result: { ok: boolean; score?: number } }[];
  rounds?: number;
  bestScore?: number | null;
  error?: string;
}

export function LayoutClient() {
  const { project, setProject, loading, saving, isPersisted, save, reload } = useProject();
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [draftProgress, setDraftProgress] = useState<{ done: number; total: number } | null>(null);
  const [finalizeProgress, setFinalizeProgress] = useState<{ done: number; total: number } | null>(null);
  const autoDraftedRef = useRef(false);

  const firstPage = project.layout.pages[0];
  const firstPageHasAnyImage = !!firstPage?.slots.find((s) => s.slotId === 'image-1')?.imageUrl;
  const noPageHasImage =
    project.layout.pages.length > 0 &&
    project.layout.pages.every((p) => !p.slots.find((s) => s.slotId === 'image-1')?.imageUrl);

  useEffect(() => {
    if (autoDraftedRef.current) return;
    if (!isPersisted || loading || !firstPage || firstPageHasAnyImage) return;
    autoDraftedRef.current = true;
    void generateDraft(firstPage.sceneNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersisted, loading, firstPage?.sceneNumber, firstPageHasAnyImage]);

  if (loading) return <div className="p-8 text-gray-400">불러오는 중…</div>;

  const page = project.layout.pages.find((p) => p.sceneNumber === selectedPage) ?? project.layout.pages[0];
  const template = project.layout.templates.find((t) => t.id === page?.templateId);
  const transform = page?.transform ?? { scale: 1, offsetX: 0, offsetY: 0 };
  const textSlotData = page?.slots.find((s) => s.slotId === 'text-1');
  const imageSlotData = page?.slots.find((s) => s.slotId === 'image-1');
  const allPagesHaveImage =
    project.layout.pages.length > 0 &&
    project.layout.pages.every((p) => p.slots.find((s) => s.slotId === 'image-1')?.imageUrl);
  const draftPageCount = project.layout.pages.filter(
    (p) => p.slots.find((s) => s.slotId === 'image-1')?.imageQuality === 'draft',
  ).length;
  const allPagesFinal = allPagesHaveImage && draftPageCount === 0;

  const post = async (url: string, body: object): Promise<GenerateResponse | null> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, ...body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? String(res.status));
    return data;
  };

  const generateScene = async (sceneNumber: number) => {
    setBusy(`장면 ${sceneNumber} 생성`);
    setMessage(null);
    try {
      const data = await post('/api/scene/generate', { sceneNumber });
      await reload();
      const score = data?.bestScore;
      setMessage(
        `장면 ${sceneNumber} 후보 생성 완료 — DNA 일관성 ${score == null ? '판단 불가' : `${score}점`}` +
          (data?.rounds && data.rounds > 1 ? ` (자동 교정 ${data.rounds - 1}회 재생성)` : ''),
      );
    } catch (e) {
      setMessage(`장면 ${sceneNumber} 생성 실패: ${(e as Error).message}`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const selectCandidate = async (sceneNumber: number, candidateId: string) => {
    setBusy('후보 확정');
    setMessage(null);
    try {
      const data = (await post('/api/scene/select', { sceneNumber, candidateId, autoTemplate: true, imageQuality: 'final' })) as {
        templateId?: string;
        recommendation?: { reason?: string } | null;
      };
      await reload();
      setMessage(
        `장면 ${sceneNumber} 그림 확정 — 템플릿 ${data?.templateId}` +
          (data?.recommendation?.reason ? ` (${data.recommendation.reason})` : ''),
      );
    } catch (e) {
      setMessage(`후보 확정 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // 일괄 생성: 그림이 확정되지 않은 모든 장면을 순차로 생성하고,
  // DNA 점수가 가장 높은 후보를 자동 선택 + 템플릿 자동 추천까지 적용한다.
  const generateAll = async () => {
    const targets = project.layout.pages
      .filter((p) => !p.slots.find((s) => s.slotId === 'image-1')?.imageUrl)
      .map((p) => p.sceneNumber)
      .sort((a, b) => a - b);
    if (targets.length === 0) {
      setMessage('모든 장면에 그림이 이미 확정되어 있습니다');
      return;
    }
    setBusy('일괄 생성');
    let done = 0;
    const failed: number[] = [];
    for (const sceneNumber of targets) {
      setMessage(`일괄 생성 중… ${done}/${targets.length} 완료 (장면 ${sceneNumber} 생성 중)`);
      try {
        const data = await post('/api/scene/generate', { sceneNumber });
        const cands = data?.candidates ?? [];
        if (cands.length > 0) {
          // DNA 점수 최고 후보 자동 선택 (점수 없으면 첫 후보)
          const scoreOf = (id: string) => {
            const c = data?.consistency?.find((x) => x.candidateId === id);
            return c?.result.ok ? c.result.score ?? -1 : -1;
          };
          const best = [...cands].sort((a, b) => scoreOf(b.id) - scoreOf(a.id))[0];
          await post('/api/scene/select', { sceneNumber, candidateId: best.id, autoTemplate: true, imageQuality: 'final' });
        } else {
          failed.push(sceneNumber);
        }
      } catch {
        failed.push(sceneNumber);
      }
      done++;
    }
    await reload();
    setBusy(null);
    setMessage(
      `일괄 생성 완료 — ${targets.length - failed.length}/${targets.length}장면 확정` +
        (failed.length ? ` (실패: 장면 ${failed.join(', ')} — 개별 재시도 하세요)` : ''),
    );
  };

  // 빠른 미리보기 1장 — 후보 비교·DNA 검증 없이 즉시 확정 (분위기 확인용)
  const generateDraft = async (sceneNumber: number) => {
    setBusy(`페이지 ${sceneNumber} 미리보기`);
    setMessage(null);
    try {
      await post('/api/scene/draft', { sceneNumber });
      await reload();
    } catch (e) {
      setMessage(`페이지 ${sceneNumber} 미리보기 생성 실패: ${(e as Error).message}`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  // 1페이지 분위기가 마음에 들 때 — 그림이 없는 나머지 페이지를 전부 빠른 미리보기로 채운다.
  const draftAllRemaining = async () => {
    const targets = project.layout.pages
      .filter((p) => !p.slots.find((s) => s.slotId === 'image-1')?.imageUrl)
      .map((p) => p.sceneNumber)
      .sort((a, b) => a - b);
    if (targets.length === 0) return;
    setBusy('전체 미리보기');
    setDraftProgress({ done: 0, total: targets.length });
    for (const sceneNumber of targets) {
      try {
        await post('/api/scene/draft', { sceneNumber });
      } catch {
        // 실패한 페이지는 비워둔 채 넘어간다 — 개별적으로 다시 시도 가능
      }
      setDraftProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    await reload();
    setBusy(null);
    setDraftProgress(null);
  };

  // 미리보기 전체를 고화질(후보 2장 + DNA 검증)로 한꺼번에 승격한다.
  const finalizeAll = async () => {
    const targets = project.layout.pages
      .filter((p) => p.slots.find((s) => s.slotId === 'image-1')?.imageQuality === 'draft')
      .map((p) => p.sceneNumber)
      .sort((a, b) => a - b);
    if (targets.length === 0) return;
    setBusy('고화질 완성');
    setFinalizeProgress({ done: 0, total: targets.length });
    const failed: number[] = [];
    for (const sceneNumber of targets) {
      try {
        const data = await post('/api/scene/generate', { sceneNumber });
        const cands = data?.candidates ?? [];
        if (cands.length > 0) {
          const scoreOf = (id: string) => {
            const c = data?.consistency?.find((x) => x.candidateId === id);
            return c?.result.ok ? c.result.score ?? -1 : -1;
          };
          const best = [...cands].sort((a, b) => scoreOf(b.id) - scoreOf(a.id))[0];
          await post('/api/scene/select', { sceneNumber, candidateId: best.id, autoTemplate: true, imageQuality: 'final' });
        } else {
          failed.push(sceneNumber);
        }
      } catch {
        failed.push(sceneNumber);
      }
      setFinalizeProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    await reload();
    setBusy(null);
    setFinalizeProgress(null);
    setMessage(
      `고화질 완성 — ${targets.length - failed.length}/${targets.length}장면 완료` +
        (failed.length ? ` (실패: 장면 ${failed.join(', ')} — 개별 재시도 하세요)` : ''),
    );
  };

  const patchPage = (patch: Partial<PageLayout>) => {
    if (!page) return;
    setProject((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        pages: prev.layout.pages.map((p) => (p.sceneNumber === page.sceneNumber ? { ...p, ...patch } : p)),
      },
    }));
  };

  const changeTemplate = (templateId: string) => patchPage({ templateId });

  // 슬롯 편집 자동 제한 (PRD §4.1) — 서버(/api/edit/slot)와 같은 클램프
  const setTransform = (patch: Partial<{ scale: number; offsetX: number; offsetY: number }>) => {
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const next = { ...transform, ...patch };
    patchPage({
      transform: {
        scale: clamp(next.scale, 1, 2.5),
        offsetX: clamp(next.offsetX, -0.4, 0.4),
        offsetY: clamp(next.offsetY, -0.4, 0.4),
      },
    });
  };

  const patchTextSlot = (patch: { fontSizePx?: number; lineHeight?: number; color?: string; textBox?: 'box' | 'none' }) => {
    if (!page) return;
    patchPage({
      slots: page.slots.map((s) => (s.slotId === 'text-1' ? { ...s, ...patch } : s)),
    });
  };

  const approve = async () => {
    setProject((prev) => ({ ...prev, layout: { ...prev.layout, approved: true } }));
    await save();
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <StepBar project={project} active="layout" />
        <div className="flex items-center gap-2">
          {!isPersisted && (
            <span className="text-xs text-amber-600">목업 미리보기 — 대시보드에서 책을 만들면 저장됩니다</span>
          )}
          {draftPageCount > 0 && (
            <button
              onClick={finalizeAll}
              disabled={busy !== null || !isPersisted}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              title="미리보기(빠른 초안) 페이지를 전부 후보 2장 비교 + DNA 검증까지 거친 고화질본으로 한꺼번에 바꿉니다"
            >
              {busy === '고화질 완성'
                ? `고화질 완성 중… ${finalizeProgress ? `${finalizeProgress.done}/${finalizeProgress.total}` : ''}`
                : `미리보기 ${draftPageCount}장 고화질로 완성`}
            </button>
          )}
          <button
            onClick={generateAll}
            disabled={busy !== null || !isPersisted}
            className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
          >
            {busy === '일괄 생성' ? '일괄 생성 중…' : '전체 장면 일괄 생성 (AI)'}
          </button>
          <button
            onClick={save}
            disabled={saving || !isPersisted}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-60"
          >
            {saving ? '저장 중…' : '편집 저장'}
          </button>
          <button
            onClick={approve}
            disabled={saving || !allPagesFinal}
            title={
              allPagesFinal
                ? undefined
                : allPagesHaveImage
                  ? '미리보기(초안) 페이지를 고화질로 완성해야 승인할 수 있습니다'
                  : '모든 장면의 그림을 확정해야 승인할 수 있습니다'
            }
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {project.layout.approved ? '그림·조판 승인됨 ✓' : allPagesFinal ? '그림·조판 승인' : '승인 (고화질 완성 필요)'}
          </button>
        </div>
      </div>

      {message && (
        <div className="border-b border-brand-100 bg-brand-50 px-6 py-2 text-xs text-gray-700">{message}</div>
      )}

      {!noPageHasImage && firstPageHasAnyImage && draftProgress === null && draftPageCount > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-6 py-2 text-xs text-gray-700">
          <div className="flex items-center justify-between">
            <span>1페이지 미리보기가 준비됐어요. 이 분위기가 마음에 들면 나머지 페이지도 빠르게 미리보기로 채워보세요.</span>
            <button
              onClick={draftAllRemaining}
              disabled={busy !== null}
              className="ml-3 shrink-0 rounded border border-amber-400 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              나머지 페이지 미리보기로 채우기
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            미리보기는 인물 일관성(DNA) 검사 없이 빠르게 그린 임시 그림입니다. 인물이 페이지마다 조금씩 달라
            보일 수 있는데, "고화질로 완성" 단계에서 자동으로 검증·보정됩니다.
          </p>
        </div>
      )}

      {draftProgress && (
        <div className="border-b border-amber-100 bg-amber-50 px-6 py-2 text-xs text-gray-700">
          전체 미리보기 생성 중… {draftProgress.done}/{draftProgress.total}
          <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-amber-200">
            <div
              className="h-1.5 rounded-full bg-amber-500 transition-all"
              style={{ width: `${(draftProgress.done / draftProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <ThreePane
        leftTitle="페이지 목록"
        rightTitle="그림 생성 · 슬롯 편집"
        left={
          <ul className="space-y-1">
            {project.layout.pages.map((p) => {
              const img = p.slots.find((s) => s.slotId === 'image-1');
              const status = img?.imageUrl
                ? img.imageQuality === 'draft'
                  ? '미리보기'
                  : '✓'
                : (img?.candidates?.length ?? 0) > 0
                  ? '후보'
                  : '';
              return (
                <li key={p.sceneNumber}>
                  <button
                    onClick={() => setSelectedPage(p.sceneNumber)}
                    className={[
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm',
                      p.sceneNumber === selectedPage ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span>페이지 {p.sceneNumber}</span>
                    <span
                      className={[
                        'text-xs',
                        status === '✓' ? 'text-green-600' : status === '미리보기' ? 'text-amber-600' : 'text-gray-400',
                      ].join(' ')}
                    >
                      {status || p.templateId}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        }
        center={
          page ? (
            <div>
              <h1 className="mb-3 flex items-center gap-2 text-lg font-bold">
                펼침면 미리보기 · 페이지 {page.sceneNumber}
                {imageSlotData?.imageQuality === 'draft' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    빠른 미리보기 (초안)
                  </span>
                )}
              </h1>
              <div className="relative aspect-square w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                {template?.slots.map((slot) => {
                  const data = page.slots.find((s) => s.slotId === slot.id);
                  const style: React.CSSProperties = {
                    left: `${slot.x * 100}%`,
                    top: `${slot.y * 100}%`,
                    width: `${slot.width * 100}%`,
                    height: `${slot.height * 100}%`,
                  };
                  if (slot.type === 'image' && data?.imageUrl) {
                    // 렌더러(html.ts)와 같은 transform 표현: scale/offset → background-size/position
                    style.backgroundImage = `url('${data.imageUrl}')`;
                    style.backgroundRepeat = 'no-repeat';
                    style.backgroundSize = page.transform ? `${page.transform.scale * 100}% auto` : 'cover';
                    style.backgroundPosition = page.transform
                      ? `${50 + page.transform.offsetX * 100}% ${50 + page.transform.offsetY * 100}%`
                      : 'center';
                  }
                  const boxless =
                    slot.type === 'text' &&
                    (data?.textBox ?? project.layout.textBoxDefault ?? 'box') === 'none';
                  if (slot.type === 'text') {
                    if (data?.fontSizePx) style.fontSize = `${data.fontSizePx * 0.6}px`;
                    if (data?.lineHeight) style.lineHeight = data.lineHeight;
                    if (data?.color) style.color = data.color;
                    if (boxless)
                      style.textShadow =
                        '0 0 3px rgba(255,253,248,0.95), 0 0 6px rgba(255,253,248,0.85), 0 0 12px rgba(255,253,248,0.7)';
                  }
                  return (
                    <div
                      key={slot.id}
                      className={[
                        'absolute flex items-center justify-center text-xs',
                        slot.type === 'image'
                          ? data?.imageUrl
                            ? ''
                            : 'border border-dashed border-gray-300 bg-white text-gray-400'
                          : boxless
                            ? 'text-gray-700'
                            : 'rounded bg-white/80 text-gray-700',
                      ].join(' ')}
                      style={style}
                    >
                      {slot.type === 'image' ? (
                        data?.imageUrl ? null : '그림 슬롯 (생성 대기)'
                      ) : (
                        <span className="px-2 text-center" style={{ textAlign: slot.align ?? 'center' }}>
                          {data?.text ?? '텍스트 슬롯'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-gray-400">페이지가 없습니다 — 먼저 파트 1에서 스토리를 생성하세요</div>
          )
        }
        right={
          <div className="space-y-5 text-sm">
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">빠른 미리보기</span>
                <button
                  onClick={() => page && generateDraft(page.sceneNumber)}
                  disabled={busy !== null || !isPersisted || !page}
                  className="rounded border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {busy === `페이지 ${page?.sceneNumber} 미리보기`
                    ? '생성 중…'
                    : imageSlotData?.imageUrl
                      ? '다시 미리보기'
                      : '빠르게 그림 만들기'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                후보 비교·DNA 검증 없이 1장만 빠르게 만들어 분위기를 확인합니다. 인물이 다른 페이지와 살짝
                달라 보여도 정상입니다 — "고화질로 완성" 시 자동 보정됩니다. 마음에 안 들면 다시 눌러보세요.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">그림 후보 (2구도, 고화질)</span>
                <button
                  onClick={() => page && generateScene(page.sceneNumber)}
                  disabled={busy !== null || !isPersisted || !page}
                  className="rounded border border-brand-300 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                >
                  {busy === `장면 ${page?.sceneNumber} 생성` ? '생성·검사 중…' : '후보 생성'}
                </button>
              </div>
              {(imageSlotData?.candidates?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {imageSlotData!.candidates!.map((cand) => {
                    const chosen = imageSlotData?.imageUrl === cand.url;
                    return (
                      <button
                        key={cand.id}
                        onClick={() => page && selectCandidate(page.sceneNumber, cand.id)}
                        disabled={busy !== null}
                        className={[
                          'relative aspect-square overflow-hidden rounded-lg border',
                          chosen ? 'border-green-500 ring-2 ring-green-300' : 'border-gray-200 hover:border-brand-400',
                        ].join(' ')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cand.url} alt={cand.id} className="h-full w-full object-cover" />
                        {chosen && (
                          <span className="absolute bottom-1 left-1 rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            확정
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  아직 후보가 없습니다. 생성 시 캐릭터 레퍼런스·DNA·스타일을 조건으로 2구도를 만들고, DNA
                  일관성 자동 검사·교정을 거칩니다.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 font-semibold">그림 슬롯 — 확대 · 이동</div>
              <label className="mb-1 block text-xs text-gray-500">
                확대 {transform.scale.toFixed(2)}×
                <input
                  type="range" min={1} max={2.5} step={0.05} value={transform.scale}
                  onChange={(e) => setTransform({ scale: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="mb-1 block text-xs text-gray-500">
                가로 이동 {(transform.offsetX * 100).toFixed(0)}%
                <input
                  type="range" min={-0.4} max={0.4} step={0.02} value={transform.offsetX}
                  onChange={(e) => setTransform({ offsetX: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="block text-xs text-gray-500">
                세로 이동 {(transform.offsetY * 100).toFixed(0)}%
                <input
                  type="range" min={-0.4} max={0.4} step={0.02} value={transform.offsetY}
                  onChange={(e) => setTransform({ offsetY: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <button
                onClick={() => patchPage({ transform: undefined })}
                className="mt-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-gray-300"
              >
                초기화 (기본 cover 맞춤)
              </button>
            </div>

            <div>
              <div className="mb-2 font-semibold">글 슬롯 — 크기 · 행간 · 색</div>
              <label className="mb-1 block text-xs text-gray-500">
                글자 크기 {textSlotData?.fontSizePx ?? 18}px
                <input
                  type="range" min={9} max={40} step={1}
                  value={textSlotData?.fontSizePx ?? 18}
                  onChange={(e) => patchTextSlot({ fontSizePx: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="mb-1 block text-xs text-gray-500">
                행간 {(textSlotData?.lineHeight ?? 1.85).toFixed(2)}
                <input
                  type="range" min={1.2} max={3} step={0.05}
                  value={textSlotData?.lineHeight ?? 1.85}
                  onChange={(e) => patchTextSlot({ lineHeight: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                글자 색
                <input
                  type="color"
                  value={textSlotData?.color ?? '#2b2620'}
                  onChange={(e) => patchTextSlot({ color: e.target.value })}
                />
              </label>
              <label className="mt-2 block text-xs text-gray-500">
                글 상자 (그림 위에 글이 얹힐 때)
                <select
                  value={textSlotData?.textBox ?? project.layout.textBoxDefault ?? 'box'}
                  onChange={(e) => patchTextSlot({ textBox: e.target.value as 'box' | 'none' })}
                  className="mt-1 w-full rounded border border-gray-300 p-1.5"
                >
                  <option value="box">반투명 상자</option>
                  <option value="none">상자 없음 (글로우)</option>
                </select>
              </label>
              <p className="mt-1 text-[11px] text-gray-400">정렬은 템플릿의 글 슬롯 정의를 따릅니다 — 아래에서 템플릿 교체.</p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between font-semibold">
                <span>템플릿</span>
                <button
                  onClick={() => setShowTemplatePicker((v) => !v)}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] font-normal text-gray-500 hover:border-gray-300"
                >
                  {showTemplatePicker ? '접기' : '템플릿 직접 바꾸기'}
                </button>
              </div>
              {!showTemplatePicker ? (
                <div className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">{page?.templateId}</span>{' '}
                  {project.layout.templates.find((t) => t.id === page?.templateId)?.name}{' '}
                  <span className="text-gray-400">(AI 추천)</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {project.layout.templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => changeTemplate(t.id)}
                      className={[
                        'rounded-lg border p-2 text-left text-xs',
                        t.id === page?.templateId ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300',
                      ].join(' ')}
                    >
                      <div className="font-semibold">{t.id}</div>
                      <div className="text-gray-500">{t.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
