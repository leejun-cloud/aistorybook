import { Suspense } from 'react';
import { CoverClient } from '../../components/cover/CoverClient';

export default function CoverPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">불러오는 중…</div>}>
      <CoverClient />
    </Suspense>
  );
}
