# Status funcional da Lumina

## Atualização de 26/09/2026 — funcionalidade 11: Resolução de questões (explicação por alternativa, marcar para revisar e dicas)

Entrega vertical fechada em 7 de 10 subitens do inventário. Os três primeiros (responder na plataforma, correção automática, feedback imediato) já existiam desde o item 9; o "gabarito comentado" (explicação da resposta correta) também. Esta entrega acrescenta os três que faltavam, menos dois que dependem de outras entregas.

- **Explicação de cada alternativa errada** (subitem "Explicação das alternativas erradas"). A explicação mora na alternativa (`question_alternatives.explanation`, migration `20260926160000_question_review_and_alternative_explanations`), não no gabarito: o gabarito responde "qual é a resposta", a explicação da alternativa responde "por que esse distrator existe". O autor escreve pelo formulário do banco de questões e pelo formulário de transcrição da busca web (campo opcional por alternativa, cujo rótulo vira "Por que esta é a correta" na alternativa marcada). A explicação **não viaja na visão de responder** — entregá-la antes de responder entregaria o gabarito junto, porque a alternativa correta está entre as explicadas: só sai em `?includeAnswer=true` (visão de autor) e no resultado de `POST /questions/:id/attempt`, no painel "Por que cada alternativa está assim" com a marcação `(sua resposta)`.
- **Marcar questão para revisar** (subitem "Marcar questão para revisar"). `user_question_progress.marked_for_review` é coluna **independente** de `is_favorite`, com índice dedicado: favoritar é gostar (coleção), marcar é compromisso de retomada (fila de trabalho) — os dois estados coexistem sem interferir. `POST`/`DELETE /questions/:id/review` e `GET /users/me/questions/review` (fila de retomada). O estado volta na listagem e no detalhe (`progress.markedForReview`) para o botão mostrar a verdade sem segunda chamada. Marcar não registra tentativa nem mexe nas estatísticas.
- **Pedir dica sem ver a resposta** (mesmo subitem). `GET /questions/:id/hint?level=1..3`: nível 1 aponta o assunto e o conceito a recuperar, 2 diz o que conferir no enunciado, 3 dá o método de eliminação; a escada para em 3 ("Sem mais dicas") e nível fora da faixa é 400. A garantia de que a dica não vaza o gabarito tem **duas camadas**: (1) estrutural — o `HintProvider` recebe só enunciado, disciplina, assunto, dificuldade e a *quantidade* de alternativas, então não tem como saber a resposta; (2) defensiva — o texto gerado é normalizado (sem acento, sem pontuação) e conferido contra a alternativa correta, sendo descartado no lugar por uma dica neutra quando a contiver (só para alternativas com 4+ caracteres, senão "8" geraria falso positivo em qualquer frase). Provedor padrão: `StudyGuideHintProvider` (`provider: "rules"`), determinístico e sem chave de API, com reconhecimento de área por casamento **insensível a acento** (o banco guarda "Funcoes exponenciais" e a dica não pode depender da acentuação). Para plugar um modelo de linguagem basta registrar outro `HintProvider` no token `QUESTION_HINTS_PROVIDER`. Pedir dica não conta como tentativa.
- **Fila de revisão na interface**: cartão "Para revisar" no painel do aluno (`/app`), alimentado pela fila real. Quando a chamada falha, o cartão diz que não carregou em vez de afirmar "nada marcado para revisar" — uma interface que afirma o vazio quando o que falhou foi a carga mente sobre o estado do aluno.
- Validação visual no navegador (Chromium via Playwright, ambiente efêmero fora do repositório) contra backend e aplicativo reais: **59 verificações, todas aprovadas** — campo de justificativa por alternativa e sua reconfiguração ao marcar o gabarito, arrasto correto das justificativas ao remover e re-adicionar alternativa, payload de salvamento com as quatro justificativas e o gabarito na posição certa, marcar/desmarcar com `POST`/`DELETE` corretos, sobrevivência ao recarregar, independência de favorito, escada de três dicas com botão desabilitado no limite e nenhuma dica contendo o gabarito, painel de explicação por alternativa no acerto e no erro com `(sua resposta)`, "Responder novamente" limpando o painel e preservando as dicas, formulário de edição reabrindo com as justificativas na ordem salva, fila do painel aparecendo e esvaziando, e a honestidade do cartão quando a fila está indisponível. Sem erro de JavaScript e sem resposta HTTP ≥ 400.
- Duas lições da validação, ambas resolvidas: (a) o cartão da fila, recém-criado, herdou o padrão `Promise.allSettled` do painel e **afirmava "nada marcado para revisar" quando a requisição falhava** — passou a distinguir erro de vazio, com verificação no navegador (requisição abortada de propósito); (b) a dica de nível 1 interpolava o assunto sem cuidado e saía "assunto: ." em questão sem assunto (comum em questão importada) — passou por `descricaoDaQuestao`, com teste para o caso sem assunto no provedor e na dica neutra do serviço.
- Ruído de ambiente explicitado: o limitador local (100 requisições por minuto por IP) reagiu à carga da própria validação — em desenvolvimento o `StrictMode` do React executa cada efeito duas vezes e o painel do aluno dispara 7 requisições por carga, com sondagem a cada 30 s. Isso não é defeito do produto: o script passou a ler `RateLimit-Remaining`, esperar a janela abrir e repetir a leitura, e reporta as respostas 429 separadamente das falhas reais.
- Testes: **359 aprovados em 23 arquivos no backend** (era 321 em 22) e **3 checks rápidos no aplicativo** (era 2) — 18 unitários do provedor/serviço de dicas (nível 1/2/3, área reconhecida com e sem acento, área genérica, questão difícil, ausência de assunto, o provedor nunca recebendo o gabarito, descarte de dica que vaza, não-descarte por resposta curta, clamp de nível, `maxLevel`), 12 unitários do serviço de questões (marcar para revisar sem mexer no favorito, alternância sem preferência, 404 em questão inacessível, dica sem gravar tentativa, explicação por alternativa no resultado da tentativa e a ausência dela na visão de responder, `progress` em lote na listagem) e 8 novos e2e (visão de responder nunca entrega a explicação, visão de autor entrega, tentativa devolve as justificativas, dica sem revelar a alternativa correta, nível inválido 400, dica não conta como tentativa, marcar para revisar volta na listagem, 404 em questão inacessível). No aplicativo, as regras da transcrição da busca web saíram do componente para `src/lib/question-transcription.ts` (alinhamento alternativa/justificativa, reposicionamento do gabarito, alternativa em branco com a justificativa órfã) e ganharam o check `test/transcricao-questoes.check.ts`: a lógica que o typecheck não pega agora é verificada em milissegundos, e o navegador fica só com o que ele é bom de provar. Typecheck, build e lint aprovados nos dois projetos.
- Documentação: `docs/RESOLUCAO_QUESTOES.md` descreve os endpoints, a regra de onde a explicação pode aparecer, a independência entre favoritar e revisar, a escada de dicas com a dupla garantia e como trocar o provedor.
- **Pendente neste item**: "Pedir ajuda à LuminIA" (depende do backend de IA; hoje o provedor de dicas é o das regras, sem chamada externa).

