// 그림책 조판 템플릿 10종 (L01~L10, PRD §3.2 / v1.0 §8.8.3).
// lib/demo.ts의 목업 템플릿을 실제 조판용 정의로 대체한다 (demo.ts 자체는 건드리지 않음 —
// 렌더러와 추천 로직은 이 배열을 쓴다).
//
// 좌표는 정사각형 판면(210×210mm 트림) 기준 0~1 분수. 렌더러(html.ts)는 20×20 CSS Grid에
// 스냅해 배치하므로 좌표는 1/20(0.05) 배수로 맞춘다.
// 슬롯 id는 기존 PageLayout 데이터(demo.ts pages)와 호환되도록 image-1 / text-1 고정.

import type { LayoutTemplate } from '../types';

export const RENDER_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'L01',
    name: '풀블리드 + 하단 오버레이',
    description:
      '그림이 페이지 전체를 가득 채우고(풀블리드) 글은 하단 중앙의 반투명 상자 위에 얹힌다. 극적이고 몰입감 있는 장면, 짧은~중간 길이 글에 적합.',
    slots: [
      { id: 'image-1', type: 'image', x: 0, y: 0, width: 1, height: 1 },
      { id: 'text-1', type: 'text', x: 0.1, y: 0.8, width: 0.8, height: 0.15, align: 'center' },
    ],
  },
  {
    id: 'L02',
    name: '상단 그림 + 하단 텍스트 밴드',
    description:
      '그림이 위쪽 70%를 차지하고 글은 아래 흰 영역에 넉넉하게 들어간다. 글이 긴 서술 장면의 기본형.',
    slots: [
      { id: 'image-1', type: 'image', x: 0, y: 0, width: 1, height: 0.7 },
      { id: 'text-1', type: 'text', x: 0.1, y: 0.75, width: 0.8, height: 0.2, align: 'center' },
    ],
  },
  {
    id: 'L03',
    name: '좌측 그림 + 우측 텍스트 칼럼',
    description:
      '그림이 왼쪽 60%(세로 풀블리드), 글은 오른쪽 흰 칼럼에 세로로 흐른다. 긴 글, 차분한 서술 장면에 적합.',
    slots: [
      { id: 'image-1', type: 'image', x: 0, y: 0, width: 0.6, height: 1 },
      { id: 'text-1', type: 'text', x: 0.65, y: 0.2, width: 0.3, height: 0.6, align: 'left' },
    ],
  },
  {
    id: 'L04',
    name: '좌측 텍스트 칼럼 + 우측 그림',
    description:
      'L03의 거울상. 글이 왼쪽 흰 칼럼, 그림이 오른쪽 60%(세로 풀블리드). 시선이 글→그림으로 흐르는 전개 장면에 적합.',
    slots: [
      { id: 'text-1', type: 'text', x: 0.05, y: 0.2, width: 0.3, height: 0.6, align: 'left' },
      { id: 'image-1', type: 'image', x: 0.4, y: 0, width: 0.6, height: 1 },
    ],
  },
  {
    id: 'L05',
    name: '상단 텍스트 밴드 + 하단 그림',
    description:
      '글이 위 흰 밴드에 먼저 오고 그림이 아래 70%를 채운다. 글을 먼저 읽고 그림으로 내려가는 도입·설명 장면에 적합.',
    slots: [
      { id: 'text-1', type: 'text', x: 0.1, y: 0.05, width: 0.8, height: 0.2, align: 'center' },
      { id: 'image-1', type: 'image', x: 0, y: 0.3, width: 1, height: 0.7 },
    ],
  },
  {
    id: 'L06',
    name: '풀블리드 + 좌상단 오버레이',
    description:
      '풀블리드 그림 위 좌상단에 글 상자를 얹는다. preferredTextArea가 upper-left/upper-center인 극적 장면에 적합. 짧은 글 전용.',
    slots: [
      { id: 'image-1', type: 'image', x: 0, y: 0, width: 1, height: 1 },
      { id: 'text-1', type: 'text', x: 0.05, y: 0.05, width: 0.5, height: 0.25, align: 'left' },
    ],
  },
  {
    id: 'L07',
    name: '풀블리드 + 우하단 오버레이',
    description:
      '풀블리드 그림 위 우하단에 글 상자를 얹는다. preferredTextArea가 lower-right인 극적·감정적 장면에 적합. 짧은 글 전용.',
    slots: [
      { id: 'image-1', type: 'image', x: 0, y: 0, width: 1, height: 1 },
      { id: 'text-1', type: 'text', x: 0.45, y: 0.7, width: 0.5, height: 0.25, align: 'left' },
    ],
  },
  {
    id: 'L08',
    name: '비네트(작은 그림) + 하단 텍스트',
    description:
      '그림이 중앙의 액자형 비네트(70%×60%)로 작게 들어가고 주변은 여백. 조용하고 사적인 순간, 호흡을 늦추는 장면에 적합.',
    slots: [
      { id: 'image-1', type: 'image', x: 0.15, y: 0.1, width: 0.7, height: 0.6 },
      { id: 'text-1', type: 'text', x: 0.15, y: 0.75, width: 0.7, height: 0.2, align: 'center' },
    ],
  },
  {
    id: 'L09',
    name: '우측 세로 그림 + 좌상단 텍스트',
    description:
      '그림이 오른쪽 65%를 세로로 가득 채우고 글은 좌상단의 좁은 칼럼에. 세로 움직임(오르기·떨어지기·비)이 있는 장면에 적합.',
    slots: [
      { id: 'text-1', type: 'text', x: 0.05, y: 0.1, width: 0.25, height: 0.5, align: 'left' },
      { id: 'image-1', type: 'image', x: 0.35, y: 0, width: 0.65, height: 1 },
    ],
  },
  {
    id: 'L10',
    name: '풀블리드 + 상단 중앙 밴드',
    description:
      '풀블리드 그림 위 상단 중앙에 가로 글 밴드를 얹는다. 하늘·풍경이 위에 펼쳐지는 절정·전환 장면에 적합. 한두 문장 전용.',
    slots: [
      { id: 'image-1', type: 'image', x: 0, y: 0, width: 1, height: 1 },
      { id: 'text-1', type: 'text', x: 0.15, y: 0.05, width: 0.7, height: 0.15, align: 'center' },
    ],
  },
];

