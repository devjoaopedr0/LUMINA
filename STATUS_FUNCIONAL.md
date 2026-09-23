# Status funcional da Lumina

## Atualização de 23/09/2026 — Cadastro de instituição na criação da conta

- A pedido do usuário, o cadastro de instituição deixou de existir no dashboard (passo pós-criação de usuário) e passou a acontecer **na criação da conta**: a opção "Sou instituição" agora coleta nome, e-mail institucional e telefone (opcional) além dos dados do responsável.
- Backend: `RegisterDto` aceita um objeto `institution` aninhado (validado por `ValidateNested`); `AuthService.register` cria o usuário como `DIRECTOR` e, **na mesma transação**, a instituição com workspace, os 4 cargos padrão (Diretor/Coordenador/Professor/Aluno) e o vínculo ACTIVE do responsável como Diretor. Conflito de e-mail institucional desfaz todo o cadastro.
- Regra de negócio: cadastro institucional não pode ser combinado com `accountType`/`teacherSubject` (400).
- Frontend: formulário completo em `Signup.tsx` para o perfil "instituição"; removido o bloco "Representa uma escola ou cursinho?" do dashboard (estado, handler e import correspondentes).
- Endpoint `POST /institutions` (autenticado) permanece disponível e reutiliza a mesma lógica transacional.
- Testes: 3 novos casos unitários em `auth.service.spec.ts` (DIRECTOR + instituição na mesma transação; rejeição de combinação com accountType; rollback quando o e-mail institucional já existe); 2 novos casos e2e em `auth.e2e-spec.ts`; fake do Prisma e2e estendido com os delegates `permission` e `institution.create`/`findUniqueOrThrow` usados pelo cadastro (o erro `Cannot read properties of undefined (reading 'findMany')` foi justamente esse gap do fake, não do código real).
- Verificações: typecheck e build do backend e do aplicativo aprovados; lint do aplicativo com zero erros e zero avisos; suíte de testes do backend com **234 aprovados em 17 arquivos**.
- Correção descoberta na validação ao vivo: instituições nasciam PENDING (default do schema) e a política de turmas exige instituição ACTIVE, sem existir fluxo de ativação — toda escola recém-cadastrada ficava impedida de gerir turmas (403 "A instituição não está ativa" em editar/arquivar/transferir). Corrigido: `InstitutionsService.createInTransaction` agora cria a instituição **ACTIVE** (vale para o cadastro na conta e para `POST /institutions`); asserção nova em `institutions.service.spec.ts`; instituições de teste antigas (QA/resíduo) foram ativadas no banco configurado para alinhar ao novo comportamento.
- Validação integrada ao vivo (backend real + Postgres configurado, sem navegador): cadastro institucional na conta (usuário nasce DIRECTOR, workspace institucional com cargo Diretor e permissões CLASS_MANAGE/MEMBER_MANAGE/REPORT_VIEW/ROLE_MANAGE), convite e aceite de professor como Professor ACTIVE, criação de turma caindo no workspace institucional, listagem vista por professor e diretor, edição (limite/série/descrição), arquivamento/desarquivamento com `includeArchived`, recusa de aluno independente sem vínculo (403 — regra aprovada de vínculo ativo), matrícula de aluno institucional por código após convite/aceite e painel do diretor com as contagens corretas. Permanece pendente apenas a validação visual da interface no navegador (ferramenta indisponível na sessão: `browser.disconnected`).

## Atualização de 22/09/2026 — funcionalidade 8: Gestão de turmas

- Retomada a implementação iniciada nas alterações locais posteriores ao commit `db3087a` (item 7).
- Integrada a página `/app/turmas`, acessível pelo dashboard e pela área de simulados.
- Implementados edição de nome/descrição/limite, arquivamento e desarquivamento, vínculo e remoção de professores/alunos por conta cadastrada, associação de disciplina, período letivo e ano/série.
- Detalhe da turma apresenta composição e histórico de atividades, questões e contagem de entregas. A interface distingue consulta de gerenciamento conforme a autorização retornada pela API.
- Listagem permite consultar turmas arquivadas e turmas institucionais para usuários com `CLASS_MANAGE`. Novos vínculos são recusados em turmas arquivadas.
- Banco: `prisma migrate deploy` confirmou as 22 migrações aplicadas, incluindo `20260921120000_add_class_organization`.
- Lotação: ingresso por código e matrícula direta usam a mesma transação, com bloqueio da linha da turma antes da contagem. Matrículas já existentes são idempotentes mesmo em turma lotada.
- Edição: limpar disciplina, período, ano/série e limite agora persiste a remoção do valor, em vez de manter silenciosamente o anterior.
- Revisão adicional: transferência recusa destino arquivado e revalida vagas dentro da transação; edição não permite reduzir limite abaixo das matrículas; nome nulo retorna erro de validação de negócio.
- Regra aprovada pelo usuário: turmas institucionais exigem vínculo ativo para ingresso, matrícula direta e transferência. Consulta/gestão e inclusão de professor também verificam vínculo institucional. Turmas técnicas de professores independentes preservam ingresso sem convite institucional.
- Validação: suíte completa com 227 testes aprovados em 17 arquivos; após adicionar duas regressões, os 42 testes dos módulos de simulados e convites passaram. Builds de backend e aplicativo aprovados; typecheck do backend aprovado; lint do aplicativo com zero erros e zero avisos. Corrigida configuração Oxc/SWC do Vitest e separados componentes React de exports auxiliares para Fast Refresh.
- Pendente antes de encerrar o item: validação autenticada da nova interface no navegador (ferramenta indisponível nesta sessão: `browser.disconnected`). A criação de turma continua no fluxo existente de simulados.