## Atualização de 26/09/2026 — itens 12 e 13: Caderno de erros e classificação do motivo do erro

Entrega vertical fechada dos dois itens do inventário. O caderno nasce dentro do módulo `Questions` (rotas `/users/me/error-notebook`), reutilizando `QuestionsRepository` e `QuestionAccessService` já exportados pelo `QuestionsModule`. A regra central é: **todo erro cria ou reabre a entrada; dois acertos seguidos dominam a questão** — a entrada continua no histórico (a evolução "EEAA" prova o progresso), mas sai da fila do que precisa ser refeito (filtro padrão `ABERTA`).

- **Registro automático** dentro da transação de `POST /questions/:id/attempt` (mesma transação da tentativa, para que o erro nunca exista sem a tentativa que o produziu). O estado da entrada volta no campo `errorNotebook` do `AttemptResultDto`, para a interface já mostrar o novo estado sem recarregar.
- **Motivo do erro** (item 13) é `ENUM Prisma ErrorReason` (7 motivos + `OUTRO`; texto livre nunca substitui a classificação). "Sem motivo" é facet (`SEM_MOTIVO`), não ausência: o aluno vê o que ainda falta classificar. Correção de contrato: o filtro `SEM_MOTIVO` promete que `value` vai no filtro, mas o serviço rejeitava com 400 — agora `where.reason = null` (unit spec + e2e).
- **Dificuldade** não é duplicada no caderno (fonte única = a da questão; no caderno ela é recorte, não escolha).
- **Evolução** = `"EEAA"`, truncada à direita em 40 caracteres; `DOMINADA` com 2 acertos seguidos (`ERROR_NOTEBOOK_MASTERED_STREAK = 2`), entrada permanece no histórico.
- **Revisão combinada** = meia-noite UTC do dia digitado; `due = reviewScheduledAt <= now` (vencida inclusive); filtro inválido → 400; POST duplicado → 409; PATCH/DELETE fora do caderno → 404; filtro padrão = `ABERTA`.
- **Resumo** com totais e recortes (`bySubject`, `byTopic`, `byReason` com desempate por `label.localeCompare(..., 'pt-BR')`), agregado em memória a partir de `slices()`.
- **Interface**: página `/app/caderno-de-erros` (filtros, cartões, evolução, revisão, remoção, banner de dominada); componente `QuestionResolution` extraído de `QuestionBank` para reuso no caderno (com `onAnswered` e `answerLabel`); cartão no `Dashboard` (seção ajustada para `xl:grid-cols-3`); item de menu "Caderno de erros" com ícone `NotebookPen`.
- **Front refatorado**: `positionLetter`, `ROTULO_DIFICULDADE`, `CLASSE_DIFICULDADE`, `origemDaQuestao` movidos para `src/lib/question-labels.ts` (fonte única), com `question-transcription.ts` reexportando `positionLetter`.
- **Testes**: `error-notebook.service.spec.ts` (30 unit), `questions.e2e-spec.ts` (bloco caderno, 13 casos; `RATE_LIMIT_MAX=5000`), suíte completa **404 testes/24 arquivos verdes**; `test/fake-prisma.ts` estendido (`errorNotebookEntry`); app: `test/caderno-de-erros.check.ts` (módulo puro `error-notebook.ts` + `question-labels.ts`) + entrada no script `test` (hoje 4 checks); `npm run typecheck`, `npx oxlint src`, `npm test`, `npm run build` no app limpos.
- **Validação visual (Playwright)**: **71 verificações, todas aprovadas** — caderno abre com as duas questões erradas, resumo conta abertas/dominadas/sem-motivo/para-revisar, matéria/assunto/procedência vêm da questão, linha do tempo começa com "E" e frase "sem acerto ainda", 8 motivos + "Sem motivo" no select, cada motivo tem rótulo legível, motivo gravado no servidor, recortes por motivo aparecem e filtram corretamente, revisão amanhã/hoje/data digitada/sem data, filtro "só o vencido", observação do aluno com botão que só aparece com texto novo e persiste após salvar, reapresentar a questão dentro do caderno, errar de novo (linha do tempo "EE", frase "2 tentativas", "Errou 2 vezes"), primeiro acerto ("Em recuperação: 1 de 2"), segundo acerto (dominada, sai da fila aberta, aviso "continua no histórico"), filtro Dominadas mostra a questão com selo e frase do progresso, filtros por matéria/assunto/dificuldade/situação, recorte vazio diz "Nenhuma questão neste recorte" (não "caderno vazio"), limpar filtros volta a fila, painel do aluno mostra o cartão com contagens e link, remover do caderno apaga no servidor e na tela, abortar propositalmente o resumo/lista faz a página dizer "Não foi possível carregar" em vez de mentir que está vazio. **Zero erros de JavaScript, zero HTTP ≥ 400 fora do abort proposital**.
- Documentação: `docs/CADERNO_DE_ERROS.md` descreve endpoints, regra de evolução, motivo como recorte, revisão combinada, dominação e como a interface evita mentir quando a chamada falha.

