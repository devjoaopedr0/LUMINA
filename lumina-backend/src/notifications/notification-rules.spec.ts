import { describe, expect, it } from 'vitest';
import { brtDayEnd, brtDayStart, formatDue, isReviewHour, newActivityNotice, reviewNotice } from './notification-rules';

describe('regras das notificações', () => {
  it('dia de Brasília: 01h UTC ainda é o dia anterior', () => {
    expect(brtDayStart(new Date('2026-11-19T01:00:00Z')).toISOString()).toBe('2026-11-18T03:00:00.000Z');
    expect(brtDayEnd(new Date('2026-11-18T15:00:00Z')).toISOString()).toBe('2026-11-19T02:59:59.999Z');
  });

  it('aviso de revisão só depois das 8h de Brasília', () => {
    expect(isReviewHour(new Date('2026-11-18T10:59:00Z'))).toBe(false); // 07h59
    expect(isReviewHour(new Date('2026-11-18T11:00:00Z'))).toBe(true); // 08h
  });

  it('prazo por extenso no fuso de Brasília', () => {
    expect(formatDue(new Date('2026-11-21T22:30:00Z'))).toBe('sábado, 21/11, às 19h30');
    expect(formatDue(new Date('2026-11-22T13:00:00Z'))).toBe('domingo, 22/11, às 10h');
  });

  it('textos de nova atividade e de revisão', () => {
    expect(newActivityNotice({ type: 'SIMULATION', title: 'Simulado 3', className: '3º A', dueAt: null })).toEqual({ title: 'Novo simulado na turma 3º A', body: 'Simulado 3' });
    expect(newActivityNotice({ type: 'LIST', title: 'Funções', className: '3º A', dueAt: new Date('2026-11-21T22:30:00Z') }).title).toBe('Nova lista de exercícios na turma 3º A');
    expect(reviewNotice(1).title).toBe('Você tem 1 revisão para hoje');
    expect(reviewNotice(4).title).toBe('Você tem 4 revisões para hoje');
  });
});
