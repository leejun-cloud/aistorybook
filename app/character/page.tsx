import { Suspense } from 'react';
import { CharacterClient } from '../../components/character/CharacterClient';

export default function CharacterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">불러오는 중…</div>}>
      <CharacterClient />
    </Suspense>
  );
}
