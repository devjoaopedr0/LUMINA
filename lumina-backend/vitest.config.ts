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
    // Idem para o timeout por teste: o DATABASE_URL hoje aponta pro Supabase
    // remoto (não mais um Postgres local em Docker), então cada chamada HTTP
    // do e2e paga uma latência de rede de verdade. Testes que encadeiam
    // vários requests autenticados (ex: trocar senha e revogar sessões) já
    // passaram do default de 5s só de latência acumulada + bcrypt — não é
    // flakiness, é o custo real de bater num banco remoto.
    testTimeout: 20000,
  },
  plugins: [swc.vite()],
});
