# Flashcards

> **Status:** item 32 entregue em 09/11/2026. Criação manual, a partir do caderno
> de erros, a partir de conteúdo, a partir de PDF e com IA real, revisão
> espaçada, histórico de domínio e integração à fila unificada.

Flashcards são cartões pessoais de memória. A frente propõe uma pergunta ou
conceito; o verso traz a resposta. Cada resposta do aluno recalcula o próximo
dia de revisão e fica registrada no histórico. O cartão pertence ao aluno, não
ao workspace: nenhuma consulta aceita `userId` do cliente.

## Origens

| Origem | Como nasce | Regra de conteúdo |
| --- | --- | --- |
| Manual | Formulário em `/app/flashcards` | Frente e verso escritos pelo aluno |
| Caderno de erros | Botão **Criar flashcard** na entrada do caderno | Frente usa o enunciado; verso usa gabarito textual e explicação carregados no servidor |
| Conteúdo | Aba **Colar conteúdo** em **Gerar com IA** | A IA recebe apenas o texto colado e a quantidade pedida |
| PDF | Aba **Enviar PDF** em **Gerar com IA** | O servidor extrai o texto em memória e usa a mesma geração de conteúdo |
| IA | Saída das duas abas acima | `source = AI`; prompt versionado e modelo ficam em `metadata` |

A criação a partir de erro não aceita um gabarito vindo do navegador. O servidor
confirma que a questão está no caderno do próprio aluno, lê a alternativa
correta e a explicação e grava o cartão. Se a questão não tiver gabarito textual
nem explicação, o aluno precisa escrever o verso.

## Geração com IA

A rota chama `AiService.generateStructured`. Não existe geração local de
conteúdo: sem `AI_PROVIDER` real, a resposta é **503** e nenhum cartão é criado.
Se o provedor falhar, a resposta é **502**; se o JSON vier inválido, também é
**502** e nada é gravado.

O prompt `flashcard-generation-2026-11-09` trata o material como dado, não como
instrução, e proíbe inventar fatos, números, fontes ou relações ausentes no
conteúdo. A resposta é validada antes da gravação:

- JSON com `cards[]`;
- frente entre 8 e 2.000 caracteres;
- verso entre 3 e 10.000 caracteres;
- até 10 cartões aproveitados por chamada;
- frentes repetidas são descartadas;
- se o material não sustentar a quantidade pedida, a IA deve gerar menos.

Cada cartão gerado guarda `metadata` com `generator`, `promptVersion`, `model`,
`origin` (`CONTENT` ou `PDF`), `generatedAt` e `reviewStatus = UNREVIEWED`. O
aluno pode editar ou excluir o cartão; a interface avisa que o conteúdo foi
gerado por IA e deve ser conferido antes do estudo.

## PDF

O upload vai em JSON como data URL `application/pdf;base64` para
`POST /flashcards/generate/from-pdf`. O limite do parser é 16 MB de corpo e o
limite do arquivo é **8 MB**, com até **40 páginas** e **20.000 caracteres**
aproveitados. O PDF é lido com `pdfjs-dist` em memória, não é gravado no banco
nem no disco, e não é enviado a terceiros além do provedor de IA configurado
para a geração.

PDF digitalizado só com imagem não passa por OCR nesta entrega. Nesse caso o
servidor responde com uma mensagem pedindo que o aluno cole o conteúdo como
texto.

## Revisão espaçada

O algoritmo é um SM-2 simplificado e vive em
`src/flashcards/flashcard-review.ts`:

| Resposta | Efeito |
| --- | --- |
| `AGAIN` | Volta em 1 dia, zera a sequência e reduz a facilidade |
| `HARD` | Cresce o intervalo em 1,2×, zera a sequência e reduz a facilidade |
| `GOOD` | Primeiro intervalo de 1 dia; depois 3 dias; depois cresce pelo fator |
| `EASY` | Primeiro intervalo de 4 dias, aumenta a facilidade e mantém a sequência |

O fator de facilidade fica entre **1,3 e 3,0**. Cartões novos entram na fila no
dia da criação. As datas são dias de calendário de Brasília gravados como
meia-noite UTC; o vencimento compara dia com dia, não instante com `new Date()`.

