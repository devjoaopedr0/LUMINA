import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionDifficulty } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';

/**
 * Serviço de simulado adaptativo (item 16 do inventário).
 *
 * Algoritmo simplificado estilo IRT (Teoria de Resposta ao Item):
 * - Cada habilidade tem uma estimativa de capacidade (ability) entre 0.0 e 1.0
 * - Questão correta → ability aumenta; incorreta → ability diminui
 * - A próxima questão é escolhida com dificuldade próxima à ability atual
 * - Dificuldade: FACIL (~0.25), MEDIA (~0.5), DIFICIL (~0.75)
 */
@Injectable()
export class AdaptiveSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionAccess: QuestionAccessService,
  ) {}

  /** Inicia uma nova sessão adaptativa para o aluno. */
  async start(userId: string, examId?: string): Promise<{ sessionId: string }> {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const session = await this.prisma.adaptiveSimulationSession.create({
      data: {
        userId,
        examId: examId ?? null,
        status: 'IN_PROGRESS',
        estimatedAbility: 0.5,
        skills: {},
      },
    });

    return { sessionId: session.id };
  }

  /** Obtém a próxima questão para a sessão adaptativa. */
  async nextQuestion(sessionId: string): Promise<{
    questionId: string;
    stem: string;
    subject: string;
    topic: string;
    difficulty: QuestionDifficulty;
    alternatives: { position: number; text: string }[];
    skill: string;
    subSkill?: string;
  } | null> {
    const session = await this.prisma.adaptiveSimulationSession.findUnique({
      where: { id: sessionId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) throw new NotFoundException('Sessão adaptativa não encontrada.');
    if (session.status !== 'IN_PROGRESS') throw new BadRequestException('Sessão não está em andamento.');

    // Habilidades já testadas nesta sessão
    const testedSkills = new Set(session.steps.map((s) => s.skill));

    // Busca questões disponíveis no workspace do aluno, filtrando por exame se houver
    const where: Prisma.QuestionWhereInput = {
      workspace: { members: { some: { userId: session.userId, status: 'ACTIVE' } } },
      alternatives: {
        some: { isCorrect: true },
        every: { question: { alternatives: { some: { isCorrect: true } } } },
      },
    };
    if (session.examId) where.examId = session.examId;

    const questions = await this.prisma.question.findMany({
      where,
      include: { alternatives: { orderBy: { position: 'asc' } } },
      take: 200, // limite para performance
    });

    if (questions.length === 0) return null;

    // Escolhe a questão cuja dificuldade mais se aproxima da ability estimada
    // Mapeia difficulty → valor numérico
    const difficultyValue = (d: QuestionDifficulty): number => {
      switch (d) {
        case 'FACIL': return 0.25;
        case 'MEDIA': return 0.5;
        case 'DIFICIL': return 0.75;
      }
    };

    // Prioriza habilidades não testadas, depois a mais fraca
    const skills = questions
      .map((q) => ({ skill: q.topic, question: q }))
      .filter(({ skill }) => !testedSkills.has(skill));

    let candidates = skills.length > 0 ? skills : questions.map((q) => ({ skill: q.topic, question: q }));

    // Ordena por proximidade da difficulty com a ability estimada
    candidates.sort((a, b) => {
      const da = Math.abs(difficultyValue(a.question.difficulty) - session.estimatedAbility);
      const db = Math.abs(difficultyValue(b.question.difficulty) - session.estimatedAbility);
      return da - db;
    });

    const chosen = candidates[0];
    if (!chosen) return null;

    const q = chosen.question;
    const correctAlt = q.alternatives.find((a) => a.isCorrect);

    return {
      questionId: q.id,
      stem: q.stem,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      alternatives: q.alternatives.map((a) => ({ position: a.position, text: a.text })),
      skill: chosen.skill,
      subSkill: undefined,
    };
  }

  /** Registra a resposta do aluno e atualiza a estimativa de habilidade. */
  async answer(
    sessionId: string,
    questionId: string,
    selectedPosition: number,
    timeSpentSeconds?: number,
  ): Promise<{
    isCorrect: boolean;
    correctPosition: number;
    abilityBefore: number;
    abilityAfter: number;
    skill: string;
    estimatedAbility: number;
    finished: boolean;
    diagnosis?: { skill: string; correct: number; total: number; ability: number }[];
  }> {
    const session = await this.prisma.adaptiveSimulationSession.findUnique({
      where: { id: sessionId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) throw new NotFoundException('Sessão adaptativa não encontrada.');
    if (session.status !== 'IN_PROGRESS') throw new BadRequestException('Sessão não está em andamento.');

    // Busca a questão
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { alternatives: true },
    });
    if (!question) throw new NotFoundException('Questão não encontrada.');

    const correctPosition = question.alternatives.find((a) => a.isCorrect)?.position ?? 0;
    const isCorrect = selectedPosition === correctPosition;

    // Atualização simplificada de ability (IRT 1PL aproximado)
    // ability_after = ability_before + (isCorrect ? +0.1 : -0.1) * (1 - difficulty_factor)
    // difficulty_factor: FACIL=0.2, MEDIA=0.5, DIFICIL=0.8
    const difficultyFactor = (d: QuestionDifficulty): number => {
      switch (d) {
        case 'FACIL': return 0.2;
        case 'MEDIA': return 0.5;
        case 'DIFICIL': return 0.8;
      }
    };

    const abilityBefore = session.estimatedAbility;
    const stepSize = 0.1 * (1 - difficultyFactor(question.difficulty));
    const abilityAfter = Math.max(0, Math.min(1, abilityBefore + (isCorrect ? stepSize : -stepSize)));

    // Atualiza skills JSON
    const skills = (session.skills ?? {}) as Record<string, { correct: number; total: number; ability: number }>;
    const skillKey = question.topic;
    if (!skills[skillKey]) skills[skillKey] = { correct: 0, total: 0, ability: abilityAfter };
    skills[skillKey].total += 1;
    if (isCorrect) skills[skillKey].correct += 1;
    skills[skillKey].ability = abilityAfter;

    // Cria o passo
    const step = await this.prisma.adaptiveSimulationStep.create({
      data: {
        sessionId,
        userId: session.userId,
        questionId,
        difficulty: question.difficulty,
        skill: skillKey,
        subSkill: null,
        selectedPosition,
        isCorrect,
        abilityBefore,
        abilityAfter,
        timeSpentSeconds: timeSpentSeconds ?? null,
      },
    });

    // Atualiza sessão
    await this.prisma.adaptiveSimulationSession.update({
      where: { id: sessionId },
      data: { estimatedAbility: abilityAfter, skills },
    });

    // Diagnóstico por habilidade
    const diagnosis = Object.entries(skills).map(([skill, data]) => ({
      skill,
      correct: data.correct,
      total: data.total,
      ability: data.ability,
    }));

    // Critério de parada: 20 questões OU 3 habilidades com ability > 0.8 (dominadas) OU 3 com ability < 0.2 (lacunas)
    const stepsCount = session.steps.length + 1;
    const strongSkills = diagnosis.filter((d) => d.ability > 0.8 && d.total >= 2).length;
    const weakSkills = diagnosis.filter((d) => d.ability < 0.2 && d.total >= 2).length;
    const finished = stepsCount >= 20 || strongSkills >= 3 || weakSkills >= 3;

    if (finished) {
      await this.prisma.adaptiveSimulationSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
    }

    return {
      isCorrect,
      correctPosition,
      abilityBefore,
      abilityAfter,
      skill: skillKey,
      estimatedAbility: abilityAfter,
      finished,
      diagnosis: finished ? diagnosis : undefined,
    };
  }

  /** Finaliza a sessão manualmente. */
  async finish(sessionId: string): Promise<void> {
    const session = await this.prisma.adaptiveSimulationSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sessão adaptativa não encontrada.');
    if (session.status !== 'IN_PROGRESS') return;

    await this.prisma.adaptiveSimulationSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
  }

  /** Abandona a sessão. */
  async abandon(sessionId: string): Promise<void> {
    await this.prisma.adaptiveSimulationSession.update({
      where: { id: sessionId },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
  }

  /** Obtém o resumo da sessão com diagnóstico final. */
  async summary(sessionId: string): Promise<{
    sessionId: string;
    status: string;
    estimatedAbility: number;
    steps: number;
    skills: { skill: string; correct: number; total: number; accuracy: number; ability: number }[];
    strongAreas: string[];
    weakAreas: string[];
    startedAt: Date;
    finishedAt: Date | null;
  }> {
    const session = await this.prisma.adaptiveSimulationSession.findUnique({
      where: { id: sessionId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Sessão adaptativa não encontrada.');

    const skills = (session.skills ?? {}) as Record<string, { correct: number; total: number; ability: number }>;
    const skillsArray = Object.entries(skills).map(([skill, data]) => ({
      skill,
      correct: data.correct,
      total: data.total,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 1000) / 10 : 0,
      ability: data.ability,
    }));

    return {
      sessionId: session.id,
      status: session.status,
      estimatedAbility: session.estimatedAbility,
      steps: session.steps.length,
      skills: skillsArray,
      strongAreas: skillsArray.filter((s) => s.ability > 0.7 && s.total >= 2).map((s) => s.skill),
      weakAreas: skillsArray.filter((s) => s.ability < 0.3 && s.total >= 2).map((s) => s.skill),
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
    };
  }

  /** Lista sessões do aluno. */
  async list(userId: string) {
    return this.prisma.adaptiveSimulationSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        examId: true,
        status: true,
        estimatedAbility: true,
        startedAt: true,
        finishedAt: true,
        _count: { select: { steps: true } },
      },
    });
  }
}