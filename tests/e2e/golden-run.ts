// E2E 골든 런 — 아이디어 한 줄 → 완성 PDF 3종까지 전체 파이프라인 1커맨드 검증.
//
//   npx tsx tests/e2e/golden-run.ts
//
// 실행 내용 (실제 Gemini 호출 — 이미지 약 20~30회 + 텍스트/vision 다수, 수 분 소요):
//   1. 프로젝트 생성 (파일시스템 저장소)
//   2. 스토리: best-of-N 초안 → 품질 게이트 (self-repair 최대 2회)
//   3. 캐릭터: 후보 4장 → 1장 확정 → 텍스트 DNA 추출
//   4. 장면 8개: 후보 2장 + DNA 일관성 자동 교정 루프 → 최고점 후보 확정 + 템플릿 추천
//   5. 표지 1방향 생성 → 책등 계산 → 랩 표지 PDF
//   6. 업스케일(300dpi) → 사전검사 → 본문 PDF 2종 (열람/인쇄)
//
// 결과: tests/e2e/run-record.json + 콘솔 요약. 게이트/사전검사 실패는 기록하되
// 파이프라인은 계속 진행한다 (어디까지 도달하는지가 이 테스트의 목적).

import fs from 'fs';
import path from 'path';

// .env.local 수동 로드 (Next.js 밖 실행)
{
  const envFile = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

import { createProject, saveProject } from '../../lib/store';
import { generateStoryDraft, runQualityGate, loadPatternLibrary } from '../../lib/ai/story';
import { generateCharacterCandidates, buildCharacterDNA, saveCharacterAsset } from '../../lib/ai/character';
import {
  generateSceneCandidatesVerified,
  selectSceneImage,
  recommendLayoutTemplate,
  type ProjectWithSceneJobs,
} from '../../lib/ai/scene';
import { RENDER_TEMPLATES } from '../../lib/render/templates';
import { STYLE_LIBRARY } from '../../lib/demo';
import { generateCoverOptions } from '../../lib/cover/generate';
import { getProfile, getInteriorPaper } from '../../lib/cover/profiles';
import { calculateSpine } from '../../lib/cover/spine';
import { renderWrapCoverPdf } from '../../lib/cover/wrap';
import { ensurePrintAssets } from '../../lib/render/upscale';
import { runPreflight } from '../../lib/preflight';
import { renderBookPdfs } from '../../lib/render/pdf';
import type { Character } from '../../lib/types';

const IDEA = '겁 많은 아기 고슴도치가 처음으로 밤 숲을 건너 아픈 할머니에게 꿀을 가져다주는 이야기';
const TARGET_AGE = '5~7세';
const SCENE_COUNT = 8 as const;
const MOOD = '조마조마하다가 포근하게';
const PATTERN_ID = 'courage';
const CHARACTER_NAME = '포리';
const CHARACTER_DESC =
  '겁 많은 아기 고슴도치. 둥근 몸에 부드러운 밤색 가시, 크고 맑은 갈색 눈, 배는 크림색. 작은 도토리 모자를 쓴다.';
const PROFILE_ID = 'bookk-2';
const PAPER = '백색모조 100g';

const t0 = Date.now();
const elapsed = () => `${Math.round((Date.now() - t0) / 1000)}s`;
const log = (msg: string) => console.log(`[${elapsed()}] ${msg}`);

interface RunRecord {
  ranAt: string;
  input: object;
  projectId?: string;
  story?: object;
  character?: object;
  scenes?: object[];
  cover?: object;
  upscale?: object;
  preflight?: object;
  pdfs?: object;
  totalSeconds?: number;
  errors: string[];
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 없음 (.env.local)');
  const record: RunRecord = {
    ranAt: new Date().toISOString(),
    input: { idea: IDEA, targetAge: TARGET_AGE, sceneCount: SCENE_COUNT, mood: MOOD, pattern: PATTERN_ID },
    errors: [],
  };

  // 1. 프로젝트 생성
  const project = createProject('밤 숲의 꿀단지') as ProjectWithSceneJobs;
  record.projectId = project.id;
  log(`프로젝트 생성: ${project.id}`);

  // 스타일: 라이브러리 수채화 (프롬프트 서술 포함)
  const style = STYLE_LIBRARY.find((s) => s.id === 'watercolor')!;
  project.character.style = {
    source: 'library',
    referenceImageUrls: [],
    description: style.prompt,
    libraryStyleId: style.id,
    copyrightAcknowledged: false,
  };
  project.character.characters = []; // 목업 시드 제거

  // 2. 스토리 (best-of-N + 게이트)
  log('스토리 초안 생성 (best-of-N)…');
  const patterns = loadPatternLibrary().filter((p) => p.id === PATTERN_ID);
  const draft = await generateStoryDraft({
    idea: IDEA,
    targetAge: TARGET_AGE,
    sceneCount: SCENE_COUNT,
    desiredMood: MOOD,
    patterns,
  });
  log(`초안 ${draft.length}장면 완성. 품질 게이트 실행…`);
  const gate = await runQualityGate(draft);
  project.story = {
    ...project.story,
    idea: IDEA,
    targetAge: TARGET_AGE,
    sceneCount: SCENE_COUNT,
    desiredMood: MOOD,
    selectedPatternIds: [PATTERN_ID],
    scenes: gate.revisedScenes,
    qualityGate: { passed: gate.passed, checkedAt: new Date().toISOString(), items: gate.items },
    approved: gate.passed,
  };
  // 조판 페이지 재구축 (story/generate 라우트와 동일)
  project.layout.pages = gate.revisedScenes.map((s, i) => ({
    sceneNumber: s.sceneNumber,
    templateId: RENDER_TEMPLATES[i % RENDER_TEMPLATES.length].id,
    slots: [
      { slotId: 'image-1', imageStatus: 'idle' as const, candidates: [] },
      { slotId: 'text-1', text: s.text },
    ],
  }));
  saveProject(project);
  record.story = {
    gatePassed: gate.passed,
    gateItems: gate.items,
    scenes: gate.revisedScenes.map((s) => ({ n: s.sceneNumber, beat: s.beat, text: s.text })),
  };
  log(`품질 게이트: ${gate.passed ? 'PASS ✓' : 'FAIL — ' + gate.items.filter((i) => !i.passed).map((i) => i.label).join(', ')}`);
  if (!gate.passed) record.errors.push('품질 게이트 미통과 (수리 2회 후에도)');

  // 3. 캐릭터
  log('캐릭터 후보 4장 생성…');
  const candResult = await generateCharacterCandidates(CHARACTER_DESC, project.character.style);
  if (!candResult.ok) throw new Error(`캐릭터 후보 생성 실패: ${candResult.error.message}`);
  const charId = 'hero';
  const candidates = candResult.candidates.map((c) => ({
    id: `${charId}-cand-${c.index}`,
    imageUrl: saveCharacterAsset(project.id, `${charId}-cand-${c.index}.png`, c.image),
    note: c.variation,
  }));
  log(`후보 ${candidates.length}장 저장. 1번 후보 확정 + DNA 추출…`);
  const chosen = candidates[0];
  const dnaResult = await buildCharacterDNA(candResult.candidates[0].image, CHARACTER_DESC);
  if (!dnaResult.ok) throw new Error(`DNA 추출 실패: ${dnaResult.error.message}`);
  const hero: Character = {
    id: charId,
    name: CHARACTER_NAME,
    description: CHARACTER_DESC,
    candidates,
    referenceImageUrl: chosen.imageUrl,
    textDNA: dnaResult.dna,
    confirmed: true,
  };
  project.character.characters = [hero];
  project.character.approved = true;
  saveProject(project);
  record.character = { dna: dnaResult.dna, referenceImageUrl: chosen.imageUrl };
  log(`DNA 추출 완료 — fixed ${dnaResult.dna.fixed.length} / props ${dnaResult.dna.recurringProps.length} / forbidden ${dnaResult.dna.forbidden.length}`);

  // 4. 장면 8개 — 생성 + 일관성 자동 교정 + 최고점 선택 + 템플릿 추천
  record.scenes = [];
  const recentTemplates: string[] = [];
  for (const scene of project.story.scenes) {
    log(`장면 ${scene.sceneNumber}/${SCENE_COUNT} 생성·검사…`);
    try {
      const v = await generateSceneCandidatesVerified(project, scene);
      saveProject(project);
      if (!v.ok || v.candidates.length === 0) {
        record.errors.push(`장면 ${scene.sceneNumber} 생성 실패`);
        record.scenes.push({ n: scene.sceneNumber, ok: false });
        continue;
      }
      // DNA 최고점 후보 선택
      const scoreOf = (id: string) => {
        const c = v.consistency.find((x) => x.candidateId === id);
        return c && c.result.ok ? c.result.score : -1;
      };
      const best = [...v.candidates].sort((a, b) => scoreOf(b.id) - scoreOf(a.id))[0];
      selectSceneImage(project, scene, best.id);
      const rec = await recommendLayoutTemplate(scene, RENDER_TEMPLATES, [...recentTemplates]);
      const page = project.layout.pages.find((p) => p.sceneNumber === scene.sceneNumber)!;
      page.templateId = rec.templateId;
      recentTemplates.push(rec.templateId);
      saveProject(project);
      record.scenes.push({
        n: scene.sceneNumber,
        ok: true,
        bestScore: v.bestScore,
        rounds: v.rounds,
        selected: best.id,
        template: rec.templateId,
        usedFallback: rec.usedFallback,
      });
      log(`  → DNA ${v.bestScore ?? '판단불가'}점 (라운드 ${v.rounds}) · 템플릿 ${rec.templateId}`);
    } catch (e) {
      record.errors.push(`장면 ${scene.sceneNumber}: ${(e as Error).message}`);
      record.scenes.push({ n: scene.sceneNumber, ok: false });
    }
  }
  project.layout.approved = project.layout.pages.every(
    (p) => p.slots.find((s) => s.slotId === 'image-1')?.imageUrl,
  );
  saveProject(project);

  // 5. 표지 (1방향 — 캐릭터 중심) + 책등 + 랩 표지 PDF
  log('표지 생성 (캐릭터 중심 1방향)…');
  const coverResult = await generateCoverOptions(project, ['character']);
  if (coverResult.ok) {
    project.publish.selectedCoverId = coverResult.options[0].id;
    saveProject(project);
    const profile = getProfile(PROFILE_ID)!;
    const paper = getInteriorPaper(profile, PAPER)!;
    const spine = calculateSpine({
      binding: 'perfect',
      paperThickness: paper.sheetThickness,
      pageCount: project.layout.pages.length + 1,
      formula: profile.spineFormula,
    });
    const { ensurePrintVariant } = await import('../../lib/render/upscale');
    await ensurePrintVariant(project.id, coverResult.options[0].imageUrl);
    const wrap = await renderWrapCoverPdf(project, {
      profile,
      spine,
      coverImageUrl: coverResult.options[0].imageUrl,
      title: project.title,
      author: 'AI 스토리북',
    });
    record.cover = { spineMm: spine.spineMm, pdf: wrap.pdfPath, dims: wrap.dims };
    log(`랩 표지 PDF 완료 — 책등 ${spine.spineMm}mm`);
  } else {
    record.errors.push('표지 생성 실패');
  }

  // 6. 업스케일 → 사전검사 → 본문 PDF 2종
  log('인쇄 변형본(300dpi) 생성…');
  const upscale = await ensurePrintAssets(project);
  record.upscale = {
    upscaled: upscale.filter((u) => u.action === 'upscaled').length,
    skipped: upscale.filter((u) => u.action === 'skipped').length,
  };
  log('사전검사 실행…');
  const preflight = await runPreflight(project, { profileId: PROFILE_ID });
  project.publish.preflight = preflight;
  saveProject(project);
  record.preflight = preflight;
  log(`사전검사: ${preflight.passed ? 'PASS ✓' : 'FAIL'}`);
  for (const item of preflight.items) log(`  ${item.passed ? '✓' : '✗'} ${item.label} — ${item.detail ?? ''}`);
  if (!preflight.passed) record.errors.push('사전검사 실패 항목 있음');

  log('본문 PDF 2종 렌더…');
  const pdfs = await renderBookPdfs(project);
  const kb = (p: string) => Math.round(fs.statSync(p).size / 1024);
  record.pdfs = {
    view: `${pdfs.viewingPdfPath} (${kb(pdfs.viewingPdfPath)}KB)`,
    print: `${pdfs.printPdfPath} (${kb(pdfs.printPdfPath)}KB)`,
  };
  log(`열람용 ${kb(pdfs.viewingPdfPath)}KB / 인쇄용 ${kb(pdfs.printPdfPath)}KB`);

  record.totalSeconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(process.cwd(), 'tests', 'e2e', 'run-record.json'), JSON.stringify(record, null, 2));
  log(`골든 런 완료 (${record.totalSeconds}s) — 기록: tests/e2e/run-record.json`);
  if (record.errors.length > 0) {
    console.log('\n⚠ 오류/미달 항목:');
    for (const e of record.errors) console.log('  -', e);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(`[${elapsed()}] 골든 런 중단:`, e.message);
  process.exit(1);
});