## Atualização de 26/09/2026 — validação visual da funcionalidade 10 (Busca de questões na web) e correções

Validação feita no navegador (Chromium via Playwright, ambiente efêmero fora do repositório) contra backend e aplicativo reais: **22 verificações, todas aprovadas** — busca com e sem acento, aviso de modo demonstração, link de origem absoluto, estado vazio, botão desabilitado abaixo de 3 caracteres, abertura do formulário sem gravação, validações do formulário, letras A–F, marcação do gabarito, aviso de salvamento, fechamento do formulário, conteúdo gravado no banco, deduplicação e exibição no banco de questões, sem erro de JavaScript e sem resposta HTTP ≥ 400.

A validação encontrou **quatro defeitos reais**, todos corrigidos:

- **Salvamento sempre devolvia 400 (bloqueante).** `SaveWebQuestionDto.sourceUrl` usava `@IsUrl()` com `require_tld` implícito em `true`, então *todo* link de `localhost` era rejeitado — ou seja, o salvamento só funcionaria em domínio real, jamais em desenvolvimento. Corrigido com `require_tld: false`, mantendo a exigência de esquema `http(s)`.
- **Conteúdo salvo era lixo.** O botão "Salvar" gravava o trecho da busca como enunciado, com duas alternativas de preenchimento e **sem gabarito**. Substituído pelo formulário de transcrição `WebQuestionTranscription`: enunciado (pré-preenchido com o trecho, para completar e corrigir), alternativas A–F com marcação da alternativa correta, gabarito comentado e classificação editável. Nenhum POST acontece até o envio do formulário.
- **Busca sem acento não encontrava.** `stem contains "funcoes"` não casa com "Funções". Nova extensão `unaccent` (migration `20260926120000_add_unaccent_text_search`) aplicada **dos dois lados** do `ILIKE` — coluna e termo —, tanto em `GET /search/web` quanto em `GET /questions?search=`. Implementação por pré-filtro de ids com SQL parametrizado (`QuestionTextSearchRepository` + `buildTextSearchSql`), mantendo paginação, ordenação, `total` e estatísticas no Prisma; com teto de 2000 ids e escape dos curingas do LIKE. Sem a extensão no banco, o serviço registra aviso e cai no `contains` tradicional em vez de derrubar a busca com 500. Sem índice, de propósito: `unaccent(text)` é `STABLE` e função `STABLE` não pode entrar em expressão de índice sem wrapper `IMMUTABLE`; o caminho de upgrade (wrapper `IMMUTABLE` + GIN/pg_trgm) está documentado.
- **Alternativas rotuladas com a letra errada.** O formulário usava `positionLetter(index + 1)` sobre um índice já baseado em zero, então a primeira alternativa aparecia como **B** (depois C, D...) e a sexta como "6" em vez de F — a letra vista na tela não era a do gabarito. `positionLetter` passou a receber a posição 1-based, igual ao banco de questões e à posição gravada.

Além disso: o link do modo demonstração passou a ser absoluto (montado a partir de `FRONTEND_URL`) — link interno violava o contrato de atribuição em `http(s)` —, o `demoHits` estático foi removido, e `src/lib/source-link.ts` centraliza a regra de que só `http(s)` vira `href`, fechando o vetor de XSS de `javascript:` em resultado de busca.

