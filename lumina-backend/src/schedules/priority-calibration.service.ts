import { Injectable } from '@nestjs/common';
import { StudyActivityType, StudyTaskStatus, TopicMasteryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { masteryHistoryDay } from '../questions/topic-mastery.service';
import { calibratePriorityWeights, type PriorityCalibration, type PriorityGainSample } from './priority-calibration';
import { topicPriorityTerms } from './schedule-priority';

/** Muda devagar (precisa de muitas tarefas novas): uma hora basta. */
const CACHE_MS = 60 * 60_000;
/** Quanto do passado entra na calibração. */
const WINDOW_DAYS = 180;
/** Dias depois da conclusão em que o ganho de domínio é medido. */
export const GAIN_WINDOW_DAYS = 7;
/** Início de topic_mastery_history: antes disso, a migration só criou a linha
 *  do último estudo, e o estado de antes da tarefa não dá para reconstruir. */
const HISTORY_START = new Date('2026-10-13T00:00:00Z');
/** Tipos de tarefa escolhidos pela prioridade. Revisão entra pela data da
 *  revisão espaçada e redação tem rotina própria: não dizem nada dos pesos. */
const PRIORITY_ACTIVITY_TYPES = [StudyActivityType.TEORIA, StudyActivityType.QUESTOES, StudyActivityType.SIMULADO];

/**
 * Junta, de todos os alunos, as tarefas de tópico concluídas e o ganho de
 * domínio de cada uma, e devolve os pesos calibrados (priority-calibration.ts).
 *
 * O estado do tópico antes da tarefa (domínio, se já tinha sido estudado,
 * dias parado) e depois dela vem de topic_mastery_history, que tem uma linha
 * por dia em que o domínio mudou — então não precisa guardar nada na tarefa.
 */
@Injectable()
export class PriorityCalibrationService {
  private cache: { at: number; value: Promise<PriorityCalibration> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async calibration(): Promise<PriorityCalibration> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const value = this.compute();
      this.cache = { at: Date.now(), value };
      // Se falhar, a próxima chamada tenta de novo em vez de repetir o erro.
      value.catch(() => (this.cache = null));
    }
    return this.cache.value;
  }

  async weights() {
    return (await this.calibration()).weights;
  }

  private async compute(): Promise<PriorityCalibration> {
    const now = Date.now();
    const since = new Date(Math.max(HISTORY_START.getTime(), now - WINDOW_DAYS * 86_400_000));
    // Só tarefas cuja janela de ganho já fechou.
    const until = new Date(now - GAIN_WINDOW_DAYS * 86_400_000);
    if (until <= since) return calibratePriorityWeights([]);

    const tasks = await this.prisma.studyTask.findMany({
      where: {
        status: StudyTaskStatus.DONE,
        topicId: { not: null },
        activityType: { in: PRIORITY_ACTIVITY_TYPES },
        completedAt: { gte: since, lte: until },
      },
      select: { topicId: true, completedAt: true, schedule: { select: { userId: true } } },
    });
    if (tasks.length === 0) return calibratePriorityWeights([]);

    const history = await this.prisma.topicMasteryHistory.findMany({
      where: {
        userId: { in: [...new Set(tasks.map((task) => task.schedule.userId))] },
        topicId: { in: [...new Set(tasks.map((task) => task.topicId!))] },
      },
      select: { userId: true, topicId: true, day: true, masteryScore: true, status: true },
      orderBy: { day: 'asc' },
    });
    const byKey = new Map<string, typeof history>();
    for (const row of history) {
      const key = `${row.userId}:${row.topicId}`;
      byKey.set(key, [...(byKey.get(key) ?? []), row]);
    }

    const samples: PriorityGainSample[] = [];
    for (const task of tasks) {
      const userId = task.schedule.userId;
      const rows = byKey.get(`${userId}:${task.topicId}`) ?? [];
      const day = masteryHistoryDay(task.completedAt!);
      const gainEnd = new Date(day.getTime() + GAIN_WINDOW_DAYS * 86_400_000);
      // A linha do próprio dia já traz o efeito da tarefa: o "antes" é o
      // último dia anterior.
      const before = last(rows.filter((row) => row.day < day));
      const after = last(rows.filter((row) => row.day <= gainEnd));
      if (!after) continue;
      const terms = topicPriorityTerms({
        masteryScore: before?.masteryScore ?? null,
        status: before?.status ?? TopicMasteryStatus.NAO_ESTUDADO,
        lastStudiedAt: before?.day ?? null,
        questionCount: 0,
        maxQuestionCountInSubject: 0,
        targetHours: 0,
        maxTargetHoursInSchedule: 0,
        now: day,
      });
      samples.push({ userId, terms, gain: after.masteryScore - (before?.masteryScore ?? 0) });
    }
    return calibratePriorityWeights(samples);
  }
}

function last<T>(items: T[]): T | null {
  return items.length > 0 ? items[items.length - 1] : null;
}
