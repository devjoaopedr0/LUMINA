# Correção de redação por foto (scanner + IA com RAG e MCP)

O aluno abre a câmera, fotografa a folha, o app digitaliza a imagem no estilo CamScanner, a LuminIA lê a letra e, depois que o aluno confere o texto, corrige pelas cinco competências do Enem. Os critérios de correção vêm da cartilha **A redação no Enem 2026 — Cartilha do Participante (Inep)**, publicada on-line em setembro de 2026, com apoio dos manuais oficiais de correção das Competências II e IV.

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
knowledge/types.ts                contratos de trecho, documento e versão
knowledge/documents.ts            catálogo: cartilha 2026 vigente, 2025 arquivada, manuais C2/C4 e base Lumina
knowledge/inep-cartilha-2026.ts   base corrente: grade 2026 + trechos oficiais de C2/C4 + material migrado
knowledge/inep-cartilha-2025.ts   base arquivada, com ids prefixados "2025:" e fora da busca padrão
knowledge/index.ts                base unificada e exportações públicas
rag/bm25.ts, rag/knowledge-base.ts recuperação BM25 própria, filtro por competência e por documento/versão
analysis/text-analysis.ts         análise determinística: linhas, parágrafos, conectivos, proposta, sinais para a IA
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

- **Fonte vigente:** A redação no Enem 2026 — Cartilha do Participante (Inep), publicada on-line em setembro de 2026 (`publishedAt: 2026-09-21`). O PDF usa fontes sem mapeamento Unicode, por isso as páginas foram conferidas uma a uma.
- **Grades de níveis** (0 a 200 em cada competência): texto literal da edição de 2026. As páginas de C2 e C4 são 27 e 34; C5, 38.
- **C2 e C4:** trechos próprios da cartilha 2026, sem herdar o texto de 2025. Na implementação, a C2 é avaliada em três dimensões separadas - recorte temático, tipo dissertativo-argumentativo e repertório (legitimidade, pertinência e produtividade). A C4 avalia relações semânticas, referenciação, articulação entre parágrafos e qualidade da repetição, não a contagem de conectivos.
- **Manuais oficiais de 2019:** os materiais de leitura das Competências II e IV (Módulos 04 e 06) entram como `status: 'reference'`, restritos à competência correspondente. Eles aprofundam tangenciamento, tipo textual, repertório, repetição e conectivo inadequado; não substituem a cartilha vigente.
- **Histórico:** a cartilha 2025 permanece arquivada, com ids `2025:<id>`, para auditoria e consulta explícita. Ela não entra na recuperação padrão.
- **Critérios operacionais da Lumina:** trechos marcados com `source: 'lumina'` **não** são texto do Inep (por exemplo, contagem de elementos da proposta e leitura global do tema). O corretor é instruído a nunca apresentá-los como cartilha; na tela aparecem como "Critério operacional da Lumina (não consta da cartilha)".
- **Recuperação:** BM25 lexical, com filtro por competência e por documento/versão. A edição vigente é o padrão; documentos arquivados só entram com `documento_versao` explícito. A base é pequena, determinística e roda sem API.

### Servidor MCP `lumina-redacao`

| Ferramenta | Para quê |
| --- | --- |
| `buscar_cartilha` | Trechos da cartilha vigente e dos manuais, com documento, versão e página (filtro por competência; `documento_versao` para consultar o arquivo de 2025). |
| `grade_competencia` | Os seis níveis oficiais de uma competência. |
| `analisar_redacao` | Métricas determinísticas do texto (sinais, não notas). |
| `verificar_nota_zero` | Condições de anulação mensuráveis (em branco, até 7 linhas) e alertas para conferir. |
| `corrigir_redacao` | Correção completa (só no processo do backend, que tem banco e IA). |

Recursos: `cartilha://enem-2026/{id}` (vigente) e `cartilha://enem-2025/{id}` (arquivo, só para auditoria). Cada resposta de busca informa o documento de origem e a versão.

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

### Corretor (processo do Inep, uma avaliação por competência)

1. `analisar_redacao` + `verificar_nota_zero`. "Em branco" e "até 7 linhas" zeram por regra, sem IA.
2. Para cada competência: `grade_competencia` + `buscar_cartilha`, com consulta montada a partir dos problemas que a análise encontrou.
3. **Cada competência é uma chamada separada.** O modelo recebe só a tarefa daquela competência (o que avaliar e o que ignorar), a grade e os trechos da cartilha dela e os sinais automáticos que importam para ela (C1: períodos e informalidade; C2: cobertura lexical apenas como alerta e termos recorrentes; C4: relações coesivas e repetições; C5: elementos da proposta). Assim, um erro de gramática não contamina a nota da C3, por exemplo. A **C2** também decide anulação e tangenciamento (tema e tipo textual); a **C5**, o respeito aos direitos humanos. Cada resposta traz nota, justificativa, pontos fortes, problemas, trechos literais da redação, explicação do nível e "como melhorar".
4. **Dois avaliadores independentes** (temperaturas 0,2 e 0,7), 5 chamadas cada. Discrepância = diferença maior que 80 numa competência ou maior que 100 no total (cartilha, p. 6). O **terceiro avaliador reavalia só as competências que divergiram** (se só o total passou de 100, as de maior diferença). Em cada competência, a nota é a média das duas avaliações mais próximas.
5. **Anulação por voto:** só vale se a maioria das avaliações da C2 anular (os dois avaliadores, ou dois de três). Se só um anular, o terceiro reavalia a C2, e as notas das outras competências são comparadas pelo que cada avaliador deu, sem o zero da anulação.
6. **Regras aplicadas no código**, não deixadas ao modelo: nota arredondada ao nível válido; tangenciamento limita C2, C3 e C5 a 40; desrespeito aos direitos humanos zera a C5.
7. **Antialucinação:** trecho "citado" que não está na redação é descartado, e referência a trecho da cartilha que não foi entregue ao modelo também.
8. **Calibração funcional por competência** (abaixo).
9. **Comentário geral** montado das competências: o ponto mais forte e as duas competências a priorizar, com a dica de cada uma.
10. **Sem IA** (provedor fora ou `AI_PROVIDER=mock`): o modelo estatístico dá uma estimativa marcada como tal, com confiança baixa.

