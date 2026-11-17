import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Todo módulo de funcionalidade precisa chegar ao AppModule (direto ou por
 * outro módulo). Em 13/11/2026 o FlashcardsModule sumiu do app.module.ts numa
 * resolução de conflito de merge e todas as rotas /flashcards passaram a dar
 * 404 sem nenhum teste acusar. Este teste pega esse tipo de perda.
 */
const SRC = join(__dirname);

function moduleFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return moduleFiles(path);
    return name.endsWith('.module.ts') && name !== 'app.module.ts' ? [path] : [];
  });
}

describe('registro dos módulos', () => {
  it('cada módulo de funcionalidade é importado por outro módulo (até o AppModule)', () => {
    const files = moduleFiles(SRC);
    const sources = new Map([...files, join(SRC, 'app.module.ts')].map((f) => [f, readFileSync(f, 'utf8')]));
    const missing: string[] = [];
    for (const file of files) {
      const name = /export class (\w+Module)\b/.exec(sources.get(file)!)?.[1];
      if (!name) continue;
      const used = [...sources].some(([other, text]) => other !== file && new RegExp(`imports:\\s*\\[[^\\]]*\\b${name}\\b`, 's').test(text));
      if (!used) missing.push(`${name} (${relative(SRC, file)})`);
    }
    expect(missing).toEqual([]);
  });
});
