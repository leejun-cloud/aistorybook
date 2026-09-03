import { Suspense } from 'react';
import { StoryClient } from '../../components/story/StoryClient';

export default function StoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">불러오는 중…</div>}>
      <StoryClient />
    </Suspense>
  );
}
