import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { ExternalQuestion, ExternalQuestionOption } from '../domain/question-types';
import { QuestionNormalizer } from './question-normalizer';

/**
 * Normalizador de arquivos CSV. Cada linha é uma questão; o valor da resposta
 * correta pode ser uma letra (A..F) numa coluna `resposta` ou, quando as
 * alternativas são colunas separadas, colunas auxiliares `resposta_correta`
 * (true/false por alternativa). Aceita `;` ou `,` como separador.
 */
export class CsvQuestionNormalizer implements QuestionNormalizer {
  constructor(private readonly defaultSourceName = 'csv') {}

  normalize(raw: unknown): ExternalQuestion[] {
    if (typeof raw !== 'string') return [];

    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return [];

    const delimiter = this.detectDelimiter(lines[0]);
    const headers = this.parseLine(lines[0], delimiter).map((header) =>
      header.toLowerCase().trim(),
    );

    return lines
      .slice(1)
      .map((line) => this.parseLine(line, delimiter))
      .filter((cells) => cells.length === headers.length)
      .map((cells) => this.mapRow(headers, cells));
  }

  private mapRow(headers: string[], cells: string[]): ExternalQuestion {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index].trim();
    });

    const optionTexts = ['A', 'B', 'C', 'D', 'E', 'F']
      .map((letter) => {
        const key = letter.toLowerCase();
        return { letter, text: row[key] ?? row[`opcao_${key}`] };
      })
      .filter((option) => option.text);

    const options: ExternalQuestionOption[] = optionTexts.map((option) => {
      const isCorrect = (row['resposta_correta'] ?? '')
        .toUpperCase()
        .split(',')
        .includes(option.letter);
      return { text: option.text, correct: isCorrect || undefined };
    });

    return {
      sourceType: this.parseSourceType(row['sourcetype']) ?? QuestionSourceType.IMPORTED,
      sourceName: row['sourcename'] ?? row['fonte'] ?? this.defaultSourceName,
      sourceId: row['sourceid'] ?? undefined,
      exam: row['exam'] ?? row['prova'] ?? undefined,
      year: this.optionalInt(row['year'] ?? row['ano']),
      examNumber: this.optionalInt(row['examnumber'] ?? row['numero']),
      subject: row['subject'] ?? row['disciplina'] ?? '',
      topic: row['topic'] ?? row['assunto'] ?? undefined,
      difficulty:
        this.parseDifficulty(row['difficulty']) ?? QuestionDifficulty.MEDIA,
      stem: row['stem'] ?? row['enunciado'] ?? '',
      options,
      correctLetter: row['resposta'] ?? row['answer'] ?? undefined,
      explanation: row['explanation'] ?? row['gabarito'] ?? undefined,
      imageUrl: row['imageurl'] ?? undefined,
    };
  }

  private detectDelimiter(line: string): string {
    return (line.match(/;/g) ?? []).length > (line.match(/,/g) ?? []).length ? ';' : ',';
  }

  private parseLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        cells.push(cell);
        cell = '';
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  }

  private optionalInt(value: string | undefined): number | undefined {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private parseDifficulty(value: string | undefined): QuestionDifficulty | undefined {
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

  private parseSourceType(value: string | undefined): QuestionSourceType | undefined {
    const normalized = String(value ?? '').toUpperCase();
    const byLabel: Record<string, QuestionSourceType> = {
      OFFICIAL: QuestionSourceType.OFFICIAL,
      PARTNER: QuestionSourceType.PARTNER,
      GENERATED: QuestionSourceType.GENERATED,
      IMPORTED: QuestionSourceType.IMPORTED,
      OFICIAL: QuestionSourceType.OFFICIAL,
      IMPORTADA: QuestionSourceType.IMPORTED,
      GENERADA: QuestionSourceType.GENERATED,
      PARCEIRO: QuestionSourceType.PARTNER,
    };
    return byLabel[normalized];
  }
}
