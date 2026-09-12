import { listProjects } from '../../lib/store';
import { getViewer } from '../../lib/auth/require';
import { NewProjectButton } from '../../components/NewProjectButton';
import { ProjectCard } from '../../components/ProjectCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { user, uid, master } = await getViewer();
  const projects = await listProjects(uid, master);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-800">내 작업실</h1>
          <p className="mt-1 text-sm text-ink-400">
            아이디어를 넣으면 스토리 → 캐릭터·스타일 → 그림·조판 → 조절·인쇄 순서로 완성합니다.
          </p>
        </div>
        <NewProjectButton />
      </div>

      {!user && projects.length === 0 && (
        <div className="mb-6 rounded-xl border border-paper-300 bg-paper-50 p-4 text-sm text-ink-600">
          <p className="font-semibold text-ink-800">로그인하면 내 책만 따로 보관됩니다</p>
          <p className="mt-1 text-xs text-ink-400">
            이용권과 작업물은 계정별로 관리됩니다. 오른쪽 위에서 Google 계정으로 로그인해 주세요.
          </p>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paper-300 bg-white p-10 text-center text-ink-400">
          아직 만든 책이 없어요. &ldquo;새 책 만들기&rdquo;로 시작해보세요.
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </main>
  );
}