- Testes: **321 aprovados em 22 arquivos** (era 299 em 21) — 8 novos e2e no `search.e2e-spec.ts` (busca sem acento com e sem acento, o mesmo filtro na listagem do banco, isolamento entre workspaces no caminho de SQL cru, link absoluto, `sourceUrl` de `localhost` aceito, esquemas não-`http(s)` recusados, exatamente uma alternativa correta na posição transcrita e recusa de questão sem gabarito), unitários do construtor de SQL/escape/fallback e cobertura de `questionAlternative.findMany`, `$queryRaw` e `where.id.in` no fake do Prisma. Typecheck, build e lint aprovados nos dois projetos.
- Documentação: `docs/BUSCA_WEB.md` passou a descrever a transcrição obrigatória, a regra de TLD do `sourceUrl`, a busca sem acento (com a estratégia de índice e o caminho de upgrade) e a interface.

## Atualização de 25/09/2026 — funcionalidade 10: Busca de questões na web

- Backend: módulo `SearchModule` com `GET /search/web` (busca) e `POST /search/save` (salvar no banco interno), ambos autenticados (`JwtAuthGuard` + `@CurrentUser()`). Busca por conteúdo (`q`), prova (`exam`), disciplina (`subject`), assunto (`topic`), dificuldade (`difficulty`) e limite (1–20, padrão 10).
- Dois provedores implementando `WebSearchProvider`: `GoogleCseSearchProvider` (Google Programmable Search Engine, com timeout via `AbortController` e tradução de HTTP 401/403/429/5xx em `WebSearchProviderError` com código) e `DemoWebSearchProvider` (modo demonstração, vasculha o banco acessível do usuário — pessoal + banco central). O `SearchService` escolhe o Google CSE quando `GOOGLE_CSE_ID` e `GOOGLE_CSE_API_KEY` existem e, sem elas, o modo demonstração.
- O response **sempre** explicita `provider` (`google-cse` | `demo`) e `demoMode` (boolean), para o cliente nunca confundir busca real com demonstração. A interface exibe um aviso explícito de modo demonstração e explica como ativar a busca real.
- Cada resultado devolve apenas metadados públicos (título, link, trecho), atribuição (`sourceName`, `sourceId`) e a **classificação automática** (disciplina, assunto, prova, ano e dificuldade) casada com o catálogo Lumina. O conteúdo integral nunca é baixado nem armazenado.
- `POST /search/save` reusa o pipeline real de importação (`QuestionImportService.importFromDtos`), que valida, classifica no catálogo e **deduplica** por conteúdo. O serviço força `sourceType=IMPORTED` e sobrescreve a origem informada no payload por `sourceName` = nome da fonte e `sourceId` = URL original — a atribuição nunca é perdida, mesmo que o cliente envie outra origem.
- Direitos autorais: a Lumina armazena apenas metadados públicos e o conteúdo **transcrito pelo usuário**. O `sourceUrl` passou a ser validado como URL http(s) real (estava sem validação, o que quebrava a rota com o `ValidationPipe` em modo estrito).
- Frontend: página "Buscar questões na web" (`/app/busca-web`) com formulário de filtros, cards com link para a fonte original, classificação, aviso de modo demonstração e ação "Salvar"; item adicionado ao menu lateral.
- Correções encontradas durante a validação (invisíveis ao typecheck): o controller usava `@Req()` em vez de `@CurrentUser()` **e não aplicava `@UseGuards(JwtAuthGuard)`** — as rotas ficavam desprotegidas; o `sourceUrl` do DTO não tinha decorador de validação; e o fake-prisma ignorava a cláusula `OR` usada no filtro da busca.
- Testes: **299 aprovados em 21 arquivos** (era 242) — 41 unitários (16 do Google CSE cobrindo configuração, mapeamento, limites e cada tradução de erro; 11 do provedor demo; 14 do `SearchService` cobrindo seleção de provedor, normalização de filtros, limites e a preservação de atribuição) e 16 e2e no fluxo HTTP completo (autenticação, validação, modo demo, classificação, filtros, workspace de destino e deduplicação). Typecheck e build aprovados nos dois projetos.
- Documentação: `docs/BUSCA_WEB.md` descreve a configuração opcional do Google CSE, a política de direitos autorais e o comportamento do modo demonstração.
- Pendente: validação visual no navegador (ferramenta indisponível neste ambiente). A entrega está validada via API e testes automatizados.

## Atualização de 23/09/2026 — funcionalidade 9: Banco de questões (estatísticas agregadas, gabarito comentado e questões semelhantes)

