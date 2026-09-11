/** @type {import('next').NextConfig} */

const nextConfig = {
  experimental: {
    // 네이티브 모듈은 번들 대신 외부화 — Vercel 파일 추적이 플랫폼별 바이너리를 통째로 포함한다
    // (sharp: 이미지 업스케일, typst-ts-node-compiler: 표지·내지 PDF 렌더)
    serverComponentsExternalPackages: ['sharp', '@myriaddreamin/typst-ts-node-compiler'],
    // 런타임에 fs로 읽는 데이터 파일을 서버리스 함수 번들에 포함
    outputFileTracingIncludes: {
      '/api/**/*': ['./patterns/**/*', './lib/render/fonts/**/*'],
    },
  },
};

export default nextConfig;
