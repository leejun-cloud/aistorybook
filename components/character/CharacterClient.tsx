'use client';

import { useRef, useState } from 'react';
import { useProject } from '../../lib/useProject';
import { PUBLISHED_STYLE_PRESETS, STYLE_LIBRARY } from '../../lib/demo';
import { StepBar } from '../StepBar';
import { ThreePane } from '../ThreePane';

export function CharacterClient() {
  const { project, setProject, loading, saving, isPersisted, save, reload } = useProject();
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedCandId, setSelectedCandId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [refineNote, setRefineNote] = useState('');
  const [copyrightOk, setCopyrightOk] = useState(false);
  const [showMoreStyles, setShowMoreStyles] = useState(false);
  const [charProgress, setCharProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading) return <div className="p-8 text-gray-400">불러오는 중…</div>;

  const character =
    project.character.characters.find((c) => c.id === selectedCharId) ?? project.character.characters[0];
  const hasConfirmed = project.character.characters.some((c) => c.confirmed && c.referenceImageUrl);

  // 선택지 과부하 방지: 12종(기본6+출판사례6)+업로드 전부를 한 화면에 펼치는 대신
  // 다양성 있는 대표 4개만 먼저 보여주고 나머지는 "더 보기"로 접는다.
  const TOP_STYLE_IDS = new Set(['watercolor', 'gouache', '3d-soft', 'published:nordic-flat']);
  const topLibrary = STYLE_LIBRARY.filter((s) => TOP_STYLE_IDS.has(s.id));
  const restLibrary = STYLE_LIBRARY.filter((s) => !TOP_STYLE_IDS.has(s.id));
  const topPublished = PUBLISHED_STYLE_PRESETS.filter((s) => TOP_STYLE_IDS.has(`published:${s.id}`));
  const restPublished = PUBLISHED_STYLE_PRESETS.filter((s) => !TOP_STYLE_IDS.has(`published:${s.id}`));
  const currentStyleIsHidden =
    project.character.style.source === 'library' &&
    !!project.character.style.libraryStyleId &&
    !TOP_STYLE_IDS.has(project.character.style.libraryStyleId);

  const call = async (label: string, url: string, body: object): Promise<Record<string, unknown> | null> => {
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
      await reload();
      return data;
    } catch (e) {
      setMessage(`${label} 실패: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const generateCandidates = async (characterId?: string, name?: string, description?: string) => {
    const desc = description ?? character?.description;
    if (!desc?.trim()) {
      setMessage('캐릭터 설명이 필요합니다');
      return;
    }
    const data = await call('후보 생성', '/api/character/candidates', {
      characterId,
      name,
      description: desc.trim(),
    });
    if (data) {
      setSelectedCharId(String(data.characterId));
      setSelectedCandId(null);
      setNewName('');
      setNewDesc('');
      setMessage('후보 4장 생성 완료 — 1장을 골라 확정하면 텍스트 DNA를 추출합니다.');
    }
  };

  const confirmCandidate = async () => {
    if (!character || !selectedCandId) return;
    const data = await call('레퍼런스 확정', '/api/character/confirm', {
      characterId: character.id,
      candidateId: selectedCandId,
    });
    if (data) setMessage('확정 완료 — 이미지에서 텍스트 DNA(고정/소품/금지)를 추출했습니다.');
  };

  const refineCandidate = async () => {
    if (!character || !selectedCandId || !refineNote.trim()) return;
    const data = await call('부분 수정', '/api/character/refine', {
      characterId: character.id,
      candidateId: selectedCandId,
      instruction: refineNote.trim(),
    });
    if (data) {
      setRefineNote('');
      const cand = data.candidate as { id?: string } | undefined;
      if (cand?.id) setSelectedCandId(cand.id);
      setMessage('부분 수정 후보가 추가되었습니다.');
    }
  };

  const uploadStyle = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 3) {
      setMessage('참고 그림은 최대 3장입니다');
      return;
    }
    if (!copyrightOk) {
      setMessage('저작권 원칙 동의에 체크해야 업로드할 수 있습니다');
      return;
    }
    setBusy('스타일 추출');
    setMessage(null);
    try {
      const form = new FormData();
      form.set('projectId', project.id);
      form.set('copyrightAcknowledged', 'true');
      for (const f of Array.from(files)) form.append('images', f);
      const res = await fetch('/api/style/extract', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`스타일 추출 실패: ${data.error ?? res.status}`);
        return;
      }
      await reload();
      setMessage(`스타일 추출 완료: ${data.style?.summary ?? ''}`);
    } catch (e) {
      setMessage(`스타일 추출 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 스타일 선택 즉시 모든 등장인물을 자동 생성한다 — 4장 중 고르는 단계 없이
  // 1인 1장으로 빠르게 전원 채우고, 마음에 안 드는 인물만 나중에 "다른 디자인
  // 4개 보기"로 바꾸는 편이 대기시간이 짧다.
  const quickGenerateAll = async () => {
    const targets = project.character.characters.filter((c) => !c.confirmed);
    if (targets.length === 0) return;
    setBusy('캐릭터 일괄 생성');
    setMessage(null);
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      setCharProgress({ done: i, total: targets.length, name: c.name });
      try {
        const res = await fetch('/api/character/quick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, characterId: c.id }),
        });
        if (res.ok) await reload();
      } catch {
        /* 이 인물만 건너뛰고 계속 — 나중에 개별적으로 재시도 가능 */
      }
    }
    setCharProgress(null);
    setBusy(null);
    setMessage(
      `등장인물 ${targets.length}명 생성 완료 — 마음에 안 드는 인물은 "다른 디자인 4개 보기"로 바꿀 수 있어요.`,
    );
  };

  const chooseLibraryStyle = async (id: string) => {
    const entry = STYLE_LIBRARY.find((s) => s.id === id);
    setProject((prev) => ({
      ...prev,
      character: {
        ...prev.character,
        style: {
          ...prev.character.style,
          source: 'library',
          libraryStyleId: id,
          referenceImageUrls: [],
          // 라이브러리 스타일의 프롬프트 서술 — 장면/후보 생성 프롬프트(styleClause)가 사용
          description: entry?.prompt ?? '',
        },
      },
    }));
    await save();
    await quickGenerateAll();
  };

  // 출판 사례 프리셋: 스타일 서술 + 분위기 제안 + 조판(글 상자) 기본값까지 복제
  const choosePublishedPreset = async (id: string) => {
    const preset = PUBLISHED_STYLE_PRESETS.find((s) => s.id === id);
    if (!preset) return;
    setProject((prev) => ({
      ...prev,
      character: {
        ...prev.character,
        style: {
          ...prev.character.style,
          source: 'library',
          libraryStyleId: `published:${preset.id}`,
          referenceImageUrls: [],
          description: preset.prompt,
        },
      },
      story: {
        ...prev.story,
        // 분위기가 비어 있을 때만 프리셋 분위기를 제안값으로 채운다
        desiredMood: prev.story.desiredMood.trim() ? prev.story.desiredMood : preset.mood,
      },
      layout: { ...prev.layout, textBoxDefault: preset.textBox },
    }));
    await save();
    setMessage(
      `"${preset.name}" 적용 — 스타일·분위기 제안·조판(글 ${preset.textBox === 'none' ? '상자 없음' : '반투명 상자'})까지 복제되었습니다.`,
    );
    await quickGenerateAll();
  };

  const approve = async () => {
    setProject((prev) => ({ ...prev, character: { ...prev.character, approved: true } }));
    await save();
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <StepBar project={project} active="character" />
        <div className="flex items-center gap-2">
          {!isPersisted && (
            <span className="text-xs text-amber-600">목업 미리보기 — 대시보드에서 책을 만들면 저장됩니다</span>
          )}
          <button
            onClick={approve}
            disabled={saving || !hasConfirmed}
            title={hasConfirmed ? undefined : '캐릭터 1명 이상을 확정해야 승인할 수 있습니다'}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {project.character.approved ? '캐릭터·스타일 승인됨 ✓' : hasConfirmed ? '캐릭터·스타일 승인' : '승인 (확정 캐릭터 필요)'}
          </button>
        </div>
      </div>

      {message && !charProgress && (
        <div className="border-b border-brand-100 bg-brand-50 px-6 py-2 text-xs text-gray-700">{message}</div>
      )}
      {charProgress && (
        <div className="border-b border-brand-100 bg-brand-50 px-6 py-2 text-xs text-gray-700">
          <div className="mb-1">
            캐릭터 생성 중… {charProgress.done}/{charProgress.total} ({charProgress.name})
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(charProgress.done / Math.max(1, charProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      <ThreePane
        leftTitle="캐릭터 목록 · 스타일"
        rightTitle="텍스트 DNA · 부분 수정"
        left={
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500">캐릭터</div>
                {project.character.characters.some((c) => !c.confirmed) && (
                  <button
                    onClick={quickGenerateAll}
                    disabled={busy !== null || !isPersisted}
                    className="rounded border border-brand-300 px-2 py-0.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {busy === '캐릭터 일괄 생성' ? '생성 중…' : '캐릭터 스타일 생성'}
                  </button>
                )}
              </div>
              {project.character.characters.some((c) => !c.confirmed) && (
                <p className="mb-2 text-[11px] text-gray-400">
                  1장씩 빠르게 만들어 바로 확정합니다. 마음에 안 드는 인물만 "다른 디자인 4개 보기"로 다시
                  고르면 됩니다 — 손가락 개수처럼 미세한 부분은 그림 생성 자체의 한계라 재생성이 더 빠른
                  해결책입니다.
                </p>
              )}
              <div className="space-y-1">
                {project.character.characters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCharId(c.id);
                      setSelectedCandId(null);
                    }}
                    className={[
                      'flex w-full items-center justify-between rounded-lg border p-2 text-left text-sm',
                      c.id === (character?.id ?? null) ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span>{c.name}</span>
                    {c.confirmed && <span className="text-xs text-green-600">확정</span>}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2 rounded-lg border border-dashed border-gray-300 p-2 text-xs">
                <div className="font-semibold text-gray-500">새 캐릭터 만들기</div>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="이름 (예: 코리)"
                  className="w-full rounded border border-gray-300 p-1.5"
                />
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="설명 — 예: 겁 많은 롭이어 아기 토끼. 크림색 털, 분홍 코"
                  className="w-full resize-none rounded border border-gray-300 p-1.5"
                />
                <button
                  onClick={() => generateCandidates(undefined, newName, newDesc)}
                  disabled={busy !== null || !isPersisted || !newDesc.trim()}
                  className="w-full rounded-lg bg-brand-500 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {busy === '후보 생성' ? '생성 중… (4장, 수십 초)' : '후보 4장 생성 (AI)'}
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500">스타일</div>
                <button
                  onClick={() => setShowMoreStyles((v) => !v)}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:border-gray-300"
                >
                  {showMoreStyles ? '접기' : '더 보기'}
                </button>
              </div>
              <div className="space-y-1">
                {topLibrary.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => chooseLibraryStyle(s.id)}
                    className={[
                      'flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs',
                      project.character.style.libraryStyleId === s.id && project.character.style.source === 'library'
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.exampleUrl} alt={s.name} className="h-12 w-12 shrink-0 rounded object-cover" />
                    <div className="min-w-0">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-gray-500">{s.description}</div>
                    </div>
                  </button>
                ))}
                {topPublished.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => choosePublishedPreset(s.id)}
                    className={[
                      'flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs',
                      project.character.style.libraryStyleId === `published:${s.id}` &&
                      project.character.style.source === 'library'
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.exampleUrl} alt={s.name} className="h-12 w-12 shrink-0 rounded object-cover" />
                    <div className="min-w-0">
                      <div className="font-semibold">{s.name} <span className="text-[10px] text-gray-400">(출판 사례)</span></div>
                      <div className="text-gray-500">{s.description}</div>
                    </div>
                  </button>
                ))}
                {currentStyleIsHidden && !showMoreStyles && (
                  <div className="rounded-lg border border-brand-300 bg-brand-50 p-2 text-xs">
                    <div className="font-semibold">
                      현재 선택: {[...STYLE_LIBRARY, ...PUBLISHED_STYLE_PRESETS].find(
                        (s) => s.id === project.character.style.libraryStyleId || `published:${s.id}` === project.character.style.libraryStyleId,
                      )?.name}
                    </div>
                  </div>
                )}
              </div>

              {showMoreStyles && (
                <>
                  {restLibrary.length > 0 && (
                    <>
                      <div className="mb-2 mt-4 text-xs font-semibold text-gray-500">기본 스타일 라이브러리</div>
                      <div className="space-y-1">
                        {restLibrary.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => chooseLibraryStyle(s.id)}
                            className={[
                              'flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs',
                              project.character.style.libraryStyleId === s.id && project.character.style.source === 'library'
                                ? 'border-brand-400 bg-brand-50'
                                : 'border-gray-200 hover:border-gray-300',
                            ].join(' ')}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.exampleUrl} alt={s.name} className="h-12 w-12 shrink-0 rounded object-cover" />
                            <div className="min-w-0">
                              <div className="font-semibold">{s.name}</div>
                              <div className="text-gray-500">{s.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mb-2 mt-4 text-xs font-semibold text-gray-500">
                    출판 사례 스타일 (분위기·이미지·조판 복제)
                  </div>
                  <div className="space-y-1">
                    {restPublished.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => choosePublishedPreset(s.id)}
                        className={[
                          'flex w-full items-start gap-2 rounded-lg border p-2 text-left text-xs',
                          project.character.style.libraryStyleId === `published:${s.id}` &&
                          project.character.style.source === 'library'
                            ? 'border-brand-400 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300',
                        ].join(' ')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.exampleUrl} alt={s.name} className="h-12 w-12 shrink-0 rounded object-cover" />
                        <div className="min-w-0">
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-gray-500">{s.description}</div>
                          <div className="mt-0.5 text-[10px] text-gray-400">
                            분위기: {s.mood} · 글 {s.textBox === 'none' ? '상자 없음' : '반투명 상자'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    검증된 그림책 미학 계열을 스타일 특성으로만 서술한 프리셋 — 특정 출판본의 그림을 직접
                    참조하려면 아래 업로드를 사용하세요.
                  </p>

                  <div className="mt-3 space-y-2 rounded-lg border border-dashed border-gray-300 p-2 text-xs">
                    <div className="font-semibold text-gray-500">참고 그림 업로드 (1~3장)</div>
                    {project.character.style.source === 'upload' && (
                      <div className="text-[11px] text-green-600">
                        업로드 스타일 사용 중 — {project.character.style.description.slice(0, 60)}…
                      </div>
                    )}
                    <label className="flex items-start gap-1.5 text-[11px] text-gray-500">
                      <input
                        type="checkbox"
                        checked={copyrightOk}
                        onChange={(e) => setCopyrightOk(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>업로드 그림의 스타일만 참고하며, 원작 캐릭터·구도를 복제하지 않는 것에 동의합니다</span>
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={busy !== null || !isPersisted || !copyrightOk}
                      onChange={(e) => uploadStyle(e.target.files)}
                      className="w-full text-[11px]"
                    />
                    {busy === '스타일 추출' && <div className="text-brand-600">스타일 분석 중…</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        }
        center={
          <div>
            <h1 className="mb-1 text-lg font-bold">{character?.name ?? '캐릭터 없음'}</h1>
            <p className="mb-4 text-sm text-gray-500">{character?.description}</p>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-500">후보 — 클릭해 선택 후 확정</div>
              {character && (
                <button
                  onClick={() => generateCandidates(character.id, character.name)}
                  disabled={busy !== null || !isPersisted}
                  title="마음에 안 들면 완전히 다른 디자인 4개를 새로 만들어 고를 수 있어요"
                  className="rounded border border-brand-300 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                >
                  {busy === '후보 생성' ? '생성 중…' : '다른 디자인 4개 보기'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {character?.candidates.map((cand) => {
                const isRef = !!character.referenceImageUrl && character.referenceImageUrl === cand.imageUrl;
                const isSelected = selectedCandId === cand.id;
                return (
                  <button
                    key={cand.id}
                    onClick={() => setSelectedCandId(cand.id)}
                    title={cand.note}
                    className={[
                      'relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border text-xs text-gray-400',
                      isRef
                        ? 'border-green-500 ring-2 ring-green-300'
                        : isSelected
                          ? 'border-brand-500 ring-2 ring-brand-300'
                          : cand.imageUrl
                            ? 'border-gray-200 hover:border-gray-400'
                            : 'border-dashed border-gray-300',
                    ].join(' ')}
                  >
                    {cand.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cand.imageUrl} alt={cand.note ?? cand.id} className="h-full w-full object-cover" />
                    ) : (
                      <span>이미지 없음</span>
                    )}
                    {isRef && (
                      <span className="absolute bottom-1 left-1 rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        확정 레퍼런스
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {character && character.candidates.some((c) => c.imageUrl) && (
              <button
                onClick={confirmCandidate}
                disabled={busy !== null || !isPersisted || !selectedCandId}
                className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy === '레퍼런스 확정' ? '확정 + DNA 추출 중…' : '선택한 후보를 공식 레퍼런스로 확정'}
              </button>
            )}
          </div>
        }
        right={
          character ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="mb-1 font-semibold">고정 요소</div>
                <ul className="list-inside list-disc text-xs text-gray-600">
                  {character.textDNA.fixed.length > 0
                    ? character.textDNA.fixed.map((f) => <li key={f}>{f}</li>)
                    : <li className="list-none text-gray-400">확정 시 이미지에서 추출됩니다</li>}
                </ul>
              </div>
              {'recurringProps' in character.textDNA &&
                Array.isArray((character.textDNA as { recurringProps?: string[] }).recurringProps) &&
                ((character.textDNA as { recurringProps?: string[] }).recurringProps?.length ?? 0) > 0 && (
                  <div>
                    <div className="mb-1 font-semibold">반복 소품</div>
                    <ul className="list-inside list-disc text-xs text-gray-600">
                      {(character.textDNA as { recurringProps: string[] }).recurringProps.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              <div>
                <div className="mb-1 font-semibold">금지 요소</div>
                <ul className="list-inside list-disc text-xs text-gray-600">
                  {character.textDNA.forbidden.length > 0
                    ? character.textDNA.forbidden.map((f) => <li key={f}>{f}</li>)
                    : <li className="list-none text-gray-400">확정 시 이미지에서 추출됩니다</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 text-xs">
                <div className="mb-2 font-semibold text-gray-700">부분 수정 — &ldquo;머리만 바꿔줘&rdquo;</div>
                <textarea
                  value={refineNote}
                  onChange={(e) => setRefineNote(e.target.value)}
                  rows={2}
                  placeholder="선택한 후보에서 바꿀 부분 — 예: 목도리를 빨간색으로"
                  className="mb-2 w-full resize-none rounded border border-gray-300 p-2"
                />
                <button
                  onClick={refineCandidate}
                  disabled={busy !== null || !isPersisted || !selectedCandId || !refineNote.trim()}
                  title={selectedCandId ? undefined : '먼저 후보 1장을 선택하세요'}
                  className="w-full rounded-lg border border-gray-200 py-2 font-medium text-gray-600 hover:border-gray-300 disabled:opacity-50"
                >
                  {busy === '부분 수정' ? '수정 중…' : '부분 수정 후보 추가'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">캐릭터를 선택하거나 새로 만드세요</div>
          )
        }
      />
    </div>
  );
}