export function getTemplate(id: string): LayoutTemplate {
  return RENDER_TEMPLATES.find((t) => t.id === id) ?? RENDER_TEMPLATES[0];
}

// 글 영역의 위치·정렬이 서로 다른 템플릿을 한 책 안에서 섞어 쓰면(예: 페이지마다
// 좌상단→우하단→좌측 칼럼) 책 전체의 통일감이 깨져 보인다. 한 책 안에서는 같은
// "글자 방향 계열"끼리만 순환하도록 그룹을 나눈다 — recommendLayoutTemplate이 첫
// 페이지에서 정해진 계열로 이후 페이지 추천을 제한하는 데 쓴다.
export const TEMPLATE_FAMILIES: Record<string, string[]> = {
  'bottom-center': ['L01', 'L02', 'L08'],
  'top-center': ['L05', 'L10'],
  'side-column': ['L03', 'L04', 'L09'],
  corner: ['L06', 'L07'],
};

export function familyOf(templateId: string): string | null {
  for (const [family, ids] of Object.entries(TEMPLATE_FAMILIES)) {
    if (ids.includes(templateId)) return family;
  }
  return null;
}

// 계열을 하나로 완전히 고정하면, 그림 구도나 글 길이가 그 계열에 안 맞는 장면(예:
// "corner" 계열은 글이 짧을 때 전용인데 그 장면만 글이 길 때)에 무리하게 욱여넣게
// 된다. 계열 고정은 유지하되, 어떤 계열에도 무난하게 섞이는 범용 템플릿 2~3개를
// 예비 선택지로 항상 같이 둬서 그림/글 사정에 따른 예외를 허용한다.
export const UNIVERSAL_TEMPLATES = ['L01', 'L02', 'L08'];
