# Resolução de questões (item 11)

Ferramentas de estudo em volta da resolução de uma questão: entender **por que
errou** (explicação de cada alternativa), **retomar** o que marcou para revisar
e **destravar** sem ver o gabarito (dicas progressivas).

## Endpoints

| Método   | Rota                          | Descrição                                              |
| -------- | ----------------------------- | ------------------------------------------------------ |
| `POST`   | `/questions/:id/attempt`       | Registra a resposta (já devolvia; agora traz as justificativas) |
| `GET`    | `/questions/:id/hint`         | Dica do nível pedido, sem revelar a alternativa correta |
| `POST`   | `/questions/:id/review`       | Marca a questão como "para revisar"                    |
| `DELETE` | `/questions/:id/review`       | Remove a marcação                                       |
| `GET`    | `/users/me/questions/review`  | Fila de retomada (o que o aluno marcou)                |

Todos exigem autenticação (`Authorization: Bearer <accessToken>`) e respeitam o
escopo de workspaces: 404 para questão que o aluno não pode ver, 403 quando
precisa ser autor dela.

## Explicação de cada alternativa (o "por que errou")

A explicação do porquê de cada alternativa mora na própria alternativa
(`question_alternatives.explanation`, migration
`20260926160000_question_review_and_alternative_explanations`) e **não** no
gabarito comentado da questão: o gabarito responde "qual é a resposta", a
explicação da alternativa responde "por que essa distratora existe".

