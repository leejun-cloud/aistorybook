// Gemini image generation validation script.
// Reads GEMINI_API_KEY directly from the lecture-video timeline .env.local file.
// Usage:
//   node gen.mjs ref "<prompt>" out.png
//   node gen.mjs scene "<prompt>" ref.png out.png

import fs from "node:fs";
import path from "node:path";

const ENV_PATH = "/Users/ichangjun/Documents/GitHub/test/lecture-video timeline/.env.local";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";

function loadKey() {
  const txt = fs.readFileSync(ENV_PATH, "utf8");
  const m = txt.match(/GEMINI_API_KEY=(.+)/);
  if (!m) throw new Error("GEMINI_API_KEY not found in env file");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const KEY = loadKey();
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const mode = process.argv[2]; // "ref" or "scene"
const prompt = process.argv[3];
let refImagePath = null;
let outPath;

if (mode === "ref") {
  outPath = process.argv[4];
} else if (mode === "scene") {
  refImagePath = process.argv[4];
  outPath = process.argv[5];
} else {
  console.error("Unknown mode:", mode);
  process.exit(1);
}

const parts = [];
if (refImagePath) {
  const b64 = fs.readFileSync(refImagePath).toString("base64");
  parts.push({ inlineData: { mimeType: "image/png", data: b64 } });
}
parts.push({ text: prompt });

const body = {
  contents: [{ role: "user", parts }],
  generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
};

const t0 = Date.now();
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const elapsed = Date.now() - t0;

const headersDump = {};
for (const [k, v] of res.headers.entries()) headersDump[k] = v;

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = null;
}

const metaPath = outPath.replace(/\.png$/, ".meta.json");

if (!res.ok) {
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ ok: false, status: res.status, elapsed_ms: elapsed, headers: headersDump, body: json ?? text }, null, 2)
  );
  console.error(`FAIL status=${res.status} elapsed=${elapsed}ms — see ${metaPath}`);
  process.exit(2);
}

let imageData = null;
let textOut = null;
try {
  const cand = json.candidates?.[0];
  for (const p of cand.content.parts) {
    if (p.inlineData?.data) imageData = p.inlineData.data;
    if (p.text) textOut = (textOut || "") + p.text;
  }
} catch (e) {
  console.error("Could not parse response structure:", e.message);
}

fs.writeFileSync(
  metaPath,
  JSON.stringify(
    {
      ok: true,
      status: res.status,
      elapsed_ms: elapsed,
      headers: headersDump,
      model: MODEL,
      hasImage: !!imageData,
      textOut,
      finishReason: json.candidates?.[0]?.finishReason,
      usageMetadata: json.usageMetadata,
    },
    null,
    2
  )
);

if (!imageData) {
  console.error(`NO IMAGE returned elapsed=${elapsed}ms — see ${metaPath}`);
  process.exit(3);
}

fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
console.log(`OK -> ${outPath} elapsed=${elapsed}ms`);
