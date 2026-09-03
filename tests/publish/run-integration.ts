// 파트 4 통합 테스트 (projects/book-scenetest — 파트 3의 코리 3장면):
//   0) DNA 일관성 검사 검증 — 파트 3의 의상 누출 이미지(scene-3-cand-1)를 실제로 잡아내는지
//   1) 슬롯 transform 수정 (§4.1)
//   2) 표지 3방향 생성 (캐릭터 레퍼런스 조건부, 이미지 호출 3회)
//   3) 1개 선택
//   4) 부크크2(B5) 프로파일 책등 계산 — 가정: 무선 · 백색모조 100g · 32p
//   5) 랩 표지 PDF + 본문 인쇄 PDF
//   6) 사전검사 실행
// 실행: npx tsx tests/publish/run-integration.ts
//   재실행 시 이미 생성된 표지가 있으면 이미지 생성을 건너뛴다 (--fresh로 강제 재생성).
// 산출물: tests/publish/output/ + run-record.json

import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const PROJECT_ID = 'book-scenetest';
const OUT_DIR = path.join(process.cwd(), 'tests', 'publish', 'output');

async function main() {
  const fresh = process.argv.includes('--fresh');
  const { loadProject, saveProject } = await import('../../lib/store');
  const { checkSceneConsistency } = await import('../../lib/ai/consistency');
  const { readCharacterAsset } = await import('../../lib/ai/character');
  const { generateCoverOptions } = await import('../../lib/cover/generate');
  const { getProfile, getInteriorPaper } = await import('../../lib/cover/profiles');
  const { calculateSpine } = await import('../../lib/cover/spine');
  const { renderWrapCoverPdf } = await import('../../lib/cover/wrap');
  const { renderBookPdfs } = await import('../../lib/render/pdf');
  const { runPreflight } = await import('../../lib/preflight');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const record: any = { ranAt: new Date().toISOString(), projectId: PROJECT_ID, imageCalls: 0, visionCalls: 0 };

  const project = loadProject(PROJECT_ID);
  if (!project) throw new Error(`프로젝트 없음: ${PROJECT_ID}`);
  const scene3 = project.story.scenes.find((s) => s.sceneNumber === 3)!;

  // ---- 0) DNA 일관성 검사 검증: 누출 이미지 vs 정상 이미지 -----------------
  console.log('0) DNA 일관성 검사 — scene-3-cand-1(의상 누출) / scene-3-cand-0(정상)');
  record.consistency = {};
  for (const name of ['scene-3-cand-1.png', 'scene-3-cand-0.png']) {
    const buf = readCharacterAsset(PROJECT_ID, name);
    if (!buf) throw new Error(`에셋 없음: ${name}`);
    const res = await checkSceneConsistency(project, scene3, buf);
    record.visionCalls++;
    if (!res.ok) throw new Error(`검사 실패 ${name}: ${res.error.message}`);
    record.consistency[name] = {
      passed: res.passed,
      score: res.score,
      summary: res.summary,
      violations: res.items.filter((i) => !i.ok).map((i) => `${i.kind}: ${i.element} — ${i.note ?? ''}`),
    };
    console.log(`   ${name}: ${res.passed ? 'PASS' : 'FAIL'} (score ${res.score}) — ${res.summary}`);
  }

  // ---- 1) 슬롯 transform 수정 (§4.1 — /api/edit/slot과 같은 클램프 규칙) ----
  console.log('1) 슬롯 transform 수정 — 페이지 2 그림 1.3배 확대 + 오른쪽 10% 이동');
  const page2 = project.layout.pages.find((p) => p.sceneNumber === 2)!;
  page2.transform = { scale: 1.3, offsetX: 0.1, offsetY: 0 };
  record.slotEdit = { sceneNumber: 2, transform: page2.transform };
  saveProject(project);

  // ---- 2) 표지 3방향 생성 (이미지 호출 3회) --------------------------------
  const hasCovers = project.publish.coverOptions.every((c) => c.imageUrl);
  if (fresh || !hasCovers) {
    console.log('2) 표지 3방향 생성 (캐릭터 레퍼런스 + 스타일 참고 조건부)…');
    const cov = await generateCoverOptions(project);
    record.imageCalls += 3;
    if (!cov.ok) throw new Error(`표지 생성 실패: ${JSON.stringify(cov.failures)}`);
    record.coverGeneration = {
      generated: cov.options.map((o) => ({ concept: o.concept, url: o.imageUrl })),
      failures: cov.failures.length,
    };
    saveProject(project);
  } else {
    console.log('2) 표지 이미 있음 — 생성 건너뜀 (--fresh로 강제)');
    record.coverGeneration = 'skipped (already generated)';
  }

  // ---- 3) 표지 1개 선택 ----------------------------------------------------
  const chosen = process.env.COVER_CONCEPT ?? 'character';
  const selected = project.publish.coverOptions.find((c) => c.concept === chosen && c.imageUrl)
    ?? project.publish.coverOptions.find((c) => c.imageUrl)!;
  project.publish.selectedCoverId = selected.id;
  record.selectedCover = selected.id;
  console.log(`3) 표지 선택: ${selected.id}`);

  // ---- 4) 책등 계산 — 부크크2(B5) · 무선 · 백색모조 100g · 32p -------------
  const profile = getProfile('bookk-2')!;
  const paper = getInteriorPaper(profile, '백색모조 100g')!;
  const spine = calculateSpine({
    binding: 'perfect',
    paperThickness: paper.sheetThickness,
    pageCount: 32,
    formula: profile.spineFormula,
  });
  record.spine = spine;
  console.log(`4) 책등: raw ${spine.rawMm.toFixed(2)}mm → ${spine.spineMm}mm, 텍스트 ${spine.canFitSpineText ? '가능' : '생략'}`);
  spine.warnings.forEach((w) => console.log(`   ⚠ ${w}`));

  // ---- 5) 랩 표지 PDF + 본문 인쇄 PDF -------------------------------------
  console.log('5) 랩 표지 PDF 렌더…');
  const cover = await renderWrapCoverPdf(
    project,
    { profile, spine, coverImageUrl: selected.imageUrl, title: project.title, author: '코리 팀' },
    OUT_DIR,
  );
  record.wrapCover = cover.dims;
  console.log(
    `   전체(재단 후) ${cover.dims.trimWidth}×${cover.dims.trimHeight}mm / PDF 페이지 ${cover.dims.pageWidth}×${cover.dims.pageHeight}mm`,
  );

  console.log('   본문 PDF 2종 렌더…');
  const body = await renderBookPdfs(project, OUT_DIR);
  record.bodyPdfs = { view: body.viewingPdfPath, print: body.printPdfPath };

  // ---- 6) 사전검사 ---------------------------------------------------------
  console.log('6) 사전검사 (부크크2 프로파일 기준)…');
  const preflight = await runPreflight(project, { profileId: 'bookk-2' });
  project.publish.preflight = preflight;
  record.preflight = preflight;
  preflight.items.forEach((i) =>
    console.log(`   ${i.passed ? (i.detail?.startsWith('WARN') ? '⚠' : '✓') : '✗'} ${i.label} — ${i.detail}`),
  );
  console.log(`   종합: ${preflight.passed ? 'PASS' : 'FAIL'}`);

  project.publish.outputs.printCoverPdfUrl = `/api/cover/render?projectId=${PROJECT_ID}`;
  saveProject(project);

  fs.writeFileSync(path.join(process.cwd(), 'tests', 'publish', 'run-record.json'), JSON.stringify(record, null, 2));
  console.log(`\n완료 — 이미지 호출 ${record.imageCalls}회, vision 호출 ${record.visionCalls}회`);
  console.log(`산출물: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
