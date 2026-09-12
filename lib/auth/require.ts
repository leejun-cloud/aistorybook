// 라우트에서 로그인 사용자를 꺼내는 공통 헬퍼.
//
// 인증이 설정되지 않은 배포(로컬 개발 등)에서는 'local' 계정 하나로 동작한다.
// 다만 결제가 걸린 동작은 requireUser()를 써서 반드시 로그인을 요구한다 —
// 로그인 없이 결제를 열면 잔액이 전체 공유되어 남의 이용권을 쓸 수 있다.

import { NextResponse } from 'next/server';
import { authConfigured } from './admin';
import { currentUser, isMaster, type SessionUser } from './session';
import { canAccess, loadProject } from '../store';
import type { Project } from '../types';

export interface Viewer {
  user: SessionUser | null;
  /** 데이터 구분 키 — 로그인했으면 uid, 인증 미설정 배포면 'local' */
  accountKey: string;
  /** 프로젝트 소유자 비교용 uid. 인증 미설정이면 null(소유자 없음과 동일 취급) */
  uid: string | null;
  master: boolean;
}

export async function getViewer(): Promise<Viewer> {
  const user = await currentUser();
  if (user) {
    return { user, accountKey: user.uid, uid: user.uid, master: isMaster(user) };
  }
  // 인증이 아예 없는 배포 = 1인 로컬 사용. 운영자 권한으로 둬야 기존 프로젝트가 보인다.
  if (!authConfigured()) {
    return { user: null, accountKey: 'local', uid: null, master: true };
  }
  return { user: null, accountKey: 'anonymous', uid: null, master: false };
}

/** 로그인 필수 동작용. 로그인이 없으면 401 응답을 돌려준다. */
export async function requireUser(): Promise<{ viewer: Viewer } | { error: NextResponse }> {
  const viewer = await getViewer();
  if (!viewer.user) {
    return {
      error: NextResponse.json(
        { error: '로그인이 필요합니다. 이용권은 계정별로 관리됩니다.', needsLogin: true },
        { status: 401 },
      ),
    };
  }
  return { viewer };
}

/**
 * 프로젝트를 여는 라우트 공통 진입점. 존재 확인과 소유권 확인을 함께 한다.
 *
 * 이걸 쓰지 않고 loadProject를 직접 부르면 projectId만 알면 남의 원고를 읽고
 * 고칠 수 있다 — 새 라우트를 만들 때도 이 함수를 쓸 것.
 */
export async function loadOwnedProject(
  projectId: string | null | undefined,
): Promise<{ project: Project; viewer: Viewer } | { error: NextResponse }> {
  if (!projectId) {
    return { error: NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 }) };
  }

  const viewer = await getViewer();
  const project = await loadProject(projectId);
  if (!project) {
    return { error: NextResponse.json({ error: 'project 없음' }, { status: 404 }) };
  }
  if (!canAccess(project, viewer.uid, viewer.master)) {
    return {
      error: NextResponse.json({ error: '이 프로젝트에 접근할 수 없습니다' }, { status: 403 }),
    };
  }
  return { project, viewer };
}