Custo: 10 chamadas por redação (15 no pior caso), 3 simultâneas (`ESSAY_COMPETENCY_CONCURRENCY`). O `AiService` respeita o limite por minuto de cada modelo (`AI_RPM_LIMITS`; 15/min no Gemini gratuito): acima dele, a chamada espera a vaga. Um 5xx transitório (em especial o 503 "high demand" do Gemini) é repetido no mesmo modelo com esperas de 2 s e 5 s antes de a vez passar ao próximo modelo.

**Versão do prompt:** `GRADER_PROMPT_VERSION = v3-c2-c4-oficial-2026`. A versão fica gravada na auditoria de cada correção, junto com o documento e a versão da base. Uma calibração só é aplicada se o `promptVersion` for exatamente esse; por isso a calibração antiga (`v2-competencia`) não é reutilizada silenciosamente. Ao gravar uma calibração de prompt novo, o arquivo anterior é copiado para `model/archive/llm-calibration.<promptVersion>.json` em vez de ser descartado. As heurísticas de `text-analysis.ts` (cobertura lexical, contagem de conectivos, repetição e parágrafo sem conectivo inicial) são **sinais para a IA conferir**, nunca nota ou anulação automática.

### Calibração funcional (`grading/calibration.ts`, `model/llm-calibration.json`)

Cada modelo distorce a escala de um jeito em cada competência. Por isso cada competência de cada modelo tem a própria **função** nota bruta → nota esperada, escolhida por validação cruzada (deixando cada redação de fora) entre:

- **identidade:** a nota do modelo já está na escala;
- **reta:** a·bruta + b;
- **isotônica:** função monotônica definida nos seis níveis (0 a 200) e interpolada entre eles. Corrige compressões que a reta não pega (ex.: o modelo dá 120 tanto às redações de 80 quanto às de 160). Em cada nível, a média humana é puxada para a identidade com peso de 3 redações, para que um nível com pouca amostra não decida sozinho.

A forma mais complexa só é escolhida se errar pelo menos 3 pontos a menos na validação cruzada (com amostra pequena, ganhos de ~2 pontos eram ruído). A calibração vale só para o modelo e a versão de prompt com que foi ajustada (`promptVersion`). Um modelo sem calibração própria recebe a nota bruta, porque a função de um modelo não serve para outro.

**Estado após a mudança de prompt (05/11/2026):** a calibração `v2-competencia`, ajustada com 174 redações, foi copiada para `model/archive/llm-calibration.v2-competencia.json`; o arquivo ativo continua em v2, de modo que o corretor v3 roda com identidade. Os números de 41,4% → 42,5% de concordância, MAE 124,6 → 126,9, viés −54,7 → −30,3 e C4 com MAE 46,4/QWK 0,393 descrevem o prompt antigo e servem de linha de base, não de validação do prompt novo. Uma execução parcial de 05/11/2026 chegou a gravar uma calibração v3 de 10 redações antes da guarda: o Gemini respondeu 503 e o Nemotron gratuito do OpenRouter estourou a cota (429) depois de 10 redações de calibração, sem nenhuma de teste. Essa função parcial foi descartada e o arquivo ativo restaurado para v2. O `essay:eval` agora só grava a calibração final quando há pelo menos 10 redações de **teste** medidas, para que uma interrupção de cota não substitua a calibração ativa por uma função ajustada só na amostra de calibração. A execução de 30+30 concluída em 05/11/2026 fechou 29 redações de calibração + 30 de teste (uma de calibração falhou por 503) e **não gravou** a v3: o teste held-out não mostrou ganho e a comparação pareada com a v2 nas mesmas 30 redações ficou pior na estimativa pontual (detalhes na seção de resultados).

A nota alimenta a estimativa de nota do Enem (`score-estimate.service.ts` já lê `essay_corrections` concluídas).

## Banco

Migration `20261101120000_essay_correction_monthly_quota` (só adição): tabela `essay_correction_usages`.

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
| POST | `/essays/:id/correction` | Corrige uma redação (digitada ou escaneada). Consome 1 crédito da cota mensal; devolve `quota`. Sem crédito: 429 com `quota` no corpo. |
| GET | `/essays/:id/correction` | Resultado (ou `IN_PROGRESS`). |
| GET | `/essay-corrections/quota` | `{ limit, used, remaining, period, resetsAt }` do mês. |

