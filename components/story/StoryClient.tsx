'use client';

import { useEffect, useRef, useState } from 'react';
import { useProject } from '../../lib/useProject';
import { PLOT_PATTERNS } from '../../lib/demo';
import { Scene } from '../../lib/types';
import { StepBar } from '../StepBar';
import { ThreePane } from '../ThreePane';

const SCENE_COUNT_PRESETS = [8, 12, 16, 20, 24];

export function StoryClient() {
  const { project, setProject, loading, saving, isPersisted, save, reload } = useProject();
  const [selectedScene, setSelectedScene] = useState<number>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [regenNote, setRegenNote] = useState('');
  const [customCount, setCustomCount] = useState(false);
  const [brainstormMode, setBrainstormMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  // 파트 1 진입 3갈래 — 선택지 과부하를 줄이려고 처음엔 하나만 고르게 한다.
  // 스토리가 이미 있으면(재편집) 갈래 선택을 건너뛰고 바로 편집 화면으로.
  const [entryMode, setEntryMode] = useState<'idea' | 'brainstorm' | 'paste' | null>(null);
  const [pasteText, setPasteText] = useState('');

  const chatMessages = project.story.brainstorm?.messages ?? [];
  // 새 메시지가 오면 채팅 맨 아래로
  useEffect(() => {
    if (brainstormMode) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, brainstormMode]);

  if (loading) return <div className="p-8 text-gray-400">불러오는 중…</div>;

  const scene = project.story.scenes.find((s) => s.sceneNumber === selectedScene) ?? project.story.scenes[0];
  const gatePassed = project.story.qualityGate?.passed === true;

  // 서버가 프로젝트를 변이하는 API 호출 공통 래퍼 (성공 시 최신 상태 재로드)
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

  const openBrainstorm = async () => {
    setEntryMode('brainstorm');
    setBrainstormMode(true);
    if (chatMessages.length === 0) {
      await call('브레인스토밍 시작', '/api/story/brainstorm', { action: 'start' });
    }
  };

  const importStory = async () => {
    if (!pasteText.trim()) return;
    const data = await call('원고 가져오기', '/api/story/import', {
      text: pasteText,
      sceneCount: project.story.sceneCount,
      targetAge: project.story.targetAge || undefined,
    });
    if (data) setMessage('원고를 장면으로 나눴어요 — 원문은 그대로이며 바로 승인할 수 있습니다.');
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    const data = await call('작가도우미', '/api/story/brainstorm', { action: 'message', message: text });
    if (!data) setChatInput(text); // 실패 시 입력 복원
  };

  const resetChat = async () => {
    await call('대화 초기화', '/api/story/brainstorm', { action: 'reset' });
    await call('브레인스토밍 시작', '/api/story/brainstorm', { action: 'start' });
  };

  // 정리(기획안 확정 → 아이디어·분위기·등장인물 자동 채움) 후 곧바로 스토리 생성
  const finalizeAndGenerate = async () => {
    const data = await call('기획안 정리', '/api/story/brainstorm', { action: 'finalize' });
    if (!data) return;
    const story = data.story as { idea?: string } | undefined;
    setMessage('기획안 정리 완료 — 이어서 스토리를 생성합니다… (1~2분)');
    setBrainstormMode(false);
    const gen = await call('스토리 생성', '/api/story/generate', {
      idea: story?.idea ?? project.story.idea,
      targetAge: (data.story as { targetAge?: string })?.targetAge ?? project.story.targetAge,
      sceneCount: project.story.sceneCount,
      desiredMood: (data.story as { desiredMood?: string })?.desiredMood ?? project.story.desiredMood,
    });
    if (gen)
      setMessage(
        '브레인스토밍 → 스토리 생성 완료! 등장인물은 파트 2에 시드되어 있어요. 품질 게이트를 실행해 검증하세요.',
      );
  };

  const generateStory = async () => {
    const data = await call('스토리 생성', '/api/story/generate', {
      idea: project.story.idea,
      targetAge: project.story.targetAge,
      sceneCount: project.story.sceneCount,
      desiredMood: project.story.desiredMood,
      patternIds: project.story.selectedPatternIds.length > 0 ? project.story.selectedPatternIds : undefined,
    });
    if (data) setMessage('스토리 초안 생성 완료 — 품질 게이트를 실행해 검증하세요.');
  };

  const runGate = async () => {
    const data = await call('품질 게이트', '/api/story/gate', {});
    if (data) {
      const story = data.story as { qualityGate?: { passed: boolean } };
      setMessage(
        story?.qualityGate?.passed
          ? '품질 게이트 통과 ✓ — 승인할 수 있습니다.'
          : '품질 게이트 미달 항목이 있습니다. 자동 수정을 반영했으니 결과를 확인하세요.',
      );
    }
  };

  const regenScene = async () => {
    if (!scene || !regenNote.trim()) return;
    const data = await call('장면 다시 쓰기', '/api/story/scene', {
      sceneNumber: scene.sceneNumber,
      note: regenNote.trim(),
    });
    if (data) {
      setRegenNote('');
      setMessage(`장면 ${scene.sceneNumber} 다시 쓰기 완료 — 게이트를 다시 실행하세요.`);
    }
  };

  const togglePattern = (id: string) => {
    setProject((prev) => {
      const has = prev.story.selectedPatternIds.includes(id);
      return {
        ...prev,
        story: {
          ...prev.story,
          selectedPatternIds: has
            ? prev.story.selectedPatternIds.filter((p) => p !== id)
            : [...prev.story.selectedPatternIds, id],
        },
      };
    });
  };

  const patchStory = (patch: Partial<typeof project.story>) => {
    setProject((prev) => ({ ...prev, story: { ...prev.story, ...patch } }));
  };

  const updateSceneText = (sceneNumber: number, text: string) => {
    setProject((prev) => ({
      ...prev,
      story: {
        ...prev.story,
        scenes: prev.story.scenes.map((s) =>
          s.sceneNumber === sceneNumber ? { ...s, text, textSource: 'user' as const } : s,
        ),
      },
      // 조판 텍스트 슬롯 동기화 (렌더러가 슬롯 text를 우선 사용)
      layout: {
        ...prev.layout,
        pages: prev.layout.pages.map((p) =>
          p.sceneNumber === sceneNumber
            ? { ...p, slots: p.slots.map((sl) => (sl.slotId === 'text-1' ? { ...sl, text } : sl)) }
            : p,
        ),
      },
    }));
  };

  const approve = async () => {
    setProject((prev) => ({ ...prev, story: { ...prev.story, approved: true } }));
    await save();
  };

  const hasStory = project.story.scenes.length > 0 && !!project.story.idea;
  // "내가 쓴 글 그대로" 원고는 게이트 통과 여부와 무관하게 바로 승인할 수 있다
  // (참고용 피드백은 보여주되 원문을 고치라고 강제하지 않음 — story/import 라우트 참고).
  const allUserText = project.story.scenes.length > 0 && project.story.scenes.every((s) => s.textSource === 'user');
  const canApprove = gatePassed || allUserText;

  // 처음 진입 — 갈래 3개 중 하나를 고를 때까지는 편집 화면 대신 선택 카드만 보여준다.
  if (!hasStory && entryMode === null) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <StepBar project={project} active="story" />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-6">
          <h1 className="mb-2 text-xl font-bold">어떻게 시작할까요?</h1>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            <EntryCard
              icon="🪄"
              title="아이디어만 던지기"
              desc="한 줄 아이디어만 주면 AI가 스토리를 전부 만들어요"
              onClick={() => setEntryMode('idea')}
            />
            <EntryCard
              icon="💬"
              title="작가도우미와 대화"
              desc="등장인물부터 하나씩 함께 정하며 만들어요"
              onClick={openBrainstorm}
            />
            <EntryCard
              icon="📝"
              title="내가 쓴 글 그대로"
              desc="이미 써온 원고를 그대로 쓰고 그림만 붙여요"
              onClick={() => setEntryMode('paste')}
            />
          </div>
        </div>
      </div>
    );
  }

  // "내가 쓴 글 그대로" — 붙여넣기 전용 화면 (스토리 생성 전까지)
  if (!hasStory && entryMode === 'paste') {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <StepBar project={project} active="story" />
          <button
            onClick={() => setEntryMode(null)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-gray-300"
          >
            ← 다른 방법으로 시작
          </button>
        </div>
        {message && (
          <div className="border-b border-brand-100 bg-brand-50 px-6 py-2 text-xs text-gray-700">{message}</div>
        )}
        <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
          <h1 className="mb-1 text-lg font-bold">내가 쓴 글 그대로</h1>
          <p className="mb-4 text-xs text-gray-500">
            문장은 한 글자도 바꾸지 않아요. AI는 장면을 나누고, 그림 제작에 필요한 등장인물·배경 정보만 뽑습니다.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={14}
            placeholder="완성한 동화 원고를 여기 붙여넣으세요…"
            className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm leading-relaxed"
          />
          <div className="mt-3 flex items-end gap-3">
            <label className="text-xs text-gray-500">
              장면 수
              <select
                value={SCENE_COUNT_PRESETS.includes(project.story.sceneCount) ? project.story.sceneCount : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') patchStory({ sceneCount: Number(e.target.value) });
                }}
                className="mt-1 block rounded border border-gray-300 p-1.5"
              >
                {SCENE_COUNT_PRESETS.map((n) => (
                  <option key={n} value={n}>{n}장면</option>
                ))}
                <option value="custom">직접 입력…</option>
              </select>
            </label>
            {!SCENE_COUNT_PRESETS.includes(project.story.sceneCount) && (
              <label className="text-xs text-gray-500">
                직접 입력
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={project.story.sceneCount}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (Number.isFinite(n)) patchStory({ sceneCount: Math.min(40, Math.max(4, n)) });
                  }}
                  className="mt-1 block w-20 rounded border border-gray-300 p-1.5"
                />
              </label>
            )}
            <button
              onClick={importStory}
              disabled={busy !== null || !isPersisted || !pasteText.trim()}
              className="ml-auto rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy === '원고 가져오기' ? '나누는 중…' : '장면으로 나누기'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <StepBar project={project} active="story" />
        <div className="flex items-center gap-2">
          {!isPersisted && (
            <span className="text-xs text-amber-600">목업 미리보기 — 대시보드에서 책을 만들면 저장됩니다</span>
          )}
          <button
            onClick={save}
            disabled={saving || !isPersisted}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-60"
          >
            {saving ? '저장 중…' : '수정 저장'}
          </button>
          <button
            onClick={approve}
            disabled={saving || !canApprove}
            title={canApprove ? undefined : '품질 게이트 5종을 통과해야 승인할 수 있습니다'}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {project.story.approved ? '스토리 승인됨 ✓' : canApprove ? '스토리 승인' : '승인 (게이트 통과 필요)'}
          </button>
        </div>
      </div>

      {message && (
        <div className="border-b border-brand-100 bg-brand-50 px-6 py-2 text-xs text-gray-700">{message}</div>
      )}

      <ThreePane
        leftTitle="스토리 설정 · 플롯 패턴"
        rightTitle="품질 게이트 · 장면 수정"
        left={
          <div className="space-y-4">
            <button
              onClick={openBrainstorm}
              disabled={busy !== null || !isPersisted}
              className={[
                'w-full rounded-lg border py-2 text-xs font-semibold',
                brainstormMode
                  ? 'border-brand-400 bg-brand-50 text-brand-600'
                  : 'border-dashed border-brand-300 text-brand-600 hover:bg-brand-50',
              ].join(' ')}
            >
              💬 AI 작가도우미와 브레인스토밍
            </button>
            {brainstormMode && (
              <button
                onClick={() => setBrainstormMode(false)}
                className="w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 hover:border-gray-300"
              >
                장면 카드로 돌아가기
              </button>
            )}
            <div className="space-y-2 text-xs">
              <label className="block text-gray-500">
                아이디어
                <textarea
                  value={project.story.idea}
                  onChange={(e) => patchStory({ idea: e.target.value })}
                  rows={3}
                  placeholder="예: 겁 많은 아기 토끼가 폭풍 속에서 친구를 구하는 이야기"
                  className="mt-1 w-full resize-none rounded border border-gray-300 p-2"
                />
              </label>
              <label className="block text-gray-500">
                대상 연령
                <input
                  type="text"
                  value={project.story.targetAge}
                  onChange={(e) => patchStory({ targetAge: e.target.value })}
                  className="mt-1 w-full rounded border border-gray-300 p-1.5"
                />
              </label>
              <label className="block text-gray-500">
                분량
                <select
                  value={SCENE_COUNT_PRESETS.includes(project.story.sceneCount) ? project.story.sceneCount : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') setCustomCount(true);
                    else {
                      setCustomCount(false);
                      patchStory({ sceneCount: Number(e.target.value) });
                    }
                  }}
                  className="mt-1 w-full rounded border border-gray-300 p-1.5"
                >
                  {SCENE_COUNT_PRESETS.map((n) => (
                    <option key={n} value={n}>{n}장면</option>
                  ))}
                  <option value="custom">직접 입력…</option>
                </select>
              </label>
              {(customCount || !SCENE_COUNT_PRESETS.includes(project.story.sceneCount)) && (
                <label className="block text-gray-500">
                  장면 수 직접 입력 (4~40)
                  <input
                    type="number"
                    min={4}
                    max={40}
                    value={project.story.sceneCount}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (Number.isFinite(n)) patchStory({ sceneCount: Math.min(40, Math.max(4, n)) });
                    }}
                    className="mt-1 w-full rounded border border-gray-300 p-1.5"
                  />
                </label>
              )}
              <label className="block text-gray-500">
                원하는 느낌
                <input
                  type="text"
                  value={project.story.desiredMood}
                  onChange={(e) => patchStory({ desiredMood: e.target.value })}
                  placeholder="예: 조마조마하다가 뭉클하게"
                  className="mt-1 w-full rounded border border-gray-300 p-1.5"
                />
              </label>
              <button
                onClick={generateStory}
                disabled={busy !== null || !isPersisted || !project.story.idea.trim()}
                className="w-full rounded-lg bg-brand-500 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy === '스토리 생성' ? '생성 중… (초안 2개 비교, 1~2분)' : hasStory ? '스토리 다시 생성 (AI)' : '스토리 생성 (AI)'}
              </button>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-gray-500">플롯 패턴 (비우면 AI 자동 선택)</div>
              <div className="space-y-2">
                {PLOT_PATTERNS.map((p) => {
                  const selected = project.story.selectedPatternIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePattern(p.id)}
                      className={[
                        'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                        selected ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300',
                      ].join(' ')}
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{p.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        }
        center={
          brainstormMode ? (
            <div className="flex h-full flex-col">
              <div className="mb-2 flex items-center justify-between">
                <h1 className="text-lg font-bold">작가도우미와 브레인스토밍</h1>
                <button
                  onClick={resetChat}
                  disabled={busy !== null}
                  className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-gray-300 disabled:opacity-50"
                >
                  대화 다시 시작
                </button>
              </div>
              <p className="mb-3 text-xs text-gray-400">
                등장인물 → 배경 → 사건 → 느낌 → 연령 순서로 함께 정리합니다. 막히면 도우미가 예시를 제안해요.
              </p>
              <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
                {chatMessages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={[
                        'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                        m.role === 'user'
                          ? 'rounded-br-sm bg-brand-500 text-white'
                          : 'rounded-bl-sm border border-gray-200 bg-white text-gray-700',
                      ].join(' ')}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {busy === '작가도우미' && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400">
                      생각 중…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="mt-3 flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (busy === null) sendChat();
                    }
                  }}
                  rows={2}
                  placeholder="이야기하고 싶은 내용을 적어보세요… (Enter 전송, Shift+Enter 줄바꿈)"
                  className="flex-1 resize-none rounded-lg border border-gray-300 p-2 text-sm"
                />
                <button
                  onClick={sendChat}
                  disabled={busy !== null || !chatInput.trim()}
                  className="rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  전송
                </button>
              </div>
              <button
                onClick={finalizeAndGenerate}
                disabled={busy !== null || chatMessages.filter((m) => m.role === 'user').length === 0}
                className="mt-2 w-full rounded-lg border-2 border-brand-500 py-2.5 text-sm font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
              >
                {busy === '기획안 정리' || busy === '스토리 생성'
                  ? '정리·생성 중… (1~2분)'
                  : '✨ 정리해서 스토리 만들기 (기획안 → 장면 대본)'}
              </button>
              {project.story.brainstorm?.brief && (
                <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-gray-600">
                  <span className="font-semibold text-green-700">정리된 기획안:</span>{' '}
                  {project.story.brainstorm.brief.summary}
                  {project.story.brainstorm.brief.characters.length > 0 && (
                    <span className="text-gray-500">
                      {' '}
                      · 등장인물 {project.story.brainstorm.brief.characters.map((c) => c.name).join(', ')} (파트 2에 시드됨)
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <h1 className="text-lg font-bold">장면 카드</h1>
              <div className="grid grid-cols-2 gap-3">
                {project.story.scenes.map((s) => (
                  <SceneCard
                    key={s.sceneNumber}
                    scene={s}
                    active={s.sceneNumber === selectedScene}
                    onClick={() => setSelectedScene(s.sceneNumber)}
                    onChangeText={(text) => updateSceneText(s.sceneNumber, text)}
                  />
                ))}
              </div>
            </div>
          )
        }
        right={
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 font-semibold">선택된 장면 · {scene?.sceneNumber ?? '-'}</div>
              <div className="text-xs text-gray-500">비트: {scene?.beat}</div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-500">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-gray-700">품질 게이트</span>
                <button
                  onClick={runGate}
                  disabled={busy !== null || !isPersisted || project.story.scenes.length === 0}
                  className="rounded border border-brand-300 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                >
                  {busy === '품질 게이트' ? '채점·수리 중…' : '게이트 실행'}
                </button>
              </div>
              {project.story.qualityGate ? (
                <ul className="space-y-1">
                  {project.story.qualityGate.items.map((item) => (
                    <li key={item.label} className={item.passed ? 'text-green-600' : 'text-red-500'}>
                      {item.passed ? '✓' : '✗'} {item.label}
                      {!item.passed && item.note && (
                        <div className="ml-4 mt-0.5 text-[11px] text-gray-500">{item.note}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>아직 실행되지 않았습니다. 5종 기준 채점 → 미달 시 자동 수정(최대 2회) → 재채점.</p>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-3 text-xs">
              <div className="mb-2 font-semibold text-gray-700">이 장면 다시 쓰기 (AI)</div>
              {scene?.textSource === 'user' ? (
                <p className="text-gray-500">직접 수정한 장면은 AI가 덮어쓰지 않습니다 (원문 보존).</p>
              ) : (
                <>
                  <textarea
                    value={regenNote}
                    onChange={(e) => setRegenNote(e.target.value)}
                    rows={2}
                    placeholder="수정 지시 — 예: 더 조마조마하게, 대사 추가"
                    className="mb-2 w-full resize-none rounded border border-gray-300 p-2"
                  />
                  <button
                    onClick={regenScene}
                    disabled={busy !== null || !isPersisted || !regenNote.trim()}
                    className="w-full rounded-lg border border-gray-200 py-2 font-medium text-gray-600 hover:border-gray-300 disabled:opacity-50"
                  >
                    {busy === '장면 다시 쓰기' ? '다시 쓰는 중…' : '이 장면 다시 쓰기'}
                  </button>
                </>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}

function EntryCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-center hover:border-brand-400 hover:shadow-sm"
    >
      <span className="text-3xl">{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-gray-500">{desc}</span>
    </button>
  );
}

function SceneCard({
  scene,
  active,
  onClick,
  onChangeText,
}: {
  scene: Scene;
  active: boolean;
  onClick: () => void;
  onChangeText: (text: string) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        'cursor-pointer rounded-lg border p-3 transition-colors',
        active ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
        <span>#{scene.sceneNumber} · {scene.beat}</span>
        <span className={scene.textSource === 'user' ? 'text-brand-600' : ''}>
          {scene.textSource === 'user' ? '직접 수정' : 'AI'}
        </span>
      </div>
      <textarea
        value={scene.text}
        onChange={(e) => onChangeText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        rows={3}
        className="w-full resize-none rounded border border-transparent bg-transparent text-sm outline-none focus:border-gray-200"
      />
    </div>
  );
}
