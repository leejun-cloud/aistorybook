// 스타일 피커 카드용 예시 그림을 한 번 생성해 public/style-samples/에 저장한다.
// 12개(기본 6 + 출판 사례 6) 전부 같은 중립 피사체로 통일해 스타일 차이만 비교되게 한다.
//
//   npx tsx scripts/gen-style-samples.ts [style-id...]   (인자 없으면 전부)

import fs from 'fs';
import path from 'path';

{
  const envFile = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { generateImage } from '../lib/ai/image';
import { STYLE_LIBRARY, PUBLISHED_STYLE_PRESETS } from '../lib/demo';
import { NO_TEXT_IN_IMAGE_PREFIX } from '../lib/prompts/character';

const SUBJECT =
  "Children's picture-book character design. A small round bunny character with long ears, sitting, " +
  'looking at the viewer with a gentle friendly expression. Full body, centered composition, plain simple background.';

const OUT_DIR = path.join(process.cwd(), 'public', 'style-samples');

async function genOne(id: string, prompt: string): Promise<void> {
  const outPath = path.join(OUT_DIR, `${id}.png`);
  process.stdout.write(`${id} ... `);
  const res = await generateImage(NO_TEXT_IN_IMAGE_PREFIX + SUBJECT + ` Illustration style: ${prompt}`);
  if (!res.ok) {
    console.log(`FAIL (${res.error.code}: ${res.error.message.slice(0, 120)})`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, res.image.data);
  console.log(`OK (${Math.round(res.image.data.length / 1024)}KB)`);
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const jobs: { id: string; prompt: string }[] = [
    ...STYLE_LIBRARY.map((s) => ({ id: s.id, prompt: s.prompt })),
    ...PUBLISHED_STYLE_PRESETS.map((s) => ({ id: `published-${s.id}`, prompt: s.prompt })),
  ];
  const targets = only.size > 0 ? jobs.filter((j) => only.has(j.id)) : jobs;
  for (const job of targets) {
    await genOne(job.id, job.prompt);
  }
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