### Cota mensal de correções

- **4 correções por IA por aluno por mês** (`ESSAY_CORRECTION_MONTHLY_LIMIT`). O mês é o do calendário em Brasília: renova à 00:00 do dia 1º.
- Conta cada pedido que chama o modelo, inclusive "corrigir de novo" depois de editar. Pedir a correção de uma versão já corrigida, ou repetir o pedido enquanto ela roda, não gasta crédito.
- **O crédito volta** se a correção falhar ou se a nota sair sem a IA (regra de nota zero ou modelo estatístico).
- Registro em `essay_correction_usages` (uma linha por pedido; apagar a redação não devolve o crédito). A reserva roda numa transação com trava por aluno (`pg_advisory_xact_lock`), então dois cliques simultâneos não passam do limite.
- **Foto:** a leitura só é aceita com crédito sobrando, e no máximo 3 fotos lidas por correção do mês (12 com o limite 4), porque cada leitura também chama a IA. Se a cota acabar entre a foto e o envio, a redação é salva sem correção e a tela avisa.
- Na tela: contador "3 de 4 correções por IA restantes em novembro" no editor e no scanner; botões desativados quando zera.

O limite de corpo de 9 MB vale só para `/essay-scans`. As demais rotas continuam com o padrão de 100 kB.

## Configuração (`lumina-backend/.env`)

- `AI_ESSAY_MODELS`: modelos da correção, em ordem. A calibração v2 foi ajustada com `gemini:gemini-3.5-flash-lite`; o prompt v3 foi medido em 29+30 e não atingiu o critério para gravar calibração, então roda com identidade. Sem essa variável, a correção usa `AI_MODEL` + `AI_FALLBACK_MODELS`.
- `AI_VISION_MODELS`: modelos que leem a foto. Vazio no OpenRouter = Gemma 4 31B, Nemotron 3.5 Super VL e Gemma 4 26B (gratuitos).

## Treino e validação

```bash
cd lumina-backend && npm run build
npm run essay:train                                   # modelo estatístico (sem custo de API)
npm run essay:eval -- --models gemini:gemini-3.5-flash-lite --calib 30 --test 30 --inep 3 --max-calls 330   # IA: calibração + teste de um modelo
npm run essay:eval -- --models gemini:gemini-3.5-flash-lite --calib 30 --test 0 --max-calls 30 --write false # só completa o cache, sem gravar calibração
```

