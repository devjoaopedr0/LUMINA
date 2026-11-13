# Gabarito Inteligente

> **Status: Em andamento.** Fase 1, importação do INEP, cartão por foto, painel do professor e gabarito comunitário estão no código e foram **validados no navegador em 03/11/2026**, com o gabarito real do ENEM 2024 (2º dia, Amarelo). As migrations `20261103150000_answer_keys` e `20261103200000_answer_key_votes` estão aplicadas. O vínculo do gabarito com o banco de questões e a **explicação da LuminIA por questão** entraram no código em 04/11/2026; no mesmo dia, o caderno do ENEM 2024 (2º dia) foi importado (75 das 90 questões) e o vínculo e a explicação foram **validados ponta a ponta com a IA real** (75/90 itens ligados; questão 91 explicada, questão sem vínculo devolvendo 422). O **gabarito sugerido por IA** também entrou no código em 04/11/2026, com validação do professor; em 05/11/2026 o caminho da IA foi **medido com um modelo real em uma prova inteira** (ENEM 2024, 2º dia, Amarelo: 44/59 sugestões corretas entre as respondidas; 16 questões ficaram pendentes), confirmando que a revisão docente é obrigatória. **A data de publicação do gabarito importado (20/11/2024) precisa ser confirmada.**

O aluno escolhe a prova, marca as respostas e vê na hora acertos, erros, brancos e desempenho por área, com histórico. O gabarito oficial aparece marcado como **Oficial**, com fonte e data. Os demais aparecem sempre como **não oficiais**.

## Fase 1 (no código)
- **Tipos de gabarito (`AnswerKeyOrigin`):**
  - `OFFICIAL`: só o administrador cadastra, e só com fonte (banca e link) e data de publicação. É único por prova, aplicação, dia e cor (índice parcial no banco). Quando a banca publica uma correção, a versão sobe e as conferências antigas avisam que o gabarito mudou.
  - `TEACHER`: professor, coordenação ou direção cadastra. Quando publicado, fica visível aos alunos das turmas dele.
  - `COMMUNITY`: nasce dos votos dos alunos (ver abaixo). Itens sempre pendentes (amarelo), nunca oficiais.
  - `AI_SUGGESTED`: rascunho gerado pela LuminIA para professor/gestão, sempre pendente até a validação docente (ver abaixo). Nunca é oficial.
- **Seleção:** prova (`Exam` existente, ou nova sem duplicar nome + ano), ano, aplicação, dia, cor do caderno e área. Áreas do Enem preenchidas pela numeração (1–45 LC, 46–90 CH, 91–135 CN, 136–180 MT).
- **Língua estrangeira (Enem, 1º dia):** um item por língua nas questões 1–5, e o aluno escolhe a dele.
- **Conferência:** grade A–E (ou colar a sequência), revisão antes de confirmar e correção. As cores são verde (acerto), vermelho (erro), cinza (em branco) e amarelo (pendente de validação). Anulada e pendente não entram no percentual. **O percentual não é convertido em nota TRI.**
- **Desempenho:** provas conferidas, acerto geral, acerto por área (da mais fraca para a mais forte), histórico e questões que o aluno mais erra.

