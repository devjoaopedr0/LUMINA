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

## Atualização de 26/09/2026 — itens 14, 15 e 16: Simulados com cronômetro, modo prova real e simulado adaptativo

Entrega vertical dos itens 14 (Simulados), 15 (Modo prova real) e 16 (Simulado adaptativo) do inventário. A base de simulados já existia (criação, listagem, envio, correção, cartão-resposta); esta entrega acrescenta o cronômetro, o modo "prova real" e o simulado adaptativo com algoritmo IRT simplificado.

### Itens 14 e 15: Cronômetro e Modo Prova Real

- **Migração** `20260926211841_add_simulation_timer_real_exam`:
  - `simulation.duration_minutes` (Int, opcional): duração em minutos
  - `simulation.is_real_exam` (Boolean, default false): modo prova real
  - `simulation.started_at` (DateTime): quando o aluno iniciou a resolução
  - `simulation_item.area` (String, opcional): área do conhecimento (estilo ENEM)

- **Backend** (`SimulationsService`):
  - `CreateSimulationDto` com `durationMinutes` (1–600) e `isRealExam`
  - Validação: modo prova real exige duração
  - `submit` grava `startedAt` no submission
  - `submission` devolve `startedAt`, `timeSpentMinutes` calculado, `area` por item
  - `list`/`get` expõem `durationMinutes` e `isRealExam`

- **Frontend** (`Simulations.tsx`):
  - Cronômetro visual (MM:SS) no header durante a resolução
  - **Modo prova real**: timer obrigatório, badge vermelho, envio automático ao fim do tempo, botão manual desabilitado enquanto timer roda
  - Área do conhecimento exibida no cartão da questão (print + responder)
  - Formulário de criação: campos Duração (min) e checkbox "Modo prova real"
  - Lista de simulados mostra badges de duração e "Prova real"
  - Resultado inclui tempo gasto e hora de início

### Item 16: Simulado Adaptativo (IRT simplificado)

- **Migração** `20260926213730_add_adaptive_simulation`:
  - `adaptive_simulation_sessions`: `userId`, `examId`, `status` (IN_PROGRESS/COMPLETED/ABANDONED), `estimatedAbility` (0–1), `skills` (JSON por habilidade)
  - `adaptive_simulation_steps`: `sessionId`, `userId`, `questionId`, `difficulty`, `skill`, `subSkill`, `selectedPosition`, `isCorrect`, `abilityBefore`, `abilityAfter`, `timeSpentSeconds`
  - `AssessmentType.ADAPTIVE` adicionado ao enum

- **Backend** (`AdaptiveSimulationService`):
  - `start/examId` → cria sessão com `ability = 0.5`
  - `nextQuestion`: escolhe questão cuja dificuldade mais aproxima da `ability` atual; prioriza habilidades não testadas
  - `answer`: atualiza `ability` via IRT 1PL simplificado — `ability += (isCorrect ? +1 : -1) * stepSize * (1 - difficultyFactor)`; grava step com `abilityBefore/After`
  - Critério de parada: 20 questões OU 3 habilidades "fortes" (ability > 0.8, total ≥ 2) OU 3 "fracas" (ability < 0.2, total ≥ 2)
  - `summary`: diagnóstico com `strongAreas`, `weakAreas`, tabela por habilidade (acertos, total, precisão, ability)
  - Endpoints: `POST /adaptive/start`, `GET /adaptive/:id/next`, `POST /adaptive/:id/answer`, `POST /adaptive/:id/finish`, `POST /adaptive/:id/abandon`, `GET /adaptive/:id/summary`, `GET /adaptive`

- **Frontend** (`AdaptiveSimulation.tsx`):
  - Página `/app/simulados/adaptativo`: lista de sessões, nova sessão com `examId` opcional
  - Durante a sessão: cronômetro, questão atual com alternativas, habilidade e dificuldade visíveis
  - Feedback imediato: certo/errado + mudança de ability
  - Diagnóstico final: pontos fortes, lacunas, tabela detalhada por habilidade

- **Testes**: suíte backend **404 testes / 24 arquivos verdes**; app **4 checks verdes**; builds limpos nos dois projetos.