- **Dados:** [Essay-BR estendido](https://github.com/lplnufpi/essay-br) (MIT): 6.577 redações avaliadas por profissionais nas cinco competências. É baixado para `lumina-backend/.cache/` (não versionado). A divisão treino/validação/teste é **por tema**, para medir a correção em propostas nunca vistas, como acontece em cada Enem. Também foram usadas as 10 redações nota mil comentadas na cartilha (cache local; a edição vigente é a de 2026).
- **Métrica principal:** concordância pela regra do próprio Inep. Correção automática e humana "concordam" quando não seriam discrepantes (até 100 de diferença no total e até 80 em cada competência). Também medidos: erro médio, QWK por competência e viés.
- Cada resposta do modelo fica em cache. `--max-calls` protege a cota diária dos modelos gratuitos, e rodar de novo continua de onde parou. A calibração final só é gravada quando há pelo menos 10 redações de teste completas e, antes disso, a calibração do prompt anterior é preservada em `model/archive/`.

### Resultados (01/11/2026) — correção por competência e escolha de modelo

**Modelos testados** (chaves gratuitas de OpenRouter, Gemini e Groq):

| Modelo | Situação |
| --- | --- |
| `gemini:gemini-3.5-flash-lite` | **Escolhido.** ~2–3 s por chamada, sem falhas, 15 req/min e 500 req/dia no plano gratuito. |
| `gemini:gemini-3.5-flash`, `3.6-flash` | Funcionam, mas só 20 req/dia no plano gratuito. |
| `gemini:gemini-3.7-flash`, `3.8-flash` | 50–60 s por chamada (passam do tempo limite). |
| `gemini:gemini-2.5-pro`, `3.1-pro-preview` | Sem acesso (404) ou sem cota (429) nesta chave. |
| `groq:openai/gpt-oss-120b`, `qwen/qwen3.8-27b` | Rápidos, mas o plano gratuito (8 mil tokens/min contando a saída) comporta ~1 chamada por minuto, e as notas saíram comprimidas em 40–80. |
| `nvidia/nemotron-3-ultra` (OpenRouter) | Bom na versão de uma chamada, mas leva 1–2 min por chamada e o OpenRouter gratuito dá 50 req/dia para a conta toda (chat incluído). |

**Leitura da foto** (página sintética recriada: letra cursiva, sombra, rotação, 13 linhas, 5 erros propositais): `gemini-3.5-flash-lite` leu com **0% de erro por caractere e manteve os 5 erros** (3 s). O `nemotron-3.5-super-vl` errou 0,3%, mas "corrigiu" 2 dos 5 erros do aluno, o que derrubaria a C1 sem motivo.

**Uma chamada vs. por competência** (mesmo modelo, flash-lite; mesmas 30 redações de temas inéditos, um avaliador):

| | Uma chamada (v1) | Por competência (v2) |
| --- | --- | --- |
| Concordância pela regra do Inep | 36,7% | **46,7%** |
| Até 100 pontos do total humano | 40% | **50%** |
| Erro médio no total | 149 | **129** |
| Erro médio C1 / C2 / C3 / C4 / C5 | 41 / 33 / 39 / 47 / 40 | **31** / 36 / **31** / 55 / **36** |
| Nota mil do Inep (esperado 1000) | 1000 / 800 / 760 | **1000 / 880 / 920** |
| Modelo estatístico, mesmas redações | erro 185, concordância 36,7% | |

- A divisão por competência melhorou C1, C3 e C5 e a nota das redações fortes. **C4 piorou e C2 ficou estável:** nas duas, o modelo concentra as notas em 120 (35 de 60 redações na C4), enquanto as notas humanas das mesmas redações vão de 0 a 200. Nenhuma calibração separa o que o modelo juntou.
- **Calibração** (81 redações: 51 de calibração + 30 de teste, validação nos dois sentidos):
  - Com o critério frouxo (ganho de 1 ponto), a calibração ajustada em 30 redações **piorou** o teste (erro 129 → 141).
  - As funções da C1 e da C5 erravam menos dentro da amostra e pioravam fora dela nos dois sentidos. A da C5 e a reta da C2 ainda levavam o 200 a 160: nenhuma redação passaria de 920 (as nota mil caíam para 920/840/840).
  - Regra final: ganho mínimo de 3 pontos na validação cruzada e preservação dos extremos (200 continua 200 e 0 continua 0). Resultado: **isotônica na C2** (a única que melhorou fora da amostra: 36 → 33) e **identidade nas outras quatro**.
  - O sistema recalibra sozinho quando houver mais dados (`essay:eval` com amostra maior).
- Não medido ainda: a produção usa dois avaliadores (+ terceiro por competência). A validação mediu um, por causa da cota.

### Resultados (04/11/2026) — calibração ampliada (180 redações)

> **Linha de base do prompt anterior.** Estes números foram medidos com `v2-competencia`. Depois da reformulação de C2/C4, o prompt passou a `v3-c2-c4-oficial-2026` e a calibração antiga deixou de ser aplicada; é preciso repetir a avaliação para medir o novo prompt. Os valores abaixo não devem ser apresentados como desempenho da versão atual.

**Amostra e custo:** 90 redações da validação (calibração) + 90 do teste (temas inéditos), contra 99 antes. Ficaram 87 + 87 completas; 6 foram descartadas por 503/timeout do Gemini, sem entrar em nenhum número. Foram 395 chamadas em 33,5 min (mediana de 2,8 s por chamada) com `gemini:gemini-3.5-flash-lite`.

**Teste honesto** (calibração ajustada só nas 87 de calibração, medida nas 87 de temas inéditos):

| Métrica | Sem calibração | Com calibração |
| --- | --- | --- |
| Concordância pela regra do Inep | 41,4% | **42,5%** |
| Erro médio no total | 124,6 | 126,9 |
| Viés médio no total | −54,7 | **−30,3** |
| Correlação no total | 0,807 | 0,798 |
| Erro médio C1 / C2 / C3 / C4 / C5 | 35,9 / 27,6 / 24,4 / 46,4 / 38,2 | **33,6** / **26,7** / 24,4 / 46,4 / 38,2 |
| QWK C1 / C2 / C3 / C4 / C5 | 0,455 / 0,500 / 0,695 / 0,393 / 0,645 | 0,311 / 0,497 / 0,695 / 0,393 / 0,645 |

- **Leitura honesta:** com 87 redações, o ganho de concordância é pequeno (41,4% → 42,5%) e o erro médio não cai (124,6 → 126,9). A diferença de concordância está dentro do ruído (5 redações discordantes para cada lado; McNemar p = 1,0), e a do erro médio também (IC 95%: −4,6 a +9,2 pontos). O 46,7% da medição anterior, com 30 redações, era otimismo de amostra pequena. A calibração continua útil para **reduzir o viés** (a IA subestimava o total em ~55 pontos; passa a ~30) e para melhorar C1/C2 no erro absoluto.
- **C1:** a isotônica melhora o erro absoluto (35,9 → 33,6) mas piora o QWK (0,455 → 0,311), porque junta níveis vizinhos ao arredondar. É um trade-off explícito; a concordância total sobe.
- **C3, C4 e C5:** identidade. **C4 continua o gargalo** (erro 46,4, QWK 0,393, acerto exato 21,8%): o modelo concentra 44 das 87 notas em 120, enquanto as humanas vão de 0 a 200. Nenhuma função separa o que o modelo juntou; o próximo ataque é no prompt, não na calibração.
- **Calibração final do prompt v2** (ajustada nas 174 redações completas, gravada em `model/llm-calibration.json`): isotônica em C1 e C2; identidade em C3, C4 e C5. Na validação cruzada (leave-one-out) por competência: C1 35,2 → 24,4; C2 29,2 → 26,0; C3 27,4; C4 41,1; C5 35,4. Com o prompt v3, esse arquivo permanece como registro histórico e não é aplicado.
- **Nota mil do Inep:** 1000 / 880 / 920, as mesmas de antes (a calibração não mexe nos extremos).
- **Modelo estatístico nas mesmas 87:** concordância 44,8%, erro 139,3, viés +39,1. A IA ainda erra menos em valor absoluto, mas a concordância pela regra do Inep é menor que a do modelo estatístico; a vantagem da IA está na correção por competência e na explicação, não em bater a régua de concordância.
- **O que não foi medido:** os dois avaliadores da produção (a validação usa um por causa da cota).

### Resultados (05/11/2026) — medição do prompt v3 (29+30)

**Amostra e custo:** 30 redações de calibração + 30 de teste (temas inéditos) com `gemini:gemini-3.5-flash-lite`, em 05/11/2026, `--write false`. Ficaram **29 de calibração + 30 de teste**: uma redação de calibração (`essay-br-3408`, C3) falhou depois das retentativas de 503. Foram 174 chamadas em 795 s (mediana de 2,7 s/chamada); o cache foi preservado.

**Teste held-out** (funções ajustadas só nas 29 de calibração e medidas nas 30 de temas inéditos). A coluna v2 usa as mesmas 30 redações e a calibração held-out da v2, não a linha de base completa de 87:

| Métrica | v2 bruto | v3 bruto | v2 calibrado | v3 calibrado |
| --- | ---: | ---: | ---: | ---: |
| Concordância pela regra do Inep | **46,7%** | 33,3% | **43,3%** | 36,7% |
| Erro médio no total | **129,3** | 150,7 | **141,3** | 152,0 |
| Viés médio no total | −46,7 | **−6,7** | −24,0 | −45,3 |
| Correlação no total | **0,808** | 0,784 | **0,793** | 0,777 |
| C1 MAE/QWK | **30,7**/0,658 | 37,3/0,447 | **32,0**/0,458 | 37,3/0,447 |
| C2 MAE/QWK | **36,0**/0,347 | 37,3/0,153 | **33,3**/0,332 | 37,3/0,153 |
| C3 MAE/QWK | **30,7**/0,654 | 42,7/0,389 | **30,7**/0,654 | 44,0/0,389 |
| C4 MAE/QWK | 54,7/0,263 | **48,0**/0,409 | 54,7/0,263 | **48,0**/0,409 |
| C5 MAE/QWK | 36,0/0,679 | **33,3**/0,689 | 36,0/0,679 | **33,3**/0,689 |

- **Calibração v3 held-out:** identidade em C1, C2, C4 e C5; reta em C3 (`a = 1,277`, `b = −60,5`). Ela **piorou** a C3 no teste (42,7 → 44,0) e não mudou as outras competências. O ajuste final em n=59 escolheu isotônica em C3 e C5, mas esse ajuste não foi validado fora da amostra e **não foi gravado**.
- **Comparação pareada nas mesmas 30 redações (v3 − v2):**
  - **Bruto:** erro médio +21,3 pontos (IC 95%: −2,7 a +46,7); 7 redações melhoraram, 14 pioraram e 9 empataram. Concordância 4 a 0 contra a v3 (McNemar p = 0,125).
  - **Calibrado held-out:** erro médio +10,7 pontos (IC 95%: −9,3 a +30,7); 10 melhoraram, 13 pioraram e 7 empataram. Concordância 2 a 0 contra a v3 (McNemar p = 0,5).
  - **Por competência (bruto):** C3 piorou de forma consistente (+12,0; IC 95%: +2,7 a +21,3); C1 piorou no limite (+6,7; IC 95%: 0,0 a +13,3); C4 melhorou direcionalmente (−6,7; IC 95%: −14,7 a +1,3), mas o IC ainda inclui zero; C2 (+1,3) e C5 (−2,7) ficaram dentro do ruído.
- **Leitura honesta:** a v3 **não mostrou ganho** sobre a v2. A estimativa pontual é pior no total, a C3 piorou de forma consistente e a C4 melhorou sem significância. Não há base para gravar a calibração v3; o arquivo ativo continua `v2-competencia` e o prompt v3 roda com identidade. O próximo ataque é o prompt de C3/C1 (e a instabilidade da C2), não a calibração.
- **Provedores e cota (05/11/2026):** o Gemini oscilou com 503 e as retentativas salvaram a maior parte da amostra. O Grok 4.3 via OpenRouter passou num teste isolado (`essay-br-6382`, 80/120/40/80/0), mas a execução completa voltou a receber **402** depois de algumas chamadas; o `/key` mostra limite de US$ 1.000 como teto de gasto, não crédito disponível (uso ~US$ 0,0287). Grok 4.7/4.6/4.5 exigem raciocínio e rejeitam `reasoning: { enabled: false }` com 400; 4.3 e 4.20 aceitam, então 4.3 é a única opção compatível sem mudar o `AiService`. Os modelos gratuitos do OpenRouter ficaram em **429** (`free-models-per-day`, 50/dia, restante 0, reset em `2026-11-06T00:00:00Z`); adicionar 10 créditos elevaria o limite para 1.000 requisições gratuitas/dia.

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
- **O que não foi medido:** a produção usa a média de dois avaliadores (e um terceiro na discrepância), o que reduz o ruído de um avaliador só. A validação mediu um avaliador por redação para caber na cota diária gratuita (29 chamadas). A medição do prompt v3 mantém **um avaliador** de propósito, para comparar com a mesma metodologia da linha de base v2; a validação com dois avaliadores é uma etapa separada e não deve ser confundida com a recalibração por modelo.
- **Ponta a ponta no navegador** (foto → cantos → digitalização → leitura → revisão → correção): funcionou. Rodou com o modelo reserva (`nemotron-3.5-lightning`), porque o `.env` local não tem `AI_ESSAY_MODELS`. Esse modelo deu 40 na C5 a uma proposta com agente, ação, meio e finalidade, o que confirma que o modelo da correção importa.

**Próximo passo para melhorar a nota:** o prompt v3 (`v3-c2-c4-oficial-2026`) foi medido em 05/11/2026 com um avaliador (29 de calibração + 30 de teste). Não houve ganho sobre a v2: a concordância ficou em 33,3% bruta/36,7% calibrada contra 46,7%/43,3% da v2 nas mesmas redações, e a C3 piorou de forma consistente. A C4 melhorou direcionalmente (MAE 54,7 → 48,0), mas o intervalo de confiança ainda inclui zero. A calibração v3 não foi gravada e o arquivo ativo continua v2; o próximo ataque é o prompt de C3/C1 (e a instabilidade da C2), não a calibração. Depois, validar a produção com os dois avaliadores.

## Volta ao prompt v2 e candidato v4 (13/11/2026)

**Produção de volta ao v2.** O prompt v3 (`v3-c2-c4-oficial-2026`) mediu pior que o v2 em 05/11 (concordância 33% contra 47%) e rodava sem calibração. Desde 13/11/2026 a produção usa de novo o `v2-competencia`, com a calibração dele (`model/llm-calibration.json`) voltando a valer. Para isso os prompts passaram a ser versionados em `grading/prompt-sets.ts`:
- cada versão guarda as instruções, a tarefa por competência, a consulta ao RAG, os sinais automáticos e o formato da resposta;
- o v2 foi restaurado do histórico (commit anterior ao `e8fd3c7`), sem reescrever;
- a base de conhecimento continua a da cartilha 2026, que é a vigente.

O que muda para o aluno: a resposta do v2 não traz os campos "pontos fortes", "problemas" e "explicação do nível" do v3. A tela mostra a justificativa e "como melhorar", e os exemplos validados pela revisão humana não entram no prompt do v2.

**Candidato v4 (`v4-calibrado`).** Parte do v2 e mira os desvios medidos nele:
- C4 com a tarefa, as regras, a consulta e os sinais do v3 (única competência que melhorou com ele);
- regras de calibração pela grade em C1, C2 e C5;
- volta dos exemplos validados por humanos.

Medido nas mesmas 30 redações de teste (`gemini:gemini-3.5-flash-lite`, um avaliador, nota bruta; o v2 veio do cache e o v4 gastou 150 chamadas):

| | v2 | v4 |
| --- | --- | --- |
| MAE total | **129,3** | 135,2 |
| Viés total | −46,7 | **−19,3** |
| Concordância (regra do Inep) | **46,7%** | 41,4% |
| C1 MAE / viés | **30,7** / −17,3 | 37,2 / −17,9 |
| C2 MAE / viés | 36,0 / −14,7 | **31,7 / −6,9** |
| C3 MAE / viés | **30,7** / +12,0 | 41,4 / +16,6 |
| C4 MAE / viés | 54,7 / −4,0 | **48,3** / +4,1 |
| C5 MAE / viés | 36,0 / −22,7 | **34,5 / −15,2** |

**Leitura honesta:**
- O prompt da C3 é idêntico no v2 e no v4, e mesmo assim o MAE foi de 30,7 para 41,4. Com 30 redações e um avaliador, a variação entre rodadas fica perto de 10 pontos por competência; a maior parte da tabela está dentro desse ruído.
- O sinal mais consistente é a redução do viés negativo (o v4 é menos severo), concentrada em C2, C4 e C5.
- A regra nova da C1 não reduziu a severidade.
- **Decisão:** a produção fica no v2. O v4 só vai para produção depois de uma medição pareada maior, ao longo de vários dias (dois avaliadores e mais redações, com intervalo de confiança), que separe ganho de ruído.

Como medir uma versão sem mudar o código:

```bash
npm run build && npm run essay:eval -- --models gemini:gemini-3.5-flash-lite --prompt v4-calibrado --calib 0 --test 30 --inep 0 --write false
```

O cache fica por versão (`.cache/llm-runs/<versão>/<modelo>/`), então rodar de novo continua de onde parou.

## Testes adversariais de C2/C4

A suíte `essay-correction.spec.ts` cobre os casos em que a heurística não pode decidir sozinha:

- C2 com sinônimos e retomadas (cobertura lexical baixa) não vira fuga automática; o texto continua com alerta para leitura global.
- C4 sem conectivos explícitos e com repetição temática não recebe penalidade automática; a consulta ao RAG fala em repetição referencial, não em "repetição tolerável" ou repertório pouco produtivo.
- C2 e C4 não misturam trechos: a busca filtrada por competência devolve só o escopo pedido; a grade oficial sempre abre o contexto.
- O título é tratado como linha escrita e não avaliado nas competências, conforme a cartilha 2026; o trecho de fuga não usa título como prova.
- O prompt estruturado exige pontos fortes, problemas, explicação do nível, trechos literais e "como melhorar"; se o modelo omitir justificativa/explicação, o parser preenche uma explicação neutra em vez de deixar o campo vazio.
- A calibração do prompt anterior não é reutilizada no prompt novo e é arquivada em `model/archive/llm-calibration.<promptVersion>.json` quando uma versão nova é gravada.

## Limites conhecidos

- **Letra manuscrita real:** a leitura foi validada com uma foto sintética (fonte manuscrita, perspectiva, sombra e erros propositais), não com fotos de alunos. Antes de liberar, vale testar com 10–20 fotos reais de folhas de redação.
- **Cota dos modelos gratuitos:** cada correção usa 10 a 15 chamadas (5 por avaliador) e cada leitura de foto, 1 por página. Com o `gemini-3.5-flash-lite` gratuito (500/dia, 15/min) cabem ~35–45 correções por dia, cerca de 1 por minuto. Com a cota de 4 por aluno no mês, isso dá ~300 alunos ativos. Acima disso, é preciso plano pago.
- **Cópia dos textos motivadores** (que derruba a C2 e desconta linhas) não é detectada: o sistema não tem os textos motivadores de cada proposta.
- **Calibração pendente para o prompt novo:** a calibração v2 foi ajustada com 174 redações completas (180 coletadas; 6 falharam por 503/timeout) e está arquivada em `model/archive/llm-calibration.v2-competencia.json`. Ela não vale para `v3-c2-c4-oficial-2026`; até a recalibração, as notas usam a identidade. A amostra 29+30 de 05/11/2026 completou o teste, mas a v3 não mostrou ganho e a calibração não foi gravada; o ajuste final em n=59 escolheu isotônica em C3 e C5, mas não foi validado fora da amostra. O script aceita amostras maiores ao longo de vários dias, graças ao cache, mas não grava calibração parcial (exige pelo menos 10 redações de teste). O limite atual não é só o tamanho da amostra: C3/C1 precisam de ajuste no prompt, e a C4 melhorou mas ainda não tem significância. A validação com dois avaliadores é uma etapa separada.
- A nota é uma **estimativa para estudo**, e a tela diz isso. A nota oficial é da banca do Enem.

### Segunda rodada (13/11/2026, mesmo modelo, sem cache)

Mesmas 30 redações de teste, chamadas novas. O v4 fechou as 30; o v2 fechou 17 antes de a cota diária do Gemini acabar (110 chamadas). Nota bruta, sem calibração:

| | MAE total | Viés | Concordância |
| --- | --- | --- | --- |
| **17 redações medidas nas 4 rodadas** | | | |
| v2 rodada 1 | **117,6** | −47,1 | 41,2% |
| v2 rodada 2 | 120,0 | −40,0 | 41,2% |
| v4 rodada 1 | 129,4 | −40,0 | 41,2% |
| v4 rodada 2 | 127,1 | **−28,2** | 41,2% |
| **29 redações (v4 nas duas rodadas)** | | | |
| v2 rodada 1 | **129,7** | −33,1 | 44,8% |
| v4 rodada 1 | 135,2 | −13,8 | 41,4% |
| v4 rodada 2 | 133,8 | **−6,9** | 44,8% |

Leitura:
- O padrão se repetiu: o v4 erra de 6 a 10 pontos a mais no total, mas tira de 10 a 25 pontos do viés negativo do v2. A concordância é igual.
- O ganho do v4 está em C2, C4 e no viés de C1; a perda está em C1 (MAE) e C3.
- A mesma redação, corrigida duas vezes pelo mesmo prompt, muda em média ~31 pontos no total (máximo de 80 a 120). Diferenças abaixo disso entre versões não são confiáveis com 30 redações.
- **Decisão: a produção continua no v2.** O v4 corrige menos para baixo, mas não erra menos. O próximo candidato deve partir do v2 e trazer só o C4 e as regras de C2 do v4, sem mexer em C1 e C3.

As respostas da segunda rodada estão em `.cache/llm-runs/<versão>/gemini_gemini-3.5-flash-lite.rodada2/`; a pasta sem sufixo continua sendo a da rodada 1 (e da calibração).

### Candidato v5 (`v5-c2-c4`, 13/11/2026)

Parte do v2 e traz do v4 só o que ganhou nas duas rodadas: a C4 do v3 e as regras de calibração da C2. C1, C3 e C5 são idênticas ao v2 (o teste garante isso), e não entram exemplos validados. Medição pendente, porque a cota diária do Gemini acabou em 13/11. Para medir (cerca de 150 chamadas):

```bash
npm run build && npm run essay:eval -- --models gemini:gemini-3.5-flash-lite --prompt v5-c2-c4 --calib 0 --test 30 --inep 0 --max-calls 160 --write false
```

Critério para virar produção: erro total menor ou igual ao do v2 nas mesmas redações, em duas rodadas, com viés menor. Se passar, a calibração dele precisa ser ajustada antes da troca (`--calib 30 --test 30`, sem `--write false`).

### Medição do v5 (14/11/2026)

Mesmas 30 redações de teste, `gemini-3.5-flash-lite`, nota bruta, 145 chamadas; 29 redações fecharam (uma ficou incompleta).

| | MAE total | Viés | Concordância |
| --- | --- | --- | --- |
| **17 redações comuns a todas as rodadas** | | | |
| v2 rodada 1 (05/11) | **117,6** | −47,1 | 41,2% |
| v2 rodada 2 (13/11) | 120,0 | −40,0 | 41,2% |
| v4 rodada 1 (13/11) | 129,4 | −40,0 | 41,2% |
| v4 rodada 2 (13/11) | 127,1 | −28,2 | 41,2% |
| v5 (14/11) | 127,1 | **−28,2** | 41,2% |
| **28 redações (v2 r1, v4 r1/r2 e v5)** | | | |
| v2 rodada 1 | **131,4** | −31,4 | 42,9% |
| v4 rodada 1 | 137,1 | −11,4 | 39,3% |
| v4 rodada 2 | 137,1 | −5,7 | 42,9% |
| v5 | 138,6 | **−4,3** | 42,9% |

Leitura:
- **O v6 não passou no critério.** Zerou o viés (de −46,7 para +8), mas errou mais: 17 pontos a mais que o v2 nas 30 redações. A checagem tirou a severidade da ponta de cima, mas também subiu as redações fracas. A C3 ficou branda (viés +25,3: o humano dá 0 a 80 e o v6 dá 80 a 120), e a C2 passou do ponto (+9,3).
- A instrução "comece pelo 200 e desça" empurra todas as notas para cima, não só as que estavam comprimidas. O desvio do v2 é de compressão (regressão ao 120), não um deslocamento uniforme, e uma regra de procedimento não resolve isso.
- Repetindo a observação de antes: o v6 continua sem conseguir dar 200 em C1 e C4 quando o humano dá. Parte da ponta de baixo do conjunto de teste é ruído das notas humanas (redações de 115 a 215 palavras com zeros pouco consistentes, como C5 = 120 com C1 a C4 = 0).
- **Decisão: a produção continua no v2.** Das tentativas até aqui (v4, v5, v6), toda mudança de prompt que reduz o viés aumenta o erro. O caminho que sobra para corrigir a compressão é a calibração por competência do v2 (`model/llm-calibration.json`, que já faz esse ajuste depois da nota bruta), não o texto do prompt.

**Atualização (14/11/2026): v6 em produção por decisão do usuário.** `GRADER_PROMPT_VERSION` passou para `v6-checagem`, mesmo com a medição acima. Consequências:
- a calibração gravada (`model/llm-calibration.json`) é a do v2 e não vale para o v6, então as notas saem brutas (identidade), como na medição;
- o esperado, pela rodada de 14/11, é um viés total perto de zero, com erro médio maior que o do v2 (cerca de 147 contra 129 pontos) e C3 mais branda;
- para voltar ao v2, basta trocar `GRADER_PROMPT_VERSION` de volta para `v2-competencia`: a calibração dele continua no arquivo;
- antes de calibrar o v6, falta uma segunda rodada de medição e uma amostra de calibração (`--prompt v6-checagem --calib 30 --test 30`, sem `--write false`, o que grava a calibração do v6 e arquiva a do v2).

### Calibração do v6 (14/11/2026)

Rodada com `--prompt v6-checagem --calib 30 --test 30` (`gemini:gemini-3.5-flash-lite`). Das 30 redações de calibração, 26 fecharam; 4 bateram no limite de chamadas por minuto do Gemini. As 30 de teste vieram do cache. A calibração do v2 continua arquivada em `model/archive/llm-calibration.v2-competencia.json`.

Calibração gravada (ajustada nas 56 redações, com escolha por validação cruzada deixando uma de fora):
- **C1:** isotônica. O bruto 80 passa a 120; os outros níveis ficam como estão. Erro na validação cruzada: 40,7 → 35,7.
- **C3:** isotônica. O bruto 80 passa a 40, o 120 a 80 e o 160 a 120, corrigindo a C3 branda do v6. Erro na validação cruzada: 45,0 → 35,7.
- **C2, C4 e C5:** identidade, porque nenhum ajuste ganhou da nota bruta.

**Atenção, os sinais são mistos.** Na medição limpa (ajustada só nas 26 de calibração e medida nas 30 de teste), a calibração piorou o total:

| | MAE total | Viés | Concordância |
| --- | --- | --- | --- |
| v6 bruto | **146,7** | **+8,0** | **40,0%** |
| v6 calibrado (só nas 26) | 153,3 | −46,7 | 36,7% |

A função gravada é outra (ajustada com 56 redações), e por competência ela reduz o erro de C1 e C3 na validação cruzada. Mesmo assim, com 26 redações de calibração e o ruído de ~31 pontos entre rodadas, o ganho não está comprovado. Para confirmar, falta uma rodada nova de teste em outro dia, comparando o bruto com o calibrado.