### API (`/answer-keys`, autenticada)
| Método | Rota | O quê |
| --- | --- | --- |
| GET | `/answer-keys?examId&year&day&origin` | Gabaritos visíveis (oficial primeiro) |
| GET | `/answer-keys/exams` | Provas cadastradas |
| GET | `/answer-keys/:id?answers=true` | Detalhe; as respostas só vêm com `answers=true` |
| POST | `/answer-keys` | Cadastro (oficial: ADMIN, com fonte e data; professor: staff) |
| POST | `/answer-keys/ai-suggestions` | Gera um rascunho `AI_SUGGESTED` com respostas e justificativas (professor/gestão; não substitui o oficial) |
| POST | `/answer-keys/import/inep` | Importa o gabarito oficial do PDF do INEP (ADMIN; só `download.inep.gov.br`) |
| PUT | `/answer-keys/:id/items` | Correção do gabarito (sobe a versão, com nota) |
| PATCH | `/answer-keys/:id/items/validate` | Valida ou corrige itens de um gabarito de professor/IA; itens não enviados continuam pendentes |
| PATCH | `/answer-keys/:id/status` | Publicar, voltar a rascunho, arquivar |
| GET | `/answer-keys/:id/sheet` | Cartão-resposta da Lumina para imprimir e marcar |
| POST | `/answer-keys/:id/read-sheet` | Lê a foto do cartão (PDF de 1 página) e devolve as respostas; não grava nada |
| POST | `/answer-keys/:id/checks` | Conferir e guardar no histórico |
| GET | `/answer-keys/checks/:checkId` | Conferência refeita contra o gabarito atual |
| GET | `/answer-keys/performance` | Painel de desempenho |
| GET | `/answer-keys/:id/stats` | Painel do professor: alunos das turmas dele neste gabarito (ADMIN: todos) |
| POST | `/answer-keys/:id/link-questions` | Liga os itens às questões do banco público (ENEM pelo `sourceId`; outras provas pelo número) |
| GET | `/answer-keys/:id/questions/:number/explanation?selected&language` | Explicação da LuminIA para uma questão já respondida (422 quando ainda não há vínculo) |
| POST | `/answer-keys/community/contributions` | Contribui com o gabarito comunitário (respostas viram votos) |
| DELETE | `/answer-keys/:id/votes/:userId` | Moderação: remove os votos de um usuário (ADMIN) |

- **Código:** `lumina-backend/src/answer-keys/` (a lógica de correção pura está em `answer-key.grading.ts` e o vínculo/prompt em `answer-key.questions.ts`) e `lumina-app/src/pages/SmartAnswerKey.tsx` (rota `/app/gabarito-inteligente`).
- **Testes:** `answer-keys.spec.ts`, com 43 casos (9 sobre o gabarito sugerido por IA, 4 sobre a importação do INEP, 2 sobre o cartão por foto e 8 sobre vínculo, explicação e limpeza do texto da IA).

## Importação do gabarito oficial do INEP
O administrador cola o link do PDF do gabarito (ex.: `.../provas_e_gabaritos/2024_GB_impresso_D2_CD5.pdf`) e informa a data de publicação, que o PDF não traz.

- **O que é lido do PDF** (`parseOfficialGabarito`, em `enem-pdf.parser.ts`): ano, dia, cor e número do caderno, além das respostas. No 1º dia, as questões 1–5 trazem duas letras ("1 B A"), na ordem do cabeçalho "INGLÊS ESPANHOL".
- **Gabarito incompleto é recusado:** falta de alguma das 90 questões do dia, questão fora do dia, ausência das duas línguas ou cabeçalho sem ano, dia ou cor.
- **Reimportar o mesmo PDF** devolve o gabarito que já existe. Se as respostas forem diferentes, a importação dá conflito e indica a correção oficial (que sobe a versão).
- **Testes** com o texto real de dois PDFs públicos: 2023, 1º dia, Azul; e 2024, 2º dia, Amarelo, com a questão 102 anulada.

**Bug corrigido no importador de questões (03/11/2026):** o leitor antigo (`parseGabaritoText`) exigia números de 2 ou 3 dígitos, e as questões 1 a 9 do 1º dia ficavam sem gabarito. Também guardava uma só resposta para as questões 1–5, que no caderno aparecem duas vezes (inglês e depois espanhol) com o mesmo `sourceId`. Agora o importador usa `parseOfficialGabarito`: a 1ª ocorrência da questão de língua recebe o gabarito de inglês e a 2ª o de espanhol, cada uma com o próprio `sourceId` (`enem-2023-d1-q1-ingles`/`-espanhol`) e a matéria Inglês ou Espanhol.