## Atualização de 26/09/2026 — item 17: Scanner de gabarito

Entrega vertical do item 17 do inventário. A base para correção de cartões-resposta físicos via foto/upload.

- **Migração** `20260926215649_add_answer_sheet_scanner`:
  - `answer_sheet_templates`: template de gabarito com `markersJson` (4 cantos) e `layoutJson` (bolhas por questão)
  - `answer_sheet_uploads`: upload de imagem pelo aluno/professor, link com template e simulado
  - `answer_sheet_processings`: resultado do OCR — `detectedAnswers`, `confidenceJson`, `warningsJson`, `totalQuestions`, `answeredCount`, `lowConfidenceCount`
  - `answer_sheet_submissions`: submissão final linkada ao processing, com `finalAnswers` (após revisão humana), `correct`/`total`
  - Enums: `AnswerSheetStatus`, `AnswerSheetProcessingStatus`
  - Relações User: `answerSheetUploads`, `answerSheetSubmissions`, `answerSheetReviews`
  - Relações Simulation: `answerSheetUploads`, `answerSheetSubmissions`

- **Service** (`AnswerSheetService`):
  - CRUD de templates, presigned URL, processamento assíncrono (simulado), detecção com confiança/warnings, auto-submissão, revisão humana, listagem/stats

- **Controller**: 9 endpoints: templates CRUD, presigned URL, upload complete, listagem uploads/processamentos, review, stats

- **Testes**: backend 404/24 ✓, app 4 checks ✓, builds limpos

## Atualização de 26/09/2026 — ## Atualização de 26/09/2026 — item 18: Scanner de questões

Entrega vertical do item 18 do inventário. Scanner de questões impressas: foto → OCR → classificação → LuminIA → questão oficial ou caderno de erros.

- **Migração** `20260927001348_add_question_scanner`:
  - `question_scan_uploads`: upload de imagem pelo aluno
  - `question_scan_processings`: resultado OCR + classificação (`stemText`, `alternativesJson`, `subject`, `topic`, `difficulty`, `explanationJson`, `confidence`, `warningsJson`)
  - `question_scan_results`: questão salva (pode virar questão oficial ou entrar no caderno de erros)
  - Enums: `QuestionScanStatus`, `QuestionScanProcessingStatus`
  - Relações: `User.questionScanUploads`, `User.questionScanResults`, `Question.scanResults`, `ErrorNotebookEntry.scanResults`

- **Service** (`QuestionScanService`):
  - Presigned upload URL
  - Processamento assíncrono simulado: OCR + classificação disciplina/assunto/dificuldade + explicação LuminIA por alternativa
  - Detecção de warnings (baixa confiança, resolução baixa, orientação)
  - `saveAsQuestion`: cria questão oficial no banco (com `exam` opcional)
  - `saveToErrorNotebook`: adiciona direto ao caderno de erros (`sourceType=IMPORTED`, `reason` opcional)
  - Listagem/uploads/processing/stats

- **Endpoints** (Controller):
  - `POST /question-scans/upload-url` (presigned)
  - `POST /question-scans/upload/:id/complete` (dispara processamento)
  - `GET /question-scans/uploads`, `GET /question-scans/processing/:id`
  - `POST /question-scans/processing/:id/save-question` (cria questão oficial)
  - `POST /question-scans/processing/:id/save-error-notebook` (adiciona ao caderno)
  - `GET /question-scans/stats`

- **Frontend** (`QuestionScanner.tsx`):
  - Página `/app/question-scanner`: upload com pré-visualização, polling de processamento
  - Resultado: enunciado, alternativas, disciplina/assunto/dificuldade, confiança, warnings
  - Explicação LuminIA por alternativa
  - Botões: "Criar questão oficial" (salva no banco) e "Adicionar ao caderno de erros" (com motivo)
  - Aba "Histórico" com lista de digitalizações e status

- **Testes**: backend 404/24 ✓, app 4 checks ✓, builds limpos

- **Próximos passos**: worker real OCR (Tesseract/Sharp), LuminIA real para explicação, UI de revisão com canvas, buscar questões semelhantes

## Não iniciado