A revisão usa uma transação e a data de atualização como versão. Duas abas não
aplicam a mesma resposta duas vezes: a segunda recebe **409** e precisa
recarregar. Cada resposta grava uma linha imutável em `FlashcardReview` com
nota, intervalo, facilidade e próxima data. Editar o cartão não reescreve o
passado.

## Histórico e resumo

`GET /flashcards/:id/history` devolve o cartão e as revisões, da mais recente
para a mais antiga, com `remembered = rating !== AGAIN`. O histórico alimenta a
tabela de domínio na interface.

`GET /flashcards/summary` devolve total, vencidos hoje, novos, total de
revisões, revisões lembradas, percentual de lembrança e revisões feitas hoje.
O percentual é `null` quando ainda não houve revisão; a interface mostra `—` em
vez de inventar 0%.

## API

Todas as rotas exigem JWT e usam apenas o usuário da sessão.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/flashcards?due=true&source=...&subjectId=...&topicId=...` | Lista os cartões do aluno |
| `GET` | `/flashcards/summary` | Resumo de domínio |
| `POST` | `/flashcards` | Cria um cartão manual |
| `POST` | `/flashcards/generate` | Gera cartões a partir de conteúdo |
| `POST` | `/flashcards/generate/from-pdf` | Gera cartões a partir de PDF |
| `POST` | `/flashcards/from-error/:questionId` | Cria a partir do caderno de erros |
| `GET` | `/flashcards/:id` | Detalhe |
| `PATCH` | `/flashcards/:id` | Edita frente, verso ou classificação |
| `DELETE` | `/flashcards/:id` | Exclui o cartão e o histórico |
| `POST` | `/flashcards/:id/review` | Registra `AGAIN`, `HARD`, `GOOD` ou `EASY` |
| `GET` | `/flashcards/:id/history` | Histórico de revisões |

A classificação é opcional. Um assunto sempre carrega a matéria; o servidor
recusa um par incompatível em vez de criar um cartão que nunca apareceria no
filtro correto. Cartão de outro aluno responde **404** para não revelar que ele
existe.

## Fila unificada

`GET /users/me/review-queue` inclui cartões vencidos como itens
`kind = FLASHCARD` e soma a contagem em `due.flashcards`. A fila continua com
`TOPIC`, `ERROR_NOTEBOOK`, `FLASHCARD` e `MARKED_QUESTION`. A central de revisão
mostra o cartão e leva para `/app/flashcards?card=<id>` para abrir a revisão.

## Interface

- `/app/flashcards` tem resumo, filtros (todos, para hoje, novos), CRUD, revisão
  com revelação do verso, quatro notas e histórico por cartão.
- **Novo flashcard** abre o formulário manual.
- **Gerar com IA** abre as abas de conteúdo e PDF, com quantidade, matéria e
  assunto opcionais.
- O caderno de erros ganha **Criar flashcard** em cada entrada e mostra o aviso
  de conflito quando a questão já tem cartão.
- O painel do aluno e a navegação têm atalho para flashcards.
- Falha de rede, sessão expirada, 409 de concorrência e ausência de provedor de
  IA aparecem como mensagens; a tela não fica em spinner infinito.

## Testes

- `lumina-backend/src/flashcards/flashcard-review.spec.ts`: intervalos, notas,
  limites do fator e virada de Brasília.
- `lumina-backend/src/flashcards/flashcard-generation.spec.ts`: prompt, JSON,
  repetição, limites e conteúdo como dado.
- `lumina-backend/src/flashcards/flashcard-pdf.spec.ts`: data URL, mimetype,
  tamanho e conteúdo não-PDF.
- `lumina-backend/src/flashcards/flashcards.service.spec.ts`: CRUD, revisão,
  histórico, isolamento por usuário, geração com IA, 503 sem provedor e 502 com
  resposta inválida.
- `lumina-backend/src/questions/review-queue.service.spec.ts`: cartões vencidos
  na fila e contagem por origem.
- `lumina-app/test/flashcards.check.ts`: filtros, rótulos, retenção nula e
  validação local do PDF.

## Limites atuais

- Geração por IA exige provedor real configurado; sem ele, 503.
- PDF com imagem digitalizada não tem OCR nesta entrega.
- O PDF não é armazenado, então não há biblioteca de materiais anexados aos
  cartões.
- O conteúdo gerado nasce `UNREVIEWED`; a revisão humana é feita pelo próprio
  aluno na tela antes de estudar.
- Não há sincronização offline nem notificação push/e-mail.
