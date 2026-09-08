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
    // O e2e sobe a aplicação Nest inteira (todos os módulos) dentro do
    // beforeAll. Isso já passou de 10s (default do Vitest) quando roda
    // junto com os outros arquivos de teste em paralelo — não é lentidão
    // pontual, é o tamanho real do grafo de módulos hoje. Timeout maior
    // evita falso-negativo por timeout de hook.
    hookTimeout: 30000,
  },
  plugins: [swc.vite()],
});
