# LuminIA — chat da área autenticada

## Estado atual

O chat flutuante aparece no canto inferior direito de todas as rotas iniciadas por `/app` quando há um usuário autenticado. A interface oferece:

- abertura e minimização do painel;
- histórico em memória durante a navegação da sessão;
- envio por formulário, estado de carregamento e mensagens de erro;
- layout responsivo para desktop e celular;
- rótulos acessíveis e foco automático no campo de mensagem.

O chat ainda **não chama um modelo de IA**. Enquanto a integração não for configurada, mensagens enviadas recebem um aviso explícito de que a conexão está pendente.

## Arquitetura

- `lumina-app/src/components/AiChatWidget.tsx`: interface e estado da conversa.
- `lumina-app/src/lib/ai-chat.ts`: contrato e ponto único de integração.
- `lumina-app/src/App.tsx`: montagem global do widget dentro do contexto autenticado.

## Como integrar a IA

Implemente `sendAiChatMessage()` em `lumina-app/src/lib/ai-chat.ts`. A função recebe a mensagem atual e o histórico da sessão e deve retornar apenas o texto da resposta.

A integração recomendada é feita pelo backend:

1. criar uma rota autenticada, por exemplo `POST /ai/chat`;
2. validar o JWT e limitar tamanho/frequência das mensagens;
3. enviar ao provedor apenas o contexto necessário;
4. manter chaves e credenciais exclusivamente no backend;
5. retornar uma resposta normalizada, como `{ "message": "..." }`;
6. substituir o erro provisório de `sendAiChatMessage()` pela chamada a essa rota.

Não coloque chaves de provedor em variáveis `VITE_*`, pois elas são expostas no bundle do navegador.

## Persistência futura

O histórico atual existe somente em memória. Para conversas persistentes, adicione entidades de conversa e mensagem no backend, sempre vinculadas ao usuário autenticado. Defina também retenção, exclusão, limites de contexto e tratamento de dados pessoais antes de ativar o recurso em produção.

## Critérios antes da produção

- autenticação e autorização na rota;
- rate limiting, timeout e cancelamento;
- moderação e proteção contra prompt injection;
- observabilidade sem registrar conteúdo sensível por padrão;
- política de privacidade e retenção;
- testes de erro, indisponibilidade e respostas longas;
- aviso visível de que respostas de IA podem conter erros.
