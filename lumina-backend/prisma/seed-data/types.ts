export type SeedDifficulty = 'FACIL' | 'MEDIA' | 'DIFICIL';

export interface SeedAlternative {
  text: string;
  isCorrect: boolean;
}

export interface SeedQuestion {
  subject: string;
  topic: string;
  difficulty: SeedDifficulty;
  exam: string;
  year: number;
  examNumber?: number;
  stem: string;
  explanation?: string;
  alternatives: SeedAlternative[];
}
