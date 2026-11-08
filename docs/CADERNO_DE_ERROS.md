# Caderno de erros e classificação do motivo (itens 12 e 13)

O caderno de erros do aluno (item 12 do inventário) com a classificação do motivo
(item 13). Tudo mora em `/users/me/error-notebook`: o caderno é do usuário,
ninguém mais escreve nele.

A criação automática acontece em `POST /questions/:id/attempt` — errar já
registra. Aqui ficam as ações do aluno: incluir à mão, dizer por que errou,
anotar observação, marcar a revisão e tirar do caderno.

---

## Endpoints

| Método   | Rota                              | Descrição                                          |
| -------- | --------------------------------- | -------------------------------------------------- |
| `GET`    | `/users/me/error-notebook`        | Caderno paginado com filtros                       |
| `GET`    | `/users/me/error-notebook/summary`| Totais e recortes por matéria, assunto e motivo    |
| `POST`   | `/users/me/error-notebook/:questionId` | Inclui a questão no caderno manualmente        |
| `PATCH`  | `/users/me/error-notebook/:questionId` | Motivo, observação e revisão combinada         |
| `DELETE` | `/users/me/error-notebook/:questionId` | Tira a questão do caderno                      |

Todos exigem autenticação (`Authorization: Bearer <accessToken>`) e workspace
pessoal do usuário (404 se não tem, 403 se tenta usar workspace alheio).

---

## Regras do caderno (item 12)

### Registro automático: errar cria ou reabre; dois acertos dominam

A regra central mora no repositório e roda **dentro da mesma transação** da
tentativa, para que o erro nunca exista sem a tentativa que o produziu:

- **Erro** (`isCorrect = false`): cria a entrada se não existe; se já existe,
  reabre — zera a sequência de acertos (`correctStreak = 0`), soma 1 em
  `wrongAttempts`, acrescenta `"E"` à evolução, volta `status = ABERTA` e
  limpa `resolvedAt`.
- **Acerto** (`isCorrect = true`): só evolui uma entrada **já existente** no
  caderno (se não tem entrada, nada acontece — acertar uma questão que nunca
  errou não entra no caderno). Acrescenta `"A"` à evolução, incrementa
  `correctStreak`. Quando `correctStreak` atinge `ERROR_NOTEBOOK_MASTERED_STREAK`
  (hoje **2**), a questão vira `DOMINADA`: ganha `resolvedAt = now`,
  `status = DOMINADA` e sai da fila padrão (que filtra `ABERTA`), mas **permanece
  no histórico** — a evolução é o que prova o progresso.
- **Errar de novo depois de dominada**: a questão reabre — zera a sequência,
  soma erro, `status = ABERTA`, `resolvedAt = null`. A evolução continua
  crescendo (ex.: `"EEAAE"`).

A entrada atualizada volta no campo `errorNotebook` do `AttemptResultDto`,
para a interface mostrar o novo estado sem recarregar.

### Linha do tempo (evolução)

String de `"E"` (erro) e `"A"` (acerto), exemplo: `"EEAA"`. Limitada a
`ERROR_NOTEBOOK_EVOLUTION_LIMIT = 40` caracteres (truncada à direita) — mais
que isso deixa de ser uma leitura e vira ruído.

### Dificuldade

A dificuldade **não é duplicada** no caderno: vem da própria questão (fonte
única). No caderno ela funciona como **recorte** (filtro), não como escolha do
aluno.

### Revisão combinada

Data digitada pelo aluno (formato `AAAA-MM-DD`). O servidor grava à **meia-noite
UTC** desse dia. A comparação é por **dia de calendário**, não por instante:

- `due = reviewScheduledAt <= now` — a revisão de **hoje** já está vencida ao
  longo do dia; a de **amanhã** só vence amanhã.
- Data passada também vale (o caso mais comum: revisar o que já venceu).
- O filtro `due=true` restringe a `status = ABERTA` **E** `reviewScheduledAt`
  não nula e `<= now`.

### Resumo do caderno

`GET /users/me/error-notebook/summary` devolve:

