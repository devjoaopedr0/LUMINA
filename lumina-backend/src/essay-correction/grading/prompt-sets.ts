/**
 * Conjuntos de prompts do avaliador de redação, por versão.
 *
 * A calibração vale para uma versão de prompt: trocar o texto muda a
 * distribuição das notas brutas. Por isso cada versão fica guardada inteira
 * aqui (instruções, tarefa por competência, consulta ao RAG, sinais
 * automáticos e formato da resposta) e a versão ativa é escolhida em
 * GRADER_PROMPT_VERSION.
 *
 * - v2-competencia: o prompt de 01/11/2026, restaurado em 13/11/2026 a partir
 *   do commit anterior ao e8fd3c7 (medido melhor que o v3 em 05/11).
 * - v3-c2-c4-oficial-2026: o prompt de 04/11/2026 (C2/C4 da cartilha 2026).
 * - v4-calibrado: v2 + C4 do v3 + regras de calibração em C1, C2 e C5 +
 *   exemplos validados por humanos (13/11/2026).
 * - v5-c2-c4: v2 + C4 do v3 + regras de calibração só em C2 (13/11/2026).
 */
import type { EssayTextAnalysis } from '../analysis/text-analysis';
import type { CompetencyId } from '../knowledge';
import type { CartilhaHit, CompetencyGrade } from '../mcp/essay-mcp-client';
import type { GradeInput, ValidatedLearningExample } from './essay-grader';

export interface CompetencyContext {
  competency: CompetencyId;
  grade: CompetencyGrade;
  chunks: CartilhaHit[];
}

export interface PromptSet {
  version: string;
  system: string;
  buildQuery: (competency: CompetencyId, analysis: EssayTextAnalysis) => string;
  buildPrompt: (input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]) => string;
}

// ===================================================== v2-competencia
const COMPETENCY_QUERIES_V2: Record<CompetencyId, string> = {
  C1: 'desvios gramaticais convenções da escrita estrutura sintática escolha de registro vocabular',
  C2: 'tema recorte repertório sociocultural produtivo tipo dissertativo-argumentativo proposição argumentação conclusão',
  C3: 'projeto de texto desenvolvimento dos argumentos autoria organização ponto de vista',
  C4: 'coesão conectivos operadores argumentativos referenciação articulação entre parágrafos',
  C5: 'proposta de intervenção elementos ação agente meio finalidade detalhamento',
};

/** Consulta do RAG montada a partir dos problemas encontrados no texto. */
function buildCompetencyQuery_V2(competency: CompetencyId, analysis: EssayTextAnalysis): string {
  const extra: string[] = [];
  switch (competency) {
    case 'C1':
      if (analysis.informalMarkers.length) extra.push('registro informal marcas de oralidade');
      if (analysis.longestSentenceWords > 60) extra.push('períodos truncados justaposição pontuação');
      break;
    case 'C2':
      if (analysis.themeCoverage !== null && analysis.themeCoverage < 0.6) extra.push('fuga ao tema tangenciamento abordagem parcial');
      extra.push('repertório de bolso');
      if (analysis.paragraphs < 3) extra.push('estrutura proposição argumentação conclusão');
      break;
    case 'C3':
      if (analysis.paragraphs < 3) extra.push('informações soltas sem desenvolvimento');
      break;
    case 'C4':
      if (analysis.connectives.overused.length || analysis.repeatedWords.length) extra.push('repetição conector inadequado substituição');
      if (analysis.paragraphs <= 1) extra.push('ausência de paragrafação');
      break;
    case 'C5':
      if (analysis.humanRightsFlags.length) extra.push('direitos humanos violência justiça com as próprias mãos');
      if (analysis.proposal.count < 3) extra.push('proposta vaga genérica explícita');
      extra.push('contagem de elementos');
      break;
  }
  return `${COMPETENCY_QUERIES_V2[competency]} ${extra.join(' ')}`.trim();
}