- Provas antigas (item 19): ENEM, vestibulares, UECE, filtro por ano/área, resolver online, gabarito, histórico, estatísticas
- Redação (item 20): enviar/digitar/foto, salvamento automático, contagem palavras, correção por competências ENEM, feedback, evolução
- LuminIA conversacional (itens 21-24): explicação de conteúdos, explicação de questões, modo socrático, recomendação de videoaulas
- Scanner de cartão-resposta (item 17 completo, item 18 feito): worker real OCR (Tesseract/Sharp), LuminIA real para explicação, UI de revisão com canvas, buscar questões semelhantes
- Mapa de Domínio e Lumina Score
- Agenda/calendário unificado, lembretes e notificações
- Metas independentes, gamificação, XP, níveis, conquistas, streaks e desafios
- Planos, assinaturas, pagamentos e cobrança institucional
- Denúncias, suporte e gestão editorial completa dos conteúdos

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
## AtualizaÃ§Ã£o de 27/09/2026 â€” item 19: Provas antigas

Entrega vertical do item 19 do inventÃ¡rio. ExperiÃªncia completa de provas antigas: ENEM, vestibulares, UECE com PDF/imagens, gabarito oficial, caderno de questÃµes, navegaÃ§Ã£o por pÃ¡ginas, comparaÃ§Ã£o entre ediÃ§Ãµes.

- **MigraÃ§Ã£o** 20260927011239_add_past_exams:
  - exam_papers: ediÃ§Ã£o de prova (ex.: ENEM 2023) com PDF, imagens das pÃ¡ginas, metadados, gabarito, caderno
  - exam_paper_pages: pÃ¡ginas individuais com imagem, dimensÃµes, OCR
  - exam_paper_questions: mapeamento questÃ£o â†’ nÃºmero na prova, pÃ¡gina, coordenadas, Ã¡rea
  - exam_paper_comparisons: comparaÃ§Ã£o entre ediÃ§Ãµes (questÃµes similares, mudanÃ§a de dificuldade, novos tÃ³picos)
  - Enum ExamPaperStatus (DRAFT, PUBLISHED, ARCHIVED)
  - RelaÃ§Ãµes: Exam.papers, ExamPaper.pages/questions/comparisons, Question.examPaperQuestions

- **PrÃ³ximos passos**: UI de navegaÃ§Ã£o da prova (PDF viewer, paginaÃ§Ã£o), busca por questÃ£o dentro da prova, importaÃ§Ã£o em lote de PDFs oficiais, geraÃ§Ã£o automÃ¡tica de comparaÃ§Ãµes.

## AtualizaÃ§Ã£o de 27/09/2026 â€” item 20: RedaÃ§Ã£o

Entrega vertical do item 20 do inventÃ¡rio. CorreÃ§Ã£o de redaÃ§Ã£o por competÃªncias ENEM (C1 a C5), versionamento, feedback IA/professor, sugestÃµes de melhoria.

- **MigraÃ§Ã£o** 20260927011239_add_past_exams (mesma migraÃ§Ã£o):
  - essay_corrections: correÃ§Ã£o por competÃªncias (C1-C5), nota total, status, corretor (IA/professor), confianÃ§a, feedback geral
  - essay_correction_details: detalhe por competÃªncia (C1-C5) com nota, justificativa, evidÃªncias
  - essay_versions: versionamento automÃ¡tico a cada salvamento (conteÃºdo, contagem de palavras)
  - essay_feedbacks: feedbacks tipados (AI_SUGGESTION, TEACHER_COMMENT, PEER_REVIEW) com ancoragem a trecho
  - Enum EssayCorrectionStatus (PENDING, IN_PROGRESS, COMPLETED, FAILED)
  - RelaÃ§Ãµes: Essay.correction/versions/feedbacks, User.essayFeedbacks

- **PrÃ³ximos passos**: UI do editor de redaÃ§Ã£o (contador de palavras, salvamento automÃ¡tico), integraÃ§Ã£o com IA para correÃ§Ã£o automÃ¡tica por competÃªncias, UI de revisÃ£o do professor, relatÃ³rio de evoluÃ§Ã£o por competÃªncia ao longo do tempo.