```json
{
  "total": 17,
  "open": 12,
  "mastered": 5,
  "dueToday": 3,
  "withoutReason": 4,
  "bySubject": [
    { "label": "Matemática", "value": "Matemática", "open": 9, "mastered": 3 },
    { "label": "Física", "value": "Física", "open": 3, "mastered": 2 }
  ],
  "byTopic": [
    { "label": "Funções exponenciais", "value": "Funções exponenciais", "open": 5, "mastered": 2 },
    ...
  ],
  "byReason": [
    { "label": "Chute", "value": "CHUTE", "open": 2, "mastered": 1 },
    { "label": "Sem motivo", "value": "SEM_MOTIVO", "open": 4, "mastered": 0 },
    { "label": "Falta de conteúdo", "value": "FALTA_CONTEUDO", "open": 1, "mastered": 0 }
  ]
}
```

- `bySubject`/`byTopic`/`byReason` são agregados **em memória** a partir de
  `slices()` (o caderno é dado do próprio aluno — poucas centenas de linhas no
  máximo).
- Desempate por `label.localeCompare(..., 'pt-BR')`.
- `SEM_MOTIVO` **não é um motivo do enum** — é o valor do recorte "Sem motivo"
  do resumo. Filtrar por ele pergunta justamente pelas entradas ainda não
  classificadas (`where.reason = null`).

---

## Classificação do motivo do erro (item 13)

O motivo é um **enum Prisma** (`ErrorReason`), não texto livre. O valor gravado
é o enum; o rótulo é o que o aluno lê.

| Enum                    | Rótulo na interface      |
| ----------------------- | ------------------------ |
| `FALTA_CONTEUDO`        | Falta de conteúdo        |
| `ERRO_INTERPRETACAO`    | Erro de interpretação    |
| `ERRO_CALCULO`          | Erro de cálculo          |
| `FALTA_ATENCAO`         | Falta de atenção         |
| `CHUTE`                 | Chute                    |
| `TEMPO_INSUFICIENTE`    | Tempo insuficiente       |
| `CONFUSAO_CONCEITOS`    | Confusão entre conceitos |
| `OUTRO`                 | Outro motivo             |

Entrada sem classificação aparece como **"Sem motivo"** — que é informação,
não ausência: o caderno mostra o que ainda falta classificar.

O recorte "Sem motivo" do resumo usa o valor `SEM_MOTIVO` (que não está no
enum). A interface envia `reason=SEM_MOTIVO` no filtro; o serviço traduz para
`where.reason = null`.

A sugestão automática do motivo pela LuminIA **depende do backend de IA** —
hoje a classificação é manual.

---

## DTOs de resposta

### `ErrorNotebookEntryDto` (o cartão do caderno)

```json
{
  "questionId": "uuid",
  "subject": "Matemática",
  "topic": "Funções exponenciais",
  "difficulty": "MEDIA",
  "exam": "ENEM",
  "year": 2023,
  "examNumber": 47,
  "stem": "Considere a função f(x) = 2^x…",
  "reason": "CHUTE",
  "notes": "Reli o enunciado: troquei 2^3 por 3^2.",
  "status": "ABERTA",
  "wrongAttempts": 2,
  "correctStreak": 0,
  "evolution": "EE",
  "reviewScheduledAt": "2026-09-27T00:00:00.000Z",
  "due": false,
  "firstWrongAt": "2026-09-20T10:00:00.000Z",
  "lastWrongAt": "2026-09-21T14:30:00.000Z",
  "resolvedAt": null
}
```

- `examNumber`: número da questão na prova (pode ser `null`). A procedência
  completa — **"ENEM · 2023 · questão 47"** — é o que o aluno usa para achar a
  questão no caderno original da prova.
- `stem`: enunciado truncado (`STEM_PREVIEW = 220`).
- `notes`: observação do aluno, truncada em `NOTES_PREVIEW = 2000`.
- `evolution`: linha do tempo, ex. `"EEAA"` (truncada em 40).

### `PaginatedErrorNotebookDto`

Lista paginada: `items`, `total`, `page`, `totalPages`, `limit`.

### `ErrorNotebookFacetDto`

Um recorte do caderno (por matéria, assunto, motivo ou dificuldade):

```json
{
  "label": "Matemática",
  "value": "Matemática",
  "open": 9,
  "mastered": 3
}
```

### `ErrorNotebookSummaryDto`

Totais e recortes — descrito na seção "Resumo do caderno" acima.

---

## DTOs de entrada

### `UpdateErrorNotebookEntryDto` (PATCH)

```json
{
  "reason": "CHUTE",          // null limpa a classificação
  "notes": "minha anotação",  // string vazia limpa a observação
  "reviewScheduledOn": "2026-09-27"  // null ou "" cancela a revisão
}
```