/** O que cada chamada avalia — e o que ela deve ignorar. */
const COMPETENCY_TASK_V2: Record<CompetencyId, string> = {
  C1: 'Avalie SOMENTE a Competência 1 — domínio da modalidade escrita formal: desvios gramaticais (concordância, regência, crase, pontuação), de convenção da escrita (ortografia, acentuação, maiúsculas), estrutura sintática (períodos truncados ou justapostos) e escolha de registro. Não avalie tema, argumentos, coesão nem proposta.',
  C2: 'Avalie SOMENTE a Competência 2 — compreensão da proposta: abordagem completa do tema (o recorte, não só o assunto amplo), estrutura do tipo dissertativo-argumentativo (proposição, argumentação, conclusão) e repertório sociocultural (legitimado, pertinente ao tema e usado de forma produtiva). Decida também se a redação deve ser anulada e se tangencia o tema.',
  C3: 'Avalie SOMENTE a Competência 3 — seleção, relação, organização e interpretação de informações, fatos e opiniões em defesa de um ponto de vista: projeto de texto, desenvolvimento e aprofundamento dos argumentos, autoria. Não avalie gramática, conectivos nem a proposta.',
  C4: 'Avalie SOMENTE a Competência 4 — mecanismos linguísticos de coesão: conectivos entre parágrafos e entre períodos, referenciação (pronomes, sinônimos, expressões resumitivas), repetições e conectores inadequados. Não avalie o mérito dos argumentos nem a gramática em geral.',
  C5: 'Avalie SOMENTE a Competência 5 — proposta de intervenção: presença e detalhamento dos elementos (agente, ação, modo/meio, finalidade/efeito e detalhamento), articulação com a discussão do texto e respeito aos direitos humanos.',
};

const SYSTEM_PROMPT_V2 = `Você é avaliador(a) da redação do Enem, formado(a) em Letras, treinado(a) pela Matriz de Referência do Inep.
Nesta tarefa você avalia UMA competência, usando SOMENTE os critérios dos trechos da cartilha fornecidos.
Regras:
- A nota é exatamente um destes valores: 0, 40, 80, 120, 160 ou 200. Escolha o nível cujo descritor melhor descreve o texto NESTA competência; use a escala inteira (200 para o que atende plenamente ao descritor, 0 ou 40 para o que quase não atende).
- Fundamente a nota com trechos copiados LITERALMENTE da redação (até 3) e com os ids dos trechos da cartilha usados.
- Trechos marcados como "critério operacional da Lumina" não são texto do Inep: use-os como guia de consistência, sem dizer que são da cartilha.
- Escreva em português, dirigindo-se ao(à) estudante, de forma direta e específica: a justificativa (2 a 4 frases) diz o que levou ao nível; "como_melhorar" (1 a 2 frases) diz o que faria a nota subir.
Responda APENAS com um objeto JSON válido, sem texto antes ou depois.`;

/** Sinais automáticos relevantes para cada competência. */
function competencySignals_V2(competency: CompetencyId, analysis: EssayTextAnalysis, zeroAlerts: string[]): string[] {
  const shape = `Parágrafos: ${analysis.paragraphs}; linhas: ${analysis.lines} (${analysis.linesSource}); palavras: ${analysis.words}.`;
  switch (competency) {
    case 'C1':
      return [
        `Períodos: ${analysis.sentences}; média de ${analysis.avgSentenceWords.toFixed(0)} palavras; maior período: ${analysis.longestSentenceWords} palavras.`,
        ...(analysis.informalMarkers.length ? [`Marcas de informalidade: ${analysis.informalMarkers.join(', ')}.`] : []),
      ];
    case 'C2':
      return [
        shape,
        ...(analysis.themeCoverage !== null ? [`Cobertura dos termos do tema: ${Math.round(analysis.themeCoverage * 100)}%${analysis.themeTermsMissing.length ? ` (ausentes: ${analysis.themeTermsMissing.join(', ')})` : ''}.`] : []),
        ...zeroAlerts.map((w) => `Possível anulação (confira lendo o texto): ${w}`),
      ];
    case 'C3':
      return [shape];
    case 'C4':
      return [
        shape,
        `Conectivos distintos: ${analysis.connectives.distinct} (${Object.entries(analysis.connectives.byRelation).map(([r, l]) => `${r}: ${l?.join(', ')}`).join('; ') || 'nenhum'}).`,
        ...(analysis.connectives.overused.length ? [`Conectivos repetidos: ${analysis.connectives.overused.join(', ')}.`] : []),
        ...(analysis.connectives.paragraphsWithoutLink.length ? [`Parágrafos que não começam com elemento de ligação: ${analysis.connectives.paragraphsWithoutLink.join(', ')}.`] : []),
        ...(analysis.repeatedWords.length ? [`Palavras repetidas: ${analysis.repeatedWords.map((w) => `${w.word} (${w.count}x)`).join(', ')}.`] : []),
      ];
    case 'C5':
      return [
        `Proposta (parágrafo ${analysis.proposal.paragraph ?? '—'}): ${Object.entries(analysis.proposal.elements).map(([k, v]) => `${k}=${v ?? 'não encontrado'}`).join(', ')}.`,
        ...(analysis.humanRightsFlags.length ? [`Possível desrespeito aos direitos humanos (confira): ${analysis.humanRightsFlags.join(', ')}.`] : []),
      ];
  }
}

