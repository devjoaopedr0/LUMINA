# Mapa de domínio (item 30)

Entrega de 06/11/2026. A página `/app/dominio` transforma o domínio já
registrado por tópico em uma leitura visual por matéria e assunto, com estados,
mapa de calor, filtros e atalho para praticar.

## O que o aluno vê

- **Resumo:** assuntos mapeados, dominados, quantos pedem atenção e quantos têm
  revisão pendente.
- **Filtros:** matéria, estado, busca por assunto (sem diferenciar maiúsculas ou
  acentos) e "só revisão pendente".
- **Mapa de calor:** cada assunto é um quadrado colorido pelo `masteryScore`
  (0–100). O número, o percentual de acerto e a próxima revisão continuam
  visíveis, então a cor não é a única informação.
- **Agrupamento por matéria:** a matéria mostra média, quantidade de assuntos e
  quantos estão com revisão pendente. O selo da matéria usa a faixa que mais
  aparece no recorte.
- **Atalho de prática:** clicar no assunto abre o banco de questões já filtrado
  por `subjectId` e `topicId`.
- **Estados vazios:** sem domínio registrado, a página explica que o mapa nasce
  das respostas e oferece banco de questões, simulado e cronograma.

## De onde vêm os dados

O mapa consome o endpoint já existente:

```http
GET /users/me/topic-mastery
Authorization: Bearer <accessToken>
```

Cada linha traz matéria, assunto, `masteryScore`, tentativas, acertos, sequência,
`status`, última prática, próxima revisão e `due`. A gravação continua sendo
feita pelo `TopicMasteryService` em:

- `POST /questions/:id/attempt` (questão avulsa);
- submissão de simulado;
- conclusão de tarefa de estudo do cronograma (`registerStudy`).

**Não houve migration nem mudança de endpoint nesta entrega.** O mapa é somente
leitura sobre dados que já existiam.

## Estados e faixas

| `TopicMasteryStatus` | Faixa no mapa | Leitura |
| --- | --- | --- |
| `DOMINADO` | Dominado | Acerta com consistência |
| `PRATICANDO` | Em progresso | Está evoluindo |
| `APRENDENDO` | Atenção | Ainda há lacunas |
| `PRECISA_REFORCO` | Crítico | Prioridade de revisão |
| `NAO_ESTUDADO` | Não estudado | Sem tentativa/registro |

O cálculo do estado e do `masteryScore` é o mesmo do cronograma adaptativo e do
caderno de erros; o mapa não recalcula nem sobrescreve nada.

## Mapa de calor

| Domínio | Nível | Cor |
| --- | --- | --- |
| 0 | 0 | Cinza |
| 1–24 | 1 | Laranja |
| 25–49 | 2 | Âmbar |
| 50–74 | 3 | Lima |
| 75–100 | 4 | Verde |

## Limites conhecidos

- **Subassunto e habilidade:** o modelo atual tem dois níveis (`Subject` →
  `Topic`). Subassunto e habilidade exigem mudança de schema/classificação das
  questões e não foram inventados na interface.
- **Tópicos nunca tocados:** como `TopicMastery` só nasce depois de tentativa ou
  tarefa de estudo, o mapa mostra o que já tem registro. O cronograma continua
  sendo a visão dos tópicos ainda não estudados.
- **Histórico:** `TopicMasteryHistory` já é gravado por dia, mas esta entrega
  mostra o estado atual; evolução e comparação semana a semana ficam para o
  próximo incremento.
- **Subassunto/habilidade e histórico não alteram a conclusão do item 30 no
  inventário:** a entrega cobre matéria, assunto, estados e mapa de calor.

## Testes

O check puro `lumina-app/test/mapa-dominio.check.ts` cobre:

- tradução dos cinco estados para as cinco faixas;
- limites exatos do mapa de calor e cores distintas;
- acerto (incluindo divisão por zero);
- datas em UTC, revisão pendente, revisão futura e ausência de revisão;
- resumo com contagens, média, acerto e revisão pendente;
- filtros combinados, busca sem acento/caixa e estado dos filtros;
- agrupamento preservando a ordem da API e faixa dominante com empate.

Execução:

```bash
cd lumina-app
npm test
npm run typecheck
npm run build
npm run lint
```
