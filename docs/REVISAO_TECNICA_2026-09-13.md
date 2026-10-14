# Revisão técnica e funcionalidades — 13/09/2026

## Escopo

Typecheck e build dos três projetos, lint do app e landing, validação do schema Prisma, execução da suíte existente e revisão de código dos fluxos de autenticação, questões e cronograma. As correções desta revisão se concentram no cronograma, onde foram identificados erros de lógica que o TypeScript não detecta.

As alterações de importação ENEM e configurações que já estavam no diretório foram preservadas. A importação ENEM entrou no typecheck/build, mas não foi testada com download real de PDFs nesta revisão.

## Correções realizadas

- Reagendamento sem sessões futuras retorna zero, em vez de informar que todas as tarefas foram movidas.
- Sequência de estudos percorre os dias do mais recente para o mais antigo e usa UTC consistentemente. Mantida a regra existente de exigir conclusão hoje para contar a sequência. A consulta de progresso recalcula o valor para evitar dados antigos após a virada do dia.
- Reabrir uma tarefa limpa `completedAt`; criar, editar e excluir tarefas recalcula o resumo na mesma transação.
- Repetir a conclusão de uma tarefa preserva sua data original, sem transferir atividade antiga para hoje.
- Divisão de tempo por disciplina preserva exatamente o orçamento diário, distribuindo os minutos restantes pelas maiores frações.
- Criação rejeita período invertido, ausência de dias selecionados no período e disciplinas sem nenhuma hora positiva antes de gravar.
- DTO valida disciplinas aninhadas, UUIDs, horas negativas, duplicatas e listas vazias. Status desconhecido de tarefa é rejeitado na validação.
- Evolução usa minutos efetivamente registrados e a data real de conclusão; a janela de 30 dias passa a ter exatamente 30 pontos.
- Scripts na raiz permitem repetir `npm run typecheck`, `npm test`, `npm run build` e `npm run lint`.

## Verificações e limites

- Typecheck aprovado nos três projetos.
- Suíte do backend: 144 testes aprovados em 10 arquivos, incluindo 22 casos de regressão do cronograma e 13 da importação ENEM.
- Prisma: schema válido. Não foram aplicadas migrações nem alterados dados de produção.
- Lint sem erros. Restam três avisos de Fast Refresh sobre arquivos que exportam componentes junto com utilitários.
- O runner emite aviso de configuração SWC/esbuild/Oxc; a suíte executa mesmo assim.
- Os testes HTTP existentes usam NestJS real com Prisma e envio de e-mail simulados. Não validam PostgreSQL real, Google OAuth externo ou entrega de e-mail.
- Não foi executada uma navegação visual no navegador nem criada uma suíte de testes do frontend. Compilação não comprova funcionamento completo da interface.
- O resumo de progresso agora consulta tarefas e logs ao ser solicitado; para grandes históricos, convém substituir essas leituras por agregações no banco.

## Funcionalidades a adicionar, em ordem sugerida

| Prioridade | Entrega | Evidência e escopo sugerido |
| --- | --- | --- |
| P1 | Redação por scanner | Captura no estilo CamScanner: bordas, perspectiva, contraste/sombras, várias páginas, OCR revisável e correção pelas competências do ENEM, com confiança e revisão humana. |
| P1 | Redação digitada | Editor com autosave, temas, versões, contagem de palavras e a mesma esteira de correção e evolução usada pela redação digitalizada. |
| P1 | Gabarito por scanner | Captura guiada, modelos de cartão, alinhamento, leitura das marcações, confiança por resposta e confirmação manual antes de vincular e corrigir o simulado. |
| P1 | Raciocínio lógico e cálculo rápido | Rodadas cronometradas de operações básicas e cálculo mental, com dificuldade adaptativa, sequência de acertos, desafio diário e métricas de precisão, velocidade e erros recorrentes. |
| P1 | Listas de questões e simulados | Reutilizar questões e tentativas para montar cadernos, selecionar questões, cronometrar a prova e apresentar relatório final. Ainda não há rota de simulados no app. |
| P1 | Instituições e turmas | Existem fundamentos de workspace no backend, mas o cadastro institucional ainda mostra uma mensagem de indisponibilidade. Entregar API e interface de instituições, convites, membros, cargos e turmas. |
| P1 | Analytics do aluno | Levar desempenho por assunto, pontos fracos e evolução ao dashboard; ele mostra principalmente dados do cronograma. Acrescentar recomendações determinísticas e revisão de erros. |
| P1 | Consolidação do cronograma | Replanejar sessões ao editar período/carga, carregar catálogos de tarefas com paginação completa e persistir o cronômetro ao navegar/recarregar. Hoje editar o cadastro não reconstrói as sessões, e a interface carrega no máximo 200 tarefas para o catálogo. |
| P2 | LuminIA integrada | `sendAiChatMessage` lança explicitamente erro de integração não configurada. Implementar endpoint autenticado, provedor, histórico, limites de uso e explicações baseadas nas questões. |
| P2 | Importação e revisão de provas antigas | Há importação ENEM em desenvolvimento no diretório. Adicionar revisão editorial, associação a cadernos, imagens/gráficos, relatório de questões ignoradas e experiência de prova completa. |
| P2 | Agenda e notificações | Unificar atividades, metas e datas de provas; oferecer lembretes e preferências de notificação. |
| P2 | Redações | Temas, envio, correção por competências, feedback e histórico de evolução. |
| P3 | Painéis institucionais | Visões de professor/coordenador, relatórios por turma e exportação PDF/Excel. |
| P3 | Gamificação e domínio | Metas, conquistas, XP e mapa de domínio com critérios explícitos baseados no histórico. |
| P3 | Assinaturas e suporte | Planos, cobrança, gestão de assinaturas e canal de suporte/denúncia de conteúdo. |

As sugestões acima não foram implementadas nesta revisão. Para cada entrega, incluir API, autorização, interface e testes do fluxo completo.

## Próximas verificações recomendadas

1. Testes com PostgreSQL descartável para migrações, transações e integridade relacional. Nesta execução, Docker Desktop e PostgreSQL local estavam parados; o serviço local não foi iniciado porque a autorização foi recusada.
2. Testes de navegador para cadastro/login, resolução de questões, cronograma e perfil.
3. Cenários de sessão expirada, falha de rede, duplo clique no salvamento do cronômetro e concorrência entre abas.
4. Testes da importação ENEM com fixtures de cadernos e gabaritos, incluindo questões com figuras.

## Verificação complementar — 13/09/2026

- App e landing abertos em navegador real: conteúdo visível, sem overlay do Vite e sem erros de console. Login, cadastro, recuperação e redefinição renderizam; as quatro rotas autenticadas verificadas redirecionam para login sem sessão.
- Sessão do cliente coberta por teste executável: seis chamadas concorrentes provocam um único refresh; refresh expirado limpa tokens e notifica a interface; falha de rede é propagada; resposta 200 vazia vira `null`.
- Login, renovação e logout em outra aba agora são observados pelo `AuthContext` por meio do evento `storage`, sincronizando a sessão da aba restante.
- Importação ENEM recebeu 13 testes com trechos representativos: áreas, blocos, alternativas, gabarito, anuladas, classificação e bloqueio de URLs externas. PDFs com figuras continuam pendentes porque ainda não há extração de imagens.
