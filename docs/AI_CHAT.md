# LuminIA — chat da área autenticada

## Estado atual

O chat flutuante aparece no canto inferior direito de todas as rotas iniciadas por `/app` quando há um usuário autenticado. A interface oferece abertura e minimização do painel, histórico em memória durante a navegação, envio por formulário, estado de carregamento, mensagens de erro, layout responsivo e foco automático no campo de mensagem.

O chat **chama o backend de verdade**. A tela usa `sendAiChatMessage()`, que envia `POST /ai/chat` pelo mesmo cliente HTTP do resto do app (com renovação de token). O backend valida o JWT, monta o contexto e chama o provedor configurado; se o provedor falhar, a resposta de erro chega à interface em vez de uma mensagem inventada.

## Fluxo

1. `lumina-app/src/components/AiChatWidget.tsx` mantém as mensagens da sessão.
2. `lumina-app/src/lib/ai-chat.ts` envia `{ message, history, scheduleTaskId? }` para `/ai/chat`.
3. `lumina-backend/src/ai/ai.controller.ts` valida o usuário e, quando há `scheduleTaskId`, monta no servidor o contexto da tarefa do cronograma.
4. `lumina-backend/src/ai/ai.service.ts` chama o provedor (Gemini, OpenRouter, Groq, OpenAI ou mock), respeita o limite por minuto de cada modelo e tenta os modelos de reserva em caso de falha.
5. A resposta normalizada (`{ message }`) volta para o widget.

O DTO limita cada mensagem a 4.000 caracteres e aceita apenas `user`/`assistant` no histórico; o serviço usa as 10 mensagens mais recentes como contexto. O limite global de requisições por IP fica em `RateLimitMiddleware` (padrão: 100 por minuto, configurável por `RATE_LIMIT_MAX` e `RATE_LIMIT_TTL_MS`).

## Outros endpoints da LuminIA

- `GET /ai/lessons/task/:taskId`: resumo de teoria do tópico da tarefa, gerado na primeira abertura.
- `GET /ai/weekly-comment`: comentário sobre a semana de estudos. Os fatos vêm do resumo do servidor; sem provedor, a resposta é um comentário determinístico com os mesmos fatos.
- `POST /ai/questions/similar`: gera uma questão parecida a partir de uma referência acessível. O cliente envia só `{ questionId }`; o servidor carrega enunciado, alternativas e gabarito, valida o JSON da IA e salva a variação no workspace pessoal como `GENERATED`/`UNREVIEWED`. Sem provedor devolve 503; resposta estruturalmente inválida devolve 502 sem gravar nada. Detalhes em [RESOLUCAO_QUESTOES.md](RESOLUCAO_QUESTOES.md).

## Configuração

- `AI_PROVIDER` e `AI_MODEL` definem o provedor e o modelo principal.
- `AI_FALLBACK_MODELS` define a ordem de reserva.
- `AI_PROVIDER=mock` atende testes e desenvolvimento sem chave externa.
- Chaves e credenciais ficam somente no backend; não use variáveis `VITE_*` para segredos.

## Limites e pendências

- O histórico existe **somente em memória** durante a sessão; recarregar a página perde a conversa.
- Não há moderação de conteúdo nem proteção específica contra prompt injection além do isolamento do prompt de sistema e do contexto montado no servidor.
- A disponibilidade depende da cota e da latência dos provedores gratuitos. O `AiService` repete 502/503/504 no mesmo modelo e depois tenta o próximo; se todos falharem, a interface mostra o erro.
- A resposta é uma orientação de estudo, não uma correção oficial; a interface deve deixar claro que a IA pode errar.
- A questão parecida é conteúdo gerado, não oficial e sem revisão humana. Ela fica marcada como `UNREVIEWED` nos metadados e restrita ao workspace pessoal; não entra no banco central automaticamente.

## Persistência futura

Para conversas persistentes, adicione entidades de conversa e mensagem no backend, sempre vinculadas ao usuário autenticado. Defina retenção, exclusão, limites de contexto e tratamento de dados pessoais antes de ativar o recurso em produção.

## Critérios antes da produção

- autenticação e autorização na rota (já implementadas);
- rate limiting global e limite por minuto do provedor (já implementados);
- timeout no provedor e fallback entre modelos (já implementados no `AiService`); cancelamento pelo usuário ainda pendente;
- moderação e proteção contra prompt injection;
- observabilidade sem registrar conteúdo sensível por padrão;
- política de privacidade e retenção;
- testes de erro, indisponibilidade e respostas longas;
- aviso visível de que respostas de IA podem conter erros.