## Cartão por foto
- **Imprimir:** o aluno imprime o cartão da Lumina do gabarito (`/app/gabarito-inteligente/:id/cartao`), com a numeração da prova (91–180 no 2º dia) e o quadro de língua no 1º dia. O cartão usa o mesmo layout e a mesma leitura óptica do scanner de simulados.
- **Código 0:** o cartão usa o código 0, que o scanner de simulados nunca sorteia (lá os códigos começam em 1). Por isso a folha de gabarito não se confunde com a de um aluno num simulado, e a folha de um simulado é recusada aqui.
- **Ler a foto:** "Ler foto do cartão" recorta e endireita a foto no próprio app, gera um PDF de uma página e manda para leitura. A grade é preenchida e as questões duvidosas ficam em amarelo. Dupla marcação fica em branco, como no Enem, e também é sinalizada.
- **Confirmar:** o aluno confere, ajusta e confirma. A correção grava `inputMode = PHOTO`. A leitura em si não grava nada.
- **Língua:** a escolha da língua no 1º dia continua sendo feita na tela. O quadro impresso serve só de lembrete e não é lido.

## Painel do professor
Aba "Desempenho das turmas" (professor, coordenação, direção, administração). Para qualquer gabarito visível, inclusive o oficial, mostra:
- quantos alunos das turmas do professor conferiram (vale a conferência mais recente de cada um);
- o acerto médio e o acerto por área;
- as questões mais difíceis para a turma, com o **distrator mais escolhido**;
- a lista de alunos.

A administração vê todos. Os alunos não veem o painel (403).

## Gabarito comunitário
- **Quando aparece:** na conferência, em "Prova sem gabarito oficial ainda?". O aluno escolhe a prova, o dia e a cor e marca o que respondeu.
- **Votos:** cada resposta vira um voto, um por questão (e língua). Reenviar substitui o voto anterior, e em branco não conta.
- **Resposta exibida:** a mais votada, a partir de **3 votos**, com a concordância ("80% concordam"). Empate fica registrado como "sem consenso".
- **Nunca oficial:** os itens são sempre pendentes. A correção mostra uma **estimativa provisória** ("X batem com a mais votada"), separada e fora do percentual.
- **Quando sai de cena:** o comunitário some da lista quando o oficial da mesma prova, aplicação, dia e cor é publicado. Também não dá para abrir um comunitário onde já existe oficial.
- **Moderação:** só a administração arquiva o comunitário e remove os votos de um usuário, e os itens são recalculados.
- **Banco:** um comunitário por prova, aplicação, dia e cor (índice parcial). Migration `20261103200000_answer_key_votes` (tabela `answer_key_votes` e coluna `answer_key_items.votes`), aplicada em 03/11/2026.

## Gabarito sugerido por IA

- **Quem pode gerar:** professor, coordenação e direção. A sugestão nasce como rascunho `AI_SUGGESTED`, com todos os itens pendentes; não é publicada e não substitui um gabarito oficial.
- **Pré-requisito:** a prova precisa ter questões acessíveis no banco (de preferência no banco público). Sem texto de questão, não há sugestão.
- **Enem:** exige a cor do caderno, porque a ordem das questões muda entre cadernos; se já existe gabarito oficial para a mesma prova, aplicação, dia e cor, a geração é recusada.
- **Resposta pronta:** quando o banco já tem exatamente uma alternativa marcada como correta, a sugestão usa essa resposta com confiança **1** — é cálculo, não palpite.
- **Sugestão da IA:** quando o banco não tem a resposta, a LuminIA recebe somente enunciado e alternativas e devolve uma alternativa + justificativa curta. A confiança fica **nula**, porque não há base para calculá-la.
- **O que é pulado:** questão com imagem (a LuminIA não lê a imagem), sem alternativas suficientes, com mais de uma alternativa correta no banco ou com resposta inválida da IA. O item fica pendente com o motivo explícito, em vez de receber uma resposta inventada. Quando a própria IA devolve `answer: null` e explica o que faltou (por exemplo, uma figura que não veio na extração), essa justificativa é preservada no item pendente.
- **Validação docente:** o professor confirma ou corrige cada item em `PATCH /answer-keys/:id/items/validate`. Só itens validados contam para o aluno; os pendentes aparecem em amarelo. Se a resposta muda, a versão do gabarito sobe e as conferências antigas avisam.
- **Medição real (05/11/2026):** no ENEM 2024 (2º dia, Amarelo), com as 75 questões oficiais que têm texto no banco, o mesmo prompt do serviço foi executado **sem informar a alternativa correta do banco** e comparado depois com o gabarito oficial. Modelo usado: `gemini-3.1-flash-lite` (o 3.5 Flash Lite estava com a cota diária esgotada). Das 75 questões, 59 receberam sugestão e 44 estavam corretas (**74,6% das respondidas; 58,7% do total**); 15 erraram e 16 ficaram sem sugestão (13 por falta de figura, esquema ou dados que não vieram na extração e 3 por 429/timeout). Sobre o total, o acerto foi 74,4% em Ciências da Natureza e 41,7% em Matemática. É uma medição de um modelo, não uma garantia: a revisão docente continua obrigatória.
- **Teste do serviço real:** em 3 questões (91–93) com as respostas do banco temporariamente ocultadas, o fluxo criou o rascunho, recebeu 2 sugestões e 1 pendência por timeout, validou os itens e publicou; os dados originais foram restaurados em seguida. Nenhum gabarito oficial ou resposta do banco foi alterado ao final.
- **Honestidade:** a IA pode errar. O fluxo foi desenhado para que a sugestão seja sempre revisada por um professor antes de valer.