const EXTRA_FIELDS_V2: Record<CompetencyId, string> = {
  C1: '',
  C2: `,
 "anulacao": null ou {"motivo": "FUGA_AO_TEMA"|"TIPO_TEXTUAL"|"PARTE_DESCONECTADA"|"IDENTIFICACAO"|"LINGUA_ESTRANGEIRA", "explicacao": "..."},
 "tangenciamento": false`,
  C3: '',
  C4: '',
  C5: `,
 "direitos_humanos_desrespeitados": false`,
};

const EXTRA_RULES_V2: Record<CompetencyId, string> = {
  C1: '',
  C2: '\nAnulação (nota zero total) só nos casos da cartilha: fuga total ao tema, não atendimento ao tipo dissertativo-argumentativo, parte deliberadamente desconectada, identificação, texto predominantemente em língua estrangeira. Na dúvida, não anule. Tangenciamento = aborda só o assunto amplo, não o recorte do tema (limita C2, C3 e C5 a 40).',
  C3: '',
  C4: '',
  C5: '\nProposta que desrespeite os direitos humanos zera a C5: marque "direitos_humanos_desrespeitados" só se for o caso.',
};

function buildCompetencyPrompt_V2(input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]): string {
  const { competency, grade, chunks } = context;
  const levels = grade.niveis.map((n) => `  ${n.nota}: ${n.descritor}`).join('\n');
  const extra = chunks.map((c) => `  [${c.id}] ${c.titulo} (${c.citacao}): ${c.texto}`).join('\n');
  const signals = competencySignals_V2(competency, analysis, zeroAlerts);
  return `${COMPETENCY_TASK_V2[competency]}${EXTRA_RULES_V2[competency]}

TEMA: ${input.theme || '(não informado — avalie a coerência interna e não anule por fuga ao tema)'}

CRITÉRIOS DA CARTILHA — ${competency}: ${grade.descricao}
[${competency.toLowerCase()}-niveis] Níveis (${grade.citacao}):
${levels}
${extra}

SINAIS AUTOMÁTICOS DO TEXTO (indícios a conferir, não notas):
${signals.join('\n') || '(nenhum)'}

REDAÇÃO:
"""
${input.text}
"""

Formato da resposta:
{"nota": 0, "justificativa": "...", "trechos": ["..."], "referencias": ["${competency.toLowerCase()}-niveis"], "como_melhorar": "..."${EXTRA_FIELDS_V2[competency]}}`;
}


// ============================================== v3-c2-c4-oficial-2026
const COMPETENCY_QUERIES_V3: Record<CompetencyId, string> = {
  C1: 'desvios gramaticais convenções da escrita estrutura sintática escolha de registro vocabular',
  C2: 'tema recorte leitura global tangenciamento fuga repertório legitimidade pertinência produtividade repertório de bolso tipo dissertativo-argumentativo',
  C3: 'projeto de texto desenvolvimento dos argumentos autoria organização ponto de vista',
  C4: 'coesão referencial sequencial articulação entre parágrafos referenciação repetição conectivo inadequado operadores argumentativos',
  C5: 'proposta de intervenção elementos ação agente meio finalidade detalhamento',
};

