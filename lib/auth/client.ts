'use client';

// 브라우저 쪽 Firebase 인증. 로그인 성공 시 받은 ID 토큰을 /api/auth/session으로
// 넘겨 httpOnly 세션 쿠키로 바꾼다 — 이후 서버 요청은 쿠키만으로 사용자를 안다.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** 클라이언트 키가 빌드에 들어가 있는지 — 없으면 로그인 버튼을 숨긴다 */
export function authAvailable(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

function app(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

function auth(): Auth {
  return getAuth(app());
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth(), provider);
  const idToken = await cred.user.getIdToken();

  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    // 서버 세션을 못 만들었으면 클라이언트 로그인 상태도 되돌린다 (반쪽 로그인 방지)
    await fbSignOut(auth()).catch(() => {});
    throw new Error(d.error ?? '로그인 처리에 실패했습니다.');
  }
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' });
  await fbSignOut(auth()).catch(() => {});
}
