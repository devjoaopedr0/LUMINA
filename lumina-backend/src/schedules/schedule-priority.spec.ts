import { TopicMasteryStatus, StudyActivityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_DURATION_MINUTES, computeTopicPriority, pickActivityType } from './schedule-priority';

const now = new Date('2026-09-30T12:00:00Z');

describe('computeTopicPriority', () => {
  it('tópico nunca estudado, sem incidência e sem peso do objetivo fica em 65 (35 de desempenho + 15 de nunca-estudado + 15 de recência)', () => {
    const priority = computeTopicPriority({
      masteryScore: null,
      status: null,
      lastStudiedAt: null,
      questionCount: 0,
      maxQuestionCountInSubject: 0,
      targetHours: 0,
      maxTargetHoursInSchedule: 0,
      now,
    });
    expect(priority).toBeCloseTo(35 + 15 + 15, 5);
  });

  it('tópico dominado (score 100) com alta incidência, revisado hoje e maior peso do objetivo tem prioridade baixa', () => {
    const priority = computeTopicPriority({
      masteryScore: 100,
      status: TopicMasteryStatus.DOMINADO,
      lastStudiedAt: now,
      questionCount: 10,
      maxQuestionCountInSubject: 10,
      targetHours: 100,
      maxTargetHoursInSchedule: 100,
      now,
    });
    // (100-100)*0.35 + 100*0.25 + 0 + 0 + 100*0.10 = 25 + 10 = 35
    expect(priority).toBeCloseTo(35, 5);
  });

  it('mais dias sem revisar aumenta a prioridade (recência cresce até o teto de 30 dias)', () => {
    const base = { masteryScore: 50, status: TopicMasteryStatus.PRATICANDO, questionCount: 0, maxQuestionCountInSubject: 0, targetHours: 0, maxTargetHoursInSchedule: 0, now };
    const recente = computeTopicPriority({ ...base, lastStudiedAt: new Date(now.getTime() - 1 * 86_400_000) });
    const antigo = computeTopicPriority({ ...base, lastStudiedAt: new Date(now.getTime() - 60 * 86_400_000) });
    expect(antigo).toBeGreaterThan(recente);
    // 60 dias já bateu no teto de 30 — mesma prioridade que exatamente 30 dias.
    const noTeto = computeTopicPriority({ ...base, lastStudiedAt: new Date(now.getTime() - 30 * 86_400_000) });
    expect(antigo).toBeCloseTo(noTeto, 5);
  });

  it('mais incidência (mais questões no banco) aumenta a prioridade', () => {
    const base = { masteryScore: 50, status: TopicMasteryStatus.PRATICANDO, lastStudiedAt: now, targetHours: 0, maxTargetHoursInSchedule: 0, now };
    const baixaIncidencia = computeTopicPriority({ ...base, questionCount: 1, maxQuestionCountInSubject: 10 });
    const altaIncidencia = computeTopicPriority({ ...base, questionCount: 10, maxQuestionCountInSubject: 10 });
    expect(altaIncidencia).toBeGreaterThan(baixaIncidencia);
  });
});

describe('pickActivityType', () => {
  it('mapeia cada status para o tipo de atividade certo', () => {
    expect(pickActivityType(null)).toBe(StudyActivityType.TEORIA);
    expect(pickActivityType(TopicMasteryStatus.NAO_ESTUDADO)).toBe(StudyActivityType.TEORIA);
    expect(pickActivityType(TopicMasteryStatus.APRENDENDO)).toBe(StudyActivityType.QUESTOES);
    expect(pickActivityType(TopicMasteryStatus.PRATICANDO)).toBe(StudyActivityType.QUESTOES);
    expect(pickActivityType(TopicMasteryStatus.PRECISA_REFORCO)).toBe(StudyActivityType.REVISAO);
    expect(pickActivityType(TopicMasteryStatus.DOMINADO)).toBe(StudyActivityType.REVISAO);
  });
});

describe('ACTIVITY_DURATION_MINUTES', () => {
  it('tem duração positiva para todo tipo de atividade', () => {
    for (const type of Object.values(StudyActivityType)) {
      expect(ACTIVITY_DURATION_MINUTES[type]).toBeGreaterThan(0);
    }
  });
});
