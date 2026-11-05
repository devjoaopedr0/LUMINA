/**
 * Servidor MCP da correção de redação ("lumina-redacao").
 *
 * É a única porta da IA corretora para o conhecimento da cartilha: o
 * corretor (EssayGrader) não lê a base diretamente — ele é um cliente MCP e
 * pede trechos, grades e análises por estas ferramentas. Assim, o que a IA
 * "sabe" sobre a correção é exatamente o que estas ferramentas devolvem, e
 * o mesmo servidor pode ser plugado em qualquer cliente MCP (Claude Code,
 * Claude Desktop, outro agente) pelo transporte stdio — ver `stdio.ts`.
 *
 * Ferramentas:
 * - buscar_cartilha       RAG (BM25) sobre a cartilha do Inep
 * - grade_competencia     níveis oficiais de 0 a 200 de uma competência
 * - analisar_redacao      métricas determinísticas do texto
 * - verificar_nota_zero   condições de anulação da cartilha
 * - corrigir_redacao      correção completa (só quando há corretor injetado)
 *
 * Recursos: cartilha://enem-2026/{id} (vigente) e cartilha://enem-2025/{id}
 * (arquivo, apenas para auditoria).
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeEssayText } from '../analysis/text-analysis';
import { CARTILHA_REFERENCE, COMPETENCY_IDS, KNOWLEDGE_BASE } from '../knowledge';
import { citationOf, EssayKnowledgeBase } from '../rag/knowledge-base';

export const ESSAY_MCP_SERVER_NAME = 'lumina-redacao';
export const ESSAY_MCP_SERVER_VERSION = '1.0.0';

export interface EssayMcpDependencies {
  knowledge?: EssayKnowledgeBase;
  /** Correção completa; sem ela, `corrigir_redacao` não é registrada. */
  correct?: (input: { text: string; theme: string }) => Promise<unknown>;
}

