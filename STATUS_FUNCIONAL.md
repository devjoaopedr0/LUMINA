# Status funcional da Lumina

Atualizado em 23/08/2026 a partir do código, rotas, schema Prisma e testes do repositório.

## Implementado

- Autenticação: cadastro com e-mail/senha, login, Google OAuth, criação/vinculação de conta Google, recuperação e redefinição de senha, verificação e reenvio de e-mail, JWT e consulta da sessão.
- Perfil: consulta e edição de nome, sobrenome, username, foto por URL, telefone, nascimento e bio.
- Banco de questões: cadastro, edição, exclusão, importação JSON/CSV, deduplicação, alternativas, resposta e correção automática.
- Catálogo educacional: disciplinas, assuntos, provas/vestibulares, ano, dificuldade e classificação estruturada.
- Histórico de questões: tentativas, acertos/erros, tempo de resposta, favoritos, progresso e desempenho por disciplina/assunto.
- Cronograma pessoal: vestibular-alvo, dias e tempo disponível, disciplinas, sessões, tarefas, conclusão, reagendamento, cronômetro e progresso agregado.
- Fundações institucionais no banco: instituições, workspaces, membros, cargos, permissões, turmas, professores e alunos.
- Landing page pública e documentação Swagger da API.

## Parcial

- Dashboard do aluno: existe a área inicial e os acessos aos módulos, mas faltam métricas reais, gráficos, metas, próximas atividades e pontos fortes/fracos.
- Cronograma adaptativo: há reorganização de tarefas perdidas, porém ainda não usa IA nem dificuldades acadêmicas para gerar/adaptar o plano.
- Instituições: o modelo de dados e a resolução de permissões existem, mas não há API nem interface de cadastro, convite, código de turma, gestão de membros/cargos/turmas/períodos.
- Provas antigas: o catálogo de exames e suas questões existe; faltam experiência de prova completa, cadernos, gabaritos e comparação entre provas.
- Recomendações: os dados de desempenho necessários já são coletados; falta o motor adaptativo e a interface de recomendações.
- Perfil: foto funciona por URL; upload e armazenamento próprio ainda não existem. Preferências do usuário ainda não possuem modelo/API/tela.

## Não iniciado

- Simulados completos/mini/personalizados, janela de aplicação, cronômetro de prova e relatórios pós-simulado.
- Scanner de cartão-resposta, câmera, visão computacional e correção física.
- LuminIA conversacional e explicações personalizadas integradas ao histórico.
- Redações: temas, envio, correção por IA/professor, competências, notas e evolução.
- Dashboards de professor, coordenador, diretor e administração interna.
- Relatórios institucionais, exportação PDF/Excel e comparações entre turmas/períodos.
- Mapa de Domínio e Lumina Score.
- Agenda/calendário unificado, lembretes e notificações.
- Metas independentes, gamificação, XP, níveis, conquistas, streaks e desafios.
- Planos, assinaturas, pagamentos e cobrança institucional.
- Denúncias, suporte e gestão editorial completa dos conteúdos.

## Ordem recomendada

1. Finalizar instituições (API e interface de membros, cargos, permissões, turmas e códigos de entrada).
2. Consolidar dashboard e analytics do aluno com os dados já coletados.
3. Criar listas/cadernos e simulados, reutilizando o banco de questões.
4. Implementar Mapa de Domínio e recomendações determinísticas antes da LuminIA generativa.
5. Adicionar provas antigas e scanner.
6. Construir redação, dashboards institucionais e relatórios.
7. Integrar LuminIA, notificações, gamificação e pagamentos após os fluxos centrais estarem maduros.

Cada item deve ser entregue verticalmente: migração/schema, regras de autorização, API, interface, testes e observabilidade.