- O item 9 já possuía ~90% da base (CRUD, importação JSON/CSV, filtros, tentativas e favoritos). Esta entrega fecha as lacunas restantes: **estatísticas agregadas de acerto por questão**, **questões semelhantes**, **exibição do gabarito comentado na interface** e **campo "explicação" no formulário de criação/edição**.
- Backend: `QuestionStatsDto` (`attempts`, `correct`, `accuracyPercent`) presente na listagem (1 consulta agregada por página, sem N+1), no detalhe e no resultado da tentativa; `SimilarQuestionsDto` (`items`, `limit`) na rota `GET /questions/:id/similar`, rankeando por proximidade (mesmo assunto +10/+8, mesma disciplina +6/+3, mesmo exame +3/+2, mesma dificuldade +1), excluindo a própria questão, limitado aos workspaces acessíveis (pessoal + banco) e com limite clampado em 1–12 (default 5). Contagens via `countsByQuestionIds` (`findMany` + `select`, compatível com o fake de testes).
- Frontend: card de questão com badge de taxa de acerto (verde ≥60%, âmbar ≥40%, vermelho abaixo), gabarito comentado exibido após responder, seção "Questões semelhantes" com carregamento sob demanda (cards aninhados sem botão próprio, para não recursar) e textarea "Gabarito comentado" no formulário.
- Correção descoberta no build de produção (`tsc -p tsconfig.build.json`): o `findSimilar` não compilava — spreads de `OR` com `mode: 'insensitive'` quebravam a tipagem do Prisma e a chamada a `findMany` omitia `skip` (obrigatório em `FindManyOptions`). Corrigido com arrays `Prisma.QuestionWhereInput[]` construídos via `push` e `{ skip: 0, take: 60 }`. O `npm test` (vitest) não pegou porque transpila sem checagem de tipos — builds do backend voltaram a verificar os tipos.
- Testes: 8 novos casos em `questions.service.spec.ts` (stats na listagem/detalhe/tentativa; rankeamento do `findSimilar`, exclusão da própria questão, clamp do limite, fronteira de visibilidade e 404 para outro workspace) e cobertura e2e; suíte completa com **242 testes aprovados em 17 arquivos**; typecheck e build do aplicativo aprovados.
- Validação ao vivo (backend real em `localhost:3001` + Postgres configurado, sem navegador): script `validate-item9.mjs` com todos os checks positivos — criação de questão com explicação (eco no response), listagem com `stats`/`explanation` nos itens, tentativa correta e errada refletindo `attempts`/`correct`/`accuracyPercent` no resultado e no detalhe, `GET /questions/:id/similar` sem incluir a própria e com `limit` clampado em 12, e remoção da questão de teste (404 no detalhe). Permanece pendente apenas a validação visual da interface no navegador (ferramenta indisponível: `browser.disconnected`).
- Lacunas que dependem de evolução de catálogo (registradas no inventário): filtros por **subassunto/habilidade/banca** (não há modelo de dados para esses eixos) e **conteúdo UECE** (o mecanismo de importação está pronto; o conteúdo depende do catálogo).

## Atualização de 23/09/2026 — Cadastro de instituição na criação da conta

- A pedido do usuário, o cadastro de instituição deixou de existir no dashboard (passo pós-criação de usuário) e passou a acontecer **na criação da conta**: a opção "Sou instituição" agora coleta nome, e-mail institucional e telefone (opcional) além dos dados do responsável.
- Backend: `RegisterDto` aceita um objeto `institution` aninhado (validado por `ValidateNested`); `AuthService.register` cria o usuário como `DIRECTOR` e, **na mesma transação**, a instituição com workspace, os 4 cargos padrão (Diretor/Coordenador/Professor/Aluno) e o vínculo ACTIVE do responsável como Diretor. Conflito de e-mail institucional desfaz todo o cadastro.
- Regra de negócio: cadastro institucional não pode ser combinado com `accountType`/`teacherSubject` (400).
- Frontend: formulário completo em `Signup.tsx` para o perfil "instituição"; removido o bloco "Representa uma escola ou cursinho?" do dashboard (estado, handler e import correspondentes).
- Endpoint `POST /institutions` (autenticado) permanece disponível e reutiliza a mesma lógica transacional.
- Testes: 3 novos casos unitários em `auth.service.spec.ts` (DIRECTOR + instituição na mesma transação; rejeição de combinação com accountType; rollback quando o e-mail institucional já existe); 2 novos casos e2e em `auth.e2e-spec.ts`; fake do Prisma e2e estendido com os delegates `permission` e `institution.create`/`findUniqueOrThrow` usados pelo cadastro (o erro `Cannot read properties of undefined (reading 'findMany')` foi justamente esse gap do fake, não do código real).
- Verificações: typecheck e build do backend e do aplicativo aprovados; lint do aplicativo com zero erros e zero avisos; suíte de testes do backend com **234 aprovados em 17 arquivos**.
- Correção descoberta na validação ao vivo: instituições nasciam PENDING (default do schema) e a política de turmas exige instituição ACTIVE, sem existir fluxo de ativação — toda escola recém-cadastrada ficava impedida de gerir turmas (403 "A instituição não está ativa" em editar/arquivar/transferir). Corrigido: `InstitutionsService.createInTransaction` agora cria a instituição **ACTIVE** (vale para o cadastro na conta e para `POST /institutions`); asserção nova em `institutions.service.spec.ts`; instituições de teste antigas (QA/resíduo) foram ativadas no banco configurado para alinhar ao novo comportamento.
- Validação integrada ao vivo (backend real + Postgres configurado, sem navegador): cadastro institucional na conta (usuário nasce DIRECTOR, workspace institucional com cargo Diretor e permissões CLASS_MANAGE/MEMBER_MANAGE/REPORT_VIEW/ROLE_MANAGE), convite e aceite de professor como Professor ACTIVE, criação de turma caindo no workspace institucional, listagem vista por professor e diretor, edição (limite/série/descrição), arquivamento/desarquivamento com `includeArchived`, recusa de aluno independente sem vínculo (403 — regra aprovada de vínculo ativo), matrícula de aluno institucional por código após convite/aceite e painel do diretor com as contagens corretas. Permanece pendente apenas a validação visual da interface no navegador (ferramenta indisponível na sessão: `browser.disconnected`).

