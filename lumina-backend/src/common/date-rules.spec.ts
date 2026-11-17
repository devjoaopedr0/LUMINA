import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { goalFromProfile } from '../schedules/schedule-goal';
import { MAX_SCHEDULE_DAYS, MIN_SCHEDULE_DAYS, TOPIC_CYCLE_MINUTES, scheduleLimits } from '../schedules/schedule-limits';
import { assertBirthDate, assertFutureInstant, assertNotFutureDay, assertNotPastDay, brazilToday, dateOnly } from './date-rules';

// 16/11/2026 às 01h UTC: em Brasília ainda é 15/11 (22h); no Acre, 15/11 (20h).
const now = new Date('2026-11-16T01:00:00Z');

describe('hoje no Brasil', () => {
  it('usa o dia do fuso mais a oeste, para não barrar quem ainda está no "ontem"', () => {
    expect(brazilToday(now).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(brazilToday(new Date('2026-11-16T05:00:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('data no passado é recusada; hoje e futuro passam', () => {
    expect(() => assertNotPastDay('2026-11-14', 'A data de início', now)).toThrow(BadRequestException);
    expect(() => assertNotPastDay('2026-11-14', 'A data de início', now)).toThrow('não pode ser anterior a hoje (15/11/2026)');
    expect(assertNotPastDay('2026-11-15', 'x', now).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(assertNotPastDay('2027-01-10', 'x', now)).toBeInstanceOf(Date);
  });

  it('prazo de atividade precisa ser futuro (1 min de tolerância)', () => {
    expect(() => assertFutureInstant('2026-11-16T00:00:00Z', 'O prazo', now)).toThrow('precisa ser uma data futura');
    expect(assertFutureInstant('2026-11-16T00:59:30Z', 'O prazo', now)).toBeInstanceOf(Date);
  });

  it('publicação não pode ser no futuro (hoje do fuso mais a leste vale)', () => {
    expect(assertNotFutureDay('2026-11-15', 'A publicação', now)).toBeInstanceOf(Date);
    expect(() => assertNotFutureDay('2026-11-17', 'A publicação', now)).toThrow('não pode ser uma data futura');
    // 16/11 03h UTC = 16/11 01h em Noronha: já é dia 16 lá.
    expect(assertNotFutureDay('2026-11-16', 'A publicação', new Date('2026-11-16T03:00:00Z'))).toBeInstanceOf(Date);
  });

  it('nascimento: passado e idade entre 8 e 100 anos', () => {
    expect(assertBirthDate('2008-05-20', now).toISOString()).toBe('2008-05-20T00:00:00.000Z');
    expect(() => assertBirthDate('2027-01-01', now)).toThrow('não pode ser no futuro');
    expect(() => assertBirthDate('2020-01-01', now)).toThrow('entre 8 e 100 anos');
    expect(() => assertBirthDate('1900-01-01', now)).toThrow('entre 8 e 100 anos');
  });

  it('dateOnly aceita só a data ou ISO completo', () => {
    expect(dateOnly('2026-11-16').toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(dateOnly('2026-11-16T22:10:00Z').toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });
});

describe('prazo máximo do cronograma pela gama de conteúdos', () => {
  const start = new Date('2026-11-16T00:00:00Z');

  it('ciclo por assunto = teoria + questões + 3 revisões', () => {
    expect(TOPIC_CYCLE_MINUTES).toBe(40 + 40 + 3 * 20);
  });

  it('assuntos × ciclo ÷ tempo semanal, com 50% de folga', () => {
    // 60 assuntos × 140 min = 8400 min; 600 min/semana → 14 semanas = 98 dias → ×1,5 = 147 dias.
    const l = scheduleLimits(start, [{ topics: 60, targetHours: 10 }], 600, start);
    expect(l).toMatchObject({ topics: 60, contentMinutes: 8400, contentDays: 98 });
    expect(l.maxEnd.toISOString()).toBe('2027-04-12T00:00:00.000Z');
  });

  it('matéria sem assuntos usa as horas-alvo; menos tempo semanal = prazo maior', () => {
    const l = scheduleLimits(start, [{ topics: null, targetHours: 20 }], 300, start);
    expect(l.contentMinutes).toBe(1200);
    expect(l.contentDays).toBe(28);
    expect(scheduleLimits(start, [{ topics: 60, targetHours: 0 }], 300, start).contentDays).toBeGreaterThan(
      scheduleLimits(start, [{ topics: 60, targetHours: 0 }], 600, start).contentDays,
    );
  });

  it('mínimo de 4 semanas e teto de 24 meses', () => {
    expect(scheduleLimits(start, [{ topics: 1, targetHours: 0 }], 1000, start).maxEnd.getTime() - start.getTime()).toBe(MIN_SCHEDULE_DAYS * 86_400_000);
    expect(scheduleLimits(start, [{ topics: 900, targetHours: 0 }], 60, start).maxEnd.getTime() - start.getTime()).toBe(MAX_SCHEDULE_DAYS * 86_400_000);
  });
});

describe('objetivo do cronograma vem do perfil', () => {
  it('curso e universidade viram o objetivo; sem curso, nada', () => {
    expect(goalFromProfile({ desiredCourse: 'Medicina', targetUniversity: 'UFC' })).toEqual({ objective: 'Medicina na UFC', targetCourse: 'Medicina' });
    expect(goalFromProfile({ desiredCourse: 'Direito', targetUniversity: null })).toEqual({ objective: 'Direito', targetCourse: 'Direito' });
    expect(goalFromProfile({ desiredCourse: '  ', targetUniversity: 'UFC' })).toEqual({ objective: null, targetCourse: null });
    expect(goalFromProfile(null)).toEqual({ objective: null, targetCourse: null });
  });
});
