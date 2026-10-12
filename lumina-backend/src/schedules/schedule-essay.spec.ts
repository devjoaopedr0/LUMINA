import { describe, expect, it } from 'vitest';
import { ESSAY_CYCLE, essayStepForWeek, pickEssaySession, scheduleWeekIndex } from './schedule-essay';

describe('rotina de redação (fase 5, §9)', () => {
  it('conta as semanas a partir do início do cronograma', () => {
    const start = new Date('2026-09-21');
    expect(scheduleWeekIndex(start, new Date('2026-09-21'))).toBe(0);
    expect(scheduleWeekIndex(start, new Date('2026-09-27'))).toBe(0);
    expect(scheduleWeekIndex(start, new Date('2026-09-28'))).toBe(1);
    expect(scheduleWeekIndex(start, new Date('2026-10-12'))).toBe(3);
  });

  it('semanal: alterna repertório, produção e correção, e recomeça', () => {
    expect([0, 1, 2, 3].map((week) => essayStepForWeek(week, null)?.title)).toEqual([
      ESSAY_CYCLE[0].title,
      ESSAY_CYCLE[1].title,
      ESSAY_CYCLE[2].title,
      ESSAY_CYCLE[0].title,
    ]);
    expect(essayStepForWeek(1, 'WEEKLY')).toBe(ESSAY_CYCLE[1]);
  });

  it('quinzenal: semana ímpar fica sem redação e o ciclo anda de duas em duas', () => {
    expect(essayStepForWeek(0, 'BIWEEKLY')).toBe(ESSAY_CYCLE[0]);
    expect(essayStepForWeek(1, 'BIWEEKLY')).toBeNull();
    expect(essayStepForWeek(2, 'BIWEEKLY')).toBe(ESSAY_CYCLE[1]);
    expect(essayStepForWeek(4, 'BIWEEKLY')).toBe(ESSAY_CYCLE[2]);
  });

  it('dia antes do início do cronograma não tem redação', () => {
    expect(essayStepForWeek(-1, null)).toBeNull();
  });

  it('a redação cai no dia com mais tempo; no empate, no último', () => {
    const session = (date: string, scheduledMinutes: number) => ({ date: new Date(date), scheduledMinutes });
    const uniform = [session('2026-09-28', 120), session('2026-09-30', 120), session('2026-10-02', 120)];
    expect(pickEssaySession(uniform)?.date).toEqual(new Date('2026-10-02'));

    const longTuesday = [session('2026-09-28', 60), session('2026-09-29', 180), session('2026-10-03', 90)];
    expect(pickEssaySession(longTuesday)?.date).toEqual(new Date('2026-09-29'));

    // Dia extra criado pelo replanejamento (0 min) nunca recebe a redação.
    expect(pickEssaySession([session('2026-10-03', 0)])).toBeNull();
  });
});
