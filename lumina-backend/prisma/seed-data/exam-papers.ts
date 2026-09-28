export type SeedExamPaper = {
  exam: string;
  year: number;
  /** Quantas páginas de exemplar a prova tem. */
  pages: number;
  /** Gabarito oficial: número da questão -> letra da alternativa correta. */
  gabarito: Record<string, string>;
  metadata: {
    totalPages: number;
    hasGabarito: boolean;
    hasCaderno: boolean;
    sourceUrl: string;
  };
};

/** Item 19 do inventário. Provas do acervo de demonstração. Duas edições do
 * mesmo vestibular (ENEM 2022 e 2023) para a tela de comparação ter o que
 * medir. As páginas são exemplares em SVG, não a prova oficial. */
export const EXAM_PAPERS: SeedExamPaper[] = [
  {
    exam: 'ENEM',
    year: 2023,
    pages: 4,
    gabarito: { '1': 'E', '2': 'C', '3': 'A', '4': 'D', '5': 'B' },
    metadata: {
      totalPages: 4,
      hasGabarito: true,
      hasCaderno: true,
      sourceUrl: 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem',
    },
  },
  {
    exam: 'ENEM',
    year: 2022,
    pages: 4,
    gabarito: { '1': 'D', '2': 'B', '3': 'A', '4': 'C', '5': 'E' },
    metadata: {
      totalPages: 4,
      hasGabarito: true,
      hasCaderno: true,
      sourceUrl: 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem',
    },
  },
  {
    exam: 'FUVEST',
    year: 2023,
    pages: 2,
    gabarito: { '1': 'B', '2': 'D' },
    metadata: {
      totalPages: 2,
      hasGabarito: true,
      hasCaderno: false,
      sourceUrl: 'https://www.fuvest.registro.br/',
    },
  },
];
