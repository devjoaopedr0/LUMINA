# Planos e assinaturas

> **Status: Implementado, aguardando configuração.** Código, testes e migration (`20261111120000_plans_billing`) prontos em 11/11/2026. Para cobrar de verdade faltam a conta no Asaas, a chave da API, o token do webhook e o preço (ver "Configuração"). Sem eles o app funciona normalmente e a assinatura aparece como "em breve".

## Planos

| Recurso | Gratuito | Premium (individual ou institucional) |
| --- | --- | --- |
| Correções de redação por IA | 2 por mês | 30 por mês |
| Simulados criados pelo aluno | 2 por mês | Ilimitados |
| Mensagens para a LuminIA (chat e "criar questão parecida") | 10 por dia | 200 por dia |
| Flashcards gerados por IA (texto ou PDF) | Não incluso | 60 gerações por mês |
| Caderno de Repertórios | Até 20 repertórios e 2 coleções | Ilimitado (ver [CADERNOS.md](CADERNOS.md)) |
| Caderno de Fórmulas | Até 20 fórmulas e 2 coleções | Ilimitado |

- Os períodos seguem o fuso de Brasília (o dia vira à meia-noite e o mês no dia 1º).
- Os tetos do Premium existem só contra abuso e custo de IA.
- Contas de equipe (professor, coordenação, direção, admin) não pagam e usam os tetos do Premium.
- Aluno de instituição com licença ativa usa o plano institucional.
- Os valores ficam em `lumina-backend/src/plans/plan-limits.ts`; a tabela do app (`lumina-app/src/lib/plans.ts`) espelha esses números.

Simulados que contam: `POST /simulations` (só quando quem cria é aluno), `POST /simulations/enem` e `POST /simulations/adaptive/start`. O simulado da tarefa do cronograma não conta. Se a operação falhar depois de consumir o limite, o crédito volta.

## Benefício de fundador

Campanha de lançamento combinada em 11/11/2026:

- só **alunos independentes** (`STUDENT_INDEPENDENT`); instituições e alunos de instituição ficam de fora;
- **100 vagas**, por ordem de cadastro;
- cada fundador ganha **Premium sem cobrança por 4 meses** a partir da concessão;
- a campanha vale **por 6 meses** (cadastros de 11/11/2026 até 11/05/2027).

Como funciona:
- **Cadastros novos** (e-mail/senha e Google) recebem o benefício logo após o cadastro, pelo `FoundersService`. Uma trava consultiva e o `founder_number` único impedem passar do número de vagas, mesmo com cadastros simultâneos. Uma falha na concessão nunca derruba o cadastro.
- **Alunos que já existiam:** a migration concede o benefício aos primeiros 100 alunos independentes por data de cadastro, com 4 meses a partir da aplicação da migration. Contas internas e de teste (`@lumina.app`, `@lumina.dev`, `@lumina.internal`) ficam de fora.
- Um fundador pode assinar antes do fim do benefício: a primeira cobrança vence no dia em que o benefício acaba, então ele não paga em dobro.
- Configuração: `FOUNDER_STUDENT_SLOTS`, `FOUNDER_GRANT_MONTHS`, `FOUNDER_CAMPAIGN_STARTS_AT`, `FOUNDER_CAMPAIGN_ENDS_AT`. Mudar a configuração não altera concessões já feitas.

## Plano anual (oferta principal)

Combinado em 12/11/2026 para reduzir churn: o **anual parcelado no cartão** é a oferta principal e vem pré-selecionado com o selo "Mais escolhido" e a economia em relação a 12 meses do mensal. O mensal continua disponível.

- Preço total em `PLAN_PREMIUM_YEARLY_PRICE`; parcelas de 1 a `PLAN_YEARLY_MAX_INSTALLMENTS` (padrão 12), escolhidas pelo aluno antes de criar a cobrança (o número de parcelas é fixo na criação no Asaas).
- No Asaas, assinatura não aceita parcelamento: o anual é uma **cobrança parcelada no cartão** (`POST /v3/payments` com `installmentCount` e `totalValue`; em 1x, cobrança simples). Cada parcela é uma cobrança com webhook próprio e o campo `installment`.
- **Acesso:** qualquer parcela paga garante 12 meses a partir do vencimento da 1ª parcela + 3 dias.
- **Parcela em atraso:** `PAST_DUE` e o acesso fica no máximo mais 7 dias; pagar a parcela devolve o ano inteiro.
- **Sem renovação automática.** Nos últimos 30 dias o app mostra o aviso e o botão "Renovar"; a nova cobrança vence quando o acesso atual acaba.
- **Arrependimento (CDC, art. 49):** nos 7 primeiros dias, "Cancelar" estorna o parcelamento inteiro (`POST /v3/installments/{id}/refund`; em 1x, `POST /v3/payments/{id}/refund`) e encerra o Premium na hora. Depois disso não há cobrança a cancelar. O estorno no cartão pode levar até 10 dias úteis.
- Anual ainda não pago: "Cancelar" remove a cobrança (`DELETE /v3/installments/{id}`).
- Trocar de ideia antes de pagar (anual ↔ mensal ou outro número de parcelas) descarta a cobrança pendente e cria a nova.

