# Correção de redação por foto (scanner + IA com RAG e MCP)

O aluno abre a câmera, fotografa a folha, o app digitaliza a imagem no estilo CamScanner, a LuminIA lê a letra e, depois que o aluno confere o texto, corrige pelas cinco competências do Enem. Os critérios de correção vêm da **Cartilha do Participante — A redação no Enem 2025 (Inep)**.

Rotas: `/app/redacoes/scanner` (novo fluxo) e o botão **Corrigir com a LuminIA** no editor de redação digitada (`/app/redacoes/:id`), que usa a mesma correção.

## Fluxo

| Etapa | Onde roda | O que acontece |
| --- | --- | --- |
| 1. Foto | App | Câmera traseira (`getUserMedia`) ou arquivo (`capture="environment"`, que abre a câmera no celular). |
| 2. Ajuste | App | `detectDocument` acha os quatro cantos da folha. O aluno arrasta os cantos se precisar, com o dedo, o mouse ou as setas do teclado. |
| 3. Digitalização | App | `warpPerspective` corrige a perspectiva (homografia + interpolação bilinear). `enhanceDocument` divide a imagem pelo "branco do papel" estimado (remove sombra e luz desigual) e estica o contraste. Há três filtros (realçado, cinza, preto e branco), botão de girar e até 2 páginas. A foto crua não sai do aparelho: só sobe a página digitalizada, em JPEG de até ~2,5 MB. |
| 4. Leitura | Backend | Um modelo de visão transcreve linha por linha **sem corrigir** (o erro do aluno é o que a C1 avalia) e marca `[ilegível]` em vez de adivinhar. O processamento é assíncrono: o app consulta o status. |
| 5. Revisão | App | O texto lido aparece ao lado da foto. O aluno corrige só o que a leitura errou e informa o tema. A correção fica bloqueada enquanto houver `[ilegível]`. |
| 6. Correção | Backend | Corretor com RAG via MCP e dois avaliadores (terceiro se houver discrepância). Ver abaixo. |

Biblioteca de imagem: `lumina-app/src/lib/doc-scanner.ts`. É própria, sem dependência externa, e opera sobre RGBA puro, por isso é testável no Node (`test/doc-scanner.check.ts`).

## Arquitetura da correção (`lumina-backend/src/essay-correction/`)

```
knowledge/inep-cartilha-2025.ts   base de conhecimento: grades literais + trechos da cartilha com página
rag/bm25.ts, rag/knowledge-base.ts recuperação BM25 própria (acento, stopwords, radical simplificado)
analysis/text-analysis.ts         análise determinística: linhas, parágrafos, conectivos, proposta, riscos de zero
mcp/essay-mcp-server.ts           servidor MCP "lumina-redacao" (ferramentas abaixo)
mcp/essay-mcp-client.ts           cliente MCP em memória usado pelo corretor
mcp/stdio.ts                      o mesmo servidor por stdio, para clientes externos
grading/essay-grader.ts           corretor: contexto via MCP, 2–3 avaliadores, regras do Inep, calibração
grading/feature-model.ts          modelo estatístico treinado (ridge), 2ª opinião e fallback sem IA
ocr/essay-ocr.ts                  leitura da foto por modelo de visão
eval/                             treino e validação com redações já avaliadas
model/*.json                      pesos treinados e calibração (versionados)
```

### Base de conhecimento (RAG)

- **Fonte:** cartilha 2025 do Inep. O PDF usa fontes sem mapeamento Unicode (~40% das linhas saem embaralhadas na extração de texto), por isso as páginas foram renderizadas e lidas uma a uma.
- **Grades de níveis** (0 a 200 em cada competência): texto literal.
- **Demais trechos:** condensações fiéis do texto oficial, com página. Cobrem nota zero, discrepância, cópia, partes desconectadas, título, estrutura sintática, tipos de desvio, recorte temático, repertório (e repertório de bolso), fuga, tangenciamento, tipo textual, projeto de texto, coesão, elementos da proposta e direitos humanos.
- **Critérios operacionais da Lumina:** dois trechos que **não** estão na cartilha (contagem de elementos da proposta na C5; frequência de desvios por nível na C1). Estão marcados com `source: 'lumina'`. O corretor recebe a instrução de nunca apresentá-los como texto do Inep, e na tela eles aparecem como "Critério operacional da Lumina (não consta da cartilha)".
- **Recuperação:** BM25 lexical. A base é pequena e usa o vocabulário técnico da própria cartilha. É determinístico (a correção é auditável) e roda sem API.

### Servidor MCP `lumina-redacao`