## Atualização de 22/09/2026 — funcionalidade 8: Gestão de turmas

- Retomada a implementação iniciada nas alterações locais posteriores ao commit `db3087a` (item 7).
- Integrada a página `/app/turmas`, acessível pelo dashboard e pela área de simulados.
- Implementados edição de nome/descrição/limite, arquivamento e desarquivamento, vínculo e remoção de professores/alunos por conta cadastrada, associação de disciplina, período letivo e ano/série.
- Detalhe da turma apresenta composição e histórico de atividades, questões e contagem de entregas. A interface distingue consulta de gerenciamento conforme a autorização retornada pela API.
- Listagem permite consultar turmas arquivadas e turmas institucionais para usuários com `CLASS_MANAGE`. Novos vínculos são recusados em turmas arquivadas.
- Banco: `prisma migrate deploy` confirmou as 22 migrações aplicadas, incluindo `20260921120000_add_class_organization`.
- Lotação: ingresso por código e matrícula direta usam a mesma transação, com bloqueio da linha da turma antes da contagem. Matrículas já existentes são idempotentes mesmo em turma lotada.
- Edição: limpar disciplina, período, ano/série e limite agora persiste a remoção do valor, em vez de manter silenciosamente o anterior.
- Revisão adicional: transferência recusa destino arquivado e revalida vagas dentro da transação; edição não permite reduzir limite abaixo das matrículas; nome nulo retorna erro de validação de negócio.
- Regra aprovada pelo usuário: turmas institucionais exigem vínculo ativo para ingresso, matrícula direta e transferência. Consulta/gestão e inclusão de professor também verificam vínculo institucional. Turmas técnicas de professores independentes preservam ingresso sem convite institucional.
- Validação: suíte completa com 227 testes aprovados em 17 arquivos; após adicionar duas regressões, os 42 testes dos módulos de simulados e convites passaram. Builds de backend e aplicativo aprovados; typecheck do backend aprovado; lint do aplicativo com zero erros e zero avisos. Corrigida configuração Oxc/SWC do Vitest e separados componentes React de exports auxiliares para Fast Refresh.
- Pendente antes de encerrar o item: validação autenticada da nova interface no navegador (ferramenta indisponível nesta sessão: `browser.disconnected`). A criação de turma continua no fluxo existente de simulados.

## Atualização de 20/09/2026 — funcionalidade 7: Gestão de instituições

- Implementado: cadastro de instituição (POST /institutions) — cria a Institution + Workspace, semeia os 4 cargos institucionais padrão (Diretor, Coordenador, Professor, Aluno) e vincula quem criou como Diretor.
- Implementado: convites institucionais por e-mail (Diretor/Coordenador convidam; a pessoa precisa já ter conta na Lumina — convite para e-mail sem conta ainda não é suportado) com aceite explícito pelo convidado.
- Implementado: transferência de aluno entre turmas da mesma instituição.
- Corrigido: turma criada por professor institucional agora nasce no workspace da instituição (antes caía num pseudo-workspace individual por professor, invisível para coordenação/direção).
- Corrigido: schema drift do model Simulation (assessmentType/dueAt ausentes do schema.prisma apesar de já aplicados no banco) — corrigia um 500 em GET /simulations para qualquer usuário.
- Pendente: convite para e-mail ainda sem conta cadastrada; conceito de "ano letivo" tratado hoje via período letivo (Fase 5), sem campo dedicado; interface de gestão de membros/turmas ainda concentrada no painel do diretor, sem tela própria de "gestão de instituições".
- Validação: 207 testes aprovados, typecheck e build dos três projetos, fluxo completo (cadastro → convite → aceite → transferência de turma) verificado ao vivo contra o banco configurado.

## Atualização de 20/09/2026 — funcionalidade 6: Painel do diretor

- Implementado: indicadores gerais da instituição com turmas, alunos, professores, entregas, média acadêmica e membros ativos.
- Implementado: desempenho consolidado por turma e disciplina.
- Implementado: evolução acadêmica mensal com volume de entregas.
- Implementado: relatório consolidado exportável em CSV.
- Implementado: gestão de usuários institucionais com ativação e suspensão de vínculos.
- Implementado: conversão entre professor e coordenador, exigindo disciplina ao definir um professor.
- Implementado: visão estratégica com indicação da turma e disciplina que demandam maior atenção.
- Segurança: somente diretor com vínculo institucional ativo acessa os dados; a própria conta do diretor não pode ser alterada pelo painel.
- Validação: 186 testes aprovados, typecheck do backend e frontend e build de produção do aplicativo.
## Atualização de 20/09/2026 — funcionalidade 5: Painel do coordenador

- Implementado: visão geral das turmas e comparação por desempenho.
- Implementado: acompanhamento de professores e disciplinas vinculadas.
- Implementado: desempenho consolidado por disciplina, média institucional e alunos em atenção.
- Implementado: relatório pedagógico exportável em CSV.
- Implementado: cadastro, histórico e ativação de períodos letivos, limitado ao coordenador vinculado a uma instituição ativa.
- Validação: 185 testes aprovados, typecheck dos três projetos, build completo, schema Prisma válido e 21 migrações aplicadas.


## Referência geral

