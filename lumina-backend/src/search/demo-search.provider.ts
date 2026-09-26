import { Injectable } from '@nestjs/common';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { QuestionAccessService } from '../questions/question-access.service';
import { QuestionsRepository } from '../questions/questions.repository';
import './search-provider.interface';
import {
  WebSearchHit,
  WebSearchHitClassification,
  WebSearchProvider,
  WebSearchQuery,
} from './search-provider.interface';

/** Provedor de DEMONSTRAÇÃO (item 10): executa o pipeline DE BUSCA por
 * questões públicas da web que o Google CSE faz, mas buscando no banco
 * Lumina acessível ao usuário (workspace pessoal + banco central). Retorna
 * APENAS metadados públicos (título derivado, link interno, trecho) com
 * classificação do catálogo — o usuário transcreve o conteúdo ao salvar.
 *
 * É SEMPRE sinalizado no response (`provider=demo`, `demoMode=true`) para
 * que origem de demonstração e origem real nunca se confundam.
 *
 * Direitos autorais: o hit carrega title/link/snippet (public metadata).
 * O conteúdo integral da questão é transcrito pelo usuário no momento de
 * salvar e a URL/fonte é sempre preservada (sourceName/sourceId). */
@Injectable()
export class DemoWebSearchProvider implements WebSearchProvider {
  readonly name = 'demo' as const;
  private readonly demoHits: WebSearchHit[] = [
    {
      title: 'ENEM 2023 — Matemática (funções exponenciais)',
      link: '/app/questoes/demo/enem-2023-funcoes-exponenciais',
      snippet:
        'Questão demonstração: crescimento populacional modelado por f(t)=100·2^(t/3).',
      sourceName: 'Lumina (demo)',
      sourceId: 'demo:enem-2023-funcoes',
      classification: {
        subject: 'Matemática',
        exam: 'ENEM',
        year: 2023,
        difficulty: QuestionDifficulty.MEDIA,
      },
    },
    {
      title: 'UECE 2022 — Física (ondas)',
      link: '/app/questoes/demo/uece-2022-ondas',
      snippet:
        'Questão demonstração: interferência de ondas em corda com extremidades fixas.',
      sourceName: 'Lumina (demo)',
      sourceId: 'demo:uece-2022-ondas',
      classification: {
        subject: 'Física',
        exam: 'UECE',
        year: 2022,
        difficulty: QuestionDifficulty.FACIL,
      },
    },
    {
      title: 'ENEM 2021 — Biologia (ecologia)',
      link: '/app/questoes/demo/enem-2021-ecologia',
      snippet:
        'Questão demonstração: cadeia alimentar e fluxo de energia em ecossistema.',
      sourceName: 'Lumina (demo)',
      sourceId: 'demo:enem-2021-ecologia',
      classification: {
        subject: 'Biologia',
        exam: 'ENEM',
        year: 2021,
        difficulty: QuestionDifficulty.MEDIA,
      },
    },
  ];

  constructor(
    private readonly questionsRepository: QuestionsRepository,
    private readonly questionAccessService: QuestionAccessService,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async searchWeb(
    query: WebSearchQuery,
    userId: string,
    limit: number,
  ): Promise<WebSearchHit[]> {
    const personal = await this.questionAccessService.getPersonalWorkspace(userId);
    const bank = await this.questionAccessService.getBankWorkspace();

    const workspaceIds = [personal?.id, bank?.id].filter(
      (id): id is string => Boolean(id),
    );
    if (workspaceIds.length === 0) {
      return [];
    }

    const results = await this.questionsRepository.findMany(
      {
        workspaceId: { in: workspaceIds },
        ...(query.subject
          ? { subject: { contains: query.subject, mode: 'insensitive' } }
          : {}),
        ...(query.topic
          ? { topic: { contains: query.topic, mode: 'insensitive' } }
          : {}),
        ...(query.exam
          ? { exam: { contains: query.exam, mode: 'insensitive' } }
          : {}),
        ...(query.difficulty ? { difficulty: query.difficulty } : {}),
        ...(query.q
          ? {
              OR: [
                { subject: { contains: query.q, mode: 'insensitive' } },
                { topic: { contains: query.q, mode: 'insensitive' } },
                { exam: { contains: query.q, mode: 'insensitive' } },
                { stem: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      { skip: 0, take: Math.min(limit, 20) },
    );

    return results.map((question) => {
      const classification: WebSearchHitClassification = {
        subject: question.subject,
        topic: question.topic,
        exam: question.exam,
        year: question.year,
        difficulty: question.difficulty,
      };
      return {
        title: `${question.exam} ${question.year ?? ''} — ${question.subject}`.trim(),
        link: `/app/questoes/${question.id}`,
        snippet: question.stem.slice(0, 200),
        sourceName: question.sourceName ?? 'Lumina',
        sourceId: question.sourceId ?? question.id,
        classification,
      };
    });
  }
}
