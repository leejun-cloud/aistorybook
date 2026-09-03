import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { extractStyleFromReference, saveCharacterAsset } from '../../../../lib/ai/character';

export const maxDuration = 300;

// POST /api/style/extract  (multipart/form-data)
// fields: projectId, copyrightAcknowledged ("true" 필수 — PRD §2.1 저작권 동의)
// files:  images (1~3장)
// → 업로드 이미지를 projects/<id>/assets/에 저장하고, 스타일 서술
//   (재료·선·팔레트·질감·배경밀도)을 추출해 project.character.style에 기록한다.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data가 필요합니다' }, { status: 400 });

  const projectId = String(form.get('projectId') ?? '');
  const acknowledged = String(form.get('copyrightAcknowledged') ?? '') === 'true';
  const files = form.getAll('images').filter((f): f is File => f instanceof File);

  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  if (!acknowledged) {
    return NextResponse.json({ error: '저작권 원칙 동의(copyrightAcknowledged=true)가 필요합니다' }, { status: 400 });
  }
  if (files.length === 0 || files.length > 3) {
    return NextResponse.json({ error: '참고 그림은 1~3장이어야 합니다' }, { status: 400 });
  }
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  const buffers: Buffer[] = [];
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const buf = Buffer.from(await files[i].arrayBuffer());
    buffers.push(buf);
    urls.push(await saveCharacterAsset(projectId, `style-ref-${i}.png`, buf));
  }

  const result = await extractStyleFromReference(buffers);
  if (!result.ok) {
    return NextResponse.json({ error: '스타일 추출 실패', detail: result.error }, { status: 502 });
  }

  project.character.style = {
    source: 'upload',
    referenceImageUrls: urls,
    description: result.style.summary,
    copyrightAcknowledged: true,
  };
  await saveProject(project);

  return NextResponse.json({ style: result.style, referenceImageUrls: urls });
}
