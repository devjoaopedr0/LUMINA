/**
 * Ponto de entrada stdio do servidor MCP `lumina-redacao`.
 *
 *   npm run build && npm run mcp:redacao
 *
 * Expõe as ferramentas de consulta (cartilha, grades, análise, nota zero)
 * a qualquer cliente MCP. A ferramenta `corrigir_redacao` não entra aqui: ela
 * depende do banco e do provedor de IA do backend — fora dele, quem corrige é
 * o próprio cliente, usando estas ferramentas como fonte.
 *
 * Nada pode ir para stdout além do protocolo: logs vão para stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createEssayMcpServer } from './essay-mcp-server';

async function main() {
  const server = createEssayMcpServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write('lumina-redacao: servidor MCP pronto (stdio)\n');
}

main().catch((error) => {
  process.stderr.write(`lumina-redacao: falha ao iniciar: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
