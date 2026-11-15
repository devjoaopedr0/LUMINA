# Usuários de teste (desenvolvimento)

Contas para testar telas e funcionalidades por perfil, no ambiente local (`http://localhost:5174`, API em `http://localhost:3001`). **Só para desenvolvimento**: não use estas senhas em produção.

Recriar ou completar as contas da escola (idempotente, não troca senhas):

```bash
cd lumina-backend && npm run build && npm run seed:test-users
```

## Contas

| Perfil | E-mail | Senha | Vínculos |
|---|---|---|---|
| Aluno independente | `aluno.teste@lumina.dev` | `Teste@1234` | aluno da turma "3º ano A" (do professor independente) |
| Professor independente | `professor.teste@lumina.dev` | `Teste@1234` | Matemática; professor da turma "3º ano A" |
| Direção | `diretor.teste@lumina.dev` | `Teste@1234` | diretora da "Escola Teste Lumina" |
| Coordenação | `coordenador.teste@lumina.dev` | `Teste@1234` | coordenador da "Escola Teste Lumina" e da "Turma Teste 3A" |
| Professor da escola | `professor.escola.teste@lumina.dev` | `Teste@1234` | Matemática; professor da "Turma Teste 3A" |
| Aluno da escola | `aluno.escola.teste@lumina.dev` | `Teste@1234` | aluno da "Turma Teste 3A" (código `TESTE3A`) |
| Administrador da plataforma | `admin.teste@lumina.dev` | `Teste@1234` | `ADMIN`: publica no acervo dos cadernos |
| Gestor do banco de questões | `admin@lumina.app` | `AdminLumina123` (seed principal) | cargo "Administrador do Banco": edita questões do banco e valida as habilidades do ENEM |
| Demonstração | `demo@lumina.app` | `DemoLumina123` (seed principal) | aluno com cadernos de exemplo |

As contas `.teste@lumina.dev` independentes foram criadas à mão; as da escola, pelo script `src/institutions/seed-test-users.ts`; `admin@lumina.app` e `demo@lumina.app`, pelo seed principal (`npm run prisma:seed`).

## O que testar com cada uma

| Conta | Telas e funcionalidades |
|---|---|
| Aluno independente | banco de questões, simulados, mapa de domínio (por assunto e por habilidade do ENEM), plano de recuperação (`/app/recuperacao`), materiais da turma, cadernos, redação, LuminIA, grupos, "Meu plano" (Gratuito) |
| Aluno da escola | o mesmo, como aluno vinculado a uma instituição; materiais e atividades da "Turma Teste 3A" |
| Professor independente / da escola | turmas e convites, simulados para a turma, acompanhamento (`/app/acompanhamento`): alertas pedagógicos, planos de recuperação dos alunos; envio de materiais e geração de questões a partir deles; revisão humana de redação |
| Coordenação | painel da coordenação, períodos letivos, turmas e professores da escola, revisões de redação |
| Direção | painel da direção, membros da instituição (cargos e status), indicadores da escola |
| Administrador da plataforma | publicar fórmulas e repertórios no acervo da Lumina |
| Gestor do banco | criar, editar e importar questões do banco; confirmar a habilidade do ENEM sugerida pela IA na edição da questão |

Conferido em 15/11/2026: as 9 contas fazem login e acessam a rota principal do próprio perfil.

## O que estas contas não cobrem

- **Premium:** nenhuma conta tem assinatura paga. A cobrança real depende das credenciais do Asaas (ver `docs/PLANOS_E_ASSINATURAS.md`).
- **E-mail:** as contas já nascem com e-mail verificado; o fluxo de confirmação e de "esqueci a senha" precisa de uma conta nova e do envio de e-mail configurado.