O inventário completo enviado pelo usuário está preservado em [Funcionalidades gerais](docs/FUNCIONALIDADES_GERAIS.txt). A ordem numerada desse documento orienta as próximas entregas. Na seção 1, o encerramento de todas as sessões foi implementado com revogação de tokens por versão de sessão. A migração `20260916030000_add_session_version` foi aplicada no banco configurado em 16/09/2026. O gerenciamento individual de sessões permite listar e encerrar uma sessão; a migração `20260917010000_add_auth_sessions` foi aplicada no banco configurado em 17/09/2026.

Em 17/09/2026, o perfil acadêmico ganhou etapa de ensino, série/ano e escola/curso, editáveis no perfil e retornados pela API autenticada. A migração `20260918010000_add_academic_profile` foi aplicada no banco configurado.

O perfil também permite informar curso desejado e universidade-alvo. O vestibular-alvo existente no cronograma agora pode ser consultado, editado e limpo na página de perfil, com data opcional. A migração `20260918020000_add_academic_goals` foi aplicada no banco configurado.

As preferências de estudo incluem melhor período, duração desejada por sessão e quantidade de dias por semana. A migração `20260918030000_add_study_preferences` foi aplicada no banco configurado em 18/09/2026.

As configurações da conta permitem trocar a senha local mediante confirmação da senha atual. A alteração revoga todas as sessões e exige novo login.

Os tipos de conta são persistidos como aluno independente, aluno institucional, professor, coordenador, diretor ou administrador. O cadastro público permite somente aluno independente e professor; perfis institucionais e administrativos ficam reservados aos futuros fluxos de gestão e convites. A migração `20260918040000_add_account_types` foi aplicada no banco configurado em 18/09/2026.

## Fase 2 — Controle de acesso — concluída

Concluída em 18/09/2026 com infraestrutura RBAC reutilizável por workspace, gestão de cargos e permissões, consulta autenticada dos acessos efetivos e rotas protegidas. Workspaces pessoais concedem acesso de proprietário; workspaces institucionais exigem vínculo ativo e todas as permissões declaradas. Os escopos de turma e aluno validam coordenação, docência, matrícula ou permissão institucional sem expor alunos de outras turmas. O dashboard apresenta experiências distintas para estudante, professor, coordenador, diretor e administrador. A migração `20260918050000_seed_rbac_permissions` registra o catálogo inicial de permissões.

## Atualização de 16/09/2026 — simulados

- Implementado: professor pode criar turma e compartilhar código de ingresso; estudante pode entrar na turma.
- Implementado: estudante cria simulado pessoal, professor cria simulado para sua turma, escolhendo de 1 a 90 questões do banco.
- Implementado: lista de simulados disponíveis, prova imprimível e cartão-resposta com identificação do simulado, ordem estável e bolinhas para marcar.
- Implementado: envio digital único por estudante, correção com gabarito preservado no simulado e resultado por questão com total de acertos.
- Migrações `20260916010000_add_simulations` e `20260916020000_add_simulation_submissions` aplicadas no banco configurado em 16/09/2026.
- Pendente: teste autenticado no navegador, leitura do cartão por câmera e analytics por turma/assunto.


Atualizado em 26/08/2026 a partir do código, rotas, schema Prisma e testes do repositório.

## Implementado

- Autenticação: cadastro com e-mail/senha, login, Google OAuth, criação/vinculação de conta Google, recuperação e redefinição de senha, verificação e reenvio de e-mail, JWT e consulta da sessão.
- Perfil: consulta e edição de nome, sobrenome, username, telefone, nascimento e bio; foto local com clique/drag and drop, recorte e compactação no navegador.
- Banco de questões: cadastro, edição, exclusão, importação em lote por arquivo JSON/CSV com relatório, destino protegido para o banco central, deduplicação, alternativas, resposta e correção automática, estatísticas agregadas de acerto por questão, questões semelhantes rankeadas por proximidade e gabarito comentado por questão (campo "explicação" no formulário).
- Catálogo educacional: disciplinas, assuntos, provas/vestibulares, ano, dificuldade e classificação estruturada.
- Histórico de questões: tentativas, acertos/erros, tempo de resposta, favoritos, progresso e desempenho por disciplina/assunto.
- Cronograma pessoal: vestibular-alvo, dias e tempo disponível, catálogo com 15 disciplinas do ENEM, divisão por matéria, sessões, tarefas, conclusão, reagendamento, sala exclusiva de cronômetro e progresso agregado.
- Fundações institucionais no banco: instituições, workspaces, membros, cargos, permissões, turmas, professores e alunos.
- Landing page pública e documentação Swagger da API.
- Cálculo mental rápido: primeira implementação de interface e API com rodadas cronometradas, dificuldade adaptativa, desafio diário e histórico por conta. Ativação depende da migração do banco; detalhes em [Cálculo mental](docs/CALCULO_MENTAL.md).

## Parcial