/** Consulta do RAG montada a partir dos problemas encontrados no texto. */
function buildCompetencyQuery_V3(competency: CompetencyId, analysis: EssayTextAnalysis): string {
  const extra: string[] = [];
  switch (competency) {
    case 'C1':
      if (analysis.informalMarkers.length) extra.push('registro informal marcas de oralidade');
      if (analysis.longestSentenceWords > 60) extra.push('períodos truncados justaposição pontuação');
      break;
    case 'C2':
      // A cobertura lexical é só um gatilho de leitura: nunca vira conclusão
      // de fuga. A consulta pede os critérios de recorte e de repertório.
      if (analysis.themeCoverage !== null && analysis.themeCoverage < 0.6) extra.push('cobertura lexical auxiliar leitura global do tema tangenciamento');
      if (analysis.repeatedWords.length) extra.push('termos recorrentes do tema retomadas repertório');
      if (analysis.paragraphs < 3) extra.push('tipo textual estrutura proposição argumentação conclusão');
      break;
    case 'C3':
      if (analysis.paragraphs < 3) extra.push('informações soltas sem desenvolvimento');
      break;
    case 'C4':
      if (analysis.connectives.overused.length || analysis.repeatedWords.length) extra.push('repetição referencial progressão inadequação semântica operador argumentativo');
      if (analysis.connectives.distinct <= 1) extra.push('coesão referencial justaposição sem conectivo explícito');
      if (analysis.paragraphs <= 1) extra.push('ausência de paragrafação monobloco');
      if (analysis.connectives.paragraphsWithoutLink.length) extra.push('articulação por referenciação elipse continuidade semântica');
      break;
    case 'C5':
      if (analysis.humanRightsFlags.length) extra.push('direitos humanos violência justiça com as próprias mãos');
      if (analysis.proposal.count < 3) extra.push('proposta vaga genérica explícita');
      extra.push('contagem de elementos');
      break;
  }
  return `${COMPETENCY_QUERIES_V3[competency]} ${extra.join(' ')}`.trim();
}


/** O que cada chamada avalia — e o que ela deve ignorar. */
const COMPETENCY_TASK_V3: Record<CompetencyId, string> = {
  C1: 'Avalie SOMENTE a Competência 1 — domínio da modalidade escrita formal: desvios gramaticais (concordância, regência, crase, pontuação), de convenção da escrita (ortografia, acentuação, maiúsculas), estrutura sintática (períodos truncados ou justapostos) e escolha de registro. Não avalie tema, argumentos, coesão nem proposta.',
  C2: 'Avalie SOMENTE a Competência 2 — compreensão da proposta, em três dimensões separadas: (a) recorte temático: o texto desenvolve o tema específico e os elementos do recorte, não apenas o assunto amplo; (b) tipo dissertativo-argumentativo: defesa de ponto de vista com proposição, argumentação e conclusão, sem predominância de narração, descrição, poema ou depoimento; (c) repertório sociocultural: verifique legitimidade (referência reconhecida, não inventada), pertinência ao recorte e produtividade argumentativa (o repertório é interpretado e sustenta a tese, não apenas citado). Não use contagem de palavras do tema como prova de fuga. Decida também, com cautela, se há fuga total, tangenciamento ou anulação por tipo textual.',
  C3: 'Avalie SOMENTE a Competência 3 — seleção, relação, organização e interpretação de informações, fatos e opiniões em defesa de um ponto de vista: projeto de texto, desenvolvimento e aprofundamento dos argumentos, autoria. Não avalie gramática, conectivos nem a proposta.',
  C4: 'Avalie SOMENTE a Competência 4 — articulação textual: relações semânticas entre ideias, referenciação (pronomes, sinônimos, hiperônimos, expressões resumitivas, elipse), progressão entre parágrafos e adequação dos recursos coesivos. A quantidade de conectivos, por si só, não é nota: avalie se as relações lógicas são recuperáveis e se a repetição prejudica ou não a clareza. Não exija conectivo no início de cada parágrafo e não penalize repetição temática por si só.',
  C5: 'Avalie SOMENTE a Competência 5 — proposta de intervenção: presença e detalhamento dos elementos (agente, ação, modo/meio, finalidade/efeito e detalhamento), articulação com a discussão do texto e respeito aos direitos humanos.',
};