## Atualização de 27/09/2026 — itens 21, 22 e 23 (cadernos e modelos de redação)

Fechamento dos itens 21, 22 e 23 do inventário, com o app inteiro de pé
(backend 3001 + frontend 5174) e as páginas novas validadas no navegador.

### Item 21 — Caderno de fórmulas

- **Migração** 20260927232158_add_formulas_repertoires:
  - formulas: expressão em LaTeX, disciplina, assunto, anotação pessoal, favorito
  - Relação User.formulas (onDelete: Cascade)
  - Índices por (userId, discipline) e (userId, isFavorite)
- **API** `GET/POST /formulas`, `GET/PATCH/DELETE /formulas/:id`
  - Toda leitura/edição filtra por (id, userId): intruso leva 404, sem vazar existência
  - DTOs com `whitelist`/`forbidNonWhitelisted`: disciplina fora da lista é
    recusada e assunto em branco é normalizado para nulo
- **Interface** `/app/caderno-formulas`: formulário, edição em linha, favoritos,
  busca por nome/LaTeX/assunto, filtro por disciplina, item de menu na lateral
- **Testes** 5 casos (padrão, validação, update parcial, intruso, exclusão)

### Item 22 — Caderno de repertórios

- **Migração** 20260927232158_add_formulas_repertoires (mesma migração):
  - repertoires: título, resumo, fonte, ano, tema, palavras-chave, dominado
  - Relação User.repertoires (onDelete: Cascade)
  - Índices por (userId, theme) e (userId, isStudied)
- **API** `GET/POST /repertoires`, `GET/PATCH/DELETE /repertoires/:id`
  - Palavras-chave normalizadas (minúsculas, sem duplicata, teto de 20)
- **Interface** `/app/caderno-repertorio`: chips de palavra-chave com Enter,
  filtro por tema, marcação de dominado, item de menu na lateral
- **Testes** 4 casos (padrão, validação, dominado, intruso)

### Item 23 — Modelos de redação nota mil

- **Migração** 20260927120000_add_essay_models: essay_models (exame, ano, tema,
  texto, nota por competência, total, PDF, destaques)
- **API** `GET /essays/models/list` (filtro por ano/exame/tema, paginado),
  `GET /essays/models/:id`
- **Interface** `/app/redacoes/modelos`: lista com nota por competência, detalhe
  com o texto e as anotações por competência, comparação lado a lado com a
  redação do aluno, link para o PDF oficial, item de menu na lateral
- **Testes** cobertos pela suíte de essays (biblioteca pública, sem vínculo com usuário)

### Item 19 (complemento) — Provas anteriores

- **API** `GET /exam-papers`, `/exam-papers/:id`, `/exam-papers/:id/pages`,
  `/exam-papers/:id/questions`, `/exam-papers/compare?baseId=&compareId=`
  - Movidas para o QuestionCatalogService (tinham ficado com um controller
    duplicado em /notebooks, sem a checagem de workspace)
  - `compare` mede a repetição de questões entre duas edições do mesmo vestibular
  - Prova não publicada responde 404, como se não existisse
- **Interface** `/app/provas-antigas`: lista, páginas, questões mapeadas e o
  bloco de comparação entre edições

### Correções

- `QuestionScanService.listUploads` pedia `result` como relação do upload, mas
  ela é do processing: a rota devolvia 500. Agora aninha
  `processing: { include: { result: true } }`
- Scanner de gabarito chamava `/api/simulations` (prefixo inexistente, 404 no
  console). Passa a usar o cliente `apiSimulations`
- Tipos de `api.ts` alinhados ao schema real (markersJson é objeto indexado
  por nome, e não array; detectedAnswers/confidenceJson com chave string)
- `NEEDS_REVIEW` pertence ao status do upload, não do processing: a tela de
  revisão do gabarito passou a ler o upload

### Estado da suíte

- Backend: 426 testes / 27 arquivos, typecheck limpo
- Frontend: build (tsc -b + vite build) limpo, oxlint sem erros,
  4 checks de node verdes
- Validação visual (Playwright): 7 páginas carregadas sem erro de console nem
  HTTP 4xx/5xx; CRUD completo de fórmula e de repertório exercitado no navegador