## LuminIA por questão
- **Vínculo:** cada item do gabarito pode apontar para uma questão do banco (`AnswerKeyItem.questionId`). O vínculo automático roda ao criar/importar/corrigir um gabarito e ao recalcular o comunitário; também há o botão **“Vincular questões”** em “Meus gabaritos”.
- **Só o banco público:** o vínculo usa apenas questões do workspace `banco@lumina.app`. Fora dele a questão não é ligada, porque a explicação precisa funcionar para qualquer aluno autenticado — não só para quem tem acesso ao workspace de quem importou o caderno.
- **Como casa:** no ENEM, pelo `sourceId` canônico (`enem-2024-d2-q91`, `enem-2023-d1-q1-ingles`); nas demais provas, pelo número da questão dentro da mesma prova cadastrada (itens de língua ficam de fora).
- **Explicação:** depois da conferência, as questões erradas ou em branco mostram **“Explicar com a LuminIA”**. A IA recebe o enunciado, as alternativas, a resposta correta e a resposta do aluno. Se a IA não estiver configurada ou falhar, a tela mostra um **roteiro de revisão determinístico** marcado como tal, sem conteúdo inventado.
- **Sem vínculo não há explicação:** a API responde **422** e a interface diz que falta ligar a questão ao banco. Nunca é gerada uma explicação sem o texto real da questão.
- **Privacidade e honestidade:** a explicação não é gravada em cache nesta fase; cada pedido é uma chamada (ou o fallback). A imagem da questão, quando existe, não é enviada para leitura — o prompt avisa que só o texto está disponível. Como a interface mostra texto puro, a resposta da IA passa por uma limpeza simples de markdown (negrito, itálico e títulos), sem alterar o conteúdo.

## Dados reais
O gabarito oficial do ENEM 2024 (2º dia, Amarelo) está no banco e o caderno do mesmo dia foi **importado em 04/11/2026**: **75 das 90 questões** estão no workspace público `banco@lumina.app`. A importação não criou duplicatas nem erros; as 15 restantes foram **puladas com motivo explícito**, sem texto inventado:

- **9 questões dependem de imagem/figura ou de um layout que a extração de texto não separa com segurança** (100, 106, 109, 110, 135, 146, 153, 156, 162): o leitor prefere pular a importar um enunciado sem as alternativas corretas.
- **5 questões têm fórmulas ou figuras que viraram “sopa de números”** (139, 147, 149, 179, 180): o leitor prefere pular a importar alternativas ilegíveis.
- **1 questão foi anulada pelo INEP** (102): não há resposta válida a importar.

