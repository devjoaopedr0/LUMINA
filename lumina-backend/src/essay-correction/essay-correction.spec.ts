import { describe, expect, it, vi } from 'vitest';
import { analyzeEssayText, splitParagraphs } from './analysis/text-analysis';
import {
  closestPair,
  dedupeQuotes,
  discrepancyBetween,
  EssayGrader,
  EvaluatorRun,
  extractJson,
  IDENTITY_CALIBRATION,
  LlmGenerate,
  parseEvaluation,
  verifiedEvidence,
} from './grading/essay-grader';
import { extractFeatures, fitRidge, FEATURE_NAMES, snapToLevel } from './grading/feature-model';
import { COMPETENCY_GRID, KNOWLEDGE_BASE } from './knowledge/inep-cartilha-2025';
import { EssayMcpClient } from './mcp/essay-mcp-client';
import { combineConfidence, linesToText, parseTranscription, transcribeEssayPages } from './ocr/essay-ocr';
import { tokenize } from './rag/bm25';
import { EssayKnowledgeBase } from './rag/knowledge-base';
import { decodeImage } from './essay-correction.service';

const THEME = 'Desafios para a valorização da herança africana no Brasil';

// Redação de teste escrita para esta suíte (não é de nenhum participante).
const ESSAY = `No Brasil, a herança africana está presente na língua, na culinária, na música e na religiosidade. Entretanto, a valorização dessa herança ainda enfrenta desafios, sobretudo o racismo estrutural e a omissão da escola em abordar a história afro-brasileira. Diante desse cenário, é necessário discutir as causas do problema e propor caminhos para superá-lo.

Em primeiro lugar, o racismo estrutural, herdado de mais de três séculos de escravização, faz com que manifestações de matriz africana sejam tratadas como folclore ou como algo inferior. Prova disso são os ataques a terreiros de candomblé, que, segundo levantamentos de organizações da sociedade civil, cresceram nos últimos anos. Dessa forma, parte da população aprende a enxergar a cultura negra apenas pelo estereótipo, o que dificulta seu reconhecimento.

Além disso, a escola, que deveria combater esse apagamento, ainda negligencia o ensino de história e cultura afro-brasileira, embora a Lei 10.639, de 2003, o torne obrigatório. Muitos currículos limitam o tema ao período escravocrata e silenciam figuras como Luís Gama e Carolina Maria de Jesus. Consequentemente, os estudantes concluem a educação básica sem conhecer a contribuição africana para a formação do país.

Portanto, para valorizar a herança africana no Brasil, o Ministério da Educação deve fiscalizar o cumprimento da Lei 10.639, por meio de formação continuada de professores e de materiais didáticos que apresentem autores e intelectuais negros, a fim de que os alunos reconheçam essa contribuição. Ademais, a mídia, como formadora de opinião, precisa divulgar campanhas contra a intolerância religiosa, com o objetivo de reduzir os ataques a terreiros.`;

function fakeRun(label: string, scores: number[], annulment: EvaluatorRun['annulment'] = null): EvaluatorRun {
  const ids = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;
  return {
    evaluator: label,
    method: 'llm',
    model: 'fake',
    annulment,
    tangencia: false,
    humanRightsViolation: false,
    competencies: Object.fromEntries(ids.map((id, i) => [id, { score: scores[i], justification: `${label} ${id}`, evidence: [], references: [] }])) as unknown as EvaluatorRun['competencies'],
    total: scores.reduce((a, b) => a + b, 0),
    generalComment: `${label} geral`,
  };
}

function llmAnswer(scores: number[], extra: Record<string, unknown> = {}) {
  const ids = ['C1', 'C2', 'C3', 'C4', 'C5'];
  return JSON.stringify({
    anulacao: null,
    tangenciamento: false,
    direitos_humanos_desrespeitados: false,
    competencias: Object.fromEntries(
      ids.map((id, i) => [id, { nota: scores[i], justificativa: `Justificativa ${id}`, trechos: ['o racismo estrutural, herdado de mais de três séculos de escravização', 'trecho que não existe na redação'], referencias: [`${id.toLowerCase()}-niveis`, 'id-inventado'] }]),
    ),
    comentario_geral: 'Bom texto.',
    ...extra,
  });
}