const competencySchema = z.enum(['C1', 'C2', 'C3', 'C4', 'C5']);

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createEssayMcpServer(deps: EssayMcpDependencies = {}): McpServer {
  const knowledge = deps.knowledge ?? new EssayKnowledgeBase();
  const server = new McpServer(
    { name: ESSAY_MCP_SERVER_NAME, version: ESSAY_MCP_SERVER_VERSION },
    {
      instructions:
        'Ferramentas para corrigir redações do Enem pela Matriz de Referência do Inep. Fonte vigente: ' +
        `"${CARTILHA_REFERENCE.title}" (${CARTILHA_REFERENCE.publisher}, ${CARTILHA_REFERENCE.version}). Antes de dar nota a uma competência, ` +
        'consulte grade_competencia e buscar_cartilha e cite o documento e a página. A edição de 2025 é arquivo de auditoria: ' +
        'só use se o pedido indicar explicitamente essa versão. Trechos com source "lumina" são critérios ' +
        'operacionais da Lumina, não texto do Inep — nunca os apresente como se fossem da cartilha.',
    },
  );

  server.registerTool(
    'buscar_cartilha',
    {
      title: 'Buscar na base oficial do Inep',
      description:
        'Busca trechos de "A redação no Enem 2026 — Cartilha do Participante" (Inep) e dos manuais oficiais de correção, ' +
        'com prioridade para a edição vigente. Use para fundamentar a nota de uma competência ou responder dúvidas sobre os critérios. ' +
        'Cada trecho vem com documento, versão e página para citação. A base de 2025 é arquivo e só aparece com documento_versao explícito.',
      inputSchema: {
        consulta: z.string().min(2).max(500).describe('O que procurar, ex.: "repertório de bolso", "tangenciamento", "agente da proposta".'),
        competencia: competencySchema.optional().describe('Restringe a uma competência (C1 a C5).'),
        incluir_gerais: z.boolean().optional().describe('Com competência definida, inclui também regras gerais (nota zero, discrepância).'),
        limite: z.number().int().min(1).max(12).optional().describe('Quantidade de trechos (padrão 4).'),
        documento_versao: z.string().max(80).optional().describe('Consulta explícita a uma versão/documento (ex.: "inep-cartilha-2025"). Sem isso, usa a base vigente.'),
      },
    },
    async ({ consulta, competencia, incluir_gerais, limite, documento_versao }) => {
      const hits = knowledge.search(consulta, { scope: competencia, includeGeneral: incluir_gerais, limit: limite, documentId: documento_versao });
      const source = documento_versao
        ? knowledge.documents().find((document) => document.id === documento_versao)
        : knowledge.currentDocument();
      return json({
        fonte: source ? { ...source, url: source.sourceUrl } : CARTILHA_REFERENCE,
        trechos: hits.map((hit) => ({
          id: hit.id,
          titulo: hit.title,
          escopo: hit.scope,
          citacao: hit.citation,
          origem: hit.source,
          documento: hit.documentId,
          versao: hit.documentVersion,
          publicado_em: hit.publishedAt,
          competencias: hit.competencies,
          relevancia: hit.score,
          texto: hit.text,
        })),
      });
    },
  );

  server.registerTool(
    'grade_competencia',
    {
      title: 'Grade de níveis de uma competência',
      description: 'Devolve os seis níveis oficiais (0, 40, 80, 120, 160 e 200 pontos) de uma competência, com o texto literal da cartilha vigente.',
      inputSchema: { competencia: competencySchema },
    },
    async ({ competencia }) => {
      const grid = knowledge.grid(competencia);
      const gradeChunk = knowledge.get(`${competencia.toLowerCase()}-niveis`);
      return json({
        competencia,
        descricao: grid.name,
        documento: gradeChunk?.documentId ?? CARTILHA_REFERENCE.id,
        versao: gradeChunk?.documentVersion ?? CARTILHA_REFERENCE.version,
        publicado_em: gradeChunk?.publishedAt ?? CARTILHA_REFERENCE.publishedAt,
        citacao: gradeChunk ? citationOf(gradeChunk) : `${CARTILHA_REFERENCE.title} (Inep), ${CARTILHA_REFERENCE.version}, p. ${grid.page}`,
        niveis: ([200, 160, 120, 80, 40, 0] as const).map((nota) => ({ nota, descritor: grid.levels[nota] })),
      });
    },
  );

  server.registerTool(
    'analisar_redacao',
    {
      title: 'Analisar o texto da redação',
      description:
        'Métricas determinísticas do texto: parágrafos, linhas, períodos, conectivos por relação, repetições, registro informal, ' +
        'elementos da proposta de intervenção (ação, agente, meio, finalidade, detalhamento), alertas de direitos humanos e riscos de nota zero. ' +
        'São sinais para conferir, não notas.',
      inputSchema: {
        texto: z.string().max(20000),
        tema: z.string().max(300).optional(),
        linhas_ocr: z.number().int().min(0).max(60).optional().describe('Linhas lidas na folha pelo OCR, quando o texto veio de foto.'),
      },
    },
    async ({ texto, tema, linhas_ocr }) => json(analyzeEssayText(texto, { theme: tema, ocrLines: linhas_ocr })),
  );

  server.registerTool(
    'verificar_nota_zero',
    {
      title: 'Verificar condições de nota zero',
      description:
        'Confere as condições de anulação da cartilha que dá para medir no texto (em branco, até 7 linhas, possível identificação e ' +
        'trecho desconectado) e devolve os trechos que as definem. Fuga ao tema, tangenciamento e tipo textual exigem leitura global: ' +
        'a cobertura lexical é apenas sinal auxiliar e nunca conclui anulação.',
      inputSchema: {
        texto: z.string().max(20000),
        tema: z.string().max(300).optional(),
        linhas_ocr: z.number().int().min(0).max(60).optional(),
      },
    },
    async ({ texto, tema, linhas_ocr }) => {
      const analysis = analyzeEssayText(texto, { theme: tema, ocrLines: linhas_ocr });
      const definitive = analysis.zeroRisks.filter((risk) => risk.code === 'EM_BRANCO' || risk.code === 'TEXTO_INSUFICIENTE');
      const rules = ['geral-nota-zero', 'geral-partes-desconectadas', 'c2-fuga-ao-tema', 'c2-tipo-textual']
        .map((id) => knowledge.get(id)!)
        .map((chunk) => ({ id: chunk.id, titulo: chunk.title, citacao: citationOf(chunk), texto: chunk.text }));
      return json({
        linhas: analysis.lines,
        origem_linhas: analysis.linesSource,
        anulacao_certa: definitive,
        alertas_para_conferir: analysis.zeroRisks.filter((risk) => !definitive.includes(risk)),
        regras: rules,
      });
    },
  );

  if (deps.correct) {
    const correct = deps.correct;
    server.registerTool(
      'corrigir_redacao',
      {
        title: 'Corrigir redação (Enem)',
        description:
          'Correção completa pelas cinco competências do Enem, com justificativa, trechos do texto e citação da cartilha em cada nota. ' +
          'Segue o processo do Inep: dois avaliadores independentes e um terceiro quando há discrepância.',
        inputSchema: {
          texto: z.string().min(1).max(20000),
          tema: z.string().min(3).max(300),
        },
      },
      async ({ texto, tema }) => json(await correct({ text: texto, theme: tema })),
    );
  }

  const resourceChunks = (documentId: string) => KNOWLEDGE_BASE.filter((chunk) => chunk.documentId === documentId);

  const registerResourceFor = (name: string, uriPrefix: string, documentId: string, title: string) => {
    server.registerResource(
      name,
      new ResourceTemplate(`${uriPrefix}/{id}`, {
        list: async () => ({
          resources: resourceChunks(documentId).map((chunk) => ({
            uri: `${uriPrefix}/${chunk.id}`,
            name: chunk.title,
            description: citationOf(chunk),
            mimeType: 'text/plain',
          })),
        }),
      }),
      { title, description: 'Um trecho da base de conhecimento da correção.', mimeType: 'text/plain' },
      async (uri, { id }) => {
        const chunk = knowledge.get(String(id));
        if (!chunk || chunk.documentId !== documentId) throw new Error(`Trecho não encontrado: ${String(id)}`);
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `${chunk.title}\n${citationOf(chunk)}\n\n${chunk.text}` }] };
      },
    );
  };

  registerResourceFor('trecho-cartilha-2026', 'cartilha://enem-2026', 'inep-cartilha-2026', 'Trecho da cartilha vigente (Enem 2026)');
  registerResourceFor('trecho-cartilha-2025', 'cartilha://enem-2025', 'inep-cartilha-2025', 'Trecho arquivado da cartilha (Enem 2025)');

  return server;
}

export const ESSAY_MCP_COMPETENCIES = COMPETENCY_IDS;
