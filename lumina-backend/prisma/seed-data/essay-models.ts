export type SeedEssayModel = {
  year: number;
  exam: string;
  theme: string;
  /** Texto reescrito para estudo — não é o original do Inep. */
  text: string;
  /** Nota por competência, de 0 a 200. */
  competencies: Record<string, number>;
  /** Anotação do que cada competência demonstra neste texto. */
  highlights: Record<string, string>;
};

export const ESSAY_MODELS: SeedEssayModel[] = [
  {
    year: 2023,
    exam: 'ENEM',
    theme: 'A velhice brasileira e o trabalho invisível de quem cuida',
    competencies: { C1: 200, C2: 200, C3: 200, C4: 200, C5: 200 },
    highlights: {
      C1: 'Tese na primeira pessoa do plural: reconhecer o cuidado como trabalho, e não como favor.',
      C2: 'Causa (dado do IBGE) e argumento (12% dos afastamentos são feitos por homens) sustentam a tese.',
      C3: 'Sequência explicativa com conectivos de oposição e conclusão: embora, portanto, enquanto.',
      C4: 'Proposta concreta: cotas de licenças de cuidado e registro das horas dedicadas ao idoso.',
      C5: 'Agente social definido (governo, empresas) e objeto claro (a licença de cuidado).',
    },
    text: [
      'A velhice brasileira e o trabalho invisível de quem cuida',
      '',
      'A população do Brasil ultrapassou a marca dos 60 milhões de pessoas idosas, e o crescimento dessa faixa etária revela um trabalho essencial e, ainda assim, invisível: o cuidado prestado por familiares, na maioria das vezes mulheres, que deixam o mercado de trabalho para assumir a tarefa.',
      '',
      'Embora a legislação garanta a licença-maternidade e a licença-paternidade, na prática, quem interrompe a trajetória profissional é, na quase totalidade dos casos, a mulher. Dados do Instituto de Geografia e Estatística indicam que apenas 12% dos afastamentos por cuidado são realizados por homens. É preciso, portanto, reconhecer o cuidado como trabalho, e não como favor, para que a sociedade calcule o custo real de manter seus idosos em casa. Enquanto o trabalho não for contabilizado, ele permanecerá fora das estatísticas e fora do orçamento público.',
      '',
      'Medidas como as cotas de licenças de cuidado e o registro obrigatório das horas dedicadas ao acompanhamento de familiares idosos são caminhos possíveis para essa mudança.',
    ].join('\n'),
  },
  {
    year: 2022,
    exam: 'ENEM',
    theme: 'Os games e a formação das crianças',
    competencies: { C1: 200, C2: 190, C3: 200, C4: 190, C5: 200 },
    highlights: {
      C1: 'Tese explícita no fim do segundo parágrafo: ensinar o uso, e não apenas proibir.',
      C2: 'Dois lados do caso (socialização x dano ao sono) e dado de pesquisa da Fundação Oswaldo Cruz.',
      C3: 'Estrutura concessiva (se, por um lado... por outro) e conectivo conclusivo (portanto).',
      C4: 'Proposta com verbo e agentes: família e escola devem orientar o uso das telas.',
      C5: 'Agente social nomeado e objeto delimitado, sem generalizar a proposta.',
    },
    text: [
      'Os games e a formação das crianças',
      '',
      'Com o crescimento do acesso à internet, os jogos eletrônicos passaram a ocupar espaço central na rotina das crianças e dos adolescentes. Se, por um lado, os games oferecem oportunidade de socialização e interatividade, por outro, o tempo excessivo diante das telas pode comprometer o sono, a atenção e a convivência familiar. Um estudo da Fundação Oswaldo Cruz associa o uso de telas por mais de três horas diárias a alterações no padrão de sono de jovens de 10 a 14 anos.',
      '',
      'Diante desse cenário, a família e a escola precisam assumir papel ativo: não basta proibir o acesso, é preciso ensinar o uso. Portanto, criar materiais de orientação para os pais e exigir das escolas horários específicos de uso de telas são medidas que podem reduzir os efeitos negativos sem afastar as crianças do mercado digital.',
    ].join('\n'),
  },
];
