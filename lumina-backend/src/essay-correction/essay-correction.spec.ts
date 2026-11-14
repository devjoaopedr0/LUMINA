import { PROMPT_SETS } from './grading/prompt-sets';
import { describe, expect, it, vi } from 'vitest';
import { analyzeEssayText, splitParagraphs } from './analysis/text-analysis';
import { applyCalibrationFn, fitIsotonicFn, LEVELS, preservesExtremes, selectCalibrationFn } from './grading/calibration';
import {
  assembleRun,
  calibrationFor,
  closestPair,
  closestScores,
  competenciesForThird,
  CompetencyRun,
  composeGeneralFeedback,
  dedupeQuotes,
  discrepancyBetween,
  EssayGrader,
  EvaluatorRun,
  buildCompetencyPrompt,
  buildCompetencyQuery,
  extractJson,
  GRADER_PROMPT_VERSION,
  LlmCalibration,
  LlmGenerate,
  parseCompetencyEvaluation,
  verifiedEvidence,
} from './grading/essay-grader';
import { extractFeatures, fitRidge, FEATURE_NAMES, snapToLevel } from './grading/feature-model';
import { ARCHIVED_KNOWLEDGE_BASE, CARTILHA_2026, COMPETENCY_GRID, CURRENT_KNOWLEDGE_BASE, KNOWLEDGE_BASE, KNOWLEDGE_DOCUMENTS } from './knowledge';
import { EssayMcpClient } from './mcp/essay-mcp-client';
import llmCalibration from './model/llm-calibration.json';
import { combineConfidence, linesToText, parseTranscription, transcribeEssayPages } from './ocr/essay-ocr';
import { tokenize } from './rag/bm25';
import { EssayKnowledgeBase } from './rag/knowledge-base';
import { decodeImage } from './essay-correction.service';

const V3 = PROMPT_SETS['v3-c2-c4-oficial-2026'];

const THEME = 'Desafios para a valorização da herança africana no Brasil';

// Redação de teste escrita para esta suíte (não é de nenhum participante).
const ESSAY = `No Brasil, a herança africana está presente na língua, na culinária, na música e na religiosidade. Entretanto, a valorização dessa herança ainda enfrenta desafios, sobretudo o racismo estrutural e a omissão da escola em abordar a história afro-brasileira. Diante desse cenário, é necessário discutir as causas do problema e propor caminhos para superá-lo.

Em primeiro lugar, o racismo estrutural, herdado de mais de três séculos de escravização, faz com que manifestações de matriz africana sejam tratadas como folclore ou como algo inferior. Prova disso são os ataques a terreiros de candomblé, que, segundo levantamentos de organizações da sociedade civil, cresceram nos últimos anos. Dessa forma, parte da população aprende a enxergar a cultura negra apenas pelo estereótipo, o que dificulta seu reconhecimento.

Além disso, a escola, que deveria combater esse apagamento, ainda negligencia o ensino de história e cultura afro-brasileira, embora a Lei 10.639, de 2003, o torne obrigatório. Muitos currículos limitam o tema ao período escravocrata e silenciam figuras como Luís Gama e Carolina Maria de Jesus. Consequentemente, os estudantes concluem a educação básica sem conhecer a contribuição africana para a formação do país.

Portanto, para valorizar a herança africana no Brasil, o Ministério da Educação deve fiscalizar o cumprimento da Lei 10.639, por meio de formação continuada de professores e de materiais didáticos que apresentem autores e intelectuais negros, a fim de que os alunos reconheçam essa contribuição. Ademais, a mídia, como formadora de opinião, precisa divulgar campanhas contra a intolerância religiosa, com o objetivo de reduzir os ataques a terreiros.`;

const IDS = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;

function fakeRun(label: string, scores: number[], annulment: EvaluatorRun['annulment'] = null): EvaluatorRun {
  return {
    evaluator: label,
    method: 'llm',
    model: 'fake',
    annulment,
    tangencia: false,
    humanRightsViolation: false,
    competencies: Object.fromEntries(IDS.map((id, i) => [id, { score: scores[i], justification: `${label} ${id}`, strengths: [], problems: [], levelExplanation: '', evidence: [], references: [] }])) as unknown as EvaluatorRun['competencies'],
    total: scores.reduce((a, b) => a + b, 0),
    generalComment: '',
  };
}

/** Resposta do modelo para UMA competência. */
function competencyAnswer(competency: string, nota: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    nota,
    justificativa: `Justificativa ${competency}`,
    pontos_fortes: [`Ponto forte ${competency}`],
    problemas: [`Problema ${competency}`],
    explicacao_nivel: `Explicação do nível ${competency}`,
    trechos: ['o racismo estrutural, herdado de mais de três séculos de escravização', 'trecho que não existe na redação'],
    referencias: [`${competency.toLowerCase()}-niveis`, 'id-inventado'],
    como_melhorar: `Dica ${competency}`,
    ...extra,
  });
}

/** Competência que o prompt pede ("Avalie SOMENTE a Competência N"). */
function competencyOf(prompt: string): (typeof IDS)[number] {
  const n = /Avalie SOMENTE a Competência (\d)/.exec(prompt)?.[1];
  if (!n) throw new Error('prompt sem competência');
  return `C${n}` as (typeof IDS)[number];
}