O vínculo ficou em **75/90** — exatamente as questões importadas. Os 15 itens sem questão continuam funcionando para conferir a resposta; a explicação por questão fica indisponível e a interface diz isso, em vez de inventar enunciado. O parser do PDF de 2024 foi corrigido para aceitar o marcador de alternativa de uma letra (o de 2023 usa duas) e para descartar o rodapé/cabeçalho de página que contaminava questões que atravessam páginas.

As 75 questões importadas já têm exatamente uma alternativa correta no banco. Por isso, no uso normal do ENEM 2024, a geração de gabarito usa a resposta do banco com confiança 1 e **não chama a IA**; o caminho generativo foi medido separadamente, ocultando essa resposta, como descrito acima.

Os demais `exam_papers` com gabarito continuam sendo dados de exemplo (o ENEM 2023, por exemplo, tem 5 respostas) e não foram migrados para cá. Os oficiais entram pela importação do INEP ou pelo cadastro manual do administrador.

## Próximas fases
1. ~~Importar o gabarito oficial do PDF do INEP~~ (feito).
2. ~~Foto do cartão-resposta para preencher as respostas~~ (feito; ver abaixo).
3. ~~Gabarito sugerido por IA (justificativa por questão, confiança só quando calculável) com validação do professor~~ (feito em 04/11/2026; caminho da IA medido no ENEM 2024 em 05/11/2026, ver acima). Repetir a medição com o modelo padrão de produção quando a cota permitir; a revisão docente continua obrigatória. A medição agora é reproduzível pelo script `lumina-backend/src/answer-keys/eval/evaluate-suggestions.ts` (só lê o banco, nunca grava): `npm run build && npm run answer-keys:eval -- --exam enem --year 2024 --day 2 --booklet Amarelo`. Ele usa o mesmo prompt do serviço sem revelar a resposta do banco, guarda as respostas em `.cache/answer-key-eval/<modelo>/` (rodar de novo retoma sem gastar cota) e aceita `--models`, `--limit`, `--only`, `--max-calls`, `--prompt-file` (A/B de prompt) e `--dry-run` (confere banco e vínculo sem chamar a IA).
4. ~~Gabarito comunitário~~ (feito; ver abaixo).
5. ~~LuminIA por questão com o texto real da questão e das alternativas (exige vincular `AnswerKeyItem.questionId` às questões do banco)~~ (feito em 04/11/2026; ver acima).
6. ~~Painel do professor~~ (feito; ver abaixo).

## Modelos do gabarito sugerido (12/11/2026)

O gabarito sugerido e a explicação por questão usam uma **cadeia própria de modelos**: `AI_ANSWER_KEY_MODELS` (mesmo formato de `AI_ESSAY_MODELS`); sem ela, a cadeia da redação (`AI_ESSAY_MODELS`, que começa pelo Gemini). O script `npm run answer-keys:eval` mede por padrão a mesma cadeia do serviço.

Medições no ENEM 2024, 2º dia, Amarelo (75 questões elegíveis, prompt `835378abc1ef`, sem revelar a resposta do banco):

| Cadeia | Corretas / respondidas | Natureza | Matemática | Pendentes | Erros de cota |
| --- | --- | --- | --- | --- | --- |
| `gemini-3.1-flash-lite` (05/11) | 44/59 (74,6%) | — | — | 16 | 3 |
| Modelo do chat, `openrouter:nvidia/nemotron-3.5-lightning:free` | 36/63 (57,1%) | 27/38 (71,1%) | 9/25 (36%) | 2 | 9 |
| **Cadeia nova** (`gemini-3.5-flash-lite` → `nemotron-3-ultra` → `gemini-3.5-flash`) | **41/55 (74,5%)** | **27/30 (90%)** | **14/25 (56%)** | 19 | 0 |

- O modelo do chat forçava alternativas quando a conta não batia (Q104, Q108, Q115). Por isso o gabarito deixou de usá-lo.
- As 19 pendentes da cadeia nova são quase todas por figura ou gráfico que não veio na extração: a IA diz que não dá para responder em vez de chutar.
- Ainda há erros de cálculo em Matemática (ex.: Q140, Q155). A revisão docente continua obrigatória.
