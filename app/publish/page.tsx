import { Suspense } from 'react';
import { PublishClient } from '../../components/publish/PublishClient';

export default function PublishPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">불러오는 중…</div>}>
      <PublishClient />
    </Suspense>
  );
}
