import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 3D 渲染器（含 three，约 670 kB / gzip 175 kB）是按需加载的单独代码块，超过默认的 500 kB 提示阈值是预期的
  build: { target: 'es2020', outDir: 'dist', chunkSizeWarningLimit: 800 },
  server: { host: true },
});
