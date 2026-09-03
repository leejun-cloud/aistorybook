/** @type {import('next').NextConfig} */

// @sparticuz/chromium의 브라우저 바이너리(bin/)는 fs로 읽혀 자동 추적되지 않는다
// — PDF를 렌더하는 라우트에 명시적으로 포함 (npm/pnpm 두 레이아웃 모두).
const CHROMIUM_BIN = [
  './node_modules/@sparticuz/chromium/bin/**/*',
  './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**/*',
];

const nextConfig = {
  experimental: {
    // 네이티브/브라우저 모듈은 번들 대신 외부화 — Vercel 파일 추적이 통째로 포함한다
    serverComponentsExternalPackages: ['sharp', '@sparticuz/chromium', 'playwright-core', 'playwright'],
    // 런타임에 fs로 읽는 데이터 파일을 서버리스 함수 번들에 포함
    outputFileTracingIncludes: {
      '/api/**/*': ['./patterns/**/*', './lib/render/fonts/**/*'],
      '/api/render/pdf': CHROMIUM_BIN,
      '/api/cover/render': CHROMIUM_BIN,
      '/api/preflight': CHROMIUM_BIN,
    },
  },
};

export default nextConfig;
