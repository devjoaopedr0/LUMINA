# Gabarito Inteligente

> **Status: Em andamento.** Fase 1, importação do INEP, cartão por foto, painel do professor e gabarito comunitário estão no código e foram **validados no navegador em 03/11/2026**, com o gabarito real do ENEM 2024 (2º dia, Amarelo). As migrations `20261103150000_answer_keys` e `20261103200000_answer_key_votes` estão aplicadas. Faltam o gabarito sugerido por IA e a LuminIA por questão. **A data de publicação do gabarito importado (20/11/2024) precisa ser confirmada.**

O aluno escolhe a prova, marca as respostas e vê na hora acertos, erros, brancos e desempenho por área, com histórico. O gabarito oficial aparece marcado como **Oficial**, com fonte e data. Os demais aparecem sempre como **não oficiais**.

## Fase 1 (no código)
- **Tipos de gabarito (`AnswerKeyOrigin`):**
  - `OFFICIAL`: só o administrador cadastra, e só com fonte (banca e link) e data de publicação. É único por prova, aplicação, dia e cor (índice parcial no banco). Quando a banca publica uma correção, a versão sobe e as conferências antigas avisam que o gabarito mudou.
  - `TEACHER`: professor, coordenação ou direção cadastra. Quando publicado, fica visível aos alunos das turmas dele.
  - `COMMUNITY`: nasce dos votos dos alunos (ver abaixo). Itens sempre pendentes (amarelo), nunca oficiais.
  - `AI_SUGGESTED`: previsto no banco; ainda não existe.
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
| POST | `/answer-keys/import/inep` | Importa o gabarito oficial do PDF do INEP (ADMIN; só `download.inep.gov.br`) |
| PUT | `/answer-keys/:id/items` | Correção do gabarito (sobe a versão, com nota) |
| PATCH | `/answer-keys/:id/status` | Publicar, voltar a rascunho, arquivar |
| GET | `/answer-keys/:id/sheet` | Cartão-resposta da Lumina para imprimir e marcar |
| POST | `/answer-keys/:id/read-sheet` | Lê a foto do cartão (PDF de 1 página) e devolve as respostas; não grava nada |
| POST | `/answer-keys/:id/checks` | Conferir e guardar no histórico |
| GET | `/answer-keys/checks/:checkId` | Conferência refeita contra o gabarito atual |
| GET | `/answer-keys/performance` | Painel de desempenho |
| GET | `/answer-keys/:id/stats` | Painel do professor: alunos das turmas dele neste gabarito (ADMIN: todos) |
| POST | `/answer-keys/community/contributions` | Contribui com o gabarito comunitário (respostas viram votos) |
| DELETE | `/answer-keys/:id/votes/:userId` | Moderação: remove os votos de um usuário (ADMIN) |

- **Código:** `lumina-backend/src/answer-keys/` (a lógica de correção pura está em `answer-key.grading.ts`) e `lumina-app/src/pages/SmartAnswerKey.tsx` (rota `/app/gabarito-inteligente`).
- **Testes:** `answer-keys.spec.ts`, com 17 casos (4 sobre a importação do INEP e 2 sobre o cartão por foto).

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

## Dados reais
O banco ainda **não tem nenhum gabarito oficial completo**. Os `exam_papers` com gabarito são dados de exemplo (o ENEM 2023, por exemplo, tem 5 respostas) e não foram migrados para cá. Os oficiais entram pela importação do INEP ou pelo cadastro manual do administrador.

## Próximas fases
1. ~~Importar o gabarito oficial do PDF do INEP~~ (feito).
2. ~~Foto do cartão-resposta para preencher as respostas~~ (feito; ver abaixo).
3. Gabarito sugerido por IA (justificativa por questão, confiança só quando calculável) com validação do professor. **Depende de ter o texto das questões ligado ao gabarito** (ver item 5).
4. ~~Gabarito comunitário~~ (feito; ver abaixo).
5. LuminIA por questão com o texto real da questão e das alternativas (exige vincular `AnswerKeyItem.questionId` às questões do banco).
6. ~~Painel do professor~~ (feito; ver abaixo).
