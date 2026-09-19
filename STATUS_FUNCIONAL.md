# Status funcional da Lumina

## Referência geral

O inventário completo enviado pelo usuário está preservado em [Funcionalidades gerais](docs/FUNCIONALIDADES_GERAIS.txt). A ordem numerada desse documento orienta as próximas entregas. Na seção 1, o encerramento de todas as sessões foi implementado com revogação de tokens por versão de sessão. A migração `20260916030000_add_session_version` foi aplicada no banco configurado em 16/09/2026. O gerenciamento individual de sessões permite listar e encerrar uma sessão; a migração `20260917010000_add_auth_sessions` foi aplicada no banco configurado em 17/09/2026.

Em 17/09/2026, o perfil acadêmico ganhou etapa de ensino, série/ano e escola/curso, editáveis no perfil e retornados pela API autenticada. A migração `20260918010000_add_academic_profile` foi aplicada no banco configurado.

O perfil também permite informar curso desejado e universidade-alvo. O vestibular-alvo existente no cronograma agora pode ser consultado, editado e limpo na página de perfil, com data opcional. A migração `20260918020000_add_academic_goals` foi aplicada no banco configurado.

As preferências de estudo incluem melhor período, duração desejada por sessão e quantidade de dias por semana. A migração `20260918030000_add_study_preferences` foi aplicada no banco configurado em 18/09/2026.

As configurações da conta permitem trocar a senha local mediante confirmação da senha atual. A alteração revoga todas as sessões e exige novo login.

Os tipos de conta são persistidos como aluno independente, aluno institucional, professor, coordenador, diretor ou administrador. O cadastro público permite somente aluno independente e professor; perfis institucionais e administrativos ficam reservados aos futuros fluxos de gestão e convites. A migração `20260918040000_add_account_types` foi aplicada no banco configurado em 18/09/2026.

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
- Dashboard do aluno: navegação lateral, foco diário, métricas reais, progresso e próximas atividades; ainda faltam gráficos avançados e pontos fortes/fracos.
- LuminIA conversacional: interface flutuante autenticada, responsiva e com adaptador isolado pronta; ainda falta conectar o backend e o provedor de IA.
- Cronograma adaptativo: há reorganização de tarefas perdidas, porém ainda não usa IA nem dificuldades acadêmicas para gerar/adaptar o plano.
- Instituições: o modelo de dados e a resolução de permissões existem, mas não há API nem interface de cadastro, convite, código de turma, gestão de membros/cargos/turmas/períodos.
- Provas antigas: o catálogo de exames e suas questões existe; faltam experiência de prova completa, cadernos, gabaritos e comparação entre provas.
- Recomendações: os dados de desempenho necessários já são coletados; falta o motor adaptativo e a interface de recomendações.
- Perfil: a foto local é armazenada como imagem compactada no perfil; armazenamento de objetos dedicado ainda não existe. Preferências do usuário ainda não possuem modelo/API/tela.

## Não iniciado

- Janela de aplicação, cronômetro de prova e relatórios avançados pós-simulado.
- Scanner de cartão-resposta, câmera, visão computacional e correção física.
- Explicações personalizadas da LuminIA integradas ao histórico acadêmico.
- Correção de redações por IA/professor, competências, notas e evolução.
- Dashboards de professor, coordenador, diretor e administração interna.
- Relatórios institucionais, exportação PDF/Excel e comparações entre turmas/períodos.
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