Ponto a validar no sandbox: a documentação do Asaas não diz se, no cartão, todas as parcelas são confirmadas de uma vez ou mês a mês. As regras acima funcionam nos dois casos.

## Cobrança (Asaas)

Fluxo do aluno em `/app/plano`:
1. Informa CPF/CNPJ e a forma de pagamento (PIX, boleto, cartão ou escolher na hora).
2. O backend cria o cliente e a assinatura mensal no Asaas e devolve o link da cobrança (`invoiceUrl`).
3. O aluno paga na página do Asaas. **A Lumina não recebe dados de cartão nem guarda o CPF.**
4. O webhook confirma o pagamento e libera o Premium.

Regras do webhook (`POST /billing/webhooks/asaas`, função pura em `asaas-events.ts`):
- autenticação pelo header `asaas-access-token`, comparado em tempo constante com `ASAAS_WEBHOOK_TOKEN`;
- o evento é gravado antes de processar (`payment_webhook_events`, chave única `provider + event_id`), porque o Asaas entrega "pelo menos uma vez"; repetido é ignorado;
- pagamento confirmado ou recebido: ativa até o vencimento + 1 mês + 3 dias de folga, sem nunca encurtar um período pago;
- cobrança vencida: `PAST_DUE`, mantendo o acesso já pago;
- estorno ou chargeback: corta o acesso na hora;
- assinatura removida ou inativada: `CANCELED`, mantendo o acesso já pago;
- erro inesperado responde 500 para o Asaas reenviar; o evento fica gravado sem `processed_at`.

Cancelamento (`POST /billing/cancel`): remove a assinatura no Asaas (cobranças em aberto somem) e mantém o acesso pago até o fim do período.

## Administração

Só contas `ADMIN`:
- `GET /billing/admin/subscriptions`: assinaturas, concessões e situação da campanha de fundadores;
- `POST /billing/admin/grants`: Premium para um aluno (`email`) ou licença institucional (`institutionId`), com `months`, `endsAt` ou sem prazo, e `note` obrigatória;
- `POST /billing/admin/grants/:id/revoke`: revoga concessão manual ou de fundador (assinatura paga se cancela pelo aluno ou no Asaas).

Licença institucional ainda é concedida pela administração (contrato fora do app). Cobrança institucional pelo Asaas fica para a Fase 3.

## Configuração

Variáveis em `lumina-backend/.env` (ver `.env.example`):

| Variável | Para quê |
| --- | --- |
| `ASAAS_API_KEY` | Chave da API (`$aact_hmlg_…` no sandbox, `$aact_prod_…` em produção) |
| `ASAAS_ENVIRONMENT` | `sandbox` (padrão) ou `production` |
| `ASAAS_WEBHOOK_TOKEN` | Token definido ao cadastrar o webhook no Asaas; valor aleatório longo, nunca a chave da API |
| `PLAN_PREMIUM_YEARLY_PRICE` | Preço total do anual, ex.: `299.00` (sem valor, só o mensal é oferecido) |
| `PLAN_YEARLY_MAX_INSTALLMENTS` | Máximo de parcelas do anual (1 a 12, padrão 12) |
| `PLAN_PREMIUM_MONTHLY_PRICE` | Preço mensal, ex.: `29.90` |

No painel do Asaas, cadastre o webhook apontando para `https://SEU_BACKEND/billing/webhooks/asaas`, com o mesmo token, e os eventos de cobrança e de assinatura.

Antes de produção:
1. Aplicar a migration: `npm run prisma:migrate:deploy` em `lumina-backend`.
2. Testar o fluxo completo no sandbox (assinar, pagar a cobrança de teste, cancelar).
3. Trocar para a chave e o ambiente de produção.

## Testes

- `lumina-backend/src/plans/plans.spec.ts`: limites, períodos, fundador, CPF/CNPJ, regras do webhook, cliente do Asaas e consumo atômico.
- `lumina-backend/src/plans/billing.service.spec.ts`: webhook (token, idempotência, entrega simultânea), checkout (Asaas, fundador, falhas) e concessão de fundador.
- `lumina-app/test/planos.check.ts`: textos e máscaras da página "Meu plano".
