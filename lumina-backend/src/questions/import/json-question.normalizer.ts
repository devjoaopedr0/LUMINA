import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { ExternalQuestion } from '../domain/question-types';
import { QuestionNormalizer } from './question-normalizer';

/**
 * Normalizador de fontes JSON. Aceita um array de objetos "genéricos" —
 * provenientes de datasets/APIs — e mapeia campos comuns com tolerância a
 * variações de nomenclatura (ex: "disciplina"/"materia"/"subject"). Fontes
 * com formato muito específico devem estender este normalizador com o
 * mapeamento próprio. Registros não mapeáveis viram ExternalQuestion com o
 * sourceType padrão IMPORTED (o validador decide o destino de cada um).
 */
export class JsonQuestionNormalizer implements QuestionNormalizer {
  constructor(private readonly aliases: Record<string, string> = DEFAULT_ALIASES) {}

  normalize(raw: unknown): ExternalQuestion[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
      .map((record) => this.mapRecord(record));
  }

  private mapRecord(record: Record<string, unknown>): ExternalQuestion {
    const get = (key: string): unknown => {
      const direct = record[key];
      if (direct !== undefined && direct !== null) return direct;
      const alias = this.aliases[key];
      if (alias && record[alias] !== undefined && record[alias] !== null) return record[alias];
      return undefined;
    };

    const rawOptions = get('options') ?? get('alternatives');
    const options = Array.isArray(rawOptions)
      ? rawOptions
          .filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
          .map((option) => ({
            text: String(option.text ?? option.statement ?? ''),
            correct: option.correct === true || option.isCorrect === true,
          }))
      : [];

    return {
      sourceType: this.parseSourceType(get('sourceType')) ?? QuestionSourceType.IMPORTED,
      sourceName: String(get('sourceName') ?? get('source') ?? 'dataset',
      ),
      sourceId: this.optionalString(get('sourceId')),
      exam: this.optionalString(get('exam')),
      year: this.optionalInt(get('year')),
      examNumber: this.optionalInt(get('examNumber') ?? get('number')),
      subject: String(get('subject') ?? ''),
      topic: this.optionalString(get('topic')),
      difficulty: this.parseDifficulty(get('difficulty')) ?? QuestionDifficulty.MEDIA,
      stem: String(get('stem') ?? get('statement') ?? ''),
      options,
      correctLetter: this.optionalString(get('correctLetter') ?? get('answer')),
      correctOptionIndex: this.optionalInt(get('correctOptionIndex') ?? get('correctIndex')),
      explanation: this.optionalString(get('explanation')),
      imageUrl: this.optionalString(get('imageUrl')),
    };
  }

  private optionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text ? text : undefined;
  }

  private optionalInt(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private parseDifficulty(value: unknown): QuestionDifficulty | undefined {
    const normalized = String(value ?? '').toUpperCase();
    const byLabel: Record<string, QuestionDifficulty> = {
      FACIL: QuestionDifficulty.FACIL,
      EASY: QuestionDifficulty.FACIL,
      FÁCIL: QuestionDifficulty.FACIL,
      MEDIA: QuestionDifficulty.MEDIA,
      MEDIUM: QuestionDifficulty.MEDIA,
      MÉDIA: QuestionDifficulty.MEDIA,
      DIFICIL: QuestionDifficulty.DIFICIL,
      HARD: QuestionDifficulty.DIFICIL,
      DIFÍCIL: QuestionDifficulty.DIFICIL,
    };
    return byLabel[normalized];
  }

  private parseSourceType(value: unknown): QuestionSourceType | undefined {
    const normalized = String(value ?? '').toUpperCase();
    const byLabel: Record<string, QuestionSourceType> = {
      OFFICIAL: QuestionSourceType.OFFICIAL,
      PARTNER: QuestionSourceType.PARTNER,
      GENERATED: QuestionSourceType.GENERATED,
      IMPORTED: QuestionSourceType.IMPORTED,
      GENERADA: QuestionSourceType.GENERATED,
      IMPORTADA: QuestionSourceType.IMPORTED,
      PARCEIRO: QuestionSourceType.PARTNER,
      OFICIAL: QuestionSourceType.OFFICIAL,
    };
    return byLabel[normalized];
  }
}

const DEFAULT_ALIASES: Record<string, string> = {
  subject: 'disciplina',
  topic: 'assunto',
  exam: 'prova',
  stem: 'enunciado',
  options: 'alternativas',
  explanation: 'gabarito_comentado',
  sourceName: 'fonte',
  sourceId: 'id_fonte',
};