| Ferramenta | Para quê |
| --- | --- |
| `buscar_cartilha` | Trechos da cartilha relevantes para a consulta, com página (filtro por competência). |
| `grade_competencia` | Os seis níveis oficiais de uma competência. |
| `analisar_redacao` | Métricas determinísticas do texto (sinais, não notas). |
| `verificar_nota_zero` | Condições de anulação mensuráveis (em branco, até 7 linhas) e alertas para conferir. |
| `corrigir_redacao` | Correção completa (só no processo do backend, que tem banco e IA). |

Recurso: `cartilha://enem-2025/{id}`, um trecho da base.

O corretor **não lê a base diretamente**: ele é um cliente MCP. O que a IA "sabe" sobre a correção é exatamente o que essas ferramentas devolvem, e cada chamada fica registrada na auditoria da correção (`audit_json.toolCalls`).

Uso externo (Claude Code, Claude Desktop ou outro agente):

```bash
cd lumina-backend && npm run build
# stdio:
npm run mcp:redacao
```

Configuração de exemplo para um cliente MCP:

```json
{ "mcpServers": { "lumina-redacao": { "command": "node", "args": ["lumina-backend/dist/essay-correction/mcp/stdio.js"] } } }
```

### Corretor (processo do Inep)

1. `analisar_redacao` + `verificar_nota_zero`. "Em branco" e "até 7 linhas" zeram por regra, sem IA.
2. Para cada competência: `grade_competencia` + `buscar_cartilha`, com consulta montada a partir dos problemas que a análise encontrou.
3. **Dois avaliadores independentes** (duas chamadas, temperaturas 0,2 e 0,7). Discrepância = diferença maior que 100 no total ou maior que 80 numa competência (cartilha, p. 6). Nesse caso entra o **terceiro**, e a nota é a média das duas avaliações mais próximas. Anulação só vale se as duas avaliações finais concordarem.
4. **Regras aplicadas no código**, não deixadas ao modelo: nota arredondada ao nível válido; tangenciamento limita C2, C3 e C5 a 40; desrespeito aos direitos humanos zera a C5.
5. **Antialucinação:** trecho "citado" que não está na redação é descartado, e referência a trecho da cartilha que não foi entregue ao modelo também.
6. **Calibração** (`model/llm-calibration.json`): nota = a·bruta + b por competência, ajustada com redações já avaliadas.
7. **Sem IA** (provedor fora ou `AI_PROVIDER=mock`): o modelo estatístico dá uma estimativa marcada como tal, com confiança baixa.

A nota alimenta a estimativa de nota do Enem (`score-estimate.service.ts` já lê `essay_corrections` concluídas).

## Banco

Migration `20261031200000_essay_scanner_correction` (só adições):

- `essay_scans`: transcrição por linha, confiança, modelo, avisos e vínculo com a redação criada.
- `essay_scan_pages`: as páginas digitalizadas (o aluno pode apagar as fotos e manter o texto).
- `essay_corrections`: ganha `annulment_json`, `audit_json` (avaliadores, discrepância, chamadas MCP, análise), `essay_version` e `error_message`.

## API

| Método | Rota | |
| --- | --- | --- |
| POST | `/essay-scans` | `{ pages: [dataURL], theme? }` → 202. Tipo conferido pelos bytes; até 2 páginas de 3 MB. |
| GET | `/essay-scans/:id` | Status e transcrição. |
| GET | `/essay-scans/:id/pages/:index` | Imagem da página. |
| POST | `/essay-scans/:id/retry` | Repete a leitura que falhou. |
| POST | `/essay-scans/:id/confirm` | `{ text, theme, title? }` → cria a redação e inicia a correção. |
| DELETE | `/essay-scans/:id/pages` | Apaga as fotos. |
| POST | `/essays/:id/correction` | Corrige uma redação (digitada ou escaneada). Limite de 15 por aluno a cada 24 h. |
| GET | `/essays/:id/correction` | Resultado (ou `IN_PROGRESS`). |

O limite de corpo de 9 MB vale só para `/essay-scans`. As demais rotas continuam com o padrão de 100 kB.

## Configuração (`lumina-backend/.env`)

- `AI_ESSAY_MODELS`: modelos da correção, em ordem. A calibração foi ajustada com `nvidia/nemotron-3-ultra-550b-a55b:free`. Sem essa variável, a correção usa `AI_MODEL` + `AI_FALLBACK_MODELS`.
- `AI_VISION_MODELS`: modelos que leem a foto. Vazio no OpenRouter = Gemma 4 31B, Nemotron 3.5 Super VL e Gemma 4 26B (gratuitos).

## Treino e validação

```bash
cd lumina-backend && npm run build
npm run essay:train                                   # modelo estatístico (sem custo de API)
npm run essay:eval -- --calib 12 --test 16 --inep 3 --max-calls 32   # IA: calibração + teste
```

