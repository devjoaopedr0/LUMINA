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
| Participação | `SimulationSubmission` e `StudyTimeLog` no período |
| Média de acerto | `SimulationSubmission.correct / total` |
| Média por questão e questões mais erradas | `SimulationItem` + `SimulationSubmission.answers` |
| Conteúdos críticos | agregação por `SimulationItem.subject` |
| Evolução | entregas e tempo de estudo agrupados por dia de Brasília |
| Tempo de estudo | `StudyTimeLog.durationMinutes` |
| Alunos em risco | regras de acerto, inatividade e sequência de erros |

A entrega usa **simulados/atividades com `SimulationSubmission`**. Tentativas avulsas do banco de questões, redações, domínio por tópico e metas do cronograma ainda não entram neste painel.

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

Um aluno é considerado ativo no período quando tem pelo menos uma entrega de simulado **ou** algum registro de tempo de estudo. A participação é `alunos ativos / alunos atuais da turma`.

### Acerto

- O denominador inclui questões em branco, porque a entrega já contabiliza branco como erro.
- Sem respostas, o acerto é `null` e a interface mostra `—`.
- A média geral não soma o mesmo aluno duas vezes no resumo; os cartões de turma mostram o recorte de cada turma.

### Tempo de estudo

`StudyTimeLog` não tem vínculo com turma. Por isso:

- o resumo deduplica os alunos e soma o tempo uma única vez;
- o cartão de uma turma soma o tempo dos alunos daquela turma e pode repetir minutos de um aluno que também esteja em outra turma do mesmo professor.

### Questões

- A chave é `questionId` quando a questão está ligada ao banco; caso contrário, é `simulationId:position`.
- A mesma questão em atividades diferentes é agregada pelo `questionId`.
- A lista de questões difíceis usa no mínimo **3 respostas** e acerto abaixo de **60%**.
- A lista de conteúdos críticos da turma usa os assuntos das questões com o mesmo critério.

### Sinais pedagógicos

| Sinal | Regra | Gravidade |
|---|---|---|
| `STUDENT_LOW_ACCURACY` | aluno com 5+ respostas e acerto < 60% | alta abaixo de 45%, média entre 45% e 59% |
| `STUDENT_INACTIVITY` | aluno na turma há 7+ dias sem entrega nem estudo nos últimos 7 dias | alta se não há atividade no período, média se há registro antigo |
| `STUDENT_ERROR_STREAK` | 3+ erros consecutivos na ordem das entregas | média |
| `CLASS_LOW_ACCURACY` | turma com 10+ respostas e acerto < 60% | alta abaixo de 45%, média entre 45% e 59% |
| `DIFFICULT_QUESTION` | questão com 3+ respostas e acerto < 60% | alta abaixo de 35%, média entre 35% e 59% |

Cada sinal traz uma sugestão textual de intervenção. A interface ordena por gravidade e depois pelo pior indicador.

## Privacidade e autorização

- A consulta nasce do vínculo `ClassTeacher`; não existe rota para consultar uma turma por id sem esse vínculo.
- O `classId` opcional é validado depois da consulta restrita ao professor. Um id de outra pessoa não retorna nome nem existência da turma.
- O retorno não inclui dados de alunos de outras turmas nem notas de outros professores.
- A rota usa o mesmo `JwtAuthGuard` das demais rotas privadas.

## Limites assumidos nesta entrega

- **Sinais são calculados na leitura.** Não há tabela de alerta, histórico, reconhecimento, atribuição de responsável ou notificação push/e-mail.
- **Sem queda de desempenho histórica.** A comparação com o período anterior, meta atrasada e recomendações personalizadas por conteúdo ficam para o próximo incremento do item 41.
- **Sem plano automático de recuperação.** O item 42 depende de decisões pedagógicas e de videoaulas; não foi simulado.
- **Sem relatório persistido.** O CSV é gerado no navegador; o item 59 continua pendente.
- **Sem tentativas avulsas do banco.** O painel usa simulados/atividades e tempo de estudo. Para incluir questões avulsas, será necessário definir como elas se relacionam com a turma.
- **Sem migration.** Nenhuma tabela nova foi criada.

## Testes

- `lumina-backend/src/institutional-analytics/teacher-analytics.spec.ts`: consolidação, participação, acerto nulo, agregação por `questionId`, evolução e todos os tipos de sinal.
- `lumina-backend/src/institutional-analytics/teacher-analytics.service.spec.ts`: bloqueio de não professor, 404 para turma alheia e consulta restrita às turmas do professor.
- `lumina-app/test/teacher-analytics.check.ts`: percentual nulo, minutos, ordenação por gravidade, filtro de sinais críticos e CSV com escape de aspas.

## Próximo incremento recomendado

1. Persistir sinais e permitir reconhecer/dispensar com trilha de auditoria.
2. Comparar o período atual com o anterior para detectar queda de desempenho.
3. Persistir relatórios pedagógicos por turma e período (item 59).
4. Definir a regra de atribuição de tempo de estudo por turma.
5. Incluir tentativas avulsas e domínio por tópico depois de definir o vínculo com a turma.
