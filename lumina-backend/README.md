# lumina-backend

API de autenticação da Lumina — NestJS + PostgreSQL + Prisma ORM + JWT. Nesta etapa, implementa **apenas** cadastro, login e proteção de rotas via JWT. Nenhum outro módulo (instituições, turmas, scanner, IA, pagamentos) está implementado ainda.

## Setup

1. Copie `.env.example` para `.env` e preencha todas as variáveis (veja os comentários de cada uma no próprio arquivo).
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Gere o Prisma Client:
   ```bash
   npm run prisma:generate
   ```
4. Aplique o schema no banco:
   ```bash
   npm run prisma:migrate:dev
   ```
5. Suba a API em modo desenvolvimento:
   ```bash
   npm run start:dev
   ```
6. Documentação interativa (Swagger): `http://localhost:<PORT>/docs`.

## Endpoints

| Método | Rota | Descrição | Autenticação |
|---|---|---|---|
| POST | `/auth/register` | Cria a conta + Workspace pessoal | — |
| POST | `/auth/login` | Autentica e retorna os tokens JWT | — |
| GET | `/auth/me` | Retorna o usuário autenticado | Bearer token |

## Scripts

- `npm run start:dev` — servidor de desenvolvimento (`tsx watch`, sem build prévio).
- `npm run build` / `npm run start:prod` — build de produção (`tsc`) e execução do `dist/`.
- `npm run typecheck` — só checa tipos, sem emitir.
- `npm test` — roda a suíte de testes (unitários + e2e via HTTP com Prisma mockado).
- `npm run prisma:validate` — valida `prisma/schema.prisma` sem precisar de conexão com o banco.
- `npm run prisma:migrate:dev` — aplica migrations pendentes em desenvolvimento (usa `SHADOW_DATABASE_URL` se definida).
- `npm run prisma:migrate:deploy` — aplica migrations em produção/homologação.
- `npm run prisma:studio` — abre o Prisma Studio para inspecionar os dados.

## Decisões técnicas relevantes

- **Prisma 7 + driver adapter**: o client não conecta mais sozinho a partir de `DATABASE_URL` — `PrismaService` instancia explicitamente `@prisma/adapter-pg` (node-postgres). O gerador usado é o clássico `prisma-client-js` (CommonJS), não o novo `prisma-client` (ESM-only, incompatível com este projeto).
- **users + user_profiles continuam separados**: dados de autenticação (`users`) ficam à parte dos dados públicos de perfil (`user_profiles`, 1:1). A API expõe os dois já achatados num único objeto `user`.
- **Workspace pessoal automático**: todo `POST /auth/register` cria, na mesma transação, um `Workspace` do tipo `PERSONAL` + um cargo de sistema "Owner" + o vínculo do usuário — pré-requisito para o restante da plataforma funcionar.
- **Refresh token**: já é emitido (JWT assinado com `JWT_REFRESH_SECRET`, diferente do secret do access token), mas ainda não existe endpoint `/auth/refresh` nem revogação — só a estrutura, como combinado.
- **Testes sem Postgres**: os testes e2e sobem a aplicação NestJS real (guards, pipes, filtro global) trocando o `PrismaService` por um fake em memória — não dependem de um banco rodando.

## Estrutura

```
src/
  auth/         # cadastro, login, JWT (strategy/guard), DTOs
  users/        # repository + service de usuários (Repository Pattern)
  common/       # filtro global de exceções, decorators
  config/       # validação de variáveis de ambiente
  database/     # PrismaService/PrismaModule
  app.module.ts
  main.ts
prisma/
  schema.prisma       # módulo CORE completo
  migrations/          # migration inicial
test/
  auth.e2e-spec.ts     # testes e2e via HTTP (supertest)
  fake-prisma.ts       # PrismaService fake usado nos testes e2e
```
