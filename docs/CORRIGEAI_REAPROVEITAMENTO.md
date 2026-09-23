# Análise do repositório externo `paivagpg77/corrigeAI`

Data da análise: 23/09/2026. Fonte: clone sparse do `main` (`6d0550e`), 41 arquivos de código revisados.

## O que é o projeto

O `corrigeAI` é uma plataforma escolar para **correção automática de provas impressas**: o professor cadastra a prova com o gabarito, o aluno marca a folha de respostas em papel, a folha é fotografada com o celular e um serviço de visão computacional lê as bolhas. É um **protótipo/MVP** (14 commits):

- **Backend**: Express + TypeScript + Prisma + PostgreSQL, arquivo único `routes.ts` (~90 linhas). Rotas: `auth/login`, `auth/me`, `auth/cadastro`, `turmas` (GET/POST), `alunos` (GET/POST), `provas` (GET/POST) e `correcoes/upload` (multer, 10 MB) — este último apenas grava `CorrecaoFoto` com status `PROCESSANDO`; **não existe rota que executa a correção**.
- **python-omr**: serviço FastAPI + OpenCV com `POST /omr/corrigir` que valida a imagem (formato, decodificação, dimensões) e devolve `respostas: {}` com `confianca: 0.0` — ou seja, **a detecção das bolhas não foi implementada**; é um stub que descreve o contrato.
- **Frontend**: Next.js (App Router) com páginas de cadastro/login, dashboard, turmas, alunos, provas (lista/nova/editar), correção (+ wizard "Enviar → Analisar → Comparar → Resultado"), resultados, relatórios, gestão e perfil. As páginas são majoritariamente **mockups estáticos** (dados fixos, sem chamada real à API nas telas-chave).
- **Modelo**: `Escola`, `Usuario` (tipos PROFESSOR/COORDENADOR/DIRETOR), `Turma` (série/turno MANHÃ/TARDE/NOITE), `Aluno`, `Disciplina`, `Prova` (status RASCUNHO/PUBLICADA/ENCERRADA), `Questao` (número, enunciado, alternativas A–E, resposta, valor), `Resultado` (PROCESSANDO/CONCLUÍDA/ERRO; nota, acertos, erros, imagem original), `Resposta` (resposta do aluno, correta, valor obtido) e `CorrecaoFoto` (identificação, arquivo, status).
- **RBAC**: `canAccess(user, roles)` — checagem por lista de cargos em cada rota, sem permissões granulares.

## Mapa com o inventário da Lumina

O caso de uso do `corrigeAI` corresponde **diretamente ao item 17 do inventário (Scanner de gabarito)**:

| corrIGEAI | Lumina (inventário) |
| --- | --- |
| Foto do cartão-resposta (`correcoes/upload`, mock `correcao`) | 17 — Foto do cartão-resposta; Upload de imagem |
| Serviço de visão (python-omr) para identificar marcações | 17 — Identificação das alternativas marcadas |
| Gabarito por questão na prova | 17 — Correção automática |
| Prova + aluno associados ao resultado (`Resultado`, `Resposta`) | 17 — Associação com aluno; com prova; Resultado imediato |
| Notas, acertos e erros por resultado | 17/40 — Relatórios por questão; Relatórios por turma |

Também tangencia os itens 19 (Provas anteriores — modelo `Prova`/`Questao` com gabarito), 4/6 (Painel do professor/diretor — `relatorios`), 7 (Gestão de instituições — `Escola`/`Turma`/`Aluno`) e 20 (Redação — nada relacionado; sem IA no repo).

## O que é reaproveitável (recomendações)

Como protótipo, o código **não é reaproveitável como está** (backend de arquivo único sem validação/erros estruturados, frontend estático, OMR sem detecção implementada, vulnerabilidades de protótipo como `.env` commitado). O valor está no **modelo conceitual e no contrato**, que alinham com a "Prioridade imediata" já documentada na Lumina:

1. **Contrato OMR (alto valor)**: definir na Lumina um contrato análogo ao `POST /omr/corrigir` (imagem → `respostas` + `confianca` + `observacao`) para o item 17. A Lumina já usa nestes moldes a ideia de captura assíncrona com estados (PROCESSANDO/CONCLUÍDA/ERRO) — o `corrigeAI` reforça o desenho. Nada do algoritmo de visão existe no repo para copiar; a implementação de detecção de bolhas/calibração continuaria sendo nossa.
2. **Esteira Resultado + Resposta (médio valor)**: o par `Resultado (nota, acertos, erros, imagemOriginal, erroMensagem)` → `Resposta (respostaAluno, correta, valorObtido)` espelha o que o item 17 precisa e o que a Lumina já tem nos simulados (submissão + correção por questão). Validar esse desenho no nosso schema antes de modelar o scanner evita retrabalho.
3. **Estados de prova (baixo valor)**: `RASCUNHO → PUBLICADA → ENCERRADA` pode enriquecer futuras entregas de provas/listas institucionais.
4. **Fluxo de captura (conceito)**: o wizard "Enviar → Analisar → Comparar → Resultado" e a captura pela câmera do celular (`capture="environment"`) são o padrão de UX esperado para o item 17; reaproveitar a ideia, não o código.

## O que NÃO reaproveitar

- Backend Express single-file, sem DTOs/validação, sem guards por permissão, senhas/segredos no repo.
- Frontend Next.js mockado: as páginas não conversam com a API; reescreveríamos na stack atual da Lumina (React + Vite + componentes existentes).
- OMR stub: retorna `{}` — útil apenas como especificação de interface.
- RBAC por lista de cargos: a Lumina já tem RBAC por permissões e workspaces (Fase 2), muito mais completo.

## Conclusão

O `corrigeAI` é um exemplo de produto concorrente em estágio inicial que valida a demanda de **correção de gabarito impresso por foto** (item 17). A Lumina deve **absorver o conceito/contrato, não o código**: montar a esteira de captura → OMR → correção já prevista na nossa rota de prioridades (captura assíncrona, estados visíveis, confiança mínima com revisão manual, vínculo com simulado/lista/turma). Nenhuma dependência técnica é herdada do repositório.