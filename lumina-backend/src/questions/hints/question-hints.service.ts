import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAX_HINT_LEVEL, MIN_HINT_LEVEL, QuestionHintDto } from '../dto/question-resolution.dto';
import { descricaoDaQuestao, HintProvider, HintRequest } from './hint-provider.interface';
import { StudyGuideHintProvider } from './study-guide-hint.provider';

/**
 * Token do provedor de dicas. Declarado aqui (e não no fim do arquivo) porque
 * o `@Inject` é avaliado na decoração da classe, ou seja, antes de qualquer
 * constante escrita depois dela.
 */
export const QUESTION_HINTS_PROVIDER = 'QUESTION_HINTS_PROVIDER';

/** Comprimento mínimo do texto de uma alternativa para a checagem de vazamento
 * fazer sentido: respostas curtas ("8", "12", "sim") aparecem por acaso em
 * qualquer frase e gerariam falso positivo. */
const MIN_LEAK_CHECK_LENGTH = 4;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Dicas de questão que NÃO revelam a resposta.
 *
 * A garantia tem duas camadas:
 *
 * 1. estrutural — o provedor recebe só enunciado e classificação
 *    (`HintRequest`); o gabarito nunca chega até ele;
 * 2. defensiva — o texto gerado é conferido contra a alternativa correta e,
 *    se por qualquer motivo a conter, é descartado no lugar por uma dica
 *    neutra. É o que protege quando um provedor de modelo de linguagem for
 *    plugado no lugar das regras.
 */
@Injectable()
export class QuestionHintsService {
  private readonly logger = new Logger(QuestionHintsService.name);

  constructor(
    @Inject(QUESTION_HINTS_PROVIDER) private readonly provider: HintProvider,
  ) {}

  /** Nível efetivo da dica: sempre dentro de 1..3, com 1 como padrão. */
  static clampLevel(level?: number): number {
    if (level === undefined || Number.isNaN(level)) return MIN_HINT_LEVEL;
    return Math.min(MAX_HINT_LEVEL, Math.max(MIN_HINT_LEVEL, Math.trunc(level)));
  }

  async hint(
    question: {
      stem: string;
      subject: string;
      topic: string;
      difficulty: HintRequest['difficulty'];
      alternatives: { text: string; isCorrect: boolean }[];
    },
    level?: number,
  ): Promise<QuestionHintDto> {
    const effectiveLevel = QuestionHintsService.clampLevel(level);
    const request: HintRequest = {
      stem: question.stem,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      alternativesCount: question.alternatives.length,
      level: effectiveLevel,
    };

    const generated = await this.provider.generate(request);
    const correctText = question.alternatives.find((a) => a.isCorrect)?.text ?? '';

    return {
      level: effectiveLevel,
      hint: this.leaksAnswer(generated, correctText) ? this.safeFallback(request) : generated,
      provider: this.provider.name,
      maxLevel: MAX_HINT_LEVEL,
    };
  }

  /** true quando o texto da dica contém a alternativa correta. */
  private leaksAnswer(hint: string, correctText: string): boolean {
    const needle = normalize(correctText);
    if (needle.length < MIN_LEAK_CHECK_LENGTH) return false;
    return normalize(hint).includes(needle);
  }

  /** Dica neutra usada quando uma dica é descartada por vazar a resposta:
   * continua ajudando, sem citar alternativa nenhuma. */
  private safeFallback(request: HintRequest): string {
    this.logger.warn(
      `Dica descartada: o texto gerado para a questão de ${request.subject} continha a alternativa correta. ` +
        'Isso é um defeito do provedor de dicas — não acontece com o provedor por regras.',
    );
    return (
      `Releia o enunciado com calma: esta questão é ${descricaoDaQuestao(request)}. ` +
      'Escreva primeiro o que se pede e com quais dados; depois escolha a alternativa que faz sentido com esse cálculo.'
    );
  }
}

/**
 * Provedor padrão das dicas: o guia de estudo por regras, que funciona sem
 * chave de API nenhuma. Para plugar um modelo de linguagem, registre outro
 * `HintProvider` (mesma interface, outro `name`) neste token — o serviço não
 * muda.
 */
export function createDefaultHintProvider(): HintProvider {
  return new StudyGuideHintProvider();
}
