import Link from 'next/link';
import { PART_LABELS, PART_ORDER, ProjectStatus, ProjectSummary, STATUS_LABELS } from '../lib/types';
import { SaveReferenceButton } from './SaveReferenceButton';

const STATUS_STYLE: Record<ProjectStatus, string> = {
  draft: 'bg-paper-200 text-ink-600',
  'in-progress': 'bg-sunset-400/20 text-sunset-600',
  'needs-fix': 'bg-red-100 text-red-700',
  ready: 'bg-emerald-100 text-emerald-700',
};

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const done = project.approvedParts.length;

  return (
    <li className="group relative rounded-2xl border border-paper-200 bg-white p-4 transition-shadow hover:shadow-md">
      <Link href={`/story?project=${encodeURIComponent(project.id)}`} className="flex gap-4">
        <div className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-paper-200 bg-paper-100">
          {project.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-ink-400">표지 전</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-serif text-base font-bold text-ink-800">{project.title}</h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[project.status]}`}>
              {STATUS_LABELS[project.status]}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
            <span>{project.sceneCount}장면</span>
            <span>현재: {PART_LABELS[project.currentPart]}</span>
            {project.auditScore !== undefined && <span>검수 {project.auditScore}점</span>}
            <span>{new Date(project.updatedAt).toLocaleDateString('ko-KR')} 수정</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {PART_ORDER.map((part) => (
                <span
                  key={part}
                  title={PART_LABELS[part]}
                  className={`h-1.5 flex-1 rounded-full ${
                    project.approvedParts.includes(part) ? 'bg-sunset-500' : 'bg-paper-200'
                  }`}
                />
              ))}
            </div>
            <span className="shrink-0 text-xs text-ink-400">{done}/4 승인</span>
          </div>
        </div>
      </Link>

      <div className="absolute right-4 top-4 text-xs opacity-0 transition-opacity group-hover:opacity-100">
        <SaveReferenceButton projectId={project.id} projectTitle={project.title} />
      </div>
    </li>
  );
}
