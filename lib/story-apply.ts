// 스토리 생성 결과(장면+cast)를 프로젝트에 반영하는 공통 로직.
// /api/story/generate(AI 생성)와 /api/story/import("내 글 그대로")가 공유한다 —
// 등장인물 자동 시드 + 조판 페이지 재구축은 입력 경로와 무관하게 동일해야 한다.

import type { Character, Project, Scene } from './types';
import type { StoryCastMember } from './ai/story';

/** 빈 플레이스홀더(후보·레퍼런스 없음) 캐릭터를 정리하고 cast를 미확정 캐릭터로 시드한다. */
export function seedCastCharacters(project: Project, cast: StoryCastMember[]): void {
  project.character.characters = project.character.characters.filter(
    (x) => x.confirmed || x.referenceImageUrl || x.candidates.some((cand) => cand.imageUrl),
  );
  for (const member of cast) {
    const existing = project.character.characters.find((x) => x.id === member.id || x.name === member.name);
    if (existing) {
      existing.description = member.description;
    } else {
      project.character.characters.push({
        id: member.id,
        name: member.name,
        description: member.description,
        candidates: [],
        textDNA: { fixed: [], forbidden: [] },
        confirmed: false,
      } satisfies Character);
    }
  }
}

/** 새 장면 목록에 맞춰 조판 페이지를 재구축한다 (이전 스토리의 페이지·이미지는 유지하지 않음). */
export function rebuildLayoutPages(project: Project, scenes: Scene[]): void {
  project.layout.pages = scenes.map((s, i) => ({
    sceneNumber: s.sceneNumber,
    templateId: project.layout.templates[i % project.layout.templates.length]?.id ?? 'L01',
    slots: [
      { slotId: 'image-1', imageStatus: 'idle' as const, candidates: [] },
      {
        slotId: 'text-1',
        text: s.text,
        ...(project.layout.textBoxDefault === 'none' ? { textBox: 'none' as const } : {}),
      },
    ],
  }));
  project.layout.approved = false;
}
