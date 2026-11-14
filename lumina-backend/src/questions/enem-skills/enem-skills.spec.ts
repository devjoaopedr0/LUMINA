import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { QuestionsService } from '../questions.service';
import { ENEM_AREAS, ENEM_MATRIX, areaForSubject, findSkill, parseSkillCode } from './enem-matrix';
import { parseSkillBatch, skillBatchPrompt } from './skill-classifier';
import { buildSkillMastery } from './skill-mastery';
import { simulationEvents } from './skill-mastery.service';

describe('Matriz de Referência do ENEM', () => {
  it('tem as 4 áreas, H1–H30 em ordem e o número oficial de competências', () => {
    const competencies = { LC: 9, CH: 6, CN: 8, MT: 7 };
    for (const area of ENEM_AREAS) {
      const m = ENEM_MATRIX[area];
      expect(m.skills.map((s) => s.n)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
      expect(m.competencies).toHaveLength(competencies[area]);
      for (const s of m.skills) {
        expect(m.competencies.some((c) => c.n === s.competency)).toBe(true);
        expect(s.text.length).toBeGreaterThan(30);
      }
    }
  });

  it('confere trechos do texto oficial', () => {
    expect(findSkill('MT-H17')).toMatchObject({ competency: 4, text: expect.stringMatching(/^Analisar informações envolvendo a variação de grandezas/) });
    expect(findSkill('CH-H30')?.text).toMatch(/preservação e degradação da vida no planeta/);
    expect(ENEM_MATRIX.LC.competencies[0].text).toMatch(/^Aplicar as tecnologias da comunicação e da informação/);
  });

  it('valida códigos e mapeia matéria para área', () => {
    expect(parseSkillCode('mt-h7')).toEqual({ area: 'MT', n: 7 });
    expect(parseSkillCode('MT-H31')).toBeNull();
    expect(parseSkillCode('XX-H1')).toBeNull();
    expect(areaForSubject('Matemática')).toBe('MT');
    expect(areaForSubject('Física')).toBe('CN');
    expect(areaForSubject('Biologia')).toBe('CN');
    expect(areaForSubject('Sociologia')).toBe('CH');
    expect(areaForSubject('Língua Portuguesa')).toBe('LC');
    expect(areaForSubject('Inglês')).toBe('LC');
    expect(areaForSubject('Robótica')).toBeNull();
  });
});

describe('classificação por IA', () => {
  const q = { ref: 'Q1', subject: 'Matemática', topic: 'Funções', stem: 'Enunciado', alternatives: ['1', '2'] };

  it('o prompt leva só a matriz da área, com o texto oficial', () => {
    const prompt = skillBatchPrompt('MT', [q]);
    expect(prompt).toContain(`H17 — ${ENEM_MATRIX.MT.skills[16].text}`);
    expect(prompt).not.toContain(ENEM_MATRIX.CH.skills[0].text);
    expect(prompt).toMatch(/responda null/);
  });

  it('aceita só números 1–30 e refs do lote', () => {
    const raw = '```json\n{"classificacoes":[{"ref":"Q1","habilidade":17,"justificativa":"variação"},{"ref":"Q2","habilidade":"H31"},{"ref":"Q3","habilidade":null,"justificativa":"falta figura"},{"ref":"Q9","habilidade":2}]}\n```';
    expect(parseSkillBatch(raw, 'MT', ['Q1', 'Q2', 'Q3', 'Q4'])).toEqual([
      { ref: 'Q1', code: 'MT-H17', note: 'variação' },
      { ref: 'Q2', code: null, note: 'Resposta da IA fora da matriz.' },
      { ref: 'Q3', code: null, note: 'falta figura' },
      { ref: 'Q4', code: null, note: 'A IA não devolveu classificação para esta questão.' },
    ]);
    expect(parseSkillBatch('não é json', 'MT', ['Q1'])[0].code).toBeNull();
  });
});

describe('domínio por habilidade', () => {
  const at = new Date('2026-11-10T12:00:00Z');

  it('agrega por habilidade, competência e área, com % de acerto e disponíveis', () => {
    const report = buildSkillMastery(
      [
        { code: 'MT-H17', correct: true, at, provisional: false },
        { code: 'MT-H17', correct: false, at: new Date('2026-11-12T12:00:00Z'), provisional: true },
        { code: 'MT-H16', correct: true, at, provisional: false },
        { code: 'LIXO', correct: true, at, provisional: false },
      ],
      new Map([['MT-H17', 4]]),
      { classifiedQuestions: 4, pendingValidation: 1 },
    );
    const mt = report.areas.find((a) => a.area === 'MT')!;
    const c4 = mt.competencies.find((c) => c.n === 4)!;
    const h17 = c4.skills.find((s) => s.n === 17)!;
    expect(h17).toMatchObject({ attempts: 2, correct: 1, accuracy: 50, available: 4, provisional: true, lastAt: '2026-11-12T12:00:00.000Z' });
    expect(c4).toMatchObject({ attempts: 3, correct: 2 });
    expect(mt).toMatchObject({ attempts: 3, correct: 2 });
    expect(report.areas.find((a) => a.area === 'LC')!.attempts).toBe(0);
    expect(report.areas.find((a) => a.area === 'LC')!.competencies[0].skills[0].accuracy).toBeNull();
  });

  it('simulado: conta acerto pela alternativa marcada e ignora em branco e questão sem habilidade', () => {
    const events = simulationEvents({
      answers: [{ position: 1, selectedPosition: 2 }, { position: 2, selectedPosition: 0 }, { position: 4, selectedPosition: 1 }],
      submittedAt: at,
      simulation: {
        items: [
          { position: 1, correctPosition: 2, question: { enemSkill: 'CN-H5', enemSkillValidated: true } },
          { position: 2, correctPosition: 1, question: { enemSkill: 'CN-H5', enemSkillValidated: false } },
          { position: 3, correctPosition: 1, question: { enemSkill: 'CN-H6', enemSkillValidated: true } },
          { position: 4, correctPosition: 1, question: null },
        ],
      },
    });
    expect(events).toEqual([
      { code: 'CN-H5', correct: true, at, provisional: false },
      { code: 'CN-H5', correct: false, at, provisional: true },
    ]);
  });
});

describe('classificação manual na edição da questão', () => {
  const service = Object.create(QuestionsService.prototype) as QuestionsService;
  const manual = (code: string | null, subject: string) => (service as any).manualEnemSkill(code, subject);

  it('grava como MANUAL e validada; null limpa', () => {
    expect(manual('MT-H17', 'Matemática')).toEqual({ enemSkill: 'MT-H17', enemSkillOrigin: 'MANUAL', enemSkillValidated: true, enemSkillNote: null });
    expect(manual(null, 'Matemática')).toEqual({ enemSkill: null, enemSkillOrigin: null, enemSkillValidated: false, enemSkillNote: null });
  });

  it('recusa habilidade de outra área da matéria', () => {
    expect(() => manual('CH-H1', 'Matemática')).toThrow(BadRequestException);
    expect(manual('CH-H1', 'Robótica').enemSkill).toBe('CH-H1');
  });
});