const SYSTEM_PROMPT_V3 = `Você é avaliador(a) da redação do Enem, formado(a) em Letras, treinado(a) pela Matriz de Referência do Inep.
Nesta tarefa você avalia UMA competência, usando SOMENTE os critérios dos trechos oficiais fornecidos.
Regras:
- A nota é exatamente um destes valores: 0, 40, 80, 120, 160 ou 200. Escolha o nível cujo descritor melhor descreve o texto NESTA competência; use a escala inteira.
- Fundamente a nota com trechos copiados LITERALMENTE da redação (até 3) e com os ids dos trechos oficiais usados. Nunca invente citação, referência ou problema que não esteja no texto.
- Separe o que é elogio, o que é problema e a explicação do nível. "pontos_fortes" e "problemas" devem ser listas curtas, específicas e ancoradas no texto; "explicacao_nivel" deve justificar por que o descritor escolhido se aplica, sem repetir a nota.
- Trechos marcados como "critério operacional da Lumina" não são texto do Inep: use-os como guia de consistência, sem dizer que são da cartilha.
- Sinais automáticos são indícios, não notas: cobertura lexical, contagem de conectivos, repetição de palavras e parágrafos sem conectivo inicial não decidem a competência.
- Escreva em português, dirigindo-se ao(à) estudante, de forma direta e específica: a justificativa (2 a 4 frases) descreve o desempenho; "como_melhorar" (1 a 2 frases) diz o que faria a nota subir.
Responda APENAS com um objeto JSON válido, sem texto antes ou depois.`;

/** Sinais automáticos relevantes para cada competência. */
function competencySignals_V3(competency: CompetencyId, analysis: EssayTextAnalysis, zeroAlerts: string[]): string[] {
  const shape = `Parágrafos: ${analysis.paragraphs}; linhas: ${analysis.lines} (${analysis.linesSource}); palavras: ${analysis.words}.`;
  switch (competency) {
    case 'C1':
      return [
        `Períodos: ${analysis.sentences}; média de ${analysis.avgSentenceWords.toFixed(0)} palavras; maior período: ${analysis.longestSentenceWords} palavras.`,
        ...(analysis.informalMarkers.length ? [`Marcas de informalidade: ${analysis.informalMarkers.join(', ')}.`] : []),
      ];
    case 'C2':
      return [
        shape,
        ...(analysis.themeCoverage !== null
          ? [`Cobertura lexical dos termos do tema: ${Math.round(analysis.themeCoverage * 100)}%${analysis.themeTermsMissing.length ? ` (ausentes: ${analysis.themeTermsMissing.join(', ')})` : ''}. Sinal auxiliar: leia o recorte desenvolvido, os sinônimos, as retomadas e os exemplos antes de concluir fuga ou tangenciamento.`]
          : []),
        ...(analysis.repeatedWords.length ? [`Termos recorrentes no texto (podem ser temáticos/referenciais): ${analysis.repeatedWords.map((w) => `${w.word} (${w.count}x)`).join(', ')}.`] : []),
        ...zeroAlerts.map((w) => `Alerta objetivo para conferir (não é anulação automática): ${w}`),
      ];
    case 'C3':
      return [shape];
    case 'C4':
      return [
        shape,
        `Relações coesivas reconhecidas: ${analysis.connectives.distinct} conectivo(s) distinto(s) (${Object.entries(analysis.connectives.byRelation).map(([r, l]) => `${r}: ${l?.join(', ')}`).join('; ') || 'nenhum'}). A contagem é auxiliar; avalie as relações semânticas e a referenciação.`,
        ...(analysis.connectives.overused.length ? [`Conectivos repetidos (${analysis.connectives.overused.join(', ')}): confira se a repetição prejudica a relação lógica ou é apenas ênfase.`] : []),
        ...(analysis.connectives.paragraphsWithoutLink.length ? [`Parágrafos sem conectivo explícito na abertura: ${analysis.connectives.paragraphsWithoutLink.join(', ')}. Isso não é falha automática: a articulação pode ocorrer por referenciação, elipse ou continuidade semântica.`] : []),
        ...(analysis.repeatedWords.length ? [`Repetições detectadas: ${analysis.repeatedWords.map((w) => `${w.word} (${w.count}x)`).join(', ')}. Podem ser temáticas ou referenciais; só penalize se prejudicarem a progressão ou a clareza.`] : []),
      ];
    case 'C5':
      return [
        `Proposta (parágrafo ${analysis.proposal.paragraph ?? '—'}): ${Object.entries(analysis.proposal.elements).map(([k, v]) => `${k}=${v ?? 'não encontrado'}`).join(', ')}.`,
        ...(analysis.humanRightsFlags.length ? [`Possível desrespeito aos direitos humanos (confira): ${analysis.humanRightsFlags.join(', ')}.`] : []),
      ];
  }
}

