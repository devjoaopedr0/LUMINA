/**
 * Cliente MCP em processo: é por ele que o corretor fala com o servidor
 * `lumina-redacao`. O transporte é em memória (sem rede, sem processo
 * filho), mas o protocolo é o mesmo do stdio — as chamadas passam pela
 * validação de esquema do servidor como passariam vindas de fora.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { EssayTextAnalysis } from '../analysis/text-analysis';
import type { CompetencyId } from '../knowledge';
import { createEssayMcpServer, EssayMcpDependencies } from './essay-mcp-server';

export interface CartilhaHit {
  id: string;
  titulo: string;
  escopo: string;
  citacao: string;
  origem: 'inep-cartilha-2025' | 'inep-cartilha-2026' | 'inep-manual-c2-2019' | 'inep-manual-c4-2019' | 'lumina';
  documento: string;
  versao: string;
  publicado_em: string;
  competencias: string[];
  relevancia: number;
  texto: string;
}

export interface CompetencyGrade {
  competencia: CompetencyId;
  descricao: string;
  documento: string;
  versao: string;
  publicado_em: string;
  citacao: string;
  niveis: { nota: number; descritor: string }[];
}

export interface ZeroCheck {
  linhas: number;
  origem_linhas: 'ocr' | 'estimativa';
  anulacao_certa: { code: string; detail: string }[];
  alertas_para_conferir: { code: string; detail: string }[];
}

/** Interface que o corretor usa — permite trocar o transporte nos testes. */
export interface EssayTools {
  buscarCartilha(args: { consulta: string; competencia?: CompetencyId; incluir_gerais?: boolean; limite?: number; documento_versao?: string }): Promise<CartilhaHit[]>;
  gradeCompetencia(competencia: CompetencyId): Promise<CompetencyGrade>;
  analisarRedacao(args: { texto: string; tema?: string; linhas_ocr?: number }): Promise<EssayTextAnalysis>;
  verificarNotaZero(args: { texto: string; tema?: string; linhas_ocr?: number }): Promise<ZeroCheck>;
  /** Registro das chamadas feitas, para auditoria da correção. */
  calls: { tool: string; at: string }[];
}

export class EssayMcpClient implements EssayTools {
  calls: { tool: string; at: string }[] = [];

  private constructor(private readonly client: Client) {}

  static async connect(deps: EssayMcpDependencies = {}): Promise<EssayMcpClient> {
    const server = createEssayMcpServer(deps);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'lumina-corretor', version: '1.0.0' });
    await client.connect(clientTransport);
    return new EssayMcpClient(client);
  }

  async listTools(): Promise<string[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => tool.name);
  }

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    this.calls.push({ tool: name, at: new Date().toISOString() });
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text?: string }[];
    const text = content.find((item) => item.type === 'text')?.text ?? '';
    if (result.isError) throw new Error(`Ferramenta ${name} falhou: ${text}`);
    return JSON.parse(text) as T;
  }

  async buscarCartilha(args: { consulta: string; competencia?: CompetencyId; incluir_gerais?: boolean; limite?: number; documento_versao?: string }) {
    return (await this.call<{ trechos: CartilhaHit[] }>('buscar_cartilha', args)).trechos;
  }

  gradeCompetencia(competencia: CompetencyId) {
    return this.call<CompetencyGrade>('grade_competencia', { competencia });
  }

  analisarRedacao(args: { texto: string; tema?: string; linhas_ocr?: number }) {
    return this.call<EssayTextAnalysis>('analisar_redacao', args);
  }

  verificarNotaZero(args: { texto: string; tema?: string; linhas_ocr?: number }) {
    return this.call<ZeroCheck>('verificar_nota_zero', args);
  }

  async close() {
    await this.client.close();
  }
}
