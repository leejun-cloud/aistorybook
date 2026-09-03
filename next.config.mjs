/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 네이티브/브라우저 모듈은 번들 대신 외부화 — Vercel 파일 추적이 통째로 포함한다
    serverComponentsExternalPackages: ['sharp', '@sparticuz/chromium', 'playwright-core', 'playwright'],
    // 런타임에 fs로 읽는 데이터 파일을 서버리스 함수 번들에 포함
    outputFileTracingIncludes: {
      '/api/**/*': ['./patterns/**/*', './lib/render/fonts/**/*'],
    },
  },
};

export default nextConfig;
