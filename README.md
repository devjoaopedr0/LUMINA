# LUMINA

Plataforma SaaS de preparação para vestibulares, começando pelo ENEM: questões e simulados, correção de redação com IA, cronograma adaptativo, cadernos, scanner de cartão-resposta, acompanhamento de desempenho e a assistente LuminIA, para alunos independentes e para instituições (turmas, professores, coordenação e direção).

A visão de longo prazo é um **ecossistema educacional**: a jornada individual do aluno, comunidades de estudo (**Lumina Groups**, planejado), instituições e um mercado de cursos e materiais de professores (**Lumina Marketplace**, futuro). Ver [docs/ROADMAP_ECOSSISTEMA.md](docs/ROADMAP_ECOSSISTEMA.md).

Monorepo simples (três projetos independentes, cada um com seu próprio `package.json`):

- `lumina-landing`: site institucional (porta 5173)
- `lumina-app`: aplicação do aluno, do professor e da gestão (porta 5174)
- `lumina-backend`: API NestJS + Prisma + PostgreSQL (porta 3001; Swagger em `/docs`)

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

## Documentação

### Produto e estratégia
- [Roadmap do ecossistema (visão, modelo de negócio, fases, riscos)](docs/ROADMAP_ECOSSISTEMA.md)
- [Status funcional do produto (registro das entregas)](STATUS_FUNCIONAL.md)
- [Funcionalidades gerais e ordem de implementação](docs/FUNCIONALIDADES_GERAIS.txt)
- [Lumina Groups: grupos e salas de estudo (planejado)](docs/LUMINA_GROUPS.md)
- [Lumina Marketplace: mercado educacional (futuro)](docs/LUMINA_MARKETPLACE.md)

### Funcionalidades
- [Chat LuminIA e guia de integração](docs/AI_CHAT.md)
- [Correção de redação por foto (scanner, RAG e MCP)](docs/CORRECAO_REDACAO_SCANNER.md)
- [Revisão humana da redação (human-in-the-loop)](docs/REVISAO_HUMANA_REDACAO.md)
- [Scanner de cartão-resposta (leitura óptica)](docs/SCANNER_GABARITO.md)
- [Gabarito Inteligente (em andamento)](docs/GABARITO_INTELIGENTE.md)
- [Cronograma adaptativo (design)](docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md)
- [Resolução de questões](docs/RESOLUCAO_QUESTOES.md)
- [Caderno de erros](docs/CADERNO_DE_ERROS.md)
- [Busca de questões na web](docs/BUSCA_WEB.md)
- [Importação de questões](docs/IMPORTACAO_QUESTOES.md)
- [Nota de corte do Sisu](docs/NOTA_DE_CORTE_SISU.md)
- [Cálculo mental](docs/CALCULO_MENTAL.md)
- [Revisão técnica de 13/09/2026](docs/REVISAO_TECNICA_2026-09-13.md)
