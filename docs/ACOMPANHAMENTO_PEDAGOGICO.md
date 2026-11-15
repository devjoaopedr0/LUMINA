# Acompanhamento pedagógico do professor (Fase 3)

Esta entrega inicia a Fase 3 do roadmap com o **painel analítico do professor** (item 40) e uma primeira camada de **sinais pedagógicos** derivados dos dados (parte do item 41). A regra central é simples: o professor só vê as turmas em que está vinculado, e o painel não inventa indicador quando não há resposta.

## O que foi entregue

- Rota web `/app/acompanhamento`.
- Atalho **Acompanhamento analítico** no painel do professor em `/app`.
- Endpoint autenticado `GET /institutional-analytics/teacher`.
- Filtros de período (`7`, `30`, `60` ou `90` dias, com limites de 7 a 180) e de turma.
- Exportação CSV da tabela de alunos da seleção.

## Endpoint

```http
GET /institutional-analytics/teacher?days=30&classId=<uuid-opcional>
Authorization: Bearer <token>
```

- `days`: inteiro entre 7 e 180. Padrão `30`.
- `classId`: recorte opcional de uma turma. A consulta sempre parte das turmas com `ClassTeacher.userId = usuário autenticado`; se o `classId` não pertencer ao professor, a resposta é **404**.
- Perfil exigido: `TeacherProfile`. Aluno, coordenação e direção recebem **403** nesta rota.

### Fontes de dados

| Indicador | Origem |
|---|---|
| Participação | `SimulationSubmission` de membros atuais e `StudyTimeLog` no período |
| Média de acerto | `SimulationSubmission.correct / total` |
| Média por questão e questões mais erradas | `SimulationItem` + `SimulationSubmission.answers` |
| Conteúdos críticos | agregação por `SimulationItem.subject` |
| Evolução | entregas e tempo de estudo agrupados por dia de Brasília |
| Tempo de estudo | `StudyTimeLog.durationMinutes` |
| Alunos em risco | regras de acerto, inatividade e sequência de erros |

A entrega usa **simulados/atividades com `SimulationSubmission`**. Tentativas avulsas do banco de questões, redações, domínio por tópico e metas do cronograma ainda não entram neste painel.

Submissões de ex-alunos e de professores/co-professores não entram nas métricas da turma: cada simulado é filtrado pelos membros atuais antes das agregações. O tempo de estudo também só é atribuído a partir da data de ingresso do aluno na turma.

### Formato resumido da resposta

```json
{
  "generatedAt": "2026-11-09T12:00:00.000Z",
  "period": { "days": 30, "from": "...", "to": "..." },
  "summary": {
    "classCount": 2,
    "studentCount": 48,
    "activeStudentCount": 31,
    "participationRate": 65,
    "submissionCount": 120,
    "answerCount": 2400,
    "correctCount": 1416,
    "accuracy": 59,
    "studyMinutes": 1830,
    "studentsAtRisk": 7,
    "questionCount": 90
  },
  "classes": [],
  "questions": [],
  "subjects": [],
  "evolution": [],
  "signals": []
}
```

Cada turma traz `students` e `difficultQuestions`; cada aluno traz `accuracy`, `studyMinutes`, `lastActivityAt`, `errorStreak`, `riskLevel` e `riskReasons`. Cada questão traz `questionId` (quando existe), enunciado truncado, disciplina, tentativas, brancos e acerto.

## Regras dos indicadores

### Participação

Um aluno é considerado ativo no período quando tem pelo menos uma entrega de simulado **ou** algum registro de tempo de estudo. A participação é `alunos ativos / alunos atuais da turma`. Entregas de quem não é mais membro e de professores não contam.

### Acerto

- O denominador inclui questões em branco, porque a entrega já contabiliza branco como erro.
- Sem respostas, o acerto é `null` e a interface mostra `—`.
- A média geral não soma o mesmo aluno duas vezes no resumo; os cartões de turma mostram o recorte de cada turma.

### Tempo de estudo

`StudyTimeLog` não tem vínculo com turma. Por isso:

- o resumo deduplica os alunos e soma o tempo uma única vez;
- o cartão de uma turma soma o tempo dos alunos daquela turma e pode repetir minutos de um aluno que também esteja em outra turma do mesmo professor;
- registros anteriores ao ingresso do aluno na turma não entram no cartão da turma nem no resumo.

### Questões

- A chave é `questionId` quando a questão está ligada ao banco; caso contrário, é `simulationId:position`.
- A mesma questão em atividades diferentes é agregada pelo `questionId`.
- A lista de questões difíceis usa no mínimo **3 respostas** e acerto abaixo de **60%**.
- A lista de conteúdos críticos da turma usa os assuntos das questões com o mesmo critério.

### Sinais pedagógicos

| Sinal | Regra | Gravidade |
|---|---|---|
| `STUDENT_LOW_ACCURACY` | aluno com 5+ respostas e acerto < 60% | alta abaixo de 45%, média entre 45% e 59% |
| `STUDENT_INACTIVITY` | aluno na turma há 7+ dias sem entrega nem estudo **nesta turma** no período | média |
| `STUDENT_ERROR_STREAK` | 3+ erros consecutivos na ordem das entregas | média |
| `CLASS_LOW_ACCURACY` | turma com 10+ respostas e acerto < 60% | alta abaixo de 45%, média entre 45% e 59% |
| `DIFFICULT_QUESTION` | questão com 3+ respostas e acerto < 60% | alta abaixo de 35%, média entre 35% e 59% |