const EXTRA_FIELDS_V3: Record<CompetencyId, string> = {
  C1: '',
  C2: `,
 "anulacao": null ou {"motivo": "FUGA_AO_TEMA"|"TIPO_TEXTUAL"|"PARTE_DESCONECTADA"|"IDENTIFICACAO"|"LINGUA_ESTRANGEIRA", "explicacao": "..."},
 "tangenciamento": false`,
  C3: '',
  C4: '',
  C5: `,
 "direitos_humanos_desrespeitados": false`,
};

const EXTRA_RULES_V3: Record<CompetencyId, string> = {
  C1: '',
  C2: `
Regras específicas da C2:
- Leia o texto inteiro antes de decidir. Fuga ao tema é desenvolver outro tema; tangenciamento é abordar apenas o assunto amplo, sem o recorte. Não conclua fuga porque faltam palavras exatas do tema: sinônimos, paráfrases e retomadas contam.
- Trate as três dimensões separadamente: quando houver evidência, identifique o ponto forte ou o problema com o prefixo [recorte], [tipo textual] ou [repertório]. Não transforme uma falha de repertório em fuga ao tema, nem uma falha de estrutura em problema de recorte.
- Repertório: avalie legitimidade, pertinência e produtividade. Citar autor/obra não garante nota; repertório de bolso, genérico ou apenas justaposto é problema de produtividade.
- Anulação (nota zero total) só nos casos da cartilha: fuga total ao tema, predominância de outro tipo textual, parte deliberadamente desconectada, identificação ou texto predominantemente em língua estrangeira. Na dúvida, não anule.
- Tangenciamento limita C2, C3 e C5 a 40; marque "tangenciamento" apenas se o recorte temático tiver sido realmente abandonado.`,
  C3: '',
  C4: `
Regras específicas da C4:
- Avalie relações semânticas e referenciação, não a quantidade de conectivos. Poucos conectivos podem ser suficientes se a articulação estiver clara; muitos conectivos podem ser inadequados se não expressarem a relação pretendida.
- Não exija conectivo no início de cada parágrafo. A articulação pode ser feita por pronomes, sinônimos, hiperônimos, expressões resumitivas, elipse, ordem dos enunciados e continuidade temática.
- Repetição de palavras ou de termos do tema pode ser necessária para manter o referente. Só aponte problema quando a repetição ou a substituição inadequada prejudicar a progressão, a clareza ou a relação lógica.
- "Repertório diversificado de recursos coesivos" é qualitativo: descreva quais relações o texto constrói e onde há inadequação real.`,
  C5: '\nProposta que desrespeite os direitos humanos zera a C5: marque "direitos_humanos_desrespeitados" só se for o caso.',
};

function learningExamplesBlock(competency: CompetencyId, examples: ValidatedLearningExample[] | undefined): string {
  if (!examples?.length) return '';
  const lines = examples
    .slice(0, 3)
    .map((example) => {
      const evidence = example.evidence ? ` Evidência anonimizada: ${example.evidence.replace(/\s+/g, ' ').trim().slice(0, 420)}.` : '';
      const reason = example.divergenceReason ? ` Motivo da divergência: ${example.divergenceReason.trim().slice(0, 240)}.` : '';
      return `  - Exemplo validado ${example.id.slice(0, 8)} (${example.competency}): IA ${example.aiScore ?? 'não informada'}, humano ${example.humanScore ?? 'não informada'}. Critério: ${example.criterion?.trim() || 'não informado'}. Aprendizado: ${example.learning.replace(/\s+/g, ' ').trim().slice(0, 700)}.${reason}${evidence}`;
    })
    .join('\n');
  return `\n\nEXEMPLOS VALIDADOS POR AVALIADORES HUMANOS — ${competency} (contexto auxiliar, anonimizado):
${lines}
Use estes exemplos apenas para calibrar a interpretação do critério. Não os trate como texto oficial do Inep, não copie a nota sem verificar a redação atual e não cite um exemplo validado como se fosse a cartilha.`;
}