- `reason`: deve ser um valor válido do enum `ErrorReason` ou `null`.
- `notes`: máximo 1000 caracteres.
- `reviewScheduledOn`: formato estrito `AAAA-MM-DD`. Data inválida → 400.

---

## Códigos de resposta

| Cenário                                      | Código | Observação                                         |
| -------------------------------------------- | ------ | -------------------------------------------------- |
| Filtro inválido (status, dificuldade, data)  | 400    | Mensagem explícita do que está errado              |
| POST duplicado (questão já no caderno)       | 409    | `ConflictException`                                |
| PATCH/DELETE de questão que não está no caderno | 404 | `NotFoundException` — não faz insert escondido     |
| Questão inacessível ao aluno                 | 404    | Mesma regra de uso que `GET /questions/:id`        |
| Usuário sem workspace pessoal                | 404    | `getPersonalWorkspaceOrThrow`                      |

---

## Interface

### `/app/caderno-de-erros` (página)

- **Filtros** (toda mudança recarrega a lista):
  - Situação: `ABERTA` (padrão) / `DOMINADA` / `TODAS`
  - Matéria / Assunto / Dificuldade / Motivo
  - "Só o que está vencido" (checkbox `due=true`)
- **Resumo** (cartão fixo no topo): Abertas, Dominadas, Para revisar hoje, Sem
  motivo classificado.
- **Cartões** (um por entrada):
  - Matéria, assunto, procedência da prova (ex.: `ENEM · 2023 · questão 47`),
    dificuldade (badge com cor).
  - Situação: `Aberta` / `Dominada`.
  - Linha do tempo: marcas "E"/"A" + frase (ex.: "2 tentativas registradas, sem
    acerto ainda", "Em recuperação: 1 de 2 acertos seguidos",
    "Dominada — 2 acertos seguidos depois do erro").
  - Enunciado truncado.
  - **Motivo**: select com os 8 motivos + "Sem motivo" (primeira opção).
  - **Revisão combinada**: campo de data + 4 atalhos (Hoje, Amanhã, Em 3 dias,
    Em 1 semana) + botão "Sem data". A data vira meia-noite UTC do dia de
    Brasília; limpar a data não esconde a dívida, porque a entrada aberta sem
    data continua pendente na central.
  - **Observação**: textarea; botão "Salvar observação" **só aparece quando há
    texto novo** — depois de salvar, some e a observação persiste.
  - **Rever questão**: abre o componente `QuestionResolution` (resposta,
    dicas, gabarito, `onAnswered`/`answerLabel` reusados do banco de questões).
    - `onAnswered` dispara o recarregamento da lista do caderno.
  - **Remover do caderno de erros**: confirmação nativa do navegador; `DELETE`
    no recurso; 204 e o cartão some.