describe('Base de conhecimento da cartilha (RAG)', () => {
  it('tem a grade oficial de seis níveis em todas as competências e só trechos citáveis', () => {
    for (const grid of Object.values(COMPETENCY_GRID)) expect(Object.keys(grid.levels).sort()).toEqual(['0', '120', '160', '200', '40', '80']);
    for (const chunk of KNOWLEDGE_BASE) {
      if (chunk.source === 'inep-cartilha-2025') expect(chunk.page).toBeGreaterThan(0);
      else expect(chunk.text).toMatch(/Critério operacional da Lumina/);
    }
    expect(new Set(KNOWLEDGE_BASE.map((c) => c.id)).size).toBe(KNOWLEDGE_BASE.length);
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

  it('cita a página da cartilha e identifica critério da Lumina como não oficial', () => {
    const kb = new EssayKnowledgeBase();
    expect(kb.search('discrepância entre avaliadores', { limit: 1 })[0].citation).toBe('Cartilha do Participante Enem 2025 (Inep), p. 6');
    expect(kb.search('contagem de elementos da proposta', { scope: 'C5', limit: 3 }).find((h) => h.source === 'lumina')?.citation).toMatch(/não consta da cartilha/);
  });

  it('contexto de competência começa sempre pela grade oficial', () => {
    const ctx = new EssayKnowledgeBase().contextFor('C4', 'conectivos repetidos');
    expect(ctx[0].id).toBe('c4-niveis');
    expect(ctx.slice(1).every((c) => c.scope === 'C4')).toBe(true);
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

  it('sinaliza fuga provável, bilhete à banca, direitos humanos e registro informal', () => {
    const offTopic = analyzeEssayText(ESSAY.replace(/herança africana|africana|Brasil|desafios|valorização|valorizar/gi, 'futebol'), { theme: THEME });
    expect(offTopic.zeroRisks.map((r) => r.code)).toContain('FUGA_AO_TEMA');
    const note = analyzeEssayText(`${ESSAY}\n\nPrezado avaliador, estou nervoso.`, { theme: THEME });
    expect(note.zeroRisks.map((r) => r.code)).toContain('PARTE_DESCONECTADA');
    const hr = analyzeEssayText(`${ESSAY}\n\nPor isso, defendo a pena de morte para quem ataca terreiros.`);
    expect(hr.humanRightsFlags).toContain('pena de morte');
    expect(analyzeEssayText('Eu acho que a gente precisa ler mais pq é bom. '.repeat(20)).informalMarkers).toEqual(expect.arrayContaining(['eu acho', 'a gente', 'pq']));
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
      expect(grade.citacao).toMatch(/p\. 37/);
      const hits = await client.buscarCartilha({ consulta: 'repertório de bolso', competencia: 'C2', limite: 2 });
      expect(hits[0].id).toBe('c2-repertorio-de-bolso');
      const zero = await client.verificarNotaZero({ texto: 'Curto.' });
      expect(zero.anulacao_certa[0].code).toBe('TEXTO_INSUFICIENTE');
      expect(client.calls.map((c) => c.tool)).toEqual(['grade_competencia', 'buscar_cartilha', 'verificar_nota_zero']);
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

describe('Corretor', () => {
  it('não aceita trecho que não está na redação nem referência que não foi entregue', () => {
    const run = parseEvaluation(extractJson('```json\n' + llmAnswer([160, 160, 120, 160, 200]) + '\n```'), ESSAY, new Set(['c1-niveis', 'c2-niveis', 'c3-niveis', 'c4-niveis', 'c5-niveis']), IDENTITY_CALIBRATION, 'a', 'm');
    expect(run.competencies.C3.evidence).toEqual(['o racismo estrutural, herdado de mais de três séculos de escravização']);
    expect(run.competencies.C3.references).toEqual(['c3-niveis']);
    expect(run.total).toBe(800);
  });

  it('arredonda nota fora do nível, aplica tangenciamento e direitos humanos', () => {
    const allowed = new Set<string>();
    const run = parseEvaluation(JSON.parse(llmAnswer([170, 200, 200, 130, 200], { tangenciamento: true, direitos_humanos_desrespeitados: true })), ESSAY, allowed, IDENTITY_CALIBRATION, 'a', 'm');
    expect(run.competencies.C1.score).toBe(160);
    expect(run.competencies.C4.score).toBe(120);
    expect(run.competencies.C2.score).toBe(40);
    expect(run.competencies.C3.score).toBe(40);
    expect(run.competencies.C5.score).toBe(0);
  });

  it('aplica a calibração antes de arredondar', () => {
    const calibration = { ...IDENTITY_CALIBRATION, fitted: true, perCompetency: { ...IDENTITY_CALIBRATION.perCompetency, C1: { a: 0.8, b: 0 } } };
    const run = parseEvaluation(JSON.parse(llmAnswer([200, 200, 200, 200, 200])), ESSAY, new Set(), calibration, 'a', 'm');
    expect(run.competencies.C1.score).toBe(160);
  });

  it('discrepância segue o Inep: >100 no total ou >80 numa competência', () => {
    expect(discrepancyBetween(fakeRun('a', [160, 160, 160, 160, 160]), fakeRun('b', [120, 120, 160, 160, 160])).discrepant).toBe(false);
    expect(discrepancyBetween(fakeRun('a', [200, 160, 160, 160, 160]), fakeRun('b', [80, 160, 160, 160, 160])).discrepant).toBe(true);
    expect(discrepancyBetween(fakeRun('a', [200, 200, 200, 160, 160]), fakeRun('b', [160, 160, 160, 120, 120])).discrepant).toBe(true);
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

  async function grade(llmTexts: (string | null)[]) {
    const tools = await EssayMcpClient.connect();
    const queue = [...llmTexts];
    const llm: LlmGenerate = vi.fn(async () => {
      const next = queue.shift();
      return next === null || next === undefined ? null : { text: next, model: 'fake-model' };
    });
    try {
      return { result: await new EssayGrader({ tools, llm }).grade({ text: ESSAY, theme: THEME }), llm };
    } finally {
      await tools.close();
    }
  }

  it('dois avaliadores concordantes: média, sem terceiro, e consulta à cartilha pelo MCP', async () => {
    const { result, llm } = await grade([llmAnswer([160, 200, 160, 160, 200]), llmAnswer([160, 160, 160, 200, 200])]);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(result.method).toBe('dois-avaliadores');
    expect(result.competencies.map((c) => c.score)).toEqual([160, 180, 160, 180, 200]);
    expect(result.total).toBe(880);
    expect(result.discrepancy?.thirdEvaluator).toBe(false);
    const tools = result.toolCalls.map((c) => c.tool);
    expect(tools.slice(0, 2)).toEqual(['analisar_redacao', 'verificar_nota_zero']);
    expect(tools.filter((t) => t === 'grade_competencia')).toHaveLength(5);
    expect(tools.filter((t) => t === 'buscar_cartilha')).toHaveLength(5);
    expect(result.competencies[0].citations[0].citation).toMatch(/Cartilha do Participante Enem 2025/);
    expect(result.competencies[0].level).toMatch(/bom domínio/);
  });

  it('discrepância chama o terceiro avaliador e fica com o par mais próximo', async () => {
    const { result, llm } = await grade([llmAnswer([200, 200, 200, 200, 200]), llmAnswer([80, 80, 80, 80, 80]), llmAnswer([160, 200, 200, 200, 200])]);
    expect(llm).toHaveBeenCalledTimes(3);
    expect(result.method).toBe('tres-avaliadores');
    expect(result.total).toBe(980);
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('anulação só vale quando as duas avaliações finais concordam', async () => {
    const annul = llmAnswer([0, 0, 0, 0, 0], { anulacao: { motivo: 'FUGA_AO_TEMA', explicacao: 'Fala de outro tema.' } });
    const split = await grade([annul, llmAnswer([160, 160, 160, 160, 160]), llmAnswer([160, 160, 120, 160, 160])]);
    expect(split.result.annulment).toBeNull();
    expect(split.result.total).toBe(780);
    const both = await grade([annul, annul]);
    expect(both.result.annulment).toMatchObject({ code: 'FUGA_AO_TEMA', citation: expect.stringMatching(/p\. 24/) });
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
    const retried = await grade(['isto não é json', llmAnswer([120, 120, 120, 120, 120]), llmAnswer([120, 120, 120, 120, 120])]);
    expect(retried.result.total).toBe(600);
    await expect(grade([null])).rejects.toThrow('Correção indisponível');
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
