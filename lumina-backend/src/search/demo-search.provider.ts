import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionAccessService } from '../questions/question-access.service';
import { QuestionsRepository } from '../questions/questions.repository';
import { QuestionTextSearchRepository } from '../questions/question-text-search.repository';
import {
  WebSearchHit,
  WebSearchHitClassification,
  WebSearchProvider,
  WebSearchQuery,
} from './search-provider.interface';

/** Provedor de DEMONSTRAÇÃO (item 10): executa o pipeline DE BUSCA por
 * questões públicas da web que o Google CSE faz, mas buscando no banco
 * Lumina acessível ao usuário (workspace pessoal + banco central). Retorna
 * APENAS metadados (título derivado, link absoluto para a questão, trecho)
 * com classificação do catálogo — o usuário transcreve o conteúdo ao salvar.
 *
 * É SEMPRE sinalizado no response (`provider=demo`, `demoMode=true`) para
 * que origem de demonstração e origem real nunca se confundam.
 *
 * Direitos autorais: o hit carrega title/link/snippet (metadados públicos).
 * O conteúdo integral da questão é transcrito pelo usuário no momento de
 * salvar e a URL/fonte é sempre preservada (sourceName/sourceId). */
@Injectable()
export class DemoWebSearchProvider implements WebSearchProvider {
  readonly name = 'demo' as const;

  constructor(
    private readonly questionsRepository: QuestionsRepository,
    private readonly questionAccessService: QuestionAccessService,
    private readonly textSearchRepository: QuestionTextSearchRepository,
    private readonly configService: ConfigService,
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

    // Termo livre vira pré-filtro de ids insensível a acento; o resto dos
    // filtros (disciplina, assunto, prova, dificuldade) segue no Prisma.
    const textIds = query.q
      ? await this.textSearchRepository.findIdsMatching(query.q, workspaceIds)
      : null;

    const results = await this.questionsRepository.findMany(
      {
        workspaceId: { in: workspaceIds },
        ...(textIds ? { id: { in: textIds } } : {}),
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
      },
      { skip: 0, take: Math.min(limit, 20) },
    );

    // No modo demonstração o "link da fonte" aponta para a própria questão na
    // Lumina — e precisa ser URL absoluta http(s), como exige a atribuição em
    // POST /search/save (o usuário pode conferir a questão e transcrevê-la).
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5174'
    ).replace(/\/+$/, '');

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
        link: `${frontendUrl}/app/questoes/${question.id}`,
        snippet: question.stem.slice(0, 200),
        sourceName: question.sourceName ?? 'Lumina',
        sourceId: question.sourceId ?? question.id,
        classification,
      };
    });
  }
}
