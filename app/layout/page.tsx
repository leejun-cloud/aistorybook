import { Suspense } from 'react';
import { LayoutClient } from '../../components/layout/LayoutClient';

export default function LayoutPartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">불러오는 중…</div>}>
      <LayoutClient />
    </Suspense>
  );
}
