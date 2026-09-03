// 파트 3 실측 통합 테스트: 코리 이야기 앞 3장면 × 후보 2장 생성 → 선택 →
// 템플릿 추천 → HTML 조판 → PDF 2종(열람/인쇄) 렌더.
// 실행: pnpm dlx tsx tests/scene/run-sample.ts
//   재실행 시 이미 생성된 후보가 있으면 이미지 생성을 건너뛴다 (--fresh로 강제 재생성).
//
// 입력 자산:
//   tests/story/sample-run.json     finalScenes (코리 12장면 중 앞 3장면 사용)
//   projects/book-mthcrush          확정 토끼 캐릭터(char-mthcstt1) + 스타일 참고
// 산출물: tests/scene/ (프로젝트 사본 projects/book-scenetest, PDF·HTML은 tests/scene/output)

import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SOURCE_PROJECT = 'book-mthcrush';
const TEST_PROJECT = 'book-scenetest';
const SCENE_COUNT = 3;

async function main() {
  const fresh = process.argv.includes('--fresh');
  const { loadProject, saveProject } = await import('../../lib/store');
  const { generateSceneImageCandidates, selectSceneImage, recommendLayoutTemplate } = await import(
    '../../lib/ai/scene'
  );
  const { RENDER_TEMPLATES } = await import('../../lib/render/templates');
  const { renderBookPdfs } = await import('../../lib/render/pdf');
  type ProjectWithSceneJobs = import('../../lib/ai/scene').ProjectWithSceneJobs;

  const record: any = { ranAt: new Date().toISOString(), imageCalls: 0, scenes: [] };

  // 1) 테스트 프로젝트 준비: book-mthcrush 사본 + 코리 3장면
  const srcDir = path.join(process.cwd(), 'projects', SOURCE_PROJECT);
  const dstDir = path.join(process.cwd(), 'projects', TEST_PROJECT);
  fs.mkdirSync(path.join(dstDir, 'assets'), { recursive: true });
  for (const f of fs.readdirSync(path.join(srcDir, 'assets'))) {
    const dst = path.join(dstDir, 'assets', f);
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(srcDir, 'assets', f), dst);
  }

  const sample = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tests', 'story', 'sample-run.json'), 'utf-8'),
  );
  const scenes = sample.finalScenes.slice(0, SCENE_COUNT);

  let project = loadProject(TEST_PROJECT) as ProjectWithSceneJobs | null;
  if (!project || fresh) {
    const base = loadProject(SOURCE_PROJECT)!;
    project = {
      ...base,
      id: TEST_PROJECT,
      title: '천하무적 냄비 모자',
      story: { ...base.story, sceneCount: 12, scenes, approved: true },
      layout: { templates: RENDER_TEMPLATES, pages: [], approved: false },
      sceneImageJobs: {},
    };
    // 확정 캐릭터 URL의 projectId 파라미터를 사본 프로젝트로 바꾼다
    const fix = (u: string) => u.replace(`projectId=${SOURCE_PROJECT}`, `projectId=${TEST_PROJECT}`);
    for (const c of project.character.characters) {
      if (c.referenceImageUrl) c.referenceImageUrl = fix(c.referenceImageUrl);
    }
    project.character.style.referenceImageUrls = project.character.style.referenceImageUrls.map(fix);
    saveProject(project);
  }

  // 2) 장면별 후보 2장 생성 (장면 단위 독립 — 한 장면 실패해도 계속)
  for (const scene of scenes) {
    const page = project.layout.pages.find((p) => p.sceneNumber === scene.sceneNumber);
    const existing = page?.slots.find((s) => s.slotId === 'image-1')?.candidates ?? [];
    if (!fresh && existing.length >= 2) {
      console.log(`장면 ${scene.sceneNumber}: 후보 ${existing.length}장 재사용`);
      continue;
    }
    console.log(`장면 ${scene.sceneNumber} 후보 생성 중... (${scene.beat})`);
    const t0 = Date.now();
    const res = await generateSceneImageCandidates(project, scene);
    record.imageCalls += 2;
    saveProject(project);
    console.log(
      `  → ${res.ok ? 'OK' : 'FAILED'} 후보 ${res.candidates.length}장, 실패 ${res.failures.length}, ${Date.now() - t0}ms, retryCount=${res.jobState.retryCount}`,
    );
    record.scenes.push({
      sceneNumber: scene.sceneNumber,
      beat: scene.beat,
      candidates: res.candidates.map((c: any) => c.id),
      failures: res.failures.map((f: any) => f.error.message),
      elapsedMs: Date.now() - t0,
    });
  }

  // 3) 후보 선택 (기본: cand-0. 육안 확인 후 tests/scene/selection.json으로 오버라이드 가능)
  const selPath = path.join(process.cwd(), 'tests', 'scene', 'selection.json');
  const overrides: Record<string, string> = fs.existsSync(selPath)
    ? JSON.parse(fs.readFileSync(selPath, 'utf-8'))
    : {};
  for (const scene of scenes) {
    const page = project.layout.pages.find((p) => p.sceneNumber === scene.sceneNumber);
    const cands = page?.slots.find((s) => s.slotId === 'image-1')?.candidates ?? [];
    if (cands.length === 0) continue;
    const chosen = overrides[String(scene.sceneNumber)] ?? cands[0].id;
    const sel = selectSceneImage(project, scene, chosen);
    console.log(`장면 ${scene.sceneNumber} 선택: ${chosen} → ${sel.ok ? 'OK' : sel.error}`);
  }

  // 4) 템플릿 추천 (Gemini, 3연속 방지는 코드)
  record.templates = [];
  const recent: string[] = [];
  for (const scene of scenes) {
    const rec = await recommendLayoutTemplate(scene, RENDER_TEMPLATES, recent);
    const page = project.layout.pages.find((p) => p.sceneNumber === scene.sceneNumber);
    if (page) page.templateId = rec.templateId;
    recent.push(rec.templateId);
    console.log(
      `장면 ${scene.sceneNumber} 템플릿: ${rec.templateId} (순위 ${rec.rankedIds.join('>')}${rec.usedFallback ? ', 폴백' : ''}) — ${rec.reason}`,
    );
    record.templates.push({ sceneNumber: scene.sceneNumber, ...rec });
  }
  saveProject(project);

  // 5) HTML 조판 + PDF 2종
  const outDir = path.join(process.cwd(), 'tests', 'scene', 'output');
  const pdfs = await renderBookPdfs(project, outDir, { sceneNumbers: scenes.map((s: any) => s.sceneNumber) });
  console.log('PDF:', pdfs.viewingPdfPath, pdfs.printPdfPath);
  record.outputs = pdfs;

  fs.writeFileSync(
    path.join(process.cwd(), 'tests', 'scene', 'run-record.json'),
    JSON.stringify(record, null, 2),
    'utf-8',
  );
  console.log('완료 — tests/scene/run-record.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