function buildCompetencyPrompt_V3(input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]): string {
  const { competency, grade, chunks } = context;
  const levels = grade.niveis.map((n) => `  ${n.nota}: ${n.descritor}`).join('\n');
  const extra = chunks.map((c) => `  [${c.id}] ${c.titulo} (${c.citacao}): ${c.texto}`).join('\n');
  const learning = learningExamplesBlock(competency, input.learningExamples?.[competency]);
  const signals = competencySignals_V3(competency, analysis, zeroAlerts);
  return `${COMPETENCY_TASK_V3[competency]}${EXTRA_RULES_V3[competency]}

TEMA: ${input.theme || '(não informado — avalie a coerência interna e não anule por fuga ao tema)'}

CRITÉRIOS DA CARTILHA — ${competency}: ${grade.descricao}
[${competency.toLowerCase()}-niveis] Níveis (${grade.citacao}):
${levels}
${extra}${learning}

SINAIS AUTOMÁTICOS DO TEXTO (indícios a conferir, não notas):
${signals.join('\n') || '(nenhum)'}

REDAÇÃO:
"""
${input.text}
"""

Formato da resposta:
{"nota": 0, "justificativa": "...", "pontos_fortes": ["..."], "problemas": ["..."], "explicacao_nivel": "...", "trechos": ["..."], "referencias": ["${competency.toLowerCase()}-niveis"], "como_melhorar": "..."${EXTRA_FIELDS_V3[competency]}}
Use "trechos" somente com citações literais da redação; use "problemas" para o que impede nota maior e "pontos_fortes" para o que o texto já faz bem. Se não houver ponto forte ou problema, devolva lista vazia.`;
}


// ========================================================= v4-calibrado
/*
 * v4 (13/11/2026): parte do v2 (melhor medido) e corrige os desvios que a
 * medição dele mostrou nas 30 redações de teste: viés negativo em C5 (−22,7),
 * C1 (−17,3) e C2 (−14,7) e o maior erro em C4 (MAE 54,7). Mudanças:
 * - C4: tarefa, regras, consulta e sinais do v3 (única competência que
 *   melhorou com ele);
 * - C1, C2 e C5: regras para ler o desempenho pelo conjunto e pela grade, sem
 *   rebaixar o nível por falha isolada (nada inventado: é o que os
 *   descritores da cartilha já dizem);
 * - exemplos validados por humanos (revisão humana) quando houver.
 * O formato da resposta continua o do v2.
 */
const RULES_V4: Record<CompetencyId, string> = {
  C1: `
Calibração pela grade (não pela caça a erros):
- Avalie o conjunto do texto. Desvios pontuais e não reincidentes, num texto com bom domínio das estruturas, não rebaixam o nível sozinhos: o descritor de 200 admite desvios como excepcionalidade, e o de 160 admite poucos desvios.
- Rebaixe quando os desvios forem frequentes, reincidentes ou comprometerem a estrutura sintática (períodos truncados, justaposição), não pela soma mecânica de erros.
- Não conte como desvio escolhas aceitas pela norma (ordem de colocação pronominal admitida, vírgula facultativa) nem trechos citados entre aspas.`,
  C2: `
Calibração pela grade:
- Abordagem completa do recorte, estrutura dissertativo-argumentativa e repertório legitimado, pertinente e usado de forma produtiva sustentam 200; um repertório só pertinente, com uso pouco desenvolvido, aponta para 160.
- Não rebaixe por ausência de palavras exatas do tema quando o recorte é discutido com sinônimos e retomadas.`,
  C3: '',
  C4: '',
  C5: `
Calibração pela grade:
- Uma única proposta completa, com os cinco elementos (agente, ação, modo/meio, finalidade/efeito e detalhamento) e articulada à discussão, vale 200. Não exija mais de uma proposta nem detalhamento longo.
- Conte cada elemento presente, mesmo que esteja implícito numa construção clara (ex.: "por meio de campanhas" é o modo/meio). Rebaixe pelo elemento que de fato falta, não pela extensão.`,
};

