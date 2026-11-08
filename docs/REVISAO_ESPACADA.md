# Revisão espaçada

> **Status:** base implementada em 07/11/2026 e correções de fuso/concorrência
> aplicadas em 08/11/2026. Flashcards dependem do item 32 e não são simulados; a
> notificação é in-app.

Central única para o aluno responder hoje o que já deveria ter voltado: tópicos
com domínio vencido, questões abertas no caderno de erros e questões marcadas
manualmente para retomar. A regra de vencimento fica no servidor; a interface só
apresenta e executa a revisão.

## Fontes da fila

| Fonte | Campo de agendamento | Quando entra na fila |
| --- | --- | --- |
| Domínio por tópico | `TopicMastery.nextReviewAt` | Data menor ou igual a hoje e status diferente de `NAO_ESTUDADO` |
| Caderno de erros | `ErrorNotebookEntry.reviewScheduledAt` | Entrada `ABERTA` com data menor ou igual a hoje ou sem data (dívida antiga) |
| Fila manual | `UserQuestionProgress.markedForReview` | Sempre; é um compromisso do aluno, não uma repetição espaçada |

A fila manual exclui questões que já estão abertas no caderno de erros. O filtro
é feito pela relação no banco, sem carregar todos os erros abertos para excluir
em memória. Assim a mesma questão não aparece duas vezes com históricos
diferentes.

Entrada aberta sem data não é escondida: ela continua pendente e entra na fila
como “Sem data”. O aluno pode limpar a data no caderno, mas a dívida só sai
quando a questão é removida do caderno ou dominada.

## Agendamento automático

### Caderno de erros

| Evento | Próxima revisão |
| --- | --- |
| Erro novo ou nova tentativa errada | Amanhã |
| Primeiro acerto depois do erro | Três dias depois |
| Dois acertos seguidos | Nenhuma; a entrada vira `DOMINADA` |
| Inclusão manual no caderno | Amanhã |

A data é gravada como meia-noite UTC do **dia de Brasília** (a convenção de
data-calendário da plataforma). A revisão é um dia, não o instante em que o
aluno respondeu: às 20:59 ou às 21:00 de Brasília ainda é o mesmo dia local,
embora o segundo instante já seja o dia seguinte em UTC. O vencimento compara a
data gravada com a data de hoje em Brasília, nunca o instante com `new Date()`.
O limite de dois acertos é o mesmo `ERROR_NOTEBOOK_MASTERED_STREAK` usado pelo
caderno.

O incremento de `correctStreak` é atômico no banco (`increment: 1`). Duas
requisições concorrentes não leem o mesmo valor e gravam “1” duas vezes; a
decisão de dominar usa o valor devolvido pelo banco. Quando a questão é
dominada, a marcação manual de “revisar depois” é removida na mesma transação,
para a questão não reaparecer na fila manual depois de já revisada.

O agendamento manual pelo `PATCH /users/me/error-notebook/:questionId` continua
disponível. A próxima tentativa na questão recalcula a data conforme o
desempenho; isso é intencional, porque a revisão deve refletir a resposta mais
recente. Datas impossíveis, como `2026-02-31`, são recusadas em vez de
normalizadas silenciosamente pelo JavaScript.

### Domínio por tópico

O cálculo já existente em `TopicMastery` continua sendo a fonte:

- primeira revisão em 3 dias;
- acerto dobra o intervalo até o teto de 30 dias;
- erro volta para 1 dia;
- o status e a pontuação de domínio são recalculados junto.

## API

`GET /users/me/review-queue?limit=20`

- `due`: total de tópicos e entradas do caderno vencidos (incluindo abertas sem
  data), contagens por origem e os itens ordenados pela data mais antiga;
- `manual`: questões marcadas fora do caderno, ordenadas pela última tentativa;
- `nextReviewAt`: a próxima data futura conhecida, para a tela orientar o aluno
  quando nada venceu;
- `limit` é limitado entre 1 e 100 no servidor. Os contadores continuam sendo o
  total real mesmo quando a lista vem truncada.

O endpoint é autenticado e usa apenas o `userId` da sessão. Não há parâmetro de
outro usuário.

## Interface

- `/app/revisao-espacada`: resumo, fila do dia e fila manual. Tópicos levam ao
  banco de questões já filtrado por matéria e assunto. Questões do caderno e da
  fila manual abrem a mesma resolução inline do caderno, com dicas e gabarito.
- O painel do aluno mostra um aviso com a contagem quando há item pendente.
- O caderno de erros aceita `?due=true&subject=...&topic=...` para abrir já no
  recorte da central.
- Responder uma questão marcada remove a marcação; responder uma questão do
  caderno registra a tentativa e recalcula a próxima data. Se a limpeza da
  marcação falhar, a tela avisa em vez de esconder o erro. A fila não recarrega
  automaticamente para o aluno conseguir ler o gabarito.
- Sessão expirada ou falha de rede mostram mensagem; a tela não fica em spinner
  infinito. O enunciado dos itens é truncado para não carregar redações inteiras
  na fila.

## Limites atuais

- **Flashcards:** o item 32 ainda não existe. Nenhum item de flashcard é
  simulado na fila; a integração fica para quando houver modelo e tela reais.
- **Notificação:** o aviso é in-app. Não há infraestrutura de push ou e-mail
  identificada no projeto.
- **Dados antigos:** entradas do caderno criadas antes deste incremento podem
  ter `reviewScheduledAt = null`. Elas já aparecem como pendentes (“Sem data”),
  sem backfill inventado; a próxima tentativa agenda a data normalmente.
- **Sem migration:** a entrega reutiliza os campos e índices existentes.

## Testes

- `lumina-backend/src/questions/review-schedule.spec.ts`: regras puras de data,
  incluindo as viradas de 20:59/21:00 de Brasília, meia-noite local e
  encerramento após dois acertos.
- `lumina-backend/src/questions/error-notebook.repository.spec.ts`: o
  agendamento entra de fato no create/update do Prisma e o acerto incrementa a
  sequência de forma atômica.
- `lumina-backend/src/questions/review-queue.service.spec.ts`: agregação,
  ordenação, exclusão da fila manual por relação, entrada sem data, truncamento
  do enunciado, contagens, limite e próxima revisão.
- `lumina-app/test/revisao-espacada.check.ts`: frases de vencimento, origem,
  detalhe e as viradas de 20:59/21:00 de Brasília.
- `lumina-app/test/caderno-de-erros.check.ts`: atalhos de revisão no calendário
  de Brasília e a entrada sem data como pendente.
- `lumina-backend/test/questions.e2e-spec.ts`: data impossível recusada e “Sem
  data” continuando na fila de hoje.
