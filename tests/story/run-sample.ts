// 실측 테스트: 실제 Gemini 호출로 초안 생성 → 품질 게이트 → sample-run.json 저장.
// 실행: pnpm dlx tsx tests/story/run-sample.ts
import fs from 'fs';
import path from 'path';

// .env.local 로드 (Next 밖에서 실행하므로 직접 읽는다)
const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { generateStoryDraft, runQualityGate, loadPatternLibrary } = await import('../../lib/ai/story');

  const idea = '겁 많은 아기 토끼가 폭풍 속에서 친구를 구하는 이야기';
  const library = loadPatternLibrary();
  const patterns = library.filter((p) => p.id === 'courage');

  console.log('1) 초안 생성 중...');
  const t0 = Date.now();
  const { scenes } = await generateStoryDraft({
    idea,
    targetAge: '6~8세',
    sceneCount: 12,
    desiredMood: '조마조마하다가 뭉클하게',
    patterns,
  });
  console.log(`   ${scenes.length}장면, ${Date.now() - t0}ms`);

  console.log('2) 품질 게이트 실행 중...');
  const t1 = Date.now();
  const gate = await runQualityGate(scenes);
  console.log(`   passed=${gate.passed}, ${Date.now() - t1}ms`);
  for (const it of gate.items) console.log(`   [${it.passed ? 'PASS' : 'FAIL'}] ${it.label} — ${it.note ?? ''}`);

  const out = {
    ranAt: new Date().toISOString(),
    input: { idea, targetAge: '6~8세', sceneCount: 12, desiredMood: '조마조마하다가 뭉클하게', patternIds: ['courage'] },
    draftScenes: scenes,
    gate: { passed: gate.passed, items: gate.items },
    finalScenes: gate.revisedScenes,
  };
  const outFile = path.join(process.cwd(), 'tests/story/sample-run.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`3) 저장: ${outFile}`);

  console.log('\n--- 최종 원고 ---');
  for (const s of gate.revisedScenes) console.log(`${s.sceneNumber}. [${s.beat}] ${s.text}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
