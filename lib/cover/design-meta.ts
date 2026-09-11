// 표지 디자인 메타데이터 — 클라이언트 컴포넌트(CoverClient)에서 갤러리를 그릴 때 쓰는
// 순수 데이터 전용 파일. fs를 쓰는 lib/render/typst.ts를 물고 있는 lib/cover/designs.ts를
// 클라이언트에서 바로 import하면 브라우저 번들이 깨지므로, id/이름/설명/색상만 분리했다.
// 실제 렌더 로직(renderFront)은 designs.ts에서 이 목록을 확장해 정의한다.

import type { StyleSource } from '../types';

export interface CoverDesignMeta {
  id: string;
  name: string;
  description: string;
  backBg: string;
  spineBg: string;
}

export const COVER_DESIGN_META: CoverDesignMeta[] = [
  {
    id: 'classic-vignette',
    name: '클래식 비네트',
    description: '상단에 은은한 그림자 띠를 깔고 그 위에 큰 제목 — 차분하고 고전적인 그림책 표지',
    backBg: '#efe3cf',
    spineBg: '#d9c9ad',
  },
  {
    id: 'bottom-banner',
    name: '하단 띠 배너',
    description: '그림은 위쪽을 가득 채우고, 아래 도톰한 색 띠 위에 제목·작가명이 놓이는 경쾌한 구성',
    backBg: '#fbe9c9',
    spineBg: '#eac06b',
  },
  {
    id: 'minimal-frame',
    name: '미니멀 여백 프레임',
    description: '그림 둘레에 넉넉한 여백을 두고 제목은 그림 위쪽 작은 글씨로 — 절제된 북유럽풍',
    backBg: '#f5f2ea',
    spineBg: '#e4e0d4',
  },
  {
    id: 'warm-glow-lower',
    name: '하단 글로우',
    description: '그림 아래쪽에 부드러운 빛무리를 깔고 그 위에 제목 — 따뜻하고 그리운 분위기',
    backBg: '#3c3226',
    spineBg: '#4a3d2e',
  },
  {
    id: 'ornate-corner',
    name: '장식 코너',
    description: '네 모서리에 얇은 장식선을 두르고 제목은 중앙 상단에 — 민화·전통 색채에 어울림',
    backBg: '#8a2e2e',
    spineBg: '#6e2424',
  },
  {
    id: 'side-ribbon',
    name: '세로 리본',
    description: '왼쪽에 색 리본을 세로로 두고 그 위에 제목을 얹는 모던 에디토리얼 구성',
    backBg: '#2f3b4a',
    spineBg: '#3d4d60',
  },
];

const STYLE_TO_DESIGN: Record<string, string> = {
  watercolor: 'classic-vignette',
  'colored-pencil': 'warm-glow-lower',
  gouache: 'bottom-banner',
  collage: 'bottom-banner',
  '3d-soft': 'warm-glow-lower',
  folk: 'ornate-corner',
  'published:classic-euro-watercolor': 'classic-vignette',
  'published:tissue-collage': 'bottom-banner',
  'published:nordic-flat': 'minimal-frame',
  'published:anime-bg-lush': 'warm-glow-lower',
  'published:pencil-spot-color': 'minimal-frame',
  'published:oil-pastel-child': 'bottom-banner',
};

/** 파트 2 스타일 선택(libraryStyleId)에 어울리는 표지 디자인을 추천한다. 없으면 무난한 기본값. */
export function recommendCoverDesign(source: StyleSource, libraryStyleId?: string): string {
  if (source === 'library' && libraryStyleId && STYLE_TO_DESIGN[libraryStyleId]) {
    return STYLE_TO_DESIGN[libraryStyleId];
  }
  return 'classic-vignette';
}
