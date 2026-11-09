import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드 → dist 폴더를 어느 경로에 올려도 동작
  base: './',
  server: {
    open: true,
  },
  build: {
    target: 'es2022',
    // three / Spark / Rapier(WASM 내장)가 커서 기본 경고 기준을 올려 둠
    chunkSizeWarningLimit: 4000,
  },
});