describe('Base de conhecimento da cartilha (RAG)', () => {
  it('tem a grade oficial de seis níveis em todas as competências e só trechos citáveis', () => {
    for (const grid of Object.values(COMPETENCY_GRID)) expect(Object.keys(grid.levels).sort()).toEqual(['0', '120', '160', '200', '40', '80']);
    for (const chunk of KNOWLEDGE_BASE) {
      if (chunk.source === 'lumina') expect(chunk.text).toMatch(/Critério operacional da Lumina/);
      else expect(chunk.page).toBeGreaterThan(0);
    }
    expect(new Set(KNOWLEDGE_BASE.map((c) => c.id)).size).toBe(KNOWLEDGE_BASE.length);
    expect(KNOWLEDGE_DOCUMENTS.some((d) => d.id === 'inep-cartilha-2026' && d.status === 'current')).toBe(true);
    expect(CARTILHA_2026.publishedAt).toBe('2026-09-21');
  });

  it('usa o texto de 2026 para título e não infere fuga pelo título ou por palavras isoladas', () => {
    const kb = new EssayKnowledgeBase();
    const title = kb.get('geral-titulo')!;
    expect(title.text).toMatch(/considerado linha escrita/i);
    expect(title.text).not.toMatch(/não conta como linha escrita/i);
    const fuga = kb.get('c2-fuga-ao-tema')!;
    expect(fuga.text).not.toMatch(/título|leitor que não teve acesso/i);
    expect(fuga.text).toMatch(/nem o assunto mais amplo nem o tema específico/i);
    expect(kb.get('c2-manual-tipo-textual')!.text).toMatch(/proporcionalidade das partes/i);
    expect(kb.get('c4-referencial-oficial')!.text).toMatch(/justaposição/i);
  });

  it('mantém 2025 arquivada e fora da recuperação padrão', () => {
    expect(ARCHIVED_KNOWLEDGE_BASE.length).toBeGreaterThan(0);
    expect(ARCHIVED_KNOWLEDGE_BASE.every((c) => c.documentId === 'inep-cartilha-2025' && c.id.startsWith('2025:'))).toBe(true);
    const kb = new EssayKnowledgeBase();
    expect(kb.search('nota zero', { limit: 12 }).every((h) => !h.id.startsWith('2025:'))).toBe(true);
    expect(kb.search('nota zero', { documentId: 'inep-cartilha-2025', limit: 1 })[0].documentId).toBe('inep-cartilha-2025');
    expect(CURRENT_KNOWLEDGE_BASE.every((c) => c.documentId !== 'inep-cartilha-2025')).toBe(true);
  });

  it('normaliza acento e flexão: "argumentação" e "argumentos" caem no mesmo radical', () => {
    expect(tokenize('argumentação')[0]).toBe(tokenize('Argumentos')[0]);
    expect(tokenize('Coesão')).toEqual(tokenize('coesao'));
  });

  it('recupera o trecho certo para cada problema e respeita o filtro de competência', () => {
    const kb = new EssayKnowledgeBase();
    expect(kb.search('repertório de bolso decorado', { limit: 1 })[0].id).toBe('c2-repertorio-de-bolso');
    expect(kb.search('tangenciamento abordagem parcial do tema', { limit: 1 })[0].id).toBe('c2-tangenciamento');
    expect(kb.search('agente meio finalidade da proposta', { scope: 'C5', limit: 1 })[0].id).toMatch(/^(c5-elementos-da-proposta|lumina-c5-contagem-de-elementos)$/);
    expect(kb.search('justiça com as próprias mãos', { limit: 1 })[0].id).toBe('c5-direitos-humanos');
    expect(kb.search('coesão', { scope: 'C1' }).every((h) => h.scope === 'C1')).toBe(true);
    expect(kb.search('nota zero', { scope: 'C2', includeGeneral: true }).some((h) => h.scope === 'GERAL')).toBe(true);
  });

  it('cita documento, versão e página e identifica critério da Lumina como não oficial', () => {
    const kb = new EssayKnowledgeBase();
    expect(kb.search('discrepância entre avaliadores', { limit: 1 })[0].citation).toMatch(/Cartilha do Participante \(Inep\), 2026, p\. 6/);
    expect(kb.search('contagem de elementos da proposta', { scope: 'C5', limit: 3 }).find((h) => h.source === 'lumina')?.citation).toMatch(/não consta da cartilha/);
  });

  it('contexto de competência começa sempre pela grade oficial', () => {
    const ctx = new EssayKnowledgeBase().contextFor('C4', 'conectivos repetidos');
    expect(ctx[0].id).toBe('c4-niveis');
    expect(ctx.slice(1).every((c) => c.scope === 'C4')).toBe(true);
  });

  it('não mistura C2 e C4 e recupera o manual específico da competência', () => {
    const kb = new EssayKnowledgeBase();
    const c2 = kb.search('repetição coesão referencial conectivo inadequado', { scope: 'C2', limit: 12 });
    expect(c2.every((h) => h.scope === 'C2')).toBe(true);
    const c4 = kb.search('repertório de bolso tangenciamento recorte temático', { scope: 'C4', limit: 12 });
    expect(c4.every((h) => h.scope === 'C4')).toBe(true);
    expect(kb.search('legitimidade pertinência produtividade repertório', { scope: 'C2', limit: 12 }).some((h) => h.documentId === 'inep-manual-c2-2019')).toBe(true);
    expect(kb.search('repetição coesão referencial', { scope: 'C4', limit: 12 }).some((h) => h.documentId === 'inep-manual-c4-2019')).toBe(true);
  });

  it('mantém a base vigente como padrão e a arquivada apenas por consulta explícita', () => {
    const kb = new EssayKnowledgeBase();
    expect(kb.currentDocument().id).toBe('inep-cartilha-2026');
    expect(kb.search('nota zero', { limit: 12 }).every((h) => h.documentId !== 'inep-cartilha-2025')).toBe(true);
    expect(kb.search('nota zero', { documentId: 'inep-cartilha-2025', limit: 1 })[0].documentId).toBe('inep-cartilha-2025');
  });
});