- Redações: editor, temas, salvamento automático, histórico de versões e importação de texto UTF-8 com prévia. Migração aplicada no banco local em 15/09/2026; correção por IA/professor e scanner ainda pendentes.
- Catálogo de propostas de redação do ENEM 2011–2025 e cadastro de professor com matéria para criação de conteúdo autoral pessoal. Consulte [Redações, professores e scanner](docs/REDAÇÕES_PROFESSORES_SCANNER.md); a migração desta etapa ainda depende da disponibilidade do PostgreSQL local.
- Fase 3 — Painel do aluno — concluída: visão geral, notas e simulados pendentes, progresso por matéria e assunto/habilidade, metas acadêmicas, cronograma, atividades, recomendação determinística, históricos de estudos, questões, simulados e redações, tempo estudado e sequência de dias.
- Fase 4 — Painel do professor — concluída: turmas e alunos, desempenho individual e geral, relatórios CSV, criação de atividades, listas, provas e simulados com prazo, correção automática, acompanhamento periódico das entregas, alertas pedagógicos e conteúdos com baixo desempenho.
- Fase 5 — Painel do coordenador — concluída: visão institucional das turmas, comparação de desempenho, acompanhamento dos professores, relatórios pedagógicos e gestão de períodos letivos.
- Fase 6 — Painel do diretor — concluída: indicadores institucionais, desempenho acadêmico, evolução mensal, relatório consolidado, gestão de usuários e visão estratégica.
- LuminIA conversacional: interface flutuante autenticada, responsiva e com adaptador isolado pronta; ainda falta conectar o backend e o provedor de IA.
- Cronograma adaptativo: há reorganização de tarefas perdidas, porém ainda não usa IA nem dificuldades acadêmicas para gerar/adaptar o plano.
- Instituições: cadastro, convites (só para e-mail já cadastrado), transferência entre turmas e gestão de membros (painel do diretor) implementados; código de turma e períodos letivos já existiam. Falta convite para e-mail sem conta e tela dedicada de gestão de instituições. Edição/arquivamento de turmas já têm interface própria no item 8.
- Provas antigas: o catálogo de exames e suas questões existe; faltam experiência de prova completa, cadernos, gabaritos e comparação entre provas.
- Recomendações: os dados de desempenho necessários já são coletados; falta o motor adaptativo e a interface de recomendações.
- Perfil: a foto local é armazenada como imagem compactada no perfil; armazenamento de objetos dedicado ainda não existe. Preferências de estudo possuem persistência e edição desde 18/09/2026.

## Não iniciado

- Janela de aplicação, cronômetro de prova e relatórios avançados pós-simulado.
- Scanner de cartão-resposta, câmera, visão computacional e correção física.
- Explicações personalizadas da LuminIA integradas ao histórico acadêmico.
- Correção de redações por IA/professor, competências, notas e evolução.
- Administração interna da plataforma.
- Exportação institucional em PDF/Excel e comparações históricas entre períodos.
- Mapa de Domínio e Lumina Score.
- Agenda/calendário unificado, lembretes e notificações.
- Metas independentes, gamificação, XP, níveis, conquistas, streaks e desafios.
- Planos, assinaturas, pagamentos e cobrança institucional.
- Denúncias, suporte e gestão editorial completa dos conteúdos.

## Prioridade imediata: correções por captura e texto

1. Correção de redação por scanner no estilo CamScanner: câmera ou arquivo, detecção das bordas, recorte e correção de perspectiva, melhoria de contraste/sombras, suporte a várias páginas, OCR, revisão da transcrição e correção pelas competências do ENEM. O original e o texto reconhecido devem permanecer vinculados e toda baixa confiança precisa de confirmação manual.
2. Correção de redação digitada/transcrita dentro da plataforma: editor com salvamento automático, contagem de palavras, versões, seleção de tema e o mesmo relatório por competências usado pelo scanner, permitindo comparar evolução sem depender de imagem.
3. Correção de gabaritos por scanner: modelos identificáveis de cartão-resposta, captura guiada, alinhamento pelos marcadores, leitura de marcações, nível de confiança por resposta, revisão manual das ambíguas e vínculo automático ao simulado/lista antes de calcular nota e desempenho.
4. Treino de raciocínio lógico e cálculo mental rápido: rodadas curtas com operações matemáticas básicas, resposta contra o tempo, sequência de acertos e dificuldade adaptativa. O módulo deve registrar precisão, tempo médio por resposta, evolução por tipo de operação e erros recorrentes, com modos de treino livre e desafio diário inspirados na dinâmica de resposta rápida citada como referência.

Os três fluxos de correção por captura/texto devem compartilhar uma esteira de captura e processamento assíncrono, com estados visíveis, repetição segura, trilha de auditoria, proteção dos arquivos enviados e exclusão configurável. A correção por IA deve apresentar justificativas e permitir revisão humana; uma nota não deve ser tratada como definitiva quando a imagem ou o OCR estiverem abaixo do nível mínimo de confiança.

## Ordem recomendada das demais entregas

5. Criar listas/cadernos e simulados, base necessária para associar gabaritos digitalizados.
6. Finalizar instituições (API e interface de membros, cargos, permissões, turmas e códigos de entrada).
7. Consolidar dashboard e analytics do aluno com os dados já coletados.
8. Implementar Mapa de Domínio e recomendações determinísticas antes da LuminIA generativa.
9. Adicionar provas antigas completas, com imagens, revisão editorial e comparação entre edições.
10. Construir dashboards institucionais e relatórios.
11. Integrar LuminIA conversacional, notificações, gamificação e pagamentos após os fluxos centrais estarem maduros.

Cada item deve ser entregue verticalmente: migração/schema, regras de autorização, API, interface, testes e observabilidade.
