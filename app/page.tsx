import Link from 'next/link';
import { listProjects } from '../lib/store';
import { PART_LABELS } from '../lib/types';
import { NewProjectButton } from '../components/NewProjectButton';
import { SaveReferenceButton } from '../components/SaveReferenceButton';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const projects = listProjects();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">내 동화책</h1>
          <p className="mt-1 text-sm text-gray-500">
            아이디어를 넣으면 스토리 → 캐릭터·스타일 → 그림·조판 → 조절·인쇄 순서로 완성합니다.
          </p>
        </div>
        <NewProjectButton />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-400">
          아직 만든 책이 없어요. &ldquo;새 책 만들기&rdquo;로 시작해보세요.
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/story?project=${encodeURIComponent(p.id)}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 hover:shadow-sm"
              >
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    마지막 수정 {new Date(p.updatedAt).toLocaleString('ko-KR')}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <SaveReferenceButton projectId={p.id} projectTitle={p.title} />
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-600">
                    현재: {PART_LABELS[p.currentPart]}
                  </span>
                  <span className="text-gray-400">{p.approvedParts.length}/4 파트 승인</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
