import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS resolve dependências via reflect-metadata (design:paramtypes),
// que só é emitido corretamente por um compilador "de verdade" (tsc/SWC).
// O transform padrão do Vitest (esbuild) NÃO emite essa metadata — por
// isso o plugin unplugin-swc, recomendado pela própria doc do Nest para
// testar com Vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globals: true,
    root: './',
  },
  plugins: [swc.vite()],
});