describe('Análise determinística do texto', () => {
  it('mede estrutura, conectivos e a proposta de intervenção completa', () => {
    const a = analyzeEssayText(ESSAY, { theme: THEME });
    expect(a.paragraphs).toBe(4);
    expect(a.lines).toBeGreaterThanOrEqual(20);
    expect(a.connectives.distinct).toBeGreaterThanOrEqual(6);
    expect(a.connectives.byRelation.oposicao).toContain('entretanto');
    expect(a.proposal.paragraph).toBe(4);
    expect(a.proposal.elements).toMatchObject({ acao: 'deve', agente: expect.any(String), meio: 'por meio de', finalidade: 'a fim de' });
    expect(a.proposal.count).toBe(5);
    expect(a.themeCoverage).toBe(1);
    expect(a.zeroRisks).toEqual([]);
    expect(a.humanRightsFlags).toEqual([]);
  });

  it('aponta texto insuficiente (até 7 linhas), usando as linhas do OCR quando houver', () => {
    expect(analyzeEssayText('Texto curto sobre o tema.').zeroRisks[0].code).toBe('TEXTO_INSUFICIENTE');
    expect(analyzeEssayText(ESSAY, { ocrLines: 7 }).zeroRisks.map((r) => r.code)).toContain('TEXTO_INSUFICIENTE');
    expect(analyzeEssayText(ESSAY, { ocrLines: 8 }).zeroRisks).toEqual([]);
    expect(analyzeEssayText('   ').zeroRisks[0].code).toBe('EM_BRANCO');
  });

  it('não conclui fuga ao tema por cobertura lexical; só alerta para leitura global', () => {
    const offTopic = analyzeEssayText(ESSAY.replace(/herança africana|africana|Brasil|desafios|valorização|valorizar/gi, 'futebol'), { theme: THEME });
    expect(offTopic.zeroRisks.map((r) => r.code)).not.toContain('FUGA_AO_TEMA');
    expect(offTopic.warnings.join(' ')).toMatch(/Cobertura lexical baixa.*Sinal auxiliar/i);
    const note = analyzeEssayText(`${ESSAY}\n\nPrezado avaliador, estou nervoso.`, { theme: THEME });
    expect(note.zeroRisks.map((r) => r.code)).toContain('PARTE_DESCONECTADA');
    const hr = analyzeEssayText(`${ESSAY}\n\nPor isso, defendo a pena de morte para quem ataca terreiros.`);
    expect(hr.humanRightsFlags).toContain('pena de morte');
    expect(analyzeEssayText('Eu acho que a gente precisa ler mais pq é bom. '.repeat(20)).informalMarkers).toEqual(expect.arrayContaining(['eu acho', 'a gente', 'pq']));
  });

  it('não transforma ausência de conectivo inicial nem repetição em penalidade automática', () => {
    const semConectivos = `A herança africana está presente no Brasil. A escola ainda silencia essa história. O racismo estrutural persiste. É preciso mudar esse quadro. O Ministério da Educação deve agir. A mídia deve divulgar a cultura afro-brasileira. A sociedade deve reconhecer essa contribuição.`;
    const a = analyzeEssayText(semConectivos, { theme: THEME, ocrLines: 10 });
    expect(a.connectives.distinct).toBeLessThanOrEqual(1);
    expect(a.zeroRisks).toEqual([]);
    expect(a.warnings.join(' ')).not.toMatch(/Repertório limitado|sem elemento de ligação no início/i);
    expect(a.warnings.join(' ')).not.toMatch(/nota automática.*conectivo/i);
    expect(V3.buildQuery('C4', a)).toMatch(/coesão referencial justaposição sem conectivo explícito/i);
    expect(V3.buildQuery('C4', a)).not.toMatch(/repetição conector inadequado substituição/i);
    const repeticao = analyzeEssayText(`${ESSAY}\n\nA herança africana é uma herança viva; a herança africana deve ser valorizada.`, { theme: THEME });
    expect(repeticao.warnings.join(' ')).toMatch(/podem ser temáticas ou referenciais/i);
    expect(repeticao.zeroRisks).toEqual([]);
    expect(V3.buildQuery('C2', repeticao)).not.toMatch(/repertório repetido|pouco produtivo/i);
    expect(V3.buildQuery('C4', repeticao)).toMatch(/repetição referencial progressão/i);
  });

  it('não transforma sinônimos e retomadas em fuga por baixa cobertura lexical', () => {
    const sinonimos = `O legado afro-brasileiro aparece na culinária, na música e na religiosidade popular. Ainda assim, a população negra enfrenta preconceito e apagamento histórico no país. É necessário discutir como a escola silencia pensadores e artistas negros. Muitos currículos reduzem a cultura negra ao período da escravidão. A mídia também repete estereótipos sobre os descendentes de africanos. O poder público deve ampliar o ensino da história afro-brasileira. A sociedade precisa reconhecer essa contribuição.`;
    const a = analyzeEssayText(sinonimos, { theme: THEME, ocrLines: 10 });
    expect(a.themeCoverage).not.toBeNull();
    expect(a.themeCoverage!).toBeLessThan(0.6);
    expect(a.zeroRisks).toEqual([]);
    expect(a.warnings.join(' ')).toMatch(/Cobertura lexical baixa.*Sinal auxiliar/i);
    expect(V3.buildQuery('C2', a)).toContain('cobertura lexical auxiliar');
    expect(V3.buildQuery('C2', a)).not.toMatch(/fuga ao tema tangenciamento abordagem parcial/);
  });

  it('separa parágrafos por linha em branco e por recuo', () => {
    expect(splitParagraphs('Um.\n\nDois.\n   Três.')).toEqual(['Um.', 'Dois.', 'Três.']);
  });
});

