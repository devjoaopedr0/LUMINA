import { describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_RULES,
  achievements,
  buildRanking,
  currentStreak,
  goalProgress,
  keysBetween,
  longestStreak,
  minutesByUserDay,
  periodKeys,
  summarize,
} from './engagement-rules';

// 17/11/2026, 15h em Brasília.
const NOW = new Date('2026-11-17T18:00:00Z');
const day = (key: string, hourUtc = 18) => new Date(`${key}T${String(hourUtc).padStart(2, '0')}:00:00Z`);
const log = (userId: string, key: string, minutes: number) => ({ userId, endTime: day(key), durationMinutes: minutes });

describe('engajamento: base', () => {
  it('períodos no fuso de Brasília, terminando hoje', () => {
    expect(periodKeys(3, NOW)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
    // 01h UTC do dia 18 ainda é dia 17 em Brasília.
    expect(periodKeys(1, new Date('2026-11-18T01:00:00Z'))).toEqual(['2026-11-17']);
    expect(keysBetween('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });

  it('teto de 10 h por dia', () => {
    const by = minutesByUserDay([log('a', '2026-11-17', 500), log('a', '2026-11-17', 400)]);
    expect(by.get('a')!.get('2026-11-17')).toBe(ENGAGEMENT_RULES.dailyCapMinutes);
  });

  it('dia com estudo exige 15 min; constância em %', () => {
    const by = minutesByUserDay([log('a', '2026-11-15', 10), log('a', '2026-11-16', 30), log('a', '2026-11-17', 60)]);
    expect(summarize(by.get('a'), periodKeys(7, NOW))).toEqual({ activeDays: 2, cappedMinutes: 100, consistency: 29 });
  });

  it('sequência atual (hoje ou ontem) e maior sequência', () => {
    const by = minutesByUserDay([
      log('a', '2026-11-10', 30), log('a', '2026-11-11', 30), log('a', '2026-11-12', 30),
      log('a', '2026-11-15', 30), log('a', '2026-11-16', 30),
    ]);
    expect(currentStreak(by.get('a'), NOW)).toBe(2);
    expect(longestStreak(by.get('a'), NOW)).toBe(3);
  });
});

describe('engajamento: placar', () => {
  const by = minutesByUserDay([
    // Ana: 3 dias de 1 h.  Bia: 1 dia de 9 h (horas brutas maiores, menos constância).
    log('ana', '2026-11-15', 60), log('ana', '2026-11-16', 60), log('ana', '2026-11-17', 60),
    log('bia', '2026-11-17', 540),
    log('caio', '2026-11-17', 999),
  ]);

  it('constância (padrão) premia o ritmo, não as horas', () => {
    const r = buildRanking(['ana', 'bia'], by, 'consistency', 7, NOW);
    expect(r.map((x) => [x.userId, x.position, x.value])).toEqual([['ana', 1, 43], ['bia', 2, 14]]);
  });

  it('horas usam o teto diário', () => {
    const r = buildRanking(['bia', 'caio'], by, 'hours', 7, NOW);
    expect(r.find((x) => x.userId === 'caio')!.value).toBe(600);
  });

  it('quem não participa não aparece', () => {
    expect(buildRanking(['ana'], by, 'consistency', 7, NOW).map((x) => x.userId)).toEqual(['ana']);
  });

  it('empate divide a posição', () => {
    const tie = minutesByUserDay([log('x', '2026-11-17', 30), log('y', '2026-11-17', 30), log('z', '2026-11-16', 20)]);
    expect(buildRanking(['x', 'y', 'z'], tie, 'consistency', 7, NOW).map((e) => e.position)).toEqual([1, 1, 3]);
  });
});

describe('engajamento: metas coletivas', () => {
  const by = minutesByUserDay([log('ana', '2026-11-16', 120), log('bia', '2026-11-17', 90), log('caio', '2026-11-17', 300)]);
  const goal = { metric: 'GROUP_MINUTES' as const, target: 240, startKey: '2026-11-16', endKey: '2026-11-22' };

  it('soma só quem participa', () => {
    expect(goalProgress(goal, ['ana', 'bia'], by, NOW)).toMatchObject({ value: 210, percent: 88, reached: false, status: 'ACTIVE', contributors: 2 });
    expect(goalProgress(goal, ['ana', 'bia', 'caio'], by, NOW)).toMatchObject({ reached: true, status: 'REACHED', percent: 100 });
  });

  it('meta de dias soma dias com estudo', () => {
    expect(goalProgress({ ...goal, metric: 'GROUP_STUDY_DAYS', target: 3 }, ['ana', 'bia'], by, NOW)).toMatchObject({ value: 2, status: 'ACTIVE' });
  });

  it('encerrada sem atingir, e ainda por começar', () => {
    expect(goalProgress({ ...goal, endKey: '2026-11-16' }, ['ana'], by, new Date('2026-11-20T18:00:00Z')).status).toBe('ENDED');
    expect(goalProgress({ ...goal, startKey: '2026-11-20', endKey: '2026-11-25' }, ['ana'], by, NOW).status).toBe('UPCOMING');
  });
});

describe('engajamento: conquistas', () => {
  it('premiam constância e equipe', () => {
    const list = achievements({ roomsJoined: 1, last7: { activeDays: 7, cappedMinutes: 600, consistency: 100 }, currentStreak: 7, longestStreak: 7, goalsHelped: 0 });
    expect(list.filter((a) => a.earned).map((a) => a.code)).toEqual(['FIRST_ROOM', 'WEEK_3', 'WEEK_7']);
    expect(list.every((a) => !/sem parar/i.test(a.description))).toBe(true);
  });
});