## Atualização de 20/09/2026 — funcionalidade 7: Gestão de instituições

- Implementado: cadastro de instituição (POST /institutions) — cria a Institution + Workspace, semeia os 4 cargos institucionais padrão (Diretor, Coordenador, Professor, Aluno) e vincula quem criou como Diretor.
- Implementado: convites institucionais por e-mail (Diretor/Coordenador convidam; a pessoa precisa já ter conta na Lumina — convite para e-mail sem conta ainda não é suportado) com aceite explícito pelo convidado.
- Implementado: transferência de aluno entre turmas da mesma instituição.
- Corrigido: turma criada por professor institucional agora nasce no workspace da instituição (antes caía num pseudo-workspace individual por professor, invisível para coordenação/direção).
- Corrigido: schema drift do model Simulation (assessmentType/dueAt ausentes do schema.prisma apesar de já aplicados no banco) — corrigia um 500 em GET /simulations para qualquer usuário.
- Pendente: convite para e-mail ainda sem conta cadastrada; conceito de "ano letivo" tratado hoje via período letivo (Fase 5), sem campo dedicado; interface de gestão de membros/turmas ainda concentrada no painel do diretor, sem tela própria de "gestão de instituições".
- Validação: 207 testes aprovados, typecheck e build dos três projetos, fluxo completo (cadastro → convite → aceite → transferência de turma) verificado ao vivo contra o banco configurado.

## Atualização de 20/09/2026 — funcionalidade 6: Painel do diretor

- Implementado: indicadores gerais da instituição com turmas, alunos, professores, entregas, média acadêmica e membros ativos.
- Implementado: desempenho consolidado por turma e disciplina.
- Implementado: evolução acadêmica mensal com volume de entregas.
- Implementado: relatório consolidado exportável em CSV.
- Implementado: gestão de usuários institucionais com ativação e suspensão de vínculos.
- Implementado: conversão entre professor e coordenador, exigindo disciplina ao definir um professor.
- Implementado: visão estratégica com indicação da turma e disciplina que demandam maior atenção.
- Segurança: somente diretor com vínculo institucional ativo acessa os dados; a própria conta do diretor não pode ser alterada pelo painel.
- Validação: 186 testes aprovados, typecheck do backend e frontend e build de produção do aplicativo.
## Atualização de 20/09/2026 — funcionalidade 5: Painel do coordenador

- Implementado: visão geral das turmas e comparação por desempenho.
- Implementado: acompanhamento de professores e disciplinas vinculadas.
- Implementado: desempenho consolidado por disciplina, média institucional e alunos em atenção.
- Implementado: relatório pedagógico exportável em CSV.
- Implementado: cadastro, histórico e ativação de períodos letivos, limitado ao coordenador vinculado a uma instituição ativa.
- Validação: 185 testes aprovados, typecheck dos três projetos, build completo, schema Prisma válido e 21 migrações aplicadas.


## Referência geral

O inventário completo enviado pelo usuário está preservado em [Funcionalidades gerais](docs/FUNCIONALIDADES_GERAIS.txt). A ordem numerada desse documento orienta as próximas entregas. Na seção 1, o encerramento de todas as sessões foi implementado com revogação de tokens por versão de sessão. A migração `20260916030000_add_session_version` foi aplicada no banco configurado em 16/09/2026. O gerenciamento individual de sessões permite listar e encerrar uma sessão; a migração `20260917010000_add_auth_sessions` foi aplicada no banco configurado em 17/09/2026.

Em 17/09/2026, o perfil acadêmico ganhou etapa de ensino, série/ano e escola/curso, editáveis no perfil e retornados pela API autenticada. A migração `20260918010000_add_academic_profile` foi aplicada no banco configurado.

O perfil também permite informar curso desejado e universidade-alvo. O vestibular-alvo existente no cronograma agora pode ser consultado, editado e limpo na página de perfil, com data opcional. A migração `20260918020000_add_academic_goals` foi aplicada no banco configurado.

As preferências de estudo incluem melhor período, duração desejada por sessão e quantidade de dias por semana. A migração `20260918030000_add_study_preferences` foi aplicada no banco configurado em 18/09/2026.

As configurações da conta permitem trocar a senha local mediante confirmação da senha atual. A alteração revoga todas as sessões e exige novo login.

Os tipos de conta são persistidos como aluno independente, aluno institucional, professor, coordenador, diretor ou administrador. O cadastro público permite somente aluno independente e professor; perfis institucionais e administrativos ficam reservados aos futuros fluxos de gestão e convites. A migração `20260918040000_add_account_types` foi aplicada no banco configurado em 18/09/2026.

## Fase 2 — Controle de acesso — concluída

Concluída em 18/09/2026 com infraestrutura RBAC reutilizável por workspace, gestão de cargos e permissões, consulta autenticada dos acessos efetivos e rotas protegidas. Workspaces pessoais concedem acesso de proprietário; workspaces institucionais exigem vínculo ativo e todas as permissões declaradas. Os escopos de turma e aluno validam coordenação, docência, matrícula ou permissão institucional sem expor alunos de outras turmas. O dashboard apresenta experiências distintas para estudante, professor, coordenador, diretor e administrador. A migração `20260918050000_seed_rbac_permissions` registra o catálogo inicial de permissões.

## Atualização de 16/09/2026 — simulados

- Implementado: professor pode criar turma e compartilhar código de ingresso; estudante pode entrar na turma.
- Implementado: estudante cria simulado pessoal, professor cria simulado para sua turma, escolhendo de 1 a 90 questões do banco.
- Implementado: lista de simulados disponíveis, prova imprimível e cartão-resposta com identificação do simulado, ordem estável e bolinhas para marcar.
- Implementado: envio digital único por estudante, correção com gabarito preservado no simulado e resultado por questão com total de acertos.
- Migrações `20260916010000_add_simulations` e `20260916020000_add_simulation_submissions` aplicadas no banco configurado em 16/09/2026.
- Pendente: teste autenticado no navegador, leitura do cartão por câmera e analytics por turma/assunto.


Atualizado em 26/08/2026 a partir do código, rotas, schema Prisma e testes do repositório.

## Implementado

- Autenticação: cadastro com e-mail/senha, login, Google OAuth, criação/vinculação de conta Google, recuperação e redefinição de senha, verificação e reenvio de e-mail, JWT e consulta da sessão.
- Perfil: consulta e edição de nome, sobrenome, username, telefone, nascimento e bio; foto local com clique/drag and drop, recorte e compactação no navegador.
- Banco de questões: cadastro, edição, exclusão, importação em lote por arquivo JSON/CSV com relatório, destino protegido para o banco central, deduplicação, alternativas, resposta e correção automática.
- Catálogo educacional: disciplinas, assuntos, provas/vestibulares, ano, dificuldade e classificação estruturada.
- Histórico de questões: tentativas, acertos/erros, tempo de resposta, favoritos, progresso e desempenho por disciplina/assunto.
- Cronograma pessoal: vestibular-alvo, dias e tempo disponível, catálogo com 15 disciplinas do ENEM, divisão por matéria, sessões, tarefas, conclusão, reagendamento, sala exclusiva de cronômetro e progresso agregado.
- Fundações institucionais no banco: instituições, workspaces, membros, cargos, permissões, turmas, professores e alunos.
- Landing page pública e documentação Swagger da API.
- Cálculo mental rápido: primeira implementação de interface e API com rodadas cronometradas, dificuldade adaptativa, desafio diário e histórico por conta. Ativação depende da migração do banco; detalhes em [Cálculo mental](docs/CALCULO_MENTAL.md).

## Parcial

- Redações: editor, temas, salvamento automático, histórico de versões e importação de texto UTF-8 com prévia. Migração aplicada no banco local em 15/09/2026; correção por IA/professor e scanner ainda pendentes.
- Catálogo de propostas de redação do ENEM 2011–2025 e cadastro de professor com matéria para criação de conteúdo autoral pessoal. Consulte [Redações, professores e scanner](docs/REDAÇÕES_PROFESSORES_SCANNER.md); a migração desta etapa ainda depende da disponibilidade do PostgreSQL local.
- Fase 3 — Painel do aluno — concluída: visão geral, notas e simulados pendentes, progresso por matéria e assunto/habilidade, metas acadêmicas, cronograma, atividades, recomendação determinística, históricos de estudos, questões, simulados e redações, tempo estudado e sequência de dias.
- Fase 4 — Painel do professor — concluída: turmas e alunos, desempenho individual e geral, relatórios CSV, criação de atividades, listas, provas e simulados com prazo, correção automática, acompanhamento periódico das entregas, alertas pedagógicos e conteúdos com baixo desempenho.
- Fase 5 — Painel do coordenador — concluída: visão institucional das turmas, comparação de desempenho, acompanhamento dos professores, relatórios pedagógicos e gestão de períodos letivos.
- Fase 6 — Painel do diretor — concluída: indicadores institucionais, desempenho acadêmico, evolução mensal, relatório consolidado, gestão de usuários e visão estratégica.
- LuminIA conversacional: interface flutuante autenticada, responsiva e com adaptador isolado pronta; ainda falta conectar o backend e o provedor de IA.
- Cronograma adaptativo: há reorganização de tarefas perdidas, porém ainda não usa IA nem dificuldades acadêmicas para gerar/adaptar o plano.
- Instituições: cadastro, convites (só para e-mail já cadastrado), transferência entre turmas e gestão de membros (painel do diretor) implementados; código de turma e períodos letivos já existiam. Falta convite para e-mail sem conta e tela dedicada de gestão de instituições. Edição/arquivamento de turmas já têm interface própria no item 8.
- Provas antigas: o catálogo de exames e suas questões existe; faltam experiência de prova completa, cadernos, gabaritos e comparação entre provas.
- Recomendações: os dados de desempenho necessários já são coletados; falta o motor adaptativo e a interface de recomendações.
- Perfil: a foto local é armazenada como imagem compactada no perfil; armazenamento de objetos dedicado ainda não existe. Preferências de estudo possuem persistência e edição desde 18/09/2026.

## Não iniciado

- Janela de aplicação, cronômetro de prova e relatórios avançados pós-simulado.
- Scanner de cartão-resposta, câmera, visão computacional e correção física.
- Explicações personalizadas da LuminIA integradas ao histórico acadêmico.
- Correção de redações por IA/professor, competências, notas e evolução.
- Administração interna da plataforma.
- Exportação institucional em PDF/Excel e comparações históricas entre períodos.
- Mapa de Domínio e Lumina Score.
- Agenda/calendário unificado, lembretes e notificações.
- Metas independentes, gamificação, XP, níveis, conquistas, streaks e desafios.
- Planos, assinaturas, pagamentos e cobrança institucional.
- Denúncias, suporte e gestão editorial completa dos conteúdos.

## Prioridade imediata: correções por captura e texto

1. Correção de redação por scanner no estilo CamScanner: câmera ou arquivo, detecção das bordas, recorte e correção de perspectiva, melhoria de contraste/sombras, suporte a várias páginas, OCR, revisão da transcrição e correção pelas competências do ENEM. O original e o texto reconhecido devem permanecer vinculados e toda baixa confiança precisa de confirmação manual.
2. Correção de redação digitada/transcrita dentro da plataforma: editor com salvamento automático, contagem de palavras, versões, seleção de tema e o mesmo relatório por competências usado pelo scanner, permitindo comparar evolução sem depender de imagem.
3. Correção de gabaritos por scanner: modelos identificáveis de cartão-resposta, captura guiada, alinhamento pelos marcadores, leitura de marcações, nível de confiança por resposta, revisão manual das ambíguas e vínculo automático ao simulado/lista antes de calcular nota e desempenho.
4. Treino de raciocínio lógico e cálculo mental rápido: rodadas curtas com operações matemáticas básicas, resposta contra o tempo, sequência de acertos e dificuldade adaptativa. O módulo deve registrar precisão, tempo médio por resposta, evolução por tipo de operação e erros recorrentes, com modos de treino livre e desafio diário inspirados na dinâmica de resposta rápida citada como referência.

Os três fluxos de correção por captura/texto devem compartilhar uma esteira de captura e processamento assíncrono, com estados visíveis, repetição segura, trilha de auditoria, proteção dos arquivos enviados e exclusão configurável. A correção por IA deve apresentar justificativas e permitir revisão humana; uma nota não deve ser tratada como definitiva quando a imagem ou o OCR estiverem abaixo do nível mínimo de confiança.

## Ordem recomendada das demais entregas

5. Criar listas/cadernos e simulados, base necessária para associar gabaritos digitalizados.
6. Finalizar instituições (API e interface de membros, cargos, permissões, turmas e códigos de entrada).
7. Consolidar dashboard e analytics do aluno com os dados já coletados.
8. Implementar Mapa de Domínio e recomendações determinísticas antes da LuminIA generativa.
9. Adicionar provas antigas completas, com imagens, revisão editorial e comparação entre edições.
10. Construir dashboards institucionais e relatórios.
11. Integrar LuminIA conversacional, notificações, gamificação e pagamentos após os fluxos centrais estarem maduros.

Cada item deve ser entregue verticalmente: migração/schema, regras de autorização, API, interface, testes e observabilidade.
