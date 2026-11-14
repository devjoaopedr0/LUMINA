import { describe, expect, it } from 'vitest';
import { buildMasteryEvolution } from './mastery-evolution';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const topics = [
  { topicId: 'func', topic: 'Funções', subject: 'Matemática' },
  { topicId: 'geo', topic: 'Geometria', subject: 'Matemática' },
  { topicId: 'cin', topic: 'Cinemática', subject: 'Física' },
];
const TODAY = new Date('2026-11-13T15:00:00.000Z');

describe('evolução do domínio', () => {
  it('pontos a cada 7 dias até hoje, com o último valor conhecido de cada tópico', () => {
    const evo = buildMasteryEvolution(
      [
        { topicId: 'func', day: day('2026-10-20'), masteryScore: 40 },
        { topicId: 'func', day: day('2026-11-10'), masteryScore: 70 },
        { topicId: 'geo', day: day('2026-11-01'), masteryScore: 50 },
      ],
      topics,
      TODAY,
      3,
    );
    expect(evo.points).toEqual(['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13']);
    // 23/10: só Funções (40); 06/11: Funções 40 e Geometria 50; 13/11: 70 e 50.
    expect(evo.overall).toEqual([40, 40, 45, 60]);
  });

  it('tópico antes do primeiro registro não conta como zero; tópico sem histórico fica fora', () => {
    const evo = buildMasteryEvolution([{ topicId: 'cin', day: day('2026-11-12'), masteryScore: 80 }], topics, TODAY, 2);
    expect(evo.overall).toEqual([null, null, 80]);
    expect(evo.subjects).toEqual([{ subject: 'Física', series: [null, null, 80] }]);
  });

  it('semana: o que subiu, o que caiu e quantos começaram', () => {
    const evo = buildMasteryEvolution(
      [
        { topicId: 'func', day: day('2026-11-01'), masteryScore: 40 },
        { topicId: 'func', day: day('2026-11-12'), masteryScore: 75 },
        { topicId: 'geo', day: day('2026-11-02'), masteryScore: 60 },
        { topicId: 'geo', day: day('2026-11-11'), masteryScore: 45 },
        { topicId: 'cin', day: day('2026-11-10'), masteryScore: 30 },
      ],
      topics,
      TODAY,
      4,
    );
    expect(evo.week.improved).toEqual([{ topicId: 'func', topic: 'Funções', subject: 'Matemática', from: 40, to: 75, delta: 35 }]);
    expect(evo.week.declined).toEqual([{ topicId: 'geo', topic: 'Geometria', subject: 'Matemática', from: 60, to: 45, delta: -15 }]);
    expect(evo.week.started).toBe(1);
  });

  it('sem histórico, tudo vazio', () => {
    const evo = buildMasteryEvolution([], topics, TODAY, 2);
    expect(evo.overall).toEqual([null, null, null]);
    expect(evo.subjects).toEqual([]);
    expect(evo.week).toEqual({ improved: [], declined: [], started: 0 });
  });
});
