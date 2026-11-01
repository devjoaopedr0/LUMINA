# LUMINA

Monorepo simples (três projetos independentes, cada um com seu próprio `package.json`):

- `lumina-landing` — site institucional (porta 5173)
- `lumina-app` — aplicação (login/cadastro/dashboard) (porta 5174)
- `lumina-backend` — API de autenticação, NestJS + Prisma (porta 3001)

## Rodando tudo de uma vez (desenvolvimento)

Na raiz do repositório:

```bash
npm install
npm run dev
```

Isso sobe `lumina-backend` e `lumina-app` juntos (o app depende do backend pra login/cadastro funcionarem). Pra incluir também a landing:

```bash
npm run dev:all
```

Pré-requisitos antes de rodar:
1. Postgres disponível (local ou via `docker compose up -d` dentro de `lumina-backend`).
2. `lumina-backend/.env` preenchido — veja `lumina-backend/.env.example` para o que cada variável significa.
3. `lumina-app/.env` (opcional em dev — os valores padrão já apontam pro localhost).

Cada projeto também pode ser rodado isoladamente (`npm run dev` dentro dele, ou `npm run start:dev` no caso do backend) — o comando na raiz é só uma conveniência que já orquestra os dois.

## Documentação de funcionalidades

- [Chat LuminIA e guia de integração](docs/AI_CHAT.md)
- [Status funcional do produto](STATUS_FUNCIONAL.md)
- [Funcionalidades gerais e ordem de implementação](docs/FUNCIONALIDADES_GERAIS.txt)
- [Correção de redação por foto (scanner, RAG e MCP)](docs/CORRECAO_REDACAO_SCANNER.md)
- [Scanner de cartão-resposta (leitura óptica)](docs/SCANNER_GABARITO.md)
