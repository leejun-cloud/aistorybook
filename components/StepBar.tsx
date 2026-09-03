'use client';

import Link from 'next/link';
import { PART_LABELS, PART_ORDER, Project, ProjectPartKey } from '../lib/types';

const PART_HREF: Record<ProjectPartKey, string> = {
  story: '/story',
  character: '/character',
  layout: '/layout',
  publish: '/publish',
};

export function StepBar({ project, active }: { project: Project; active: ProjectPartKey }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {PART_ORDER.map((part, i) => {
        const approved = project[part].approved;
        const isActive = part === active;
        return (
          <li key={part} className="flex items-center gap-2">
            <Link
              href={`${PART_HREF[part]}?project=${encodeURIComponent(project.id)}`}
              className={[
                'flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors',
                isActive
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : approved
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                  isActive ? 'bg-white text-brand-600' : approved ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500',
                ].join(' ')}
              >
                {approved ? '✓' : i + 1}
              </span>
              {PART_LABELS[part]}
            </Link>
            {i < PART_ORDER.length - 1 && <span className="text-gray-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
