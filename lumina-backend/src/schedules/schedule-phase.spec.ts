import { StudyActivityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { computeSchedulePhase, PHASE_MIX } from './schedule-phase';

// 100 dias de reta: o percentual decorrido é o próprio número de dias.
const start = new Date('2026-09-01');
const exam = new Date('2026-12-10');
const day = (n: number) => new Date(start.getTime() + n * 86_400_000);

describe('computeSchedulePhase', () => {
  it('divide a reta em base (<50%), consolidação (50–80%) e preparação (≥80%)', () => {
    expect(computeSchedulePhase(start, exam, day(0))).toBe('BASE');
    expect(computeSchedulePhase(start, exam, day(49))).toBe('BASE');
    expect(computeSchedulePhase(start, exam, day(50))).toBe('CONSOLIDACAO');
    expect(computeSchedulePhase(start, exam, day(79))).toBe('CONSOLIDACAO');
    expect(computeSchedulePhase(start, exam, day(80))).toBe('PREPARACAO');
    expect(computeSchedulePhase(start, exam, day(100))).toBe('PREPARACAO');
  });

  it('dia antes do início é base; dia depois da prova continua preparação', () => {
    expect(computeSchedulePhase(start, exam, day(-5))).toBe('BASE');
    expect(computeSchedulePhase(start, exam, day(130))).toBe('PREPARACAO');
  });

  it('prova no dia do início (ou antes) não tem reta: tudo é preparação', () => {
    expect(computeSchedulePhase(start, start, start)).toBe('PREPARACAO');
    expect(computeSchedulePhase(start, day(-10), start)).toBe('PREPARACAO');
  });
});

describe('PHASE_MIX', () => {
  it('cada fase distribui 100% do tempo', () => {
    for (const mix of Object.values(PHASE_MIX)) {
      const total = Object.values(StudyActivityType).reduce((sum, type) => sum + mix[type], 0);
      expect(total).toBeCloseTo(1);
    }
  });
});
