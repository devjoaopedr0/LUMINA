# Cálculo mental rápido

Primeira entrega do módulo de raciocínio lógico: treino de operações básicas em `/app/calculo-mental`, acessível no menu do dashboard.

## Funcionalidades

- Rodadas de dez questões de soma, subtração, multiplicação e divisão exata.
- Quinze segundos por questão, medidos no servidor. Ao esgotar o prazo, a interface envia uma resposta vazia; é possível pular antes.
- Cinco níveis: três acertos seguidos aumentam a dificuldade; um erro reduz um nível. Divisões têm resultado inteiro e subtrações não ficam negativas.
- Treino livre e um desafio diário por conta, com data de Brasília. Questões diárias são determinísticas por data, posição e nível; o percurso varia conforme os acertos.
- Histórico na conta, com as últimas trinta rodadas concluídas, precisão, média de tempo, desempenho por operação e revisão dos erros de cada rodada.
- URL de sessão permite retomar e rever resultados. Recarregar ou sair não pausa o prazo da questão atual. Ao voltar após o prazo, ela é registrada como erro e a próxima recebe um novo prazo.
- Controle de versão impede que tentativas repetidas ou simultâneas registrem duas respostas. O gabarito atual não é enviado ao navegador.

## Ativação

A migração `20260915010000_add_mental_math` cria uma tabela com vínculo ao usuário, índice de histórico e unicidade de desafio por dia/conta. Ela não modifica tabelas de questões ou cronogramas.

No ambiente de destino, com `DATABASE_URL` configurada, aplicar as migrações e gerar o cliente:

```powershell
npm run prisma:migrate:deploy --prefix lumina-backend
npm run prisma:generate --prefix lumina-backend
npm run build
```

Reiniciar a API após a atualização. `migrate deploy` aplica todas as migrações pendentes; verificar o estado do ambiente antes de executá-lo.

## API autenticada

| Método | Rota | Entrada |
| --- | --- | --- |
| POST | `/mental-math/sessions` | `{ "mode": "free" }` ou `{ "mode": "daily" }` |
| GET | `/mental-math/sessions/:id` | UUID da sessão |
| POST | `/mental-math/sessions/:id/answers` | `{ "version": 0, "answer": 42 }`; `null` para pular |
| GET | `/mental-math/history` | Histórico do usuário autenticado |

Tempo medido inclui rede e processamento. Não há ranking competitivo. Sessões livres incompletas permanecem acessíveis pela URL, mas não entram no histórico agregado. Retenção/limpeza de sessões abandonadas, gráficos detalhados de erros recorrentes e exercícios de lógica além das operações ficam para próximas entregas.

## Validação

Testes automatizados cobrem aritmética, adaptação, expiração, validação de entrada, escopo por usuário, ocultação do gabarito, repetição de requisições, gravação condicionada à versão, conclusão e retomada diária. Os testes de persistência usam um substituto do Prisma; não substituem a aplicação da migração e um teste com PostgreSQL real. Navegação autenticada no navegador ainda não foi validada nesta entrega.
