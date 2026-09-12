// 인쇄용 산출물 다운로드 잠금.
//
// 잠그는 것: 인쇄용 본문 PDF, 인쇄용 랩 표지 PDF, 최종 출판 패키지.
// 잠그지 않는 것: 열람용 미리보기 PDF — 결제 전에 결과물을 확인할 수 없으면
// 무엇을 사는지 모르는 채로 결제하게 된다.

import type { Project } from '../types';

export function isUnlocked(project: Project): boolean {
  return Boolean(project.publish.unlockedAt);
}

export const LOCKED_MESSAGE = '인쇄용 파일은 이용권으로 잠금을 해제한 뒤 내려받을 수 있습니다.';