function buildCompetencyQuery_V4(competency: CompetencyId, analysis: EssayTextAnalysis): string {
  return competency === 'C4' ? buildCompetencyQuery_V3(competency, analysis) : buildCompetencyQuery_V2(competency, analysis);
}

/** v2 com a C4 do v3 e regras extras por competência (base do v4 e do v5). */
function buildHybridPrompt(
  rules: Record<CompetencyId, string>,
  withLearning: boolean,
  input: GradeInput,
  analysis: EssayTextAnalysis,
  context: CompetencyContext,
  zeroAlerts: string[],
): string {
  const { competency, grade, chunks } = context;
  const c4 = competency === 'C4';
  const levels = grade.niveis.map((n) => `  ${n.nota}: ${n.descritor}`).join('\n');
  const extra = chunks.map((c) => `  [${c.id}] ${c.titulo} (${c.citacao}): ${c.texto}`).join('\n');
  const learning = withLearning ? learningExamplesBlock(competency, input.learningExamples?.[competency]) : '';
  const signals = c4 ? competencySignals_V3(competency, analysis, zeroAlerts) : competencySignals_V2(competency, analysis, zeroAlerts);
  const task = c4 ? `${COMPETENCY_TASK_V3[competency]}${EXTRA_RULES_V3[competency]}` : `${COMPETENCY_TASK_V2[competency]}${EXTRA_RULES_V2[competency]}${rules[competency]}`;
  return `${task}

TEMA: ${input.theme || '(não informado — avalie a coerência interna e não anule por fuga ao tema)'}

CRITÉRIOS DA CARTILHA — ${competency}: ${grade.descricao}
[${competency.toLowerCase()}-niveis] Níveis (${grade.citacao}):
${levels}
${extra}${learning}

SINAIS AUTOMÁTICOS DO TEXTO (indícios a conferir, não notas):
${signals.join('\n') || '(nenhum)'}

REDAÇÃO:
"""
${input.text}
"""

Formato da resposta:
{"nota": 0, "justificativa": "...", "trechos": ["..."], "referencias": ["${competency.toLowerCase()}-niveis"], "como_melhorar": "..."${EXTRA_FIELDS_V2[competency]}}`;
}

function buildCompetencyPrompt_V4(input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]): string {
  return buildHybridPrompt(RULES_V4, true, input, analysis, context, zeroAlerts);
}

// ========================================================= v5-c2-c4
/*
 * v5 (13/11/2026): nas duas rodadas de medição, o v4 só ganhou do v2 em C4
 * (MAE 55 → 44–48) e em C2 (viés −11 → −1 a −7, MAE igual); as regras de C1
 * pioraram o MAE e as de C5 não mudaram o erro. O v5 fica com o v2 e traz só
 * essas duas partes. Sem exemplos validados, como o v2, para que a diferença
 * medida seja só a das duas competências.
 */
const RULES_V5: Record<CompetencyId, string> = { C1: '', C2: RULES_V4.C2, C3: '', C4: '', C5: '' };

function buildCompetencyPrompt_V5(input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]): string {
  return buildHybridPrompt(RULES_V5, false, input, analysis, context, zeroAlerts);
}

export const PROMPT_SETS: Record<string, PromptSet> = {
  'v2-competencia': { version: 'v2-competencia', system: SYSTEM_PROMPT_V2, buildQuery: buildCompetencyQuery_V2, buildPrompt: buildCompetencyPrompt_V2 },
  'v3-c2-c4-oficial-2026': { version: 'v3-c2-c4-oficial-2026', system: SYSTEM_PROMPT_V3, buildQuery: buildCompetencyQuery_V3, buildPrompt: buildCompetencyPrompt_V3 },
  'v4-calibrado': { version: 'v4-calibrado', system: SYSTEM_PROMPT_V2, buildQuery: buildCompetencyQuery_V4, buildPrompt: buildCompetencyPrompt_V4 },
  'v5-c2-c4': { version: 'v5-c2-c4', system: SYSTEM_PROMPT_V2, buildQuery: buildCompetencyQuery_V4, buildPrompt: buildCompetencyPrompt_V5 },
};