- **Dados:** [Essay-BR estendido](https://github.com/lplnufpi/essay-br) (MIT): 6.577 redações avaliadas por profissionais nas cinco competências. É baixado para `lumina-backend/.cache/` (não versionado). A divisão treino/validação/teste é **por tema**, para medir a correção em propostas nunca vistas, como acontece em cada Enem. Também foram usadas as 10 redações nota mil comentadas na cartilha 2025 (cache local).
- **Métrica principal:** concordância pela regra do próprio Inep. Correção automática e humana "concordam" quando não seriam discrepantes (até 100 de diferença no total e até 80 em cada competência). Também medidos: erro médio, QWK por competência e viés.
- Cada resposta do modelo fica em cache. `--max-calls` protege a cota diária dos modelos gratuitos, e rodar de novo continua de onde parou.

### Resultados (31/10/2026)

**Digitalização** (cena sintética: folha em perspectiva, sombra forte, tinta azul):
- cantos a menos de 2,5% da diagonal;
- proporção da folha recuperada;
- variação de luz no papel de 22,5 para 4,7 (sombra removida), com a tinta preservada;
- numa foto 1700×2200, detecção em ~0,1 s e perspectiva + realce em ~0,8 s.

**Leitura da letra** (foto sintética com fonte manuscrita, 15 linhas e 5 erros de ortografia propositais):
- **0% de erro por caractere**;
- 15/15 linhas e 4/4 parágrafos;
- os **5 erros mantidos** (o modelo não "consertou" o aluno);
- 8,5 s, com `nvidia/nemotron-3.5-super-vl:free`.

**Correção — modelo estatístico** (1.075 redações de teste, temas inéditos):

| | Modelo estatístico | Chutar a média |
| --- | --- | --- |
| Concordância pela regra do Inep | **52,8%** | 29,9% |
| Erro médio no total | 113,6 | 166,7 |
| Correlação no total | 0,61 | — |

**Correção — IA, um avaliador** (`nemotron-3-ultra`, 16 redações de temas inéditos; 28 com as de calibração):

| | IA (1 avaliador) | Modelo estatístico (mesmas 16) |
| --- | --- | --- |
| Correlação no total | **0,88** | 0,64 |
| Erro médio no total | 135 | 192,5 |
| Concordância pela regra do Inep | 31% | 37,5% |
| QWK por competência | 0,44 a 0,70 | 0,04 a 0,47 |

- **Leitura dos números:** a IA ordena bem as redações (correlação 0,88), mas **comprime a escala**. Dá nota alta demais às fracas (+80 a +160) e baixa demais às fortes (até −400). Por isso o erro absoluto e a concordância pela regra do Inep ainda estão fracos.
- **Calibração:** com as 28 redações, a validação cruzada (leave-one-out) baixou o erro médio de 134 para 123. Ela foi aplicada só em C1, C3 e C5, onde generalizou (ver `model/llm-calibration.json`). A concordância pela regra do Inep ficou em 39% com e sem calibração: com 28 redações, não há dado para mais.
- **Nota mil do Inep** (3 das 10 redações comentadas na cartilha 2025): 1000, 760 e 760. A subavaliação das redações fortes aparece aqui também, sobretudo na C5 (120).
- **O que não foi medido:** a produção usa a média de dois avaliadores (e um terceiro na discrepância), o que reduz o ruído de um avaliador só. A validação mediu um avaliador por redação para caber na cota diária gratuita (29 chamadas).
- **Ponta a ponta no navegador** (foto → cantos → digitalização → leitura → revisão → correção): funcionou. Rodou com o modelo reserva (`nemotron-3.5-lightning`), porque o `.env` local não tem `AI_ESSAY_MODELS`. Esse modelo deu 40 na C5 a uma proposta com agente, ação, meio e finalidade, o que confirma que o modelo da correção importa.

**Próximo passo para melhorar a nota:** ampliar a calibração para 150–300 redações (algumas sessões de `essay:eval`, graças ao cache) e medir o pipeline completo de dois avaliadores. Com mais dados, uma calibração não linear (isotônica) por competência deve atacar a compressão de escala.

## Limites conhecidos

- **Letra manuscrita real:** a leitura foi validada com uma foto sintética (fonte manuscrita, perspectiva, sombra e erros propositais), não com fotos de alunos. Antes de liberar, vale testar com 10–20 fotos reais de folhas de redação.
- **Cota dos modelos gratuitos:** o plano gratuito do OpenRouter limita as requisições por dia. Cada correção usa 2 ou 3 chamadas e cada leitura de foto, 1 por página. Para uso real, é preciso um plano com créditos ou outro provedor.
- **Cópia dos textos motivadores** (que derruba a C2 e desconta linhas) não é detectada: o sistema não tem os textos motivadores de cada proposta.
- **Calibração com amostra pequena:** ajustada com 12 redações por causa da cota. O script aceita amostras maiores ao longo de vários dias, graças ao cache.
- A nota é uma **estimativa para estudo**, e a tela diz isso. A nota oficial é da banca do Enem.