Cada sinal traz uma sugestão textual de intervenção. A interface ordena por gravidade e depois pelo pior indicador: acerto menor, sequência de erros maior ou mais dias sem atividade. A inatividade é deliberadamente **média** porque o aluno pode estar ativo em outra turma; consultar a atividade fora desta janela fica para o próximo incremento.

## Privacidade e autorização

- A consulta nasce do vínculo `ClassTeacher`; não existe rota para consultar uma turma por id sem esse vínculo.
- O `classId` opcional é validado depois da consulta restrita ao professor. Um id de outra pessoa não retorna nome nem existência da turma.
- O retorno não inclui dados de alunos de outras turmas nem notas de outros professores.
- A rota usa o mesmo `JwtAuthGuard` das demais rotas privadas.

## Limites assumidos nesta entrega

- **Sinais são calculados na leitura.** Não há tabela de alerta, histórico, reconhecimento, atribuição de responsável ou notificação push/e-mail.
- **Inatividade é local à turma e ao período.** Atividade em outra turma ou fora da janela não é consultada nesta versão; por isso a severidade é média.
- **Sem queda de desempenho histórica.** A comparação com o período anterior, meta atrasada e recomendações personalizadas por conteúdo ficam para o próximo incremento do item 41.
- **Sem plano automático de recuperação.** O item 42 depende de decisões pedagógicas e de videoaulas; não foi simulado.
- **Sem relatório persistido.** O CSV é gerado no navegador; o item 59 continua pendente.
- **Sem tentativas avulsas do banco.** O painel usa simulados/atividades e tempo de estudo. Para incluir questões avulsas, será necessário definir como elas se relacionam com a turma.
- **Sem migration.** Nenhuma tabela nova foi criada.

## Testes

- `lumina-backend/src/institutional-analytics/teacher-analytics.spec.ts`: consolidação, participação, acerto nulo, agregação por `questionId`, evolução, todos os tipos de sinal, exclusão de ex-alunos/professores e tempo anterior ao ingresso.
- `lumina-backend/src/institutional-analytics/teacher-analytics.service.spec.ts`: bloqueio de não professor, 404 para turma alheia, consulta restrita às turmas do professor e relógio congelado para não depender da data de execução.
- `lumina-app/test/teacher-analytics.check.ts`: percentual nulo, minutos, fuso de Brasília, ordenação por gravidade, filtro de questões difíceis, filtro de sinais críticos e CSV com escape de aspas/fórmulas.

## Próximo incremento recomendado

1. Persistir sinais e permitir reconhecer/dispensar com trilha de auditoria.
2. Comparar o período atual com o anterior para detectar queda de desempenho.
3. Persistir relatórios pedagógicos por turma e período (item 59).
4. Definir a regra de atribuição de tempo de estudo por turma.
5. Incluir tentativas avulsas e domínio por tópico depois de definir o vínculo com a turma.

## Alertas pedagógicos persistidos (item 41, 15/11/2026)

Migration `20261115120000_pedagogical_alerts` (só adições), aplicada.

### Novos sinais

| Sinal | Regra | Gravidade |
|---|---|---|
| `STUDENT_PERFORMANCE_DROP` | acerto do aluno na turma caiu 15+ pontos em relação ao período anterior de mesmo tamanho, com 5+ respostas nos dois | alta a partir de 25 pontos |
| `STUDENT_OVERDUE_TASKS` ("meta atrasada") | 3+ tarefas do cronograma dos últimos 14 dias nem feitas nem puladas | alta a partir de 8 |
| `STUDENT_INACTIVITY` (revisto) | continua local à turma, mas agora consulta a atividade do aluno **na Lumina inteira** (tempo de estudo, questões avulsas e simulados) | **alta** sem atividade em lugar nenhum há 14+ dias; média, com a data da última atividade fora da turma, quando o aluno está ativo em outro lugar |

Os sinais extras ficam em `lumina-backend/src/institutional-analytics/extra-signals.ts` e entram também no painel do período filtrado.

### Ciclo de vida

`GET /institutional-analytics/teacher/alerts` recalcula os sinais numa **janela fixa de 30 dias**, com todas as turmas, independente do filtro do painel, e sincroniza a tabela `pedagogical_alerts` (regra em `pedagogical-alerts.ts`):

| Situação | Resultado |
|---|---|
| Sinal novo | alerta **Aberto** |
| Sinal que continua | atualiza texto, gravidade e "visto por último" |
| Sinal some de um alerta aberto ou em acompanhamento | **Resolvido automaticamente** |
| Sinal volta num alerta resolvido | reaberto (`reopenCount` + 1) |
| Alerta dispensado | continua dispensado, a menos que a gravidade suba |

`PATCH /institutional-analytics/teacher/alerts/:id` com `{ status, note }` registra o acompanhamento do professor (Acompanhar, Resolver, Dispensar, Reabrir). Toda mudança entra no histórico do alerta (quando, quem, de → para, anotação; "sistema" nas automáticas). Um professor só vê e altera os próprios alertas (404 para os de outro).

Na tela `/app/acompanhamento`, a seção **Alertas pedagógicos** separa Abertos, Em acompanhamento e Encerrados (últimos 60 dias). A seção de sinais do período continua, agora como leitura do filtro escolhido.

Validado no navegador em 15/11/2026 com a conta de professor de teste: o alerta de inatividade foi criado, mostrou a atividade do aluno fora da turma e passou para "Em acompanhamento" com anotação.

### Ainda não entra

- Notificação push ou e-mail do alerta (depende do módulo de notificações, item 51).
- Atribuição a outro responsável (coordenação).
- Questões avulsas do banco no acerto da turma (o vínculo questão avulsa → turma continua indefinido).
