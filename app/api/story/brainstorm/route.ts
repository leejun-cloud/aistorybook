import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import {
  BRAINSTORM_GREETING,
  brainstormReply,
  finalizeBrainstorm,
} from '../../../../lib/ai/brainstorm';
import type { Character } from '../../../../lib/types';

export const maxDuration = 120;

// POST /api/story/brainstorm
// body: { projectId, action: 'start' | 'message' | 'finalize' | 'reset', message? }
//
//   start    → 대화 시작 (비어 있으면 도우미 인사 추가)
//   message  → 사용자 메시지 추가 + 도우미 답변 생성
//   finalize → 대화를 기획안(brief)으로 정리하고 스토리 입력(아이디어·연령·분위기)과
//              등장인물(파트 2에서 후보 생성할 수 있게 미확정 캐릭터로) 자동 채움
//   reset    → 대화 초기화
export async function POST(req: NextRequest) {
  const { projectId, action, message } = await req.json().catch(() => ({}));
  if (!projectId || !action) {
    return NextResponse.json({ error: 'projectId, action이 필요합니다' }, { status: 400 });
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  const bs = (project.story.brainstorm ??= { messages: [] });

  try {
    if (action === 'reset') {
      project.story.brainstorm = { messages: [] };
      await saveProject(project);
      return NextResponse.json({ brainstorm: project.story.brainstorm });
    }

    if (action === 'start') {
      if (bs.messages.length === 0) {
        bs.messages.push({ role: 'assistant', text: BRAINSTORM_GREETING });
        await saveProject(project);
      }
      return NextResponse.json({ brainstorm: bs });
    }

    if (action === 'message') {
      if (typeof message !== 'string' || !message.trim()) {
        return NextResponse.json({ error: 'message가 필요합니다' }, { status: 400 });
      }
      bs.messages.push({ role: 'user', text: message.trim() });
      const reply = await brainstormReply(bs.messages);
      bs.messages.push({ role: 'assistant', text: reply });
      await saveProject(project);
      return NextResponse.json({ brainstorm: bs });
    }

    if (action === 'finalize') {
      if (bs.messages.filter((m) => m.role === 'user').length === 0) {
        return NextResponse.json({ error: '대화 내용이 없습니다 — 먼저 도우미와 이야기해 보세요' }, { status: 400 });
      }
      const brief = await finalizeBrainstorm(bs.messages);
      bs.brief = brief;
      // 스토리 입력 자동 채움 (분량은 기존 설정 유지)
      project.story.idea = brief.idea;
      project.story.targetAge = brief.targetAge;
      if (brief.desiredMood) project.story.desiredMood = brief.desiredMood;
      // 목업 시드 등 빈 플레이스홀더 캐릭터(후보·레퍼런스 없음) 정리 후 시드
      project.character.characters = project.character.characters.filter(
        (x) => x.confirmed || x.referenceImageUrl || x.candidates.some((cand) => cand.imageUrl),
      );
      // 등장인물 → 파트 2 미확정 캐릭터로 시드 (같은 이름이 있으면 설명만 갱신)
      for (const c of brief.characters) {
        const existing = project.character.characters.find((x) => x.name === c.name);
        if (existing) {
          existing.description = c.description;
        } else {
          project.character.characters.push({
            id: `char-${Date.now().toString(36)}-${project.character.characters.length}`,
            name: c.name,
            description: c.description,
            candidates: [],
            textDNA: { fixed: [], forbidden: [] },
            confirmed: false,
          } satisfies Character);
        }
      }
      await saveProject(project);
      return NextResponse.json({ brainstorm: bs, story: project.story });
    }

    return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