- **Banner de dominada**: quando uma questão vira `DOMINADA` depois de responder
  dentro do caderno, aparece um aviso não-modal no topo ("Você dominou esta
  questão… continua no histórico").

### `Dashboard` (painel do aluno)

Cartão `data-notebook-summary` com:
- Abertas (contagem)
- Para revisar hoje (contagem)
- Sem motivo classificado (contagem)
- Dominadas (frase: "1 questão já dominada" / "N questões já dominadas")
- Link "Abrir caderno de erros" → `/app/caderno-de-erros`

A seção de "Notas recentes / Próximos simulados / Caderno de erros" usa
`xl:grid-cols-3` para acomodar o terceiro cartão.

### Menu lateral

Item "Caderno de erros" com ícone `NotebookPen` → `/app/caderno-de-erros`.

---

## Componentes reutilizados

- `QuestionResolution` (`src/components/QuestionResolution.tsx`): extraído de
  `QuestionBank` para reuso no caderno. Recebe `questionId`, `onAnswered`
  (chamado após cada resposta com o `AttemptResult`) e `answerLabel` (rótulo
  do botão de envio — "Responder" vs "Tentar de novo").
- `origemDaQuestao`, `positionLetter`, `ROTULO_DIFICULDADE`,
  `CLASSE_DIFICULDADE` em `src/lib/question-labels.ts` (fonte única para banco
  de questões, busca web e caderno).

---

## Testes que cobrem esta entrega

### Backend

- `src/questions/error-notebook.service.spec.ts` — 30 testes unitários:
  - Criação automática na transação da tentativa, reabrir no erro, evolução
    truncada em 40, 2 acertos dominam, errar de novo reabre.
  - Listagem: filtro padrão `ABERTA`, `TODAS`, `DOMINADA`, matéria/assunto/
    dificuldade/motivo/`due`, filtro inválido → 400, `SEM_MOTIVO` traduzido
    para `reason = null`.
  - Resumo: totais, recortes por matéria/assunto/motivo com desempate pt-BR,
    `withoutReason` conta só abertas sem razão.
  - Adição manual: 409 se já está no caderno, 404 se questão inacessível.
  - Atualização: motivo, observação, revisão; limpar com `null`/`""`; data
    inválida → 400; 404 se não está no caderno.
  - Remoção: 404 se não está no caderno; só remove a do próprio aluno.
  - Formato da entrada: devolve pronta para o cartão, com a dificuldade da
    questão, evolução nunca passa do limite.
- `test/questions.e2e-spec.ts` — bloco "caderno de erros" (13 casos):
  - Caderno nasce vazio e listagem não confunde com erro de carregamento.
  - Erro cria a entrada e volta na tentativa.
  - Classificar o motivo como "sem motivo" limpa a classificação.
  - O motivo registrado muda o recorte e o total de sem motivo.
  - O caderno é do aluno: outro aluno não vê nem edita a entrada.
  - Acerto evolui a entrada e dois acertos seguidos dominam a questão.
  - Errar de novo reabre a questão dominada.
  - Revisão combinada: data digitada, "Hoje", "Amanhã", "Sem data".
  - Filtro `due=true` mostra o vencido e a entrada aberta sem data.
  - Observação gravada e persistida.
  - Recortes por matéria/assunto/dificuldade/motivo/situação.
  - Recorte vazio diz "Nenhuma questão neste recorte".
- `test/fake-prisma.ts` estendido com `errorNotebookEntry` (inclui projeção
  `select` com `examNumber`).

Suíte completa: **404 testes / 24 arquivos verdes** (`npx vitest run`).

### Frontend (app)

- `test/caderno-de-erros.check.ts` — lógica pura (`error-notebook.ts` +
  `question-labels.ts`) sem navegador:
  - 8 motivos + "Sem motivo" com rótulos distintos; rótulo de `null`/vazio =
    "Sem motivo".
  - `SEM_MOTIVO` não está no enum de motivos; filtro envia `reason=SEM_MOTIVO`.
  - `ACERTOS_PARA_DOMINAR = 2`.
  - Atalhos de revisão (Hoje/Amanhã/3 dias/1 semana), fim de mês, virada de
    ano, `diasEntre` sem fuso, `formatarData`.
  - `descreverRevisao`: "Sem revisão marcada", "Revisão para hoje",
    "Revisão vencida ontem", "Revisão vencida em DD/MM/AAAA", "Revisar
    amanhã", "Revisar em N dias", "Revisar em DD/MM/AAAA".
  - `lerEvolucao` / `descreverEvolucao`: "E" → 1 tentativa sem acerto;
    "EE" → 2 sem acerto; "EA" streak 1 → "Em recuperação: 1 de 2";
    "EAA" streak 2 → "Dominada — 2 acertos seguidos"; "EAAE" streak 0 →
    "4 tentativas registradas, sem acerto ainda".
  - Filtros: contagem ativa, `filtrosParaApi` (página, limite, status só se
    não vazia, `due` só se true, `SEM_MOTIVO` vira `reason=SEM_MOTIVO`).
  - Rótulos compartilhados: `positionLetter(1)='A'`, `positionLetter(7)='7'`,
    mesmo `positionLetter` da transcrição; `ROTULO_DIFICULDADE` e
    `CLASSE_DIFICULDADE` não vazias; `origemDaQuestao` com número, sem número,
    autoral (vazio), ano 0.
- Incluído no script `test` do app (hoje 4 checks: `api-session`,
  `essay-draft`, `transcricao-questoes`, `caderno-de-erros`).

`npm run typecheck`, `npx oxlint src`, `npm test`, `npm run build` — limpos.

---

## Validação visual (Playwright)

Script `visual5.mjs` (padrão de `visual4.mjs`) roda em Chromium contra backend
(`localhost:3001`) e app (`localhost:5174`) reais, com usuário de teste
(`visual.busca@lumina.dev`). Espera a janela do limitador (`RateLimit-Remaining`)
antes de cada carga pesada.

**71 verificações, todas aprovadas**:

1. **O erro entra sozinho**: caderno abre com 2 entradas, resumo conta 2
   abertas/0 dominadas/2 sem motivo, matéria/assunto/procedência vêm da
   questão, linha do tempo "E" + "sem acerto ainda", dificuldade traduzida
   (vem da questão, não é escolha).
2. **Motivo é recorte**: 8 motivos + "Sem motivo" no select, todos com rótulo
   legível; PATCH chamado e gravado no servidor; resumo atualiza "Sem motivo";
   recortes por motivo aparecem e filtram (CHUTE → 1, SEM_MOTIVO → 1, limpo → 2).
3. **Revisão combinada**: "Amanhã" lido como amanhã, "Hoje" vira alerta de
   vencida, resumo conta "Para revisar hoje", filtro "só o vencido" isola a
   de hoje, data digitada (24/12/2026) respeitada, "Sem data" limpa a data mas
   mantém a entrada aberta pendente.
4. **Observação**: começa vazia, botão só aparece com texto, grava no servidor,
   persiste na tela, botão some.
5. **Filtros**: matérias/assuntos/dificuldades do caderno viram opções; filtro
   por matéria/assunto/dificuldade funciona; limpar filtros volta à fila; recorte
   vazio (DOMINADA antes de ter dominada) diz "Nenhuma questão neste recorte",
   **não** "Seu caderno está vazio".
6. **Reapresentar e dominar**: abrir "Rever questão", errar de novo (EE, "2
   tentativas", "Errou 2 vezes"), 1º acerto ("Em recuperação: 1 de 2"), 2º
   acerto → dominada (sai da fila, aviso "continua no histórico"), servidor tem
   `EEAA` + observação + motivo preservados, filtro Dominadas mostra a questão
   com selo e frase do progresso.
7. **Painel do aluno**: cartão existe com contagens, link abre o caderno, menu
   lateral tem o item.
8. **Remover**: no filtro Dominadas, remover apaga no servidor (DELETE) e na
   tela; recorte fica vazio com a frase honesta.
9. **Não mente quando falha**: abortar propositalmente `/summary` → página diz
   "Não foi possível carregar o caderno de erros" (não mostra resumo zerado);
   abortar `/error-notebook` (lista) → página não afirma que está vazia.
10. **Saúde**: zero erros de JavaScript, zero HTTP ≥ 400 fora do abort
    proposital do passo 9; respostas 429 do limitador reportadas separadamente.

---

## Como a interface evita mentir

- **Fila/ lista indisponível**: a página mostra "Não foi possível carregar o
  caderno de erros." em vez de "Seu caderno está vazio." — afirmar o vazio
  quando o que falhou foi a carga mente sobre o estado do aluno.
- **Resumo indisponível**: o cartão do resumo some (não mostra zeros), e a
  frase "Não foi possível carregar o caderno de erros" aparece no corpo.
- **Botões otimistas com reversão**: marcar motivo, revisão, observação — se a
  chamada falha, o componente restaura o estado anterior (o select volta ao
  valor antigo, o campo de data limpa, a observação volta ao rascunho salvo).
- **Recorte vazio**: a mensagem distingue "filtro não achou nada" de "caderno
  vazio" — são estados semanticamente diferentes e o aluno merece saber qual
  é o seu.
- **Limite de taxa local**: o script de validação lê `RateLimit-Remaining`,
  espera a janela abrir e reporta 429 separadamente; não é defeito do produto.

---

## Migrações relacionadas

- `20260926170000_error_notebook` — tabela `error_notebook_entries`,
  enum `ErrorReason`, enum `ErrorNotebookStatus`, índices.
- `20260926160000_question_review_and_alternative_explanations` —
  `question_alternatives.explanation` (base da explicação por alternativa,
  item 11, compartilhada com o caderno na reapresentação).

---

## Variáveis de ambiente

Nenhuma variável específica do caderno. O limitador de taxa (`100 req/60s por
IP`) é global e afeta a validação visual (o script espera a janela).

---

## O que ainda não está aqui

- **Sugestão automática do motivo pela LuminIA**: depende do backend de IA
  (`docs/AI_CHAT.md` e `lumina-app/src/lib/ai-chat.ts` ainda lançam
  `AiChatNotConfiguredError`).
- **Notificação/lembrete de revisão combinada**: hoje só a interface mostra
  "Para revisar hoje" no resumo; não há push/e-mail/alerta automático.