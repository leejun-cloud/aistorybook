// 목업 시드 데이터. 실제 AI/스토리지 연동 전까지 화면을 채우는 용도.
// 새 프로젝트를 만들 때(lib/store.ts createProject)와, 프로젝트를 아직
// 아무것도 저장하지 않은 페이지들의 초기 상태로 쓰인다.

import { Character, LayoutTemplate, PlotPattern, Project, Scene } from './types';
import { RENDER_TEMPLATES } from './render/templates';

export const PLOT_PATTERNS: PlotPattern[] = [
  {
    id: 'quest',
    name: '여정형',
    description: '결핍 → 여정 → 시련 → 조력 → 귀환 (오디세이아형)',
    emotionCurve: '설렘으로 시작해 중반 좌절, 후반 조력을 통한 회복',
    ageRange: '5~9세',
    commonFailure: '조력자가 너무 쉽게 등장해 시련이 무의미해짐',
  },
  {
    id: 'transformation',
    name: '변화형',
    description: '약점 → 사건 → 선택 → 변화 (미운 오리 새끼형)',
    emotionCurve: '위축 → 계기 → 자기 발견의 기쁨',
    ageRange: '4~8세',
    commonFailure: '변화의 계기가 갑작스럽고 개연성이 없음',
  },
  {
    id: 'friendship',
    name: '우정형',
    description: '만남 → 오해 → 위기 → 화해 (샬롯의 거미줄형)',
    emotionCurve: '호기심 → 갈등의 긴장 → 화해의 따뜻함',
    ageRange: '5~9세',
    commonFailure: '오해가 대화 한 번으로 너무 쉽게 풀림',
  },
  {
    id: 'courage',
    name: '용기형',
    description: '두려움 → 회피 → 직면 계기 → 극복 (괴물들이 사는 나라형)',
    emotionCurve: '불안 → 망설임 → 직면의 카타르시스',
    ageRange: '4~7세',
    commonFailure: '두려움의 대상이 막판에 이유 없이 순해짐',
  },
  {
    id: 'kindness-ripple',
    name: '선행 파급형',
    description: '작은 선행 → 뜻밖의 연결 → 되돌아옴 (행복한 왕자형)',
    emotionCurve: '잔잔한 다정함 → 확산의 감동 → 되돌아오는 뭉클함',
    ageRange: '5~10세',
    commonFailure: '교훈을 마지막에 문장으로 직접 설명해버림',
  },
];

// prompt: 이미지 생성 프롬프트에 그대로 들어가는 영어 스타일 서술
// (라이브러리 스타일 선택 시 StyleSpec.description에 대입 — styleClause가 사용)
export const STYLE_LIBRARY = [
  {
    id: 'watercolor', name: '수채화', description: '번짐과 여백을 살린 부드러운 색감',
    prompt: 'soft watercolor with gentle color bleeding, light pencil outlines, generous white space and airy washes',
  },
  {
    id: 'colored-pencil', name: '색연필', description: '따뜻한 질감과 손그림 느낌',
    prompt: 'warm colored-pencil illustration with visible hand-drawn strokes, soft paper grain and cozy muted colors',
  },
  {
    id: 'gouache', name: '과슈', description: '불투명한 발색과 또렷한 형태',
    prompt: 'opaque gouache painting with flat vivid color blocks, crisp shapes and subtle brush texture',
  },
  {
    id: 'collage', name: '콜라주', description: '종이 질감을 살린 조형적 구성',
    prompt: 'paper-cut collage style with layered textured papers, torn edges and playful geometric composition',
  },
  {
    id: '3d-soft', name: '3D 소프트', description: '둥글고 포근한 3D 렌더 스타일',
    prompt: 'soft 3D render with rounded plump forms, matte clay-like surfaces and warm gentle studio lighting',
  },
  {
    id: 'folk', name: '민화풍', description: '한국 전통 민화의 색채와 구도',
    prompt: 'Korean traditional minhwa folk-painting style with bold obangsaek palette, flat decorative composition and ink outlines',
  },
];

// 출판 사례 스타일 — 실제 출판 그림책들에서 검증된 미학 계열을 "재사용 가능한 스타일
// 특성"으로만 서술한 프리셋 (PRD §2.1/§5.7 저작권 원칙: 특정 작품·캐릭터·구도는
// 지칭하지 않는다). 스타일 프롬프트 + 어울리는 분위기 + 조판(글 상자) 기본값까지
// 한 번에 복제한다. 특정 출판본의 그림을 직접 참조하려면 "참고 그림 업로드"를 사용.
export interface PublishedStylePreset {
  id: string;
  name: string;
  description: string;
  /** 이미지 생성 프롬프트용 스타일 서술 (영어) */
  prompt: string;
  /** 이 계열이 흔히 쓰는 분위기 — 스토리 "원하는 느낌" 제안값 */
  mood: string;
  /** 조판 분위기: 그림 위 글 처리 기본값 */
  textBox: 'box' | 'none';
}

export const PUBLISHED_STYLE_PRESETS: PublishedStylePreset[] = [
  {
    id: 'classic-euro-watercolor',
    name: '클래식 유럽 수채',
    description: '섬세한 담채 수채 + 가는 잉크 선, 자연 관찰 디테일 (영국 고전 그림책 계열)',
    prompt:
      'classic European storybook watercolor: delicate transparent washes, fine sepia ink outlines, ' +
      'naturalistic botanical detail, soft cream paper background with generous white margins, vintage gentle palette',
    mood: '잔잔하고 고전적인, 오후의 티타임 같은',
    textBox: 'box',
  },
  {
    id: 'tissue-collage',
    name: '티슈페이퍼 콜라주',
    description: '손으로 칠한 색지 콜라주, 대담한 형태와 원색 (미국 콜라주 그림책 계열)',
    prompt:
      'hand-painted tissue-paper collage: bold simple animal and object shapes cut from vividly painted textured papers, ' +
      'visible brush strokes inside each shape, bright saturated primaries on clean white background',
    mood: '경쾌하고 리듬감 있는',
    textBox: 'none',
  },
  {
    id: 'nordic-flat',
    name: '북유럽 미니멀 플랫',
    description: '절제된 팔레트의 평면 도형, 기하학적 구성 (스칸디나비아 그림책 계열)',
    prompt:
      'Scandinavian flat illustration: simplified geometric shapes, limited palette of 4-5 muted colors plus one accent, ' +
      'no outlines, subtle paper grain, lots of negative space, mid-century picture-book poster feel',
    mood: '담백하고 위트 있는',
    textBox: 'none',
  },
  {
    id: 'anime-bg-lush',
    name: '따뜻한 애니메이션 배경풍',
    description: '풍성한 회화적 배경, 따뜻한 빛과 하늘 (일본 극장 애니메이션 배경미술 계열)',
    prompt:
      'warm painterly animation background art: lush detailed natural scenery, glowing sunlight and volumetric clouds, ' +
      'rich greens and sky blues, soft gouache-like rendering, nostalgic summer atmosphere, high background density',
    mood: '뭉클하고 그리운, 여름 방학 같은',
    textBox: 'none',
  },
  {
    id: 'pencil-spot-color',
    name: '연필 소묘 + 포인트 색',
    description: '흑백 연필 소묘에 한 가지 색만 살린 절제된 화면 (모노톤 그림책 계열)',
    prompt:
      'expressive graphite pencil drawing in warm gray monochrome with soft cross-hatching, ' +
      'exactly one accent color (warm red) reserved for the emotional focal object, textured sketchbook paper',
    mood: '고요하고 여운이 긴',
    textBox: 'box',
  },
  {
    id: 'oil-pastel-child',
    name: '오일파스텔 크레용',
    description: '두껍고 자유로운 크레용 질감, 아이 그림 같은 활력 (프랑스·유럽 현대 그림책 계열)',
    prompt:
      'thick oil-pastel and crayon illustration: bold energetic strokes with waxy texture, slightly wobbly childlike shapes ' +
      'drawn with confident intention, saturated joyful colors, visible layering and scribbled backgrounds',
    mood: '천진하고 에너지 넘치는',
    textBox: 'box',
  },
];

// 조판 템플릿의 정본은 lib/render/templates.ts (렌더러·추천 로직과 동일 정의).
// UI 미리보기와 최종 PDF가 같은 슬롯 좌표를 쓰도록 여기서도 그대로 사용한다.
export const LAYOUT_TEMPLATES: LayoutTemplate[] = RENDER_TEMPLATES;

function demoScenes(count: number): Scene[] {
  const beats = [
    '평범한 일상', '작은 결핍의 발견', '떠나기로 결심', '첫 번째 시련',
    '조력자를 만남', '더 큰 위기', '결정적 선택', '위기의 절정',
    '스스로의 극복', '되돌아오는 길', '변화한 모습', '따뜻한 마무리',
    '여운', '다음을 기약', '가족과의 재회', '마지막 한 문장',
  ];
  return Array.from({ length: count }, (_, i) => ({
    sceneNumber: i + 1,
    beat: beats[i % beats.length],
    text: `(장면 ${i + 1} 초안 문장이 여기 들어갑니다.)`,
    textSource: 'ai',
    characters: ['char-1'],
    location: '숲 속 오솔길',
    emotion: '설렘과 약간의 긴장',
    visualFocus: '주인공의 표정',
    preferredTextArea: 'lower-center',
  }));
}

export const DEMO_CHARACTERS: Character[] = [
  {
    id: 'char-1',
    name: '토토',
    description: '호기심 많은 아기 토끼. 겁이 많지만 마음이 따뜻하다.',
    candidates: [
      { id: 'cand-1', imageUrl: '' },
      { id: 'cand-2', imageUrl: '' },
      { id: 'cand-3', imageUrl: '' },
      { id: 'cand-4', imageUrl: '' },
    ],
    referenceImageUrl: '',
    textDNA: {
      fixed: ['긴 귀 한쪽이 접힘', '빨간 목도리', '갈색 반점'],
      forbidden: ['안경', '신발'],
    },
    confirmed: false,
  },
];

export function demoProject(): Project {
  const sceneCount = 12;
  return {
    id: 'demo',
    title: '제목 없는 동화책',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    story: {
      idea: '',
      targetAge: '5~7세',
      sceneCount,
      desiredMood: '따뜻하고 잔잔한',
      selectedPatternIds: ['courage'],
      scenes: demoScenes(sceneCount),
      approved: false,
    },
    character: {
      style: {
        source: 'library',
        referenceImageUrls: [],
        description: '',
        libraryStyleId: 'watercolor',
        copyrightAcknowledged: false,
      },
      characters: DEMO_CHARACTERS,
      approved: false,
    },
    layout: {
      templates: LAYOUT_TEMPLATES,
      pages: demoScenes(sceneCount).map((s) => ({
        sceneNumber: s.sceneNumber,
        templateId: LAYOUT_TEMPLATES[s.sceneNumber % LAYOUT_TEMPLATES.length].id,
        slots: [
          { slotId: 'image-1', imageStatus: 'idle' as const, candidates: [] },
          { slotId: 'text-1', text: s.text },
        ],
      })),
      approved: false,
    },
    publish: {
      coverOptions: [
        { id: 'cover-character', concept: 'character', imageUrl: '', title: '제목 없는 동화책' },
        { id: 'cover-scene', concept: 'scene', imageUrl: '', title: '제목 없는 동화책' },
        { id: 'cover-symbol', concept: 'symbol', imageUrl: '', title: '제목 없는 동화책' },
      ],
      outputs: {},
      approved: false,
    },
  };
}
