import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateFormulaDto, CreateRepertoireDto } from './notebooks.dto';
import { PLATFORM_FORMULAS, PLATFORM_REPERTOIRES } from './platform-content';

describe('acervo inicial dos cadernos', () => {
  it('todas as fórmulas passam na validação e vêm completas', async () => {
    for (const formula of PLATFORM_FORMULAS) {
      expect(await validate(plainToInstance(CreateFormulaDto, formula)), formula.name).toEqual([]);
      expect(formula.variables && formula.whenToUse && formula.example, formula.name).toBeTruthy();
    }
  });

  it('todos os repertórios passam na validação, têm fonte e sugestão de uso', async () => {
    for (const rep of PLATFORM_REPERTOIRES) {
      expect(await validate(plainToInstance(CreateRepertoireDto, rep)), rep.title).toEqual([]);
      expect(rep.source && rep.essayUse && rep.example, rep.title).toBeTruthy();
    }
  });

  it('sem nomes repetidos (o script usa o nome para não duplicar)', () => {
    expect(new Set(PLATFORM_FORMULAS.map((f) => f.name)).size).toBe(PLATFORM_FORMULAS.length);
    expect(new Set(PLATFORM_REPERTOIRES.map((r) => r.title)).size).toBe(PLATFORM_REPERTOIRES.length);
  });

  it('não usa citação literal entre aspas duplas atribuída a autor', () => {
    for (const rep of PLATFORM_REPERTOIRES) {
      for (const field of [rep.summary, rep.example, rep.context]) {
        // Aspas só para nomear conceitos curtos (ex.: "bancária"), nunca frase longa.
        const quoted = (field ?? '').match(/"([^"]+)"/g) ?? [];
        for (const q of quoted) expect(q.split(' ').length, `${rep.title}: ${q}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('as leis citadas têm o número certo (conferência das mais citadas no ENEM)', () => {
    const titles = PLATFORM_REPERTOIRES.map((r) => r.title).join(' | ');
    expect(titles).toContain('Lei 11.340/2006'); // Maria da Penha (11.343 é a Lei de Drogas)
    expect(titles).toContain('Lei 8.069/1990'); // ECA
    expect(titles).toContain('Lei 13.709/2018'); // LGPD
  });
});
