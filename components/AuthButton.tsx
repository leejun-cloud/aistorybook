'use client';

import { useCallback, useEffect, useState } from 'react';
import { authAvailable, signInWithGoogle, signOut } from '../lib/auth/client';

interface Me {
  authEnabled: boolean;
  user: { uid: string; email?: string; name?: string; picture?: string } | null;
}

/** 헤더 로그인 버튼. 인증이 설정되지 않은 배포에서는 아무것도 렌더하지 않는다. */
export function AuthButton() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(refresh, [refresh]);

  if (!me?.authEnabled || !authAvailable()) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      // 서버 컴포넌트(대시보드 목록)가 새 세션으로 다시 그려져야 한다
      window.location.reload();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('popup-closed') || msg.includes('cancelled') ? null : msg);
      setBusy(false);
    }
  };

  if (me.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[12rem] truncate text-xs text-ink-400 sm:block">
          {me.user.name ?? me.user.email}
        </span>
        <button
          onClick={() => run(signOut)}
          disabled={busy}
          className="rounded-full border border-paper-300 px-3 py-1.5 text-xs text-ink-600 hover:bg-paper-100 disabled:opacity-50"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="hidden text-xs text-red-600 sm:block">{error}</span>}
      <button
        onClick={() => run(signInWithGoogle)}
        disabled={busy}
        className="rounded-full bg-ink-800 px-4 py-1.5 text-xs font-semibold text-paper-50 hover:bg-ink-600 disabled:opacity-50"
      >
        {busy ? '로그인 중…' : 'Google로 로그인'}
      </button>
    </div>
  );
}
