# Cronograma adaptativo — design (fases 1–5 implementadas)

Este documento projeta a reformulação do cronograma de estudos a partir da
especificação funcional recebida (aluno → "o que estudar hoje, quanto tempo e
por quê"). Nada aqui está construído ainda — é o plano para orientar as
próximas sessões. Segue o mesmo espírito dos outros docs de `docs/`, mas
descrito ANTES da implementação, não depois.

---

## 1. Onde estamos hoje (o que já existe e o que falta)

O cronograma atual (`lumina-backend/src/schedules/`) já resolve uma fatia
real do problema, mas de forma **estática**, não adaptativa:

| Já existe | Arquivo | Limite frente à spec |
| --- | --- | --- |
| Cadastro de disponibilidade (dias/minutos por dia) | `CreateStudyScheduleDto` | Não pergunta objetivo, curso-alvo ou nível — não há onboarding (seção 3) |
| Alocação diária proporcional a `targetHours` por matéria | `SchedulesService.buildSessions()` | **Fixa por todo o período** — a mesma proporção todo dia, do primeiro ao último. Não olha desempenho, incidência ou prazo (seções 6, 7, 15) |
| Tarefa por matéria (`StudyTask.subjectId`) | schema | **Não tem `topicId`** — a granularidade para de existir no nível de matéria; não dá para priorizar "Funções" dentro de Matemática (seção 4) |
| Cronômetro por matéria (`StudyTimeLog`) | schema, `logSubjectTime` | Não distingue tipo de atividade (teoria/questões/revisão) — seção 5 |
| Reagendar tarefa perdida | `SchedulesService.rescheduleMissed` | Só reagenda a MESMA tarefa; não redistribui o cronograma inteiro (seção 8) |
| Painel de progresso (`ProgressPanel`, `StudyProgress`) | frontend + schema | Cobre boa parte da seção 18 (indicadores) já |
| Revisão espaçada com `reviewScheduledAt`/`due` | `ErrorNotebookEntry` (caderno de erros) | Já resolvido **para questões erradas** — é o padrão a reaproveitar para revisão de conteúdo (seção 14), não uma peça nova |
| Chat LuminIA | `AiService`, `AiChatRequestDto` | **Sem contexto nenhum** — `sendMessage(dto)` não recebe nada do aluno. Não dá para responder "por que você colocou matemática hoje" sem isso (seção 11) |
| Catálogo de conteúdos por matéria (ENEM) | `prisma/seed-data/study-subject-topics.ts` | É só um arquivo de dados — **não é tabela**, não tem `id`, não pode ser referenciado por FK ainda |

Ou seja: a infraestrutura de "cronograma como grade de horário" está pronta;
falta a camada de **decisão** (o que priorizar, quando revisar, quando
avançar de fase) — que é o miolo da spec.

---

## 2. Peça central: `TopicMastery`

Toda a seção 6 (priorização), 7 (adaptação), 13 (progressão) e 14 (revisão
espaçada) depende de uma coisa que hoje não existe: **saber o que o aluno
sabe, por tópico**. Sem isso, "priorizar por desempenho" não tem dado para
funcionar com.

```prisma
/// Estado de domínio do aluno em um tópico — a peça que faltava para
/// priorizar o cronograma por desempenho de verdade (em vez de só por
/// horas-alvo). Uma linha por (aluno, tópico).
model TopicMastery {
  id                String       @id @default(uuid()) @db.Uuid
  userId            String       @map("user_id") @db.Uuid
  subjectId         String       @map("subject_id") @db.Uuid
  topicId           String       @map("topic_id") @db.Uuid
  /// 0-100, calculado a partir de tentativas de questão + simulados
  /// (ver §3). Não é só "% de acerto bruto" — pesa recência.
  masteryScore      Int          @default(0)
  attempts          Int          @default(0)
  correctAttempts   Int          @default(0)
  /// Streak de acertos seguidos — mesma lógica do caderno de erros
  /// (ERROR_NOTEBOOK_MASTERED_STREAK), reaproveitada aqui.
  correctStreak     Int          @default(0)
  status            TopicMasteryStatus @default(NAO_ESTUDADO)
  lastStudiedAt     DateTime?    @map("last_studied_at")
  /// Próxima revisão espaçada — mesmo campo/semântica de
  /// ErrorNotebookEntry.reviewScheduledAt (comparação por dia, meia-noite UTC).
  nextReviewAt      DateTime?    @map("next_review_at")
  /// Intervalo de dias da última revisão (1, 3, 7, 14, 30, ...) — cresce
  /// quando o aluno acerta a revisão, volta ao início quando erra.
  reviewIntervalDays Int         @default(1) @map("review_interval_days")
  createdAt         DateTime     @default(now()) @map("created_at")
  updatedAt         DateTime     @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject Subject @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  topic   Topic   @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@unique([userId, topicId])
  @@index([userId, status])
  @@index([userId, nextReviewAt])
  @@map("topic_masteries")
}

enum TopicMasteryStatus {
  NAO_ESTUDADO
  APRENDENDO
  PRATICANDO
  DOMINADO
  PRECISA_REFORCO  // domínio que caiu depois de erros novos
}
```

**Por que `Subject`/`Topic` (banco de questões) e não `StudySubject`
(cronograma)?** Porque o desempenho nasce das QUESTÕES (`Question.subjectId`/
`topicId`), e é o único lugar com granularidade de tópico hoje. `StudyTask`
passa a ganhar `topicId?` (opcional — Redação e "revisão geral" não têm
tópico) apontando para o MESMO `Topic`, fechando o elo:

```
Question (subjectId, topicId) → tentativas → TopicMastery (masteryScore)
                                                    ↓
                                          gera StudyTask (topicId)
```

Isso também resolve o `study-subject-topics.ts` (seed-data solto): vira
`INSERT`s em `Topic` de verdade, vinculados ao `Subject` certo — deixa de
ser um arquivo TS e passa a ser dado consultável com FK.

---

## 3. Cálculo do `masteryScore` (o "desempenho" da seção 6)

Atualizado depois de cada tentativa de questão e depois de cada simulado
(reaproveita os hooks que já existem em `POST /questions/:id/attempt` e
`SimulationsService.submit`, no mesmo espírito de como o caderno de erros já
se atualiza dentro da transação da tentativa):

```
masteryScore = round(100 × (
    0.6 × taxaAcertoRecente          // últimas 10 tentativas, não todas — desempenho VELHO não deve segurar a nota para sempre
  + 0.25 × fatorStreak                // correctStreak / STREAK_ALVO (cap em 1.0)
  + 0.15 × fatorRecência              // 1.0 se estudado nos últimos 7 dias, decai linear até 0 aos 30 dias sem tocar
))
```

`status` deriva do score (limiares simples, ajustáveis):

| score | status |
| --- | --- |
| sem tentativa | `NAO_ESTUDADO` |
| < 40 | `APRENDENDO` |
| 40–74 | `PRATICANDO` |
| ≥ 75 com `correctStreak ≥ 2` | `DOMINADO` |
| caiu de `DOMINADO` por erro novo | `PRECISA_REFORCO` |

---

## 4. Prioridade de conteúdo (seção 6)

Com `masteryScore` resolvido, a prioridade de cada tópico no dia é um score
combinado — **não** uma lista de regras soltas:

```
prioridade = 0.35 × (100 - masteryScore)        // baixo desempenho pesa mais
           + 0.25 × incidenciaENEM               // 0-100, do catálogo de tópicos (STUDY_SUBJECT_TOPICS vira dado com peso por incidência, hoje só tem a lista — precisa ganhar um peso por item)
           + 0.15 × (NAO_ESTUDADO ? 100 : 0)      // nunca visto sobe na fila
           + 0.15 × diasDesdeUltimaRevisão / 30   // cresce com o tempo parado
           + 0.10 × pesoObjetivo                  // área que o aluno marcou como importante no onboarding
```

O gerador do dia (§5) ordena os tópicos elegíveis por essa prioridade e
preenche o tempo disponível — não distribui igualmente entre matérias como
`buildSessions` faz hoje.

**Dado que falta**: `incidenciaENEM` por tópico. O `study-subject-topics.ts`
que guardei numa sessão anterior tem só a LISTA de tópicos, sem peso. Antes da
Fase 2 (§10) alguém precisa atribuir um peso 0-100 por tópico (pode vir de um
levantamento manual ENEM ou de contagem de questões existentes por tópico no
banco — o segundo é mais barato e já temos os dados).

---

### Trilha: a base antes do que depende dela

A prioridade acima decide QUANTO um tópico importa; a trilha decide em que
ORDEM o conteúdo novo de cada matéria é apresentado. `topic-sequence.ts` traz,
por matéria, os tópicos em ordem didática e em três níveis (base,
intermediário, avançado) — Frações antes de Razão e proporção, Função
exponencial antes de Função logarítmica, as escolas literárias na linha do
tempo.

- Vale só para tópico ainda não estudado. As prioridades que os tópicos novos
  da matéria já tinham são redistribuídas entre eles na ordem da trilha: a
  matéria disputa o dia com as outras como antes, só muda qual tópico novo vem
  primeiro. Tópico já começado segue pela prioridade (domínio, recência).
- A ordem é suave, não um bloqueio: a base já agendada por perto dá a vez ao
  próximo da trilha, então o aluno não fica parado esperando concluir uma
  tarefa.
- Na fase de preparação (reta final) a trilha não vale: vai o que mais cai.
- Tópico tirado do plano pelo aluno não segura os seguintes.
- Tópico fora da trilha (criado por questão importada) vai para o fim, em
  ordem alfabética, até alguém colocá-lo na posição certa do arquivo.

A aba "Por matéria" lista os tópicos nessa ordem, separados por nível, e a
LuminIA cita o nível ao explicar por que um tópico novo entrou no dia.

## 5. Gerador diário (substitui `buildSessions`)

Roda toda vez que o cronograma precisa de novas tarefas (criação, virada de
dia, replanejamento). Pseudocódigo:

```
function gerarTarefasDoDia(schedule, date):
  minutosDisponiveis = schedule.dailyMinutes
  fase = calcularFase(schedule, date)              // §7
  revisõesVencidas = TopicMastery.where(userId, nextReviewAt <= date, status != NAO_ESTUDADO)
                        .orderBy(nextReviewAt asc)  // revisão vencida sempre entra primeiro
  candidatos = TopicMastery.where(userId, subjectId in schedule.subjects)
                 .orderBy(prioridade desc)          // §4

  tarefas = []
  para cada revisão em revisõesVencidas:
    if minutosDisponiveis <= 0: break
    tarefas.push(criarAtividade(revisão.topic, tipo=Revisão, duração=mix[fase].revisão))
    minutosDisponiveis -= duração

  para cada topico em candidatos:
    if minutosDisponiveis <= 0: break
    tipo = escolherTipoAtividade(topico.status, fase)   // §6
    tarefas.push(criarAtividade(topico, tipo, duração=mix[fase][tipo]))
    minutosDisponiveis -= duração

  if sobrar tempo e Redação estiver no plano:
    tarefas.push(atividadeDeRedaçãoDaSemana())          // §9

  return tarefas
```

`mix[fase]` é a tabela de proporção teoria/questões/revisão/simulado por fase
(§7) — troca o "proporcional a horas-alvo" fixo por "proporcional à fase da
reta", que é o que a seção 15 pede.

---

## 6. Tipos de atividade (seção 5)

```prisma
enum StudyActivityType {
  TEORIA
  QUESTOES
  REVISAO
  SIMULADO
  REDACAO
}
```

`StudyTask` ganha `activityType StudyActivityType` (hoje só tem `title`/
`description` livres) e `topicId String?`. O `title` deixa de ser
"Matemática: estudo programado" (texto fixo, ver comentário existente em
`taskCustomNote`) e passa a ser gerado a partir de `activityType` + `topic`:
"Questões — Funções exponenciais", "Revisão — Ecologia".

`escolherTipoAtividade(status, fase)`:

| status do tópico | fase base | fase consolidação | fase preparação |
| --- | --- | --- | --- |
| `NAO_ESTUDADO` | Teoria | Teoria + Questões | Questões (pula teoria se o prazo for curto) |
| `APRENDENDO` | Teoria + Questões | Questões | Questões (nível ENEM) |
| `PRATICANDO` | Questões | Questões + Revisão | Simulado / Questões ENEM |
| `DOMINADO` | (não entra — só revisão espaçada) | (idem) | (idem) |
| `PRECISA_REFORCO` | volta para Teoria | Questões | Revisão intensiva |

---

### Prática: a tarefa se conclui pelo resultado

Toda tarefa com tópico tem o botão "Praticar": abre um bloco de até 10
questões do tópico (as nunca respondidas primeiro, depois as que o aluno mais
erra). Cada resposta é uma tentativa normal de questão — atualiza o domínio do
tópico e o caderno de erros — e, ao fim do bloco, a tarefa é concluída com o
placar (`practice_answered` / `practice_correct`), que aparece na tarefa.

- O placar é contado no servidor, pelas tentativas registradas nas últimas 12
  horas nas questões do bloco e do tópico da tarefa; o cliente só informa quais
  questões eram do bloco.
- Quem para no meio escolhe entre concluir com o que respondeu ou continuar
  depois (a tarefa fica em aberto).
- "Concluir" manual continua existindo, para quem estudou por fora ou para
  tópico sem questões no banco; nesse caso não há placar.
- Reabrir a tarefa apaga o placar.

### Estudar: resumo de teoria do tópico

Tarefa aberta com tópico também tem "Estudar" (botão principal nas tarefas de
Teoria): abre um resumo do tópico em cinco seções fixas — em poucas palavras, o
que você precisa saber, exemplo resolvido, erros comuns e como cai no ENEM — e
termina em "Praticar agora", que leva para o bloco de questões.

- O resumo fica em `topic_lessons`, um por tópico e igual para todos os alunos:
  é gerado pela IA na primeira abertura (uns 10 a 15 s) e reaproveitado depois.
- Texto que não segue as cinco seções é descartado, não guardado; sem provedor
  de IA (`AI_PROVIDER=mock`) ou com o provedor fora do ar, a tela avisa e
  oferece tentar de novo — não há conteúdo inventado no lugar.
- É conteúdo gerado: a tela avisa que pode ter erro. `source` aceita `MANUAL`
  para um resumo escrito ou revisado por professor substituir o gerado (ainda
  não há tela para isso; hoje é direto no banco).

### Simulado: a tarefa abre um simulado de verdade

A tarefa de tipo Simulado (reta final, tópico em prática) tem "Fazer
simulado": monta um simulado real do app (`simulations`), cronometrado com os
minutos da tarefa, e leva o aluno para a tela de simulados.

- Até 15 questões: 8 do tópico da tarefa e o resto de outros tópicos da mesma
  matéria que o aluno já começou a estudar (assunto nunca visto não entra). Sem
  outros tópicos estudados, completa com o próprio tópico; com menos de 5
  questões no total não há simulado e a tarefa segue pela prática.
- A tarefa guarda o simulado (`study_tasks.simulation_id`): abrir de novo leva
  ao mesmo. Ao enviar as respostas, a tarefa se conclui com a nota — a correção
  do simulado já atualiza o domínio de cada tópico.
- Reabrir a tarefa solta o vínculo (o simulado só aceita um envio) e a próxima
  abertura monta um simulado novo.

## 7. Fases pela proximidade da prova (seção 15)

```
diasRestantes = examDate - hoje
percentualDecorrido = 1 - (diasRestantes / duraçãoTotalDoCronograma)

percentualDecorrido < 0.5  → BASE          (mix: 50% teoria, 35% questões, 15% revisão)
0.5 ≤ p < 0.8              → CONSOLIDACAO  (mix: 15% teoria, 50% questões, 35% revisão)
p ≥ 0.8                    → PREPARACAO    (mix: 5% teoria, 35% questões, 30% revisão, 30% simulado)
```

Guardado em `StudySchedule.currentPhase` (novo campo, recalculado a cada
geração — não precisa de tabela própria).

---

## 8. Revisão espaçada (seção 14)

Reaproveita EXATAMENTE o padrão do caderno de erros — mesma comparação por
dia de calendário, mesmo campo `nextReviewAt`/`due` — só que por
`TopicMastery` em vez de `ErrorNotebookEntry`:

```
Dia 1 estuda → nextReviewAt = +3 dias, reviewIntervalDays = 3
Revisa e acerta → reviewIntervalDays *= 2 (cresce: 3 → 7 → 14 → 30, cap em 30)
Revisa e erra → reviewIntervalDays = 1, status cai para PRECISA_REFORCO
```

Não precisa ser um scheduler externo — é consultado no momento de gerar as
tarefas do dia (§5), igual o caderno de erros consulta `due` sob demanda.

---

## 9. Redação (seção 16)

Não é um `StudySubject` igual aos outros — tem rotina própria. Proposta:
`StudySchedule` ganha `essayFrequency` opcional (ex.: "semanal") e o gerador
injeta UMA atividade de redação por semana, alternando um ciclo fixo:

```
semana % 3 == 0 → Repertório
semana % 3 == 1 → Estrutura + Produção
semana % 3 == 2 → Competências + Correção
```

(A correção em si depende do scanner de redação que já existe —
`docs/REDAÇÕES_PROFESSORES_SCANNER.md` — este design só cuida de quando
agendar, não de como corrigir.)

---

## 10. LuminIA explica o cronograma (seção 11)

Hoje `AiService.sendMessage(dto)` não recebe nada do aluno. Precisa de um
contexto server-side, montado ANTES de chamar o provedor — não confiar em
contexto vindo do cliente (evita o aluno "convencer" a IA de dados falsos):

```ts
// novo: schedules.service.ts
async explainTask(userId: string, taskId: string): Promise<string /* contexto textual */> {
  const task = await this.repo.findTaskWithMastery(taskId);
  return `O aluno estuda ${task.subject.name} — ${task.topic?.name}.
Domínio atual: ${task.mastery?.masteryScore}% (${task.mastery?.status}).
Últimas tentativas: ${task.mastery?.correctAttempts}/${task.mastery?.attempts}.
Motivo da prioridade hoje: ${explicarPrioridade(task)}.`;
}
```

`AiChatRequestDto` ganha um campo opcional `scheduleContext?: string` que o
`ai.service.ts` injeta como mensagem de sistema antes do histórico — sem
mexer nos provedores (OpenAI/OpenRouter/Anthropic/Groq já aceitam mensagem de
sistema). O frontend chama `GET /schedules/tasks/:id/explain` para montar
esse contexto e passa para o chat já aberto, em vez de expor os números
crus na tela.

---

## 11. Onboarding (seção 3)

Tela nova antes da primeira criação de cronograma (ou reaproveitando o
formulário atual de criação, em etapas):

1. **Disponibilidade** — hoje já existe (`studyDays`, `dailyMinutes`), falta
   só granularidade por dia da semana (a spec quer "Segunda: 2h, Terça:
   1h30..." — hoje é um `dailyMinutes` único para todos os dias). Isso é uma
   mudança pequena: `StudySchedule.dailyMinutes` vira opcional e
   `StudyScheduleSubject`... não — o lugar certo é um novo
   `StudyScheduleDayMinutes { scheduleId, weekday, minutes }`, opcional
   (se ausente, usa `dailyMinutes` uniforme como hoje — não quebra
   cronogramas existentes).
2. **Objetivo** — `StudySchedule.objective` já existe (texto livre). Curso-alvo
   e área prioritária são novos campos opcionais.
3. **Nível atual** — se o aluno já tem `TopicMastery` (veio de questões
   respondidas antes de ter cronograma), usa. Senão, oferece um diagnóstico
   curto (ex.: 5 questões por área) — **isso é a única peça nova de produto
   desta lista que não tem nenhum precedente no código hoje**; as outras são
   extensões de coisa que já existe.

---

## 12. Replanejamento (seção 8)

`rescheduleMissed` já existe mas só move a MESMA tarefa. A spec pede uma
escolha explícita do aluno (reagendar amanhã / sábado / redistribuir /
não fazer). Isso é uma extensão de UI + endpoint, não uma mudança de modelo:

```
POST /schedules/tasks/:id/reschedule  { strategy: 'TOMORROW' | 'SATURDAY' | 'AUTO' | 'SKIP' }
```

`AUTO` chama o gerador diário (§5) para os dias restantes da semana,
redistribuindo o que sobrou — com o mesmo aviso da seção 12 ("isso vai
deixar 4h de Matemática e só 30min de Ciências, confirma?") calculado
comparando os `targetHours` da semana antes/depois do replanejamento.

---

## 13. Indicadores (seção 18)

Já bem coberto por `ProgressPanel` + `StudyProgress`. Faltam só:
`conteúdosConcluídos`/`conteúdosParaRevisar` — que caem direto de
`TopicMastery.status` (contagem por status), sem tabela nova.

---

### Resumo semanal

A aba "Semanal" traz, abaixo dos sete dias, o resumo da semana em exibição
(`GET study/weekly-summary`): tarefas concluídas sobre as planejadas, tempo no
cronômetro, questões respondidas e acerto (somando as dos simulados enviados),
cumprimento por matéria e os tópicos em que o aluno mexeu, sempre comparando
com a semana anterior. A LuminIA comenta a semana (`GET ai/weekly-comment`) em
cima dos mesmos fatos; sem provedor de IA sai um comentário fixo.

- Só entra dado registrado. O sistema não guarda histórico de domínio, então os
  tópicos aparecem com a situação ATUAL, não com "quanto subiu na semana".
- A meta do Sisu é mostrada; a distância até ela vem da estimativa de nota
  (abaixo). Sem estimativa, a LuminIA é instruída a não fazer essa conta.
- Semana em andamento é marcada como tal: o planejado inclui dias que ainda não
  chegaram, então não vira porcentagem de cumprimento nem atraso.
- A semana vira à meia-noite de Brasília (respostas e cronômetro têm hora; as
  sessões, só data).

### Estimativa de nota

`GET study/score-estimate` devolve uma estimativa da nota do ENEM do aluno, por
área e na média, sempre como faixa, e a distância até a meta do Sisu. Aparece no
cartão "Sua nota estimada hoje" do cronograma e entra no comentário semanal da
LuminIA, marcada como estimativa.

É uma aproximação declarada — a nota real usa TRI, que o app não reproduz:

- Por área, o acerto ponderado pela dificuldade da questão (fácil 1, média 1,5,
  difícil 2) posiciona o aluno entre a menor e a maior nota que a área costuma
  ter no ENEM (`AREA_SCALE` em `score-estimate.ts`, valores arredondados das
  edições recentes — conferir e ajustar a cada edição).
- Cada questão conta uma vez, pela primeira resposta dos últimos 120 dias
  (avulsas e de simulados enviados).
- Área com menos de 10 questões não tem estimativa: mostra quantas faltam. A
  média só existe com pelo menos duas áreas, e diz quantas das 5 notas entraram.
- A faixa é mais larga com poucas questões (cerca de ±90 com 10, ±35 com 60+).
- Redação entra pela média das últimas 3 correções concluídas, quando há.
- Nada disso foi validado contra notas reais de alunos: os pesos e a régua são
  chutes iniciais, na mesma categoria dos pesos da prioridade.

## 14. Design visual (seção 19)

Sem mudança de arquitetura — é o design system que a Lumina já usa
(fundo branco, amarelo de destaque, cards arredondados — visível em
`StudySchedulePage.tsx` hoje). Só precisa ser seguido nas telas novas
(onboarding, explicação da LuminIA, indicadores extras).

---

## 15. Roteiro de fases (não dá para ser uma PR só)

| Fase | Entrega | Depende de |
| --- | --- | --- |
| **1** | `TopicMastery` (schema + migration) alimentado por tentativas de questão e simulados; `study-subject-topics.ts` vira `Topic`s de verdade | Nada — é a base de tudo |
| **2** | Prioridade (§4) + gerador diário (§5) substituindo `buildSessions`; `activityType` em `StudyTask` | Fase 1 |
| **3** | Fases por proximidade da prova (§7) + revisão espaçada (§8) | Fase 2 |
| **4** | Replanejamento com escolha (§12) + indicadores novos (§13) | Fase 2 |
| **5** | LuminIA explica o cronograma (§10) + onboarding completo com diagnóstico (§11) + rotina de redação (§9) | Fases 2–3 |

Cada fase é entregável e testável sozinha — a Fase 1 já é útil por si (dá
para mostrar "domínio por tópico" no dashboard antes de tocar no gerador).

---

## Estado da implementação e desvios do design

Fases 1 a 5 implementadas. Onde o código diverge do que está escrito acima:

- **Fatia por matéria (§4-5).** O gerador não ordena a fila inteira só por
  prioridade: cada matéria recebe uma fatia do dia proporcional às
  horas-alvo, e a prioridade decide o tópico DENTRO da fatia. Com a fila
  única, as matérias de menor peso ficavam sem tempo nenhum, todos os dias.
- **Repetição entre dias (§5).** Tópico já agendado nos 3 dias vizinhos vai
  para o fim da fila, e concluir uma tarefa de tópico registra o estudo em
  `TopicMastery` (`registerStudy`: sai de `NAO_ESTUDADO`, atualiza
  `lastStudiedAt`, empurra a revisão vencida). Sem isso o dia seguinte
  repetia as mesmas tarefas para quem estuda sem responder questões.
- **`currentPhase` não é gravado (§7).** A fase é função pura das datas e é
  calculada na hora (`schedule-phase.ts`), devolvida em `GET /study/daily`.
  A prova é `UserVestibular.targetDate`; sem ela, `StudySchedule.endDate`.
- **Mix da fase é alvo, não trava (§7).** Entre os tópicos disponíveis vai
  primeiro o de maior prioridade cujo tipo ainda tem tempo na fase; quando
  não há tópico daquele tipo (aluno novo só tem teoria a fazer), o tempo vai
  para os outros.
- **Revisão vencida tem teto (§5, §8).** Entra primeiro, mas só até a fatia
  de revisão da fase (mínimo de uma por dia); o excedente fica para os dias
  seguintes, a mais atrasada na frente.
- **Dia do aluno × relógio do servidor.** O gatilho de geração tolera um dia
  de diferença, porque o "hoje" do aluno no Brasil ainda é o "ontem" UTC do
  servidor à noite.

- **Revezamento de matérias (§5).** Quando não cabem todas as matérias no
  dia com pelo menos 30 minutos cada, entram só as mais "em dívida" (as que
  receberam menos tempo do que a fatia delas pediria nas últimas duas
  semanas). Dividir 2h por 13 matérias dava blocos de 3 a 13 minutos.
- **Redação (§9).** `essayFrequency` é `WEEKLY`/`BIWEEKLY` (nulo = semanal).
  A atividade cai no dia de estudo com mais tempo da semana, entre os que
  ainda dá para planejar; Redação não entra na divisão diária por matéria.
- **LuminIA (§10).** O cliente não manda `scheduleContext`: manda só
  `scheduleTaskId` em `POST /ai/chat`, e o contexto é montado no servidor
  (`ScheduleInsightsService.explainTask`). Texto vindo do cliente permitiria
  justamente o que a seção quer evitar.
- **Onboarding (§11).** A criação é um formulário em três etapas
  (disponibilidade, objetivo, matérias). O aluno marca até três áreas
  prioritárias (`priorityAreas`), e as matérias delas ganham 25% a mais de
  peso na divisão do dia. O diagnóstico é oferecido só a
  quem não tem nenhum `TopicMastery`, usa a tentativa normal de questão e,
  ao terminar, refaz o dia (`POST /study/daily/refresh`).
- **Replanejamento (§12).** `POST /study/tasks/:id/replan`. `SKIP` usa o
  status novo `SKIPPED` em vez de apagar. `AUTO` não regenera a semana:
  encaixa a tarefa no próximo dia de estudo dentro do tempo dele e refaz só
  esse dia em volta — a prévia (sem `confirm`) mostra os minutos por matéria
  antes e depois. Sábado fora dos dias de estudo vira um dia extra de 0 min.
- **Cronogramas antigos.** Dia com só tarefas estáticas intocadas
  ("Matemática: estudo programado") é refeito pelo gerador ao ser aberto.
- **Tópicos duplicados.** Fundidos por `mergeDuplicateTopics` (lista em
  `prisma/seed-data/topic-merges.ts`, roda no seed); o tópico-coringa
  "Geral" nunca vira tarefa.

Endpoints novos: `GET /study/week`, `POST /study/daily/refresh`,
`GET /study/diagnostic`, `POST /study/tasks/:id/replan`,
`GET /study/tasks/:id/explain`; `GET /study/progress` passou a trazer
`mastery` (conteúdos por status, §13) e `PATCH /study/schedule/:id` aceita o
cronograma inteiro e refaz os dias a partir de hoje.

---

## O que este documento não decide

- Pesos exatos da fórmula de prioridade (§4) — são chutes iniciais,
  calibráveis depois com dado real de uso.
- Se o diagnóstico inicial (§11.3) é 5, 10 ou 15 questões — depende de teste
  com usuário.
- Se `incidenciaENEM` por tópico vem de contagem do banco de questões ou de
  fonte externa — decisão de produto, não técnica.