describe('Servidor MCP lumina-redacao', () => {
  it('expõe as ferramentas e responde pelo protocolo', async () => {
    const client = await EssayMcpClient.connect();
    try {
      expect(await client.listTools()).toEqual(['buscar_cartilha', 'grade_competencia', 'analisar_redacao', 'verificar_nota_zero']);
      const grade = await client.gradeCompetencia('C5');
      expect(grade.niveis.map((n) => n.nota)).toEqual([200, 160, 120, 80, 40, 0]);
      expect(grade.citacao).toMatch(/p\. 38/);
      const hits = await client.buscarCartilha({ consulta: 'repertório de bolso', competencia: 'C2', limite: 2 });
      expect(hits[0].id).toBe('c2-repertorio-de-bolso');
      const zero = await client.verificarNotaZero({ texto: 'Curto.' });
      expect(zero.anulacao_certa[0].code).toBe('TEXTO_INSUFICIENTE');
      expect(client.calls.map((c) => c.tool)).toEqual(['grade_competencia', 'buscar_cartilha', 'verificar_nota_zero']);
    } finally {
      await client.close();
    }
  });

  it('devolve versão e documento do trecho, inclusive no arquivo de 2025', async () => {
    const client = await EssayMcpClient.connect();
    try {
      const current = await client.buscarCartilha({ consulta: 'repertório de bolso', competencia: 'C2', limite: 1 });
      expect(current[0]).toMatchObject({ documento: 'inep-cartilha-2026', versao: '2026', publicado_em: '2026-09-21' });
      const archived = await client.buscarCartilha({ consulta: 'nota zero', documento_versao: 'inep-cartilha-2025', limite: 1 });
      expect(archived[0]).toMatchObject({ documento: 'inep-cartilha-2025', versao: '2025' });
      expect(archived[0].citacao).toMatch(/2025/);
    } finally {
      await client.close();
    }
  });

  it('rejeita argumento fora do esquema (competência inexistente)', async () => {
    const client = await EssayMcpClient.connect();
    try {
      await expect(client.gradeCompetencia('C9' as never)).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it('registra corrigir_redacao só quando há corretor injetado', async () => {
    const correct = vi.fn().mockResolvedValue({ total: 880 });
    const client = await EssayMcpClient.connect({ correct });
    try {
      expect(await client.listTools()).toContain('corrigir_redacao');
    } finally {
      await client.close();
    }
  });
});

describe('Corretor por competência', () => {
  const allowed = new Set(['c1-niveis', 'c2-niveis', 'c3-niveis', 'c4-niveis', 'c5-niveis']);

  it('não aceita trecho que não está na redação nem referência que não foi entregue', () => {
    const run = parseCompetencyEvaluation(extractJson('```json\n' + competencyAnswer('C3', 120) + '\n```'), 'C3', ESSAY, allowed, undefined, 'a', 'm');
    expect(run.evidence).toEqual(['o racismo estrutural, herdado de mais de três séculos de escravização']);
    expect(run.references).toEqual(['c3-niveis']);
    expect(run).toMatchObject({ score: 120, rawScore: 120, tip: 'Dica C3' });
  });

  it('arredonda nota fora do nível', () => {
    expect(parseCompetencyEvaluation(JSON.parse(competencyAnswer('C1', 170)), 'C1', ESSAY, allowed, undefined, 'a', 'm').score).toBe(160);
    expect(parseCompetencyEvaluation(JSON.parse(competencyAnswer('C4', 130)), 'C4', ESSAY, allowed, undefined, 'a', 'm').score).toBe(120);
  });

  it('preenche explicação e justificativa quando o modelo omite os campos', () => {
    const raw = JSON.parse(competencyAnswer('C2', 120));
    delete raw.justificativa;
    delete raw.explicacao_nivel;
    delete raw.como_melhorar;
    const run = parseCompetencyEvaluation(raw, 'C2', ESSAY, allowed, undefined, 'a', 'm');
    expect(run.justification).toMatch(/descritor melhor descreve/i);
    expect(run.levelExplanation).toMatch(/descritor melhor descreve/i);
    expect(run.tip).toMatch(/Reescreva os trechos apontados/i);
  });

  it('a calibração só vale para a versão de prompt em que foi ajustada', () => {
    expect(llmCalibration.promptVersion).toBe('v2-competencia');
    const calibration = llmCalibration as unknown as LlmCalibration;
    expect(calibrationFor(calibration, 'gemini:gemini-3.5-flash-lite', 'v2-competencia').fitted).toBe(true);
    expect(calibrationFor(calibration, 'gemini:gemini-3.5-flash-lite', 'v3-c2-c4-oficial-2026').fitted).toBe(false);
    expect(calibrationFor(calibration, 'gemini:gemini-3.5-flash-lite', 'v4-calibrado').fitted).toBe(false);
  });

  it('aplica a função de calibração da competência só ao modelo dela', () => {
    const calibration: LlmCalibration = {
      version: 2,
      promptVersion: GRADER_PROMPT_VERSION,
      byModel: {
        'gemini:x': {
          perCompetency: {
            C1: { type: 'isotonic', points: [[0, 0], [40, 40], [80, 80], [120, 160], [160, 180], [200, 200]] },
            C2: { type: 'identity' },
            C3: { type: 'linear', a: 0.8, b: 0 },
            C4: { type: 'identity' },
            C5: { type: 'identity' },
          },
        },
      },
    };
    const c1 = parseCompetencyEvaluation(JSON.parse(competencyAnswer('C1', 120)), 'C1', ESSAY, allowed, calibration, 'a', 'gemini:x');
    expect(c1).toMatchObject({ rawScore: 120, score: 160 });
    expect(parseCompetencyEvaluation(JSON.parse(competencyAnswer('C3', 200)), 'C3', ESSAY, allowed, calibration, 'a', 'gemini:x').score).toBe(160);
    // Outro modelo, ou outra versão de prompt: sem calibração.
    expect(parseCompetencyEvaluation(JSON.parse(competencyAnswer('C1', 120)), 'C1', ESSAY, allowed, calibration, 'a', 'groq:y').score).toBe(120);
    expect(calibrationFor({ ...calibration, promptVersion: 'v1' }, 'gemini:x').fitted).toBe(false);
  });

  it('regras entre competências: tangenciamento (C2) limita C2, C3 e C5; direitos humanos (C5) zeram a C5', () => {
    const part = (id: (typeof IDS)[number], score: number, extra: Partial<CompetencyRun> = {}): CompetencyRun => ({
      competency: id,
      evaluator: 'a',
      model: 'm',
      score,
      rawScore: score,
      justification: '',
      strengths: [],
      problems: [],
      levelExplanation: '',
      evidence: [],
      references: [],
      ...extra,
    });
    const run = assembleRun('a', { C1: part('C1', 160), C2: part('C2', 200, { tangencia: true, annulment: null }), C3: part('C3', 200), C4: part('C4', 120), C5: part('C5', 200, { humanRightsViolation: true }) });
    expect(IDS.map((id) => run.competencies[id].score)).toEqual([160, 40, 40, 120, 0]);
    const annulled = assembleRun('a', { C1: part('C1', 160), C2: part('C2', 120, { annulment: { code: 'FUGA_AO_TEMA', explanation: '' } }) });
    expect(annulled.total).toBe(0);
  });

  it('discrepância segue o Inep e o terceiro reavalia só o que divergiu', () => {
    expect(discrepancyBetween(fakeRun('a', [160, 160, 160, 160, 160]), fakeRun('b', [120, 120, 160, 160, 160])).discrepant).toBe(false);
    const byCompetency = discrepancyBetween(fakeRun('a', [200, 160, 160, 160, 160]), fakeRun('b', [80, 160, 160, 160, 160]));
    expect(byCompetency.discrepant).toBe(true);
    expect(competenciesForThird(byCompetency, false)).toEqual(['C1']);
    // Só o total passou de 100: vão as de maior diferença.
    const byTotal = discrepancyBetween(fakeRun('a', [200, 200, 200, 160, 160]), fakeRun('b', [160, 160, 120, 120, 120]));
    expect(competenciesForThird(byTotal, false)).toEqual(['C3']);
    expect(competenciesForThird(byCompetency, true)).toEqual(['C1', 'C2']);
    expect(closestScores([200, 80, 160])).toEqual([200, 160]);
    const pair = closestPair([fakeRun('a', [200, 200, 200, 200, 200]), fakeRun('b', [80, 80, 80, 80, 80]), fakeRun('c', [160, 160, 200, 200, 200])]);
    expect(pair.map((r) => r.evaluator).sort()).toEqual(['a', 'c']);
  });

  it('não repete o mesmo trecho com e sem pontuação', () => {
    expect(dedupeQuotes(['o país valorizará suas raízes', 'Assim, o país valorizará suas raízes.', 'outro trecho'])).toEqual(['Assim, o país valorizará suas raízes.', 'outro trecho']);
  });

  it('confere citação com reticências pedaço por pedaço', () => {
    expect(verifiedEvidence(['o racismo estrutural, herdado ... três séculos de escravização'], ESSAY)).toHaveLength(1);
    expect(verifiedEvidence(['o racismo estrutural ... algo que não está no texto'], ESSAY)).toHaveLength(0);
  });

  /**
   * Corrige com um modelo falso: `answer(competência, avaliador)` devolve o
   * texto da resposta (o avaliador sai da temperatura: 0,2 → 1, 0,7 → 2, 0,4 → 3).
   */
  async function grade(answer: (competency: (typeof IDS)[number], evaluator: number) => string | null, promptVersion?: string) {
    const tools = await EssayMcpClient.connect();
    const prompts: string[] = [];
    const llm: LlmGenerate = vi.fn(async ({ prompt, temperature }) => {
      prompts.push(prompt);
      const text = answer(competencyOf(prompt), temperature === 0.2 ? 1 : temperature === 0.7 ? 2 : 3);
      return text === null ? null : { text, model: 'fake-model' };
    });
    try {
      return { result: await new EssayGrader({ tools, llm, promptVersion }).grade({ text: ESSAY, theme: THEME }), llm, prompts };
    } finally {
      await tools.close();
    }
  }

  const scores =
    (first: number[], second: number[], third: number[] = first) =>
    (c: (typeof IDS)[number], e: number) =>
      competencyAnswer(c, (e === 1 ? first : e === 2 ? second : third)[IDS.indexOf(c)]);

  it('dois avaliadores concordantes: cinco chamadas cada, uma por competência, com contexto só dela', async () => {
    const { result, llm, prompts } = await grade(scores([160, 200, 160, 160, 200], [160, 160, 160, 200, 200]));
    expect(llm).toHaveBeenCalledTimes(10);
    expect(result.method).toBe('dois-avaliadores');
    expect(result.competencies.map((c) => c.score)).toEqual([160, 180, 160, 180, 200]);
    expect(result.total).toBe(880);
    expect(result.discrepancy?.thirdEvaluator).toBe(false);
    // O prompt da C1 traz a grade da C1 e não a das outras.
    const c1 = prompts.find((p) => competencyOf(p) === 'C1')!;
    expect(c1).toContain('[c1-niveis]');
    expect(c1).not.toContain('[c5-niveis]');
    expect(c1).not.toContain('"anulacao"');
    expect(prompts.find((p) => competencyOf(p) === 'C2')).toContain('"anulacao"');
    const tools = result.toolCalls.map((c) => c.tool);
    expect(tools.slice(0, 2)).toEqual(['analisar_redacao', 'verificar_nota_zero']);
    expect(tools.filter((t) => t === 'grade_competencia')).toHaveLength(5);
    expect(tools.filter((t) => t === 'buscar_cartilha')).toHaveLength(5);
    expect(result.competencies[0].citations[0].citation).toMatch(/Cartilha do Participante \(Inep\), 2026/);
    expect(result.competencies[0].level).toMatch(/bom domínio/);
    expect(result.competencies[0].tip).toBe('Dica C1');
    expect(result.generalFeedback).toMatch(/Ponto mais forte: C5/);
  });

  it('prompts de C2 e C4 ensinam os critérios oficiais sem transformar contagem em nota', async () => {
    const { prompts } = await grade(scores([160, 160, 160, 160, 160], [160, 160, 160, 160, 160]), 'v3-c2-c4-oficial-2026');
    const c2 = prompts.find((p) => competencyOf(p) === 'C2')!;
    const c4 = prompts.find((p) => competencyOf(p) === 'C4')!;
    expect(c2).toMatch(/recorte temático/i);
    expect(c2).toMatch(/\[recorte\].*\[tipo textual\].*\[repertório\]/is);
    expect(c2).toMatch(/legitimidade.*pertinência.*produtividade/is);
    expect(c2).toMatch(/Não conclua fuga porque faltam palavras exatas do tema/i);
    expect(c2).toMatch(/Cobertura lexical.*Sinal auxiliar/is);
    expect(c2).not.toContain('[c4-niveis]');
    expect(c4).toMatch(/Não exija conectivo no início de cada parágrafo/i);
    expect(c4).toMatch(/quantidade de conectivos/i);
    expect(c4).toMatch(/referenciação/i);
    expect(c4).toMatch(/repetição.*pode ser necessária/is);
    expect(c4).toMatch(/A contagem é auxiliar/i);
    expect(c4).not.toContain('[c2-niveis]');
  });

  it('v4: base v2, C4 do v3, regras de calibração em C1/C2/C5 e formato do v2', async () => {
    const { prompts } = await grade(scores([160, 160, 160, 160, 160], [160, 160, 160, 160, 160]), 'v4-calibrado');
    const byC = (c: string) => prompts.find((p) => competencyOf(p) === c)!;
    expect(byC('C4')).toMatch(/Não exija conectivo no início de cada parágrafo/i);
    expect(byC('C1')).toMatch(/Calibração pela grade \(não pela caça a erros\)/);
    expect(byC('C5')).toMatch(/Uma única proposta completa/);
    expect(byC('C2')).toMatch(/Calibração pela grade/);
    expect(byC('C3')).not.toMatch(/Calibração pela grade/);
    // Formato do v2: sem os campos extras do v3.
    expect(byC('C1')).not.toContain('pontos_fortes');
    const analysis = analyzeEssayText(ESSAY, { theme: THEME });
    expect(PROMPT_SETS['v4-calibrado'].buildQuery('C4', analysis)).toBe(V3.buildQuery('C4', analysis));
    expect(PROMPT_SETS['v4-calibrado'].buildQuery('C2', analysis)).toBe(PROMPT_SETS['v2-competencia'].buildQuery('C2', analysis));
  });

  it('v5: igual ao v2 em C1, C3 e C5; C4 do v3; regras de calibração só em C2', async () => {
    const same = scores([160, 160, 160, 160, 160], [160, 160, 160, 160, 160]);
    const v5 = (await grade(same, 'v5-c2-c4')).prompts;
    const v2 = (await grade(same, 'v2-competencia')).prompts;
    const v4 = (await grade(same, 'v4-calibrado')).prompts;
    const byC = (prompts: string[], c: string) => prompts.find((p) => competencyOf(p) === c)!;
    for (const c of ['C1', 'C3', 'C5']) expect(byC(v5, c)).toBe(byC(v2, c));
    expect(byC(v5, 'C4')).toBe(byC(v4, 'C4'));
    expect(byC(v5, 'C2')).toMatch(/Calibração pela grade/);
    expect(byC(v5, 'C2')).toBe(byC(v4, 'C2'));
  });

  it('produção volta ao prompt v2 (o v3 mediu pior em 05/11/2026)', () => {
    expect(GRADER_PROMPT_VERSION).toBe('v2-competencia');
  });

  it('devolve pontos fortes, problemas, explicação do nível e a versão da base usada', async () => {
    const { result } = await grade(scores([160, 160, 160, 160, 160], [160, 160, 160, 160, 160]));
    expect(result.competencies[0]).toMatchObject({
      strengths: ['Ponto forte C1'],
      problems: ['Problema C1'],
      levelExplanation: 'Explicação do nível C1',
    });
    expect(result.knowledge.activeDocument).toMatchObject({ id: 'inep-cartilha-2026', version: '2026', publishedAt: '2026-09-21' });
    expect(result.knowledge.documents.map((d) => d.id)).toEqual(expect.arrayContaining(['inep-cartilha-2026', 'inep-cartilha-2025', 'inep-manual-c2-2019', 'inep-manual-c4-2019']));
    expect(result.knowledge.documents.find((d) => d.id === 'inep-cartilha-2025')?.status).toBe('archived');
  });

  it('discrepância numa competência: o terceiro reavalia só ela e vale o par mais próximo', async () => {
    const { result, llm } = await grade(scores([200, 160, 160, 160, 160], [80, 160, 160, 160, 160], [160, 0, 0, 0, 0]));
    expect(llm).toHaveBeenCalledTimes(11);
    expect(result.method).toBe('tres-avaliadores');
    expect(result.discrepancy?.competencies).toEqual(['C1']);
    expect(result.competencies.map((c) => c.score)).toEqual([180, 160, 160, 160, 160]);
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('anulação só vale quando a maioria das avaliações da C2 concorda', async () => {
    const annul = { anulacao: { motivo: 'FUGA_AO_TEMA', explicacao: 'Fala de outro tema.' } };
    const split = await grade((c, e) => competencyAnswer(c, 160, c === 'C2' && e === 1 ? annul : {}));
    expect(split.result.annulment).toBeNull();
    expect(split.llm).toHaveBeenCalledTimes(11);
    expect(split.result.total).toBe(800);
    const both = await grade((c) => competencyAnswer(c, 160, c === 'C2' ? annul : {}));
    expect(both.result.annulment).toMatchObject({ code: 'FUGA_AO_TEMA', citation: expect.stringMatching(/p\. 25/) });
    expect(both.result.total).toBe(0);
  });

  it('texto insuficiente zera por regra, sem chamar o modelo', async () => {
    const tools = await EssayMcpClient.connect();
    const llm = vi.fn();
    const result = await new EssayGrader({ tools, llm }).grade({ text: 'Só uma frase sobre o tema.', theme: THEME });
    await tools.close();
    expect(llm).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, method: 'regra', annulment: { code: 'TEXTO_INSUFICIENTE' } });
  });

  it('JSON quebrado tenta de novo; sem provedor e sem modelo treinado, falha com mensagem clara', async () => {
    const broken = new Set<string>();
    const retried = await grade((c, e) => {
      const key = `${c}${e}`;
      if (c === 'C3' && !broken.has(key)) {
        broken.add(key);
        return 'isto não é json';
      }
      return competencyAnswer(c, 120);
    });
    expect(retried.result.total).toBe(600);
    expect(retried.llm).toHaveBeenCalledTimes(12);
    await expect(grade(() => null)).rejects.toThrow('Correção indisponível');
  });

  it('comentário geral aponta o ponto forte e o que priorizar', () => {
    const text = composeGeneralFeedback([
      { competency: 'C1', score: 120, tip: 'Revise a crase.' },
      { competency: 'C2', score: 200 },
      { competency: 'C3', score: 160 },
      { competency: 'C4', score: 160 },
      { competency: 'C5', score: 80, tip: 'Detalhe o meio.' },
    ]);
    expect(text).toMatch(/Ponto mais forte: C2/);
    expect(text).toMatch(/priorize C5 .* e C1/);
    expect(text).toContain('C5: Detalhe o meio.');
  });
});

describe('Calibração funcional por competência', () => {
  it('isotônica é monotônica e, sem dados num nível, fica na identidade', () => {
    const fn = fitIsotonicFn([
      [120, 160], [120, 160], [120, 160], [120, 160],
      [160, 140], [160, 140], [160, 140], [160, 140],
    ]);
    const values = LEVELS.map((x) => applyCalibrationFn(fn, x));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(applyCalibrationFn(fn, 0)).toBe(0);
    expect(applyCalibrationFn(fn, 200)).toBe(200);
    // Interpola entre níveis (média de dois avaliadores).
    expect(applyCalibrationFn({ type: 'isotonic', points: [[80, 80], [120, 160]] }, 100)).toBe(120);
  });

  it('modelo já na escala: a validação cruzada mantém a identidade', () => {
    const pairs: [number, number][] = Array.from({ length: 30 }, (_, i) => [LEVELS[i % 6], LEVELS[i % 6]]);
    expect(selectCalibrationFn(pairs).fn).toEqual({ type: 'identity' });
  });

  it('modelo que comprime a escala: escolhe uma função que a expande', () => {
    // O modelo dá 120 a redações de 80 a 160, e 80 às de 40.
    const pairs: [number, number][] = [];
    for (let i = 0; i < 8; i++) pairs.push([80, 40], [120, 80], [120, 120], [160, 200], [120, 160], [160, 160]);
    const sel = selectCalibrationFn(pairs);
    expect(sel.fn.type).not.toBe('identity');
    expect(Math.min(sel.loo.linear, sel.loo.isotonic)).toBeLessThan(sel.loo.identity);
    expect(applyCalibrationFn(sel.fn, 80)).toBeLessThan(80);
    expect(applyCalibrationFn(sel.fn, 160)).toBeGreaterThan(160);
  });

  it('recusa função que achata os extremos (nenhuma redação chegaria a 1000)', () => {
    // Avaliadores humanos ruidosos: o 200 do modelo vira, em média, 170.
    const pairs: [number, number][] = [];
    for (let i = 0; i < 6; i++) pairs.push([200, 200], [200, 160], [200, 120], [160, 160], [120, 120], [80, 80], [40, 40], [0, 0]);
    expect(preservesExtremes({ type: 'linear', a: 0.633, b: 49 })).toBe(false);
    expect(preservesExtremes({ type: 'isotonic', points: [[0, 18.6], [200, 173.3]] })).toBe(false);
    const sel = selectCalibrationFn(pairs);
    expect(preservesExtremes(sel.fn)).toBe(true);
    expect(snapToLevel(applyCalibrationFn(sel.fn, 200))).toBe(200);
  });

  it('lê o formato antigo (reta sem tipo)', () => {
    expect(applyCalibrationFn({ a: 0.5, b: 20 }, 200)).toBe(120);
  });
});

describe('Modelo de atributos', () => {
  it('ridge recupera uma relação linear conhecida', () => {
    const x = Array.from({ length: 200 }, (_, i) => [1, Math.sin(i), Math.cos(i * 0.7)]);
    const y = x.map((r) => 100 + 30 * r[1] - 20 * r[2]);
    const w = fitRidge(x, y, 1e-6);
    expect(w[0]).toBeCloseTo(100, 3);
    expect(w[1]).toBeCloseTo(30, 3);
    expect(w[2]).toBeCloseTo(-20, 3);
  });

  it('extrai um valor por atributo, todos finitos, e arredonda ao nível', () => {
    const features = extractFeatures(analyzeEssayText(ESSAY, { theme: THEME }), ESSAY);
    expect(features).toHaveLength(FEATURE_NAMES.length);
    expect(features.every(Number.isFinite)).toBe(true);
    expect([snapToLevel(-10), snapToLevel(139), snapToLevel(141), snapToLevel(260)]).toEqual([0, 120, 160, 200]);
  });
});

describe('Leitura da foto (OCR por visão)', () => {
  it('junta linhas desfazendo a translineação e respeitando parágrafos', () => {
    const text = linesToText([
      { number: 1, text: 'A herança afri-', paragraphStart: true, illegibleWords: 0 },
      { number: 2, text: 'cana é ampla.', paragraphStart: false, illegibleWords: 0 },
      { number: 3, text: 'Contudo, há desafios.', paragraphStart: true, illegibleWords: 0 },
    ]);
    expect(text).toBe('A herança africana é ampla.\n\nContudo, há desafios.');
  });

  it('preserva erros do aluno, conta [ilegível] e não deixa o título virar linha', () => {
    const parsed = parseTranscription({ titulo: 'Herança viva', linhas: [{ n: 1, texto: 'A eranssa africana  [ilegível] presente', novo_paragrafo: true }, { n: 2, texto: '' }], confianca: 0.9 }, 'm');
    expect(parsed.title).toBe('Herança viva');
    expect(parsed.lines).toEqual([{ number: 1, text: 'A eranssa africana [ilegível] presente', paragraphStart: true, illegibleWords: 1 }]);
    expect(parsed.illegibleWords).toBe(1);
  });

  it('confiança cai com palavras ilegíveis mesmo quando o modelo se diz seguro', () => {
    expect(combineConfidence(1, 300, 0)).toBe(1);
    expect(combineConfidence(1, 300, 30)).toBeLessThan(0.85);
  });

  it('numera a 2ª página a partir da 31 e sem provedor devolve null', async () => {
    const vision = vi.fn()
      .mockResolvedValueOnce({ text: JSON.stringify({ linhas: [{ n: 1, texto: 'Primeira página.', novo_paragrafo: true }], confianca: 0.8 }), model: 'v' })
      .mockResolvedValueOnce({ text: JSON.stringify({ linhas: [{ n: 1, texto: 'continua aqui.', novo_paragrafo: false }], confianca: 0.8 }), model: 'v' });
    const t = await transcribeEssayPages(vision, ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB']);
    expect(t?.lines.map((l) => l.number)).toEqual([1, 31]);
    expect(t?.text).toBe('Primeira página. continua aqui.');
    expect(await transcribeEssayPages(vi.fn().mockResolvedValue(null), ['data:image/jpeg;base64,AAA'])).toBeNull();
  });
});

describe('Upload da página digitalizada', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 1)]);
  it('aceita JPEG pelos bytes e recusa tipo trocado, imagem vazia e grande demais', () => {
    expect(decodeImage(`data:image/jpeg;base64,${jpeg.toString('base64')}`).mime).toBe('image/jpeg');
    // Declarado como PNG mas os bytes são JPEG: vale o que os bytes dizem.
    expect(decodeImage(`data:image/png;base64,${jpeg.toString('base64')}`).mime).toBe('image/jpeg');
    expect(() => decodeImage(`data:image/jpeg;base64,${Buffer.alloc(2000, 7).toString('base64')}`)).toThrow('Formato não suportado');
    expect(() => decodeImage('data:image/jpeg;base64,AAAA')).toThrow('vazia');
    expect(() => decodeImage(`data:image/jpeg;base64,${Buffer.concat([jpeg, Buffer.alloc(3 * 1024 * 1024)]).toString('base64')}`)).toThrow('3 MB');
    expect(() => decodeImage('https://exemplo.com/foto.jpg')).toThrow('data URL');
  });
});
