import { descricaoDaQuestao, HintProvider, HintRequest } from './hint-provider.interface';

/** Remove acentos e caixa para casar o texto com os padrões abaixo. O banco
 * pode ter "Funcoes exponenciais" (sem acento) e o mesmo vale para enunciados
 * digitados rápido: a dica da área não pode depender da acentuação. */
function semAcento(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Áreas de conhecimento reconhecidas pelo enunciado. O casamento é por
 * substantivo comum em prova; quando nada casa, caímos nas dicas genéricas,
 * que servem para qualquer disciplina. A ordem importa: o primeiro padrão que
 * casar ganha. */
const AREAS: { match: RegExp; review: string; check: string }[] = [
  {
    match: /funcao|funcoes|logarit|exponen|trigonometr|grafico|raiz de|polinom/,
    review:
      'reveja como a função se comporta no ponto pedido (monotonia, pontos notáveis, domínio)',
    check:
      'o enunciado pede o valor da imagem, a inversa ou a raiz; confira o sinal do expoente e se a base vale para o logaritmo',
  },
  {
    match: /equacao|equacoes|inequacao|raiz|discriminante|fatora|teorema|angulo entre|retas|funcao linear/,
    review: 'revise como se isola a incógnita e quais condições a solução precisa respeitar',
    check:
      'o sinal ao passar o termo para o outro lado e se a resposta é válida no conjunto universo (não divide por zero, não é negativa quando não pode)',
  },
  {
    match: /probabilidade|estatistic|media|mediana|desvio|variancia|amostra|populacao/,
    review: 'revise a fórmula que o enunciado pede e o que cada símbolo significa',
    check:
      'se o evento é possível (as probabilidades somam 1?) e se o enunciado pede a probabilidade do evento ou a de um dos seus casos',
  },
  {
    match: /geometria|area|perimetro|volume|angulo|trapezoid|circulo|prisma|cilindro/,
    review: 'revise a fórmula da figura e o que cada medida representa',
    check: 'as unidades e se o enunciado pede área, perímetro ou volume antes de substituir',
  },
  {
    match: /velocidade|aceleracao|forca|movimento|energia|potencia|corrente|tribulacao|onda/,
    review: 'revise as fórmulas do movimento e a definição de cada grandeza',
    check:
      'as unidades e a coerência física: o resultado precisa ter a magnitude e o sentido esperados pela situação descrita',
  },
  {
    match: /mole|estequiom|reacao|reacoes|quimic|solucao|concentr|acido|eletro/,
    review: 'revise o raciocínio estequiométrico e as condições da reação',
    check: 'o balanceamento, as unidades e se o enunciado pede massa, mol ou volume',
  },
  {
    match: /celula|gene|enzima|mitose|meiose|fotossintese|ecossistema|dna|protein|metabolismo/,
    review: 'revise o ciclo ou processo citado e em que etapa o enunciado te coloca',
    check: 'se você está lendo o enunciado do ponto de vista certo (produto, reagente, etapa)',
  },
  {
    match: /revolucao|guerra|republica|imperio|constituicao|independencia|urbaniz|escravid|monarquia|ditadura/,
    review: 'revise o contexto (período, governo, recorte) que o enunciado cita',
    check:
      'o recorte temporal e se a alternativa descreve o processo, não apenas um de seus efeitos',
  },
  {
    match: /gramatic|verbo|pronome|conjugac|sintaxe|redacao|interpretac|poetico|genero textual/,
    review: 'revise a regra gramatical que o enunciado exige e escreva um exemplo seu',
    check: 'se a questão pede o termo, a função da oração ou a análise do período',
  },
];

/** Estratégias de eliminação: método, não resposta. Nenhuma delas diz qual
 * alternativa está certa — só como descartar as outras com segurança. A
 * escada começa no nível 3; níveis acima, quando existirem, avançam para a
 * próxima estratégia. */
const ELIMINACAO = [
  'teste cada alternativa uma a uma: substitua os valores do enunciado e veja se a igualdade se confirma de fato. A que não se confirma é distrator.',
  'antes de eliminar, ache a resposta que é estupidamente óbvia demais para ser a esperada: em prova, o enunciado sempre cobra o passo que parece pulado.',
  'elimine por ordem de grandeza: se o enunciado trabalha com unidades, potências ou porcentagens, jogue um valor plausível e descarte quem foge da escala.',
  'veja se alguma alternativa contradiz uma condição escrita no próprio enunciado. Condição explícita no texto é a pista mais segura.',
  'não comece pela alternativa que parece mais atraente: marque as duas que você consegue justificar com contas e escolha entre elas.',
];

/** Consulta genérica, usada quando a área não é reconhecida. */
const AREA_GENERICA = {
  review: 'reveja o conceito que o enunciado cobra',
  check: 'o que está sendo calculado, com quais dados e em qual unidade',
};

/**
 * Provedor de dicas por regras: um guia de estudo determinístico, sem chamada
 * externa e sem depender de chave de API. Ele recebe só enunciado e
 * classificação (ver `HintRequest`), então não tem como saber qual é a
 * resposta — e, portanto, não tem como vazar.
 */
export class StudyGuideHintProvider implements HintProvider {
  readonly name = 'rules';

  async generate(request: HintRequest): Promise<string> {
    return this.build(request);
  }

  /** Monta a dica do nível pedido. Separado do `generate` para ser testável
   * sem passar pela interface. */
  build(request: HintRequest): string {
    const area =
      AREAS.find((candidata) =>
        candidata.match.test(semAcento(`${request.subject} ${request.topic} ${request.stem}`)),
      ) ?? AREA_GENERICA;

    if (request.level === 1) {
      return (
        `Esta questão é ${descricaoDaQuestao(request)}. ` +
        `Comece por aqui: ${area.review}. ` +
        'Escreva em uma linha a resposta que você espera antes de olhar as alternativas — ' +
        'comparar sua expectativa com as opções já elimina metade do trabalho.'
      );
    }

    if (request.level === 2) {
      return (
        'Agora volte ao enunciado e confira o que ele realmente pede: ' +
        `${area.check}. Enunciado mal lido é a causa mais comum de erro aqui.`
      );
    }

    return (
      `Para eliminar sem chute: ${ELIMINACAO[Math.max(0, request.level - 3)]}` +
      (request.difficulty === 'DIFICIL'
        ? ' Esta questão está marcada como difícil no banco, então é normal a primeira conta não fechar: refaça por outro caminho antes de marcar.'
        : ' Marque as alternativas que você consegue justificar e descarte o resto.')
    );
  }
}