O autor escreve pelo formulário do banco de questões
(`/app/questoes` → **Editar questão**/**Nova questão**) ou pelo formulário de
transcrição da busca web (`/app/busca-web` → **Salvar**), em um campo opcional
por alternativa ("Por que esta está errada (opcional)"; o rótulo vira "Por que
esta é a correta" na alternativa marcada como gabarito).

Onde a explicação aparece:

| Contexto                                                  | Traz a explicação? |
| -------------------------------------------------------- | ------------------ |
| `GET /questions` e `GET /questions/:id` (visão de responder) | **não**          |
| `GET /questions/:id?includeAnswer=true` (visão de autor)   | sim                |
| `POST /questions/:id/attempt` (depois de responder)        | sim                |

Fora da visão de autor e do resultado da tentativa, a explicação simplesmente
não viaja na resposta — entregá-la antes de responder entregaria o gabarito
junto (a alternativa correta está entre as explicadas).

Resposta da tentativa:

```json
{
  "isCorrect": false,
  "selectedPosition": 1,
  "correctPosition": 2,
  "explanations": [
    { "position": 1, "text": "4", "isCorrect": false, "selected": true,
      "explanation": "2^2 = 4: o expoente foi trocado." },
    { "position": 2, "text": "8", "isCorrect": true, "selected": false,
      "explanation": "2^3 = 8." }
  ],
  "stats": { "attempts": 4, "correct": 2, "accuracyPercent": 50 }
}
```

`explanations` só traz as alternativas que **têm** explicação escrita — questão
importada sem esse detalhe continua funcionando, com o array vazio ou ausente.

## Marcar para revisar

`user_question_progress.marked_for_review` é uma coluna **independente** de
`is_favorite`, com índice próprio:

- **favoritar** é gostar da questão (coleção);
- **marcar para revisar** é um compromisso de retomada (fila de trabalho).

Marcar não é favoritar e não desmarcar não desfavorita: são dois estados
independentes que a interface trata separadamente. Marcar também **não** cria
tentativa nem mexe nas estatísticas.

| Endpoint                | Efeito                                  | Resposta                    |
| ----------------------- | --------------------------------------- | --------------------------- |
| `POST /questions/:id/review`   | marca                            | `{ "markedForReview": true }`  |
| `DELETE /questions/:id/review` | desmarca                         | `{ "markedForReview": false }` |
| `GET /users/me/questions/review?page=1&limit=20` | fila de retomada | `PaginatedProgressDto`        |

O estado volta junto da questão (`progress.markedForReview`) na listagem e no
detalhe, para a interface mostrar o botão certo sem uma segunda chamada.

## Dicas progressivas (`GET /questions/:id/hint`)

| Query  | Tipo | Padrão | Observações                    |
| ------ | ---- | ------ | ------------------------------ |
| `level` | int | `1`   | 1 a 3; fora da faixa → 400      |

```json
{ "level": 2, "hint": "Agora volte ao enunciado…", "provider": "rules", "maxLevel": 3 }
```

Os níveis são uma escada: **1** aponta o assunto e o conceito a recuperar,
**2** diz o que conferir no enunciado, **3** dá o método de eliminação. A escada
para em `maxLevel` — não existe nível 4 "quase resposta".

Níveis fora de 1..3 são recusados com 400 pelo `QuestionHintQueryDto`; nível
ausente vale 1.

### A dica nunca revela o gabarito — em duas camadas

1. **Estrutural.** O provedor recebe, via `HintRequest`, apenas enunciado,
   disciplina, assunto, dificuldade e **quantidade** de alternativas. O texto da
   alternativa correta não chega até ele, então ele não tem como vazar.
2. **Defensiva.** O texto gerado é normalizado (sem acento, sem pontuação) e
   comparado com a alternativa correta; se contiver o texto dela, é descartado e
   substituído por uma dica neutra, com aviso no log. A checagem só vale para
   alternativas com 4 caracteres ou mais — "8" ou "12" aparecem por acaso em
   qualquer frase e gerariam falso positivo.

Essa segunda camada é o que protege quando um provedor de modelo de linguagem for
plugado no lugar das regras.

### Provedor de dicas

O padrão é o `StudyGuideHintProvider` (`provider: "rules"`): um guia de estudo
determinístico, sem chamada externa e sem chave de API. Ele reconhece a área do
conhecimento pelo enunciado (função, equação, probabilidade, geometria, física,
química, biologia, história/geografia, língua) com casamento **insensível a
acento** — o banco pode guardar "Funcoes exponenciais" e a dica da área não pode
depender da acentuação — e cai em dicas genéricas quando nada casa.

Para trocar por um modelo de linguagem, registre outro `HintProvider` (mesma
interface, outro `name`) no token `QUESTION_HINTS_PROVIDER`: o serviço não muda.

```ts
// src/questions/questions.module.ts
{ provide: QUESTION_HINTS_PROVIDER, useClass: MeuProvedorDeDicas }
```

Pedir dica **não** registra tentativa: as estatísticas da questão não mudam.

## Interface

`/app/questoes` (Banco de questões), no cartão de cada questão:

- botão **Revisar depois** / **Para revisar** (o rótulo e o `aria-pressed`
  refletem o estado salvo; se a chamada falhar, o botão volta ao estado anterior
  em vez de mentir);
- botão **Pedir dica** → **Outra dica** → **Sem mais dicas** (desabilitado no
  limite), com as dicas empilhadas em numeração e a nota de que elas não revelam
  a alternativa correta;
- depois de responder, o painel **Por que cada alternativa está assim**, com a
  marcação `(sua resposta)` na alternativa escolhida, o **Gabarito comentado** e
  **Responder novamente** (que preserva as dicas já pedidas).

`/app` (Visão geral do aluno) ganhou o cartão **Para revisar**, alimentado por
`GET /users/me/questions/review`.

## Testes que cobrem esta entrega

- `src/questions/hints/question-hints.service.spec.ts` — provedor por regras e
  serviço: nível 1/2/3, reconhecimento de área com e sem acento, área genérica,
  questão sem assunto, o provedor nunca recebendo o gabarito, descarte de dica
  que vaza a resposta, não-descarte por alternativa curta, clamp de nível e
  `maxLevel`.
- `src/questions/questions.service.spec.ts` — marcar para revisar sem mexer no
  favorito, alternância sem preferência, 404 em questão inacessível, dica sem
  gravar tentativa, explicações no resultado da tentativa e a ausência delas na
  visão de responder, `progress` em lote na listagem.
- `test/questions.e2e-spec.ts` — visão de responder nunca entrega a explicação,
  visão de autor entrega, tentativa devolve as justificativas, dica sem revelar
  a alternativa correta, nível inválido 400, dica não conta como tentativa,
  marcar para revisar volta na listagem, 404 em questão inacessível.
- `lumina-app/test/transcricao-questoes.check.ts` — as regras da transcrição da
  busca web (`src/lib/question-transcription.ts`): alinhamento entre
  alternativa e justificativa ao acrescentar e remover, reposicionamento do
  gabarito, descarte da alternativa em branco com a sua justificativa órfã,
  validação do formulário e limites de 2 a 6 alternativas.

## O que ainda não está aqui

- **Caderno de erros** (revisar em lote as questões erradas e registrar o motivo
  do erro): é o item 12/13 do inventário. O campo `marked_for_review` já é a
  base da fila.
- **Ajuda da LuminIA** durante a resolução: depende do backend de IA
  (`docs/AI_CHAT.md`); hoje o provedor de dicas é o das regras, sem chamada
  externa.
