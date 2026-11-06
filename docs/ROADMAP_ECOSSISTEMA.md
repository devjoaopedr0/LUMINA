# Roadmap do ecossistema Lumina

> Documento estratégico. Junta a visão de longo prazo, o modelo de negócio e o roadmap em fases. O detalhe de cada frente nova está em [LUMINA_GROUPS.md](LUMINA_GROUPS.md) e [LUMINA_MARKETPLACE.md](LUMINA_MARKETPLACE.md). O estado entregue, com datas e testes, continua em [STATUS_FUNCIONAL.md](../STATUS_FUNCIONAL.md), e o inventário completo em [FUNCIONALIDADES_GERAIS.txt](FUNCIONALIDADES_GERAIS.txt).

## Legenda de status (usada em todos os documentos)
| Status | Significado |
| --- | --- |
| **Implementado** | No código, com testes, usado pelo app |
| **Parcial** | Existe, mas falta parte relevante ou validação real |
| **Em andamento** | Em desenvolvimento, ainda sem commit ou sem migration aplicada |
| **Planejado** | Especificado e com fase definida; nenhum código |
| **Futuro** | Visão de longo prazo; arquitetura só esboçada |

## 1. Visão

A Lumina é uma plataforma SaaS de preparação para vestibulares, começando pelo ENEM. A visão é virar uma **infraestrutura digital de aprendizagem** que liga quatro coisas:

1. **A jornada individual do aluno:** diagnóstico, cronograma, questões, simulados, redação, cadernos, LuminIA.
2. **Comunidades de estudo:** grupos de amigos, salas coletivas, metas e constância (Lumina Groups).
3. **Instituições:** escolas e cursinhos com turmas, professores, coordenação, direção e relatórios.
4. **Professores e produtores de conteúdo:** cursos, aulas, mentorias e materiais vendidos dentro do app (Lumina Marketplace).

A **LuminIA** é a camada que conecta tudo: entende onde o aluno está e recomenda o próximo passo (revisão, questões, sessão em grupo e, por último, um conteúdo pago), sempre de forma transparente.

O foco do momento continua sendo a **Fase 1** (produto principal para o aluno). Groups e Marketplace estão documentados para orientar decisões de arquitetura de hoje, não para competir com as prioridades atuais.

## 2. Estado atual (resumo em 06/11/2026)

| Área | Status | Observação |
| --- | --- | --- |
| Autenticação (JWT, refresh, Google OAuth, verificação de e-mail) | Implementado | |
| Controle de acesso por workspace, cargos e permissões | Implementado | |
| Painéis do aluno, professor, coordenação e direção | Implementado | |
| Instituições, convites institucionais e turmas | Implementado | Convite de turma por link para aluno independente: **em andamento** (03/11, sem commit) |
| Banco de questões, busca na web, resolução com dicas | Implementado | Dicas por regras; "Pedir ajuda à LuminIA" entregue em 05/11/2026 (contexto da questão montado no servidor) |
| Caderno de erros com motivo do erro | Implementado | |
| Simulados (cronômetro, prova real, modelo ENEM 90 questões, nota estilo TRI) | Implementado | |
| Simulado adaptativo | Implementado | IRT simplificado |
| Scanner de cartão-resposta (OMR) | Implementado | Falta o teste com impressão real; cartão configurável pelo gestor **em andamento** (03/11) |
| Correção de redação (foto e texto, IA com RAG e MCP, cota mensal) | Implementado | Revisão humana validada entregue em 05/11/2026; calibração em ampliação e medição held-out aguardando volume validado |
| Revisão humana da redação (chat, evidências, validação e aprendizado) | Implementado | Ver [REVISAO_HUMANA_REDACAO.md](REVISAO_HUMANA_REDACAO.md) |
| Cronograma adaptativo, tempo de estudo por matéria, nota de corte Sisu | Implementado | |
| Mapa de domínio (matéria → assunto, estados e calor) | Implementado (básico) | Página `/app/dominio` entregue em 06/11/2026; consome o domínio já calculado; subassunto/habilidade e histórico ficam para próximos incrementos; ver [MAPA_DOMINIO.md](MAPA_DOMINIO.md) |
| Cálculo mental | Implementado | |
| LuminIA (chat) | Parcial | Explicação contextual de questões entregue em 05/11/2026; modo socrático e videoaulas planejados |
| Scanner de questões | Parcial | OCR ainda simulado |
| Provas anteriores | Parcial | Navegação por páginas e vínculo questão→página entregues em 05/11/2026; faltam PDF embutido e importação em lote |
| Cadernos de fórmulas e repertórios | Implementado (básico) | Caderno de Repertórios completo: especificação recebida e incompleta |
| Gabarito Inteligente | Em andamento | Fase 1, INEP, foto, painel e comunitário no código; vínculo com o banco e LuminIA por questão validados em 04/11 (ENEM 2024: 75/90 questões importadas e ligadas); gabarito sugerido por IA com validação docente no código e caminho da IA medido em 05/11 (44/59 sugestões corretas entre as respondidas; 16 pendentes; modelo `gemini-3.1-flash-lite`), com revisão docente obrigatória; repetir com o modelo padrão de produção; ver [GABARITO_INTELIGENTE.md](GABARITO_INTELIGENTE.md) |
| Gamificação, metas, notificações, flashcards, revisão espaçada, agenda | Planejado | Itens 31–52 do inventário |
| Assinaturas e pagamentos | Planejado | Item 55; **a landing já cita planos Free/Premium** (ver §9) |
| Lumina Groups | Planejado | Fase 2 |
| Lumina Marketplace | Futuro | Fase 4 |

## 3. Modelo de negócio

Três fontes de receita, sem preços definidos nesta etapa:

1. **Assinaturas individuais:** plano gratuito com limites (ex.: correções de redação por mês, que já existem como cota técnica de 4/mês em `ESSAY_CORRECTION_MONTHLY_LIMIT`) e planos pagos com mais limite e mais recursos.
2. **Assinaturas institucionais:** escolas e cursinhos, por aluno ou por turma, com painéis, relatórios, cartão-resposta e correção em escala.
3. **Marketplace:** comissão sobre vendas. Hipótese de **10% a 20%**, a validar.

Depois: recursos premium para professores e vendedores (ex.: ferramentas de produção, destaque orgânico por qualidade, análises avançadas). Sem preço por enquanto.

**Dependência:** as três dependem de um módulo de **planos e cobrança** (item 55) com provedor de pagamentos. O provedor do Marketplace (com split) deve ser escolhido pensando também nas assinaturas, para não manter dois.

## 4. Camadas transversais

### 4.1 Usuários e permissões (identidade única)
| Perfil | Como é representado hoje / proposta |
| --- | --- |
| Aluno independente | `AccountType.STUDENT_INDEPENDENT`, workspace pessoal. Entra em turma só por link de convite |
| Aluno de instituição | `STUDENT_INSTITUTION` + `WorkspaceMember` ativo |
| Professor de instituição | `TEACHER` + `TeacherProfile` + vínculo com o workspace |
| Professor vendedor independente | `TEACHER` (ou outro tipo) + **`InstructorProfile` aprovado** (proposto) |
| Professor em instituição e no marketplace | A mesma conta, com os dois vínculos |
| Coordenação, direção | `COORDINATOR`, `DIRECTOR` + cargos do workspace |
| Administrador | `ADMIN` |
| Moderador | **Proposto:** permissão da administração da plataforma, sem ser ADMIN pleno |

Regra: **nunca duplicar conta** para quem tem mais de um papel. Papéis novos (vendedor, moderador, dono de grupo) são vínculos ou permissões adicionais. Os papéis dentro de um grupo de estudo ficam no próprio grupo, não nos cargos do workspace.

### 4.2 LuminIA como conectora
- **Aprendizagem:** identificar dificuldades (`TopicMastery`, caderno de erros), recomendar questões, revisões e ajustes no cronograma (em parte já existe: prioridade pelo ganho de domínio e resumo semanal), sugerir atividade em grupo.
- **Marketplace:** sugerir curso, professor, aula, material ou mentoria ligados à dificuldade.
- **Regras:**
  - ordem revisar → praticar → grupo → pago;
  - sempre explicar o motivo da recomendação;
  - o que é pago aparece rotulado;
  - **nunca** priorizar produto pela comissão.
- **Exemplo:** aluno com dificuldade recorrente em funções → 1) revisão do tópico; 2) lista de questões de funções; 3) sessão com o grupo; 4) aula de um professor especializado no marketplace, marcada como produto pago.

### 4.3 Tempo real
Hoje: só HTTP/REST. Para Groups (presença e cronômetros), notificações e mensagens: começar com polling e heartbeat, depois `@nestjs/websockets` (Socket.IO) com adaptador Redis quando houver várias instâncias, ou avaliar Supabase Realtime. Decisão na Fase 2. Detalhes em [LUMINA_GROUPS.md §4.3](LUMINA_GROUPS.md).

### 4.4 Arquivos e mídia
Hoje: imagens e PDFs do scanner são guardados no banco ou em URL, e não há storage de vídeo. O Marketplace exige **storage de objetos e streaming** (HLS com URL assinada). É uma dependência nova a escolher na Fase 4.

## 5. Decisões arquiteturais importantes
1. **Sem trocar a stack:** React, TypeScript, Vite, NestJS, Prisma, PostgreSQL. As frentes novas são módulos NestJS novos (`groups`, `marketplace`), com migrations só de adição.
2. **Tempo de estudo com fonte única:** `StudyTimeLog`. Sessões de grupo e aulas de curso apontam para ele, sem contabilidade paralela.
3. **Colisão de nome:** `StudySession` já existe (o dia do cronograma). A sessão coletiva se chama `GroupStudySession`.
4. **Grupos fora de `Workspace`/`Class`:** comunidade de usuários não é turma institucional, e os dados de um não vazam para o outro.
5. **Vendedor é vínculo, não tipo de conta:** `InstructorProfile` 1:1 com `User`.
6. **Pagamento no provedor:** a Lumina não guarda cartão nem dado bancário. Guarda pedidos e repasses como espelho, com webhooks idempotentes.
7. **Privacidade por padrão:** em grupo, só aparece o que o aluno liga. Notas, redações e caderno de erros nunca são compartilhados automaticamente.
8. **Notificações em módulo genérico** (item 51), usado por Groups, Marketplace e o produto principal, e não um por frente.

## 6. Segurança, privacidade e menores
- **Controle de acesso:** permissão conferida no serviço em toda leitura e escrita (padrão já usado: 404 para recurso de outro usuário, contra IDOR); DTOs com whitelist.
- **LGPD:**
  - base legal e finalidade por tratamento;
  - consentimento para compartilhamento em grupo;
  - exportação e exclusão de dados;
  - retenção definida para mensagens e logs;
  - registro de operações administrativas (item 58).
- **Menores de idade:** `UserProfile.birthDate` já existe e permite:
  - consentimento do responsável abaixo da idade mínima (definir com o jurídico);
  - ranking desligado por padrão e chat restrito para menores;
  - compra no marketplace só com responsável;
  - nenhuma exposição de dado pessoal sem ação do próprio aluno.

  O Painel dos responsáveis (item 53) é a peça que viabiliza isso.
- **Marketplace:**
  - **Conta e conteúdo:** proteção contra compartilhamento de conta e de curso (sessões simultâneas, marca d'água, URL assinada); moderação de conteúdo e de avaliações.
  - **Financeiro:** prevenção a fraude (conferência do webhook, idempotência, limites para conta nova); segurança financeira e conciliação.
- **Groups:** denúncia, bloqueio, limites anti-spam e moderação.

## 7. Roadmap em fases

### Fase 1: consolidação do produto principal (agora)
Preparação para o ENEM; questões e simulados; scanner de gabaritos; correção de redação; cadernos; cronograma; LuminIA; experiência individual do aluno.
- **Já entregue:** ver §2.
- **Pendências da fase:**
  - **Calibração e validação:** calibração da redação ampliada para 180 redações em 04/11 (174 completas; ganho honesto menor que a amostra de 30, viés reduzido); próximo: atacar C4/C2 no prompt, medir dois avaliadores e validar com fotos reais (redação) e impressões reais (cartão-resposta).
  - **Gabarito Inteligente:** fase 1, INEP, foto, painel e comunitário entregues; vínculo com o banco e LuminIA por questão validados com o ENEM 2024 (75/90 questões importadas e ligadas; as 15 restantes puladas por imagem, fórmula ilegível ou anulação); gabarito sugerido por IA com validação docente no código e caminho da IA medido em 05/11 (44/59 sugestões corretas entre as respondidas; 16 pendentes), com revisão docente obrigatória; repetir a medição com o modelo padrão de produção.
  - **Conteúdo:** Caderno de Repertórios completo (aguarda o resto da especificação); provas anteriores completas.
  - **LuminIA e dados:** ~~LuminIA explicando questões (com o texto real da questão)~~ (feito em 04/11 no Gabarito Inteligente); OCR real no scanner de questões.
  - **Comercial:** planos e cota do plano gratuito alinhados à landing.

### Fase 2: Lumina Groups
- **Primeiro:** criação de grupos, entrada por código e link, convites, participantes e papéis, perfis de estudo com privacidade, registro de sessões, tempo no `StudyTimeLog`.
- **Depois:** salas coletivas com presença, ranking opcional, metas, desafios, notificações e chat.

### Fase 3: fortalecimento institucional e ferramentas para professores
Painel do professor mais completo, gestão de alunos e turmas, acompanhamento (alertas pedagógicos, plano de recuperação, relatórios: itens 40–42 e 59), central de materiais (48–50), integração com o ecossistema. Também prepara o terreno do Marketplace: professores ativos e conteúdo próprio.

### Fase 4: Lumina Marketplace
Cadastro e verificação de vendedores, perfis, publicação de cursos, catálogo, compra, biblioteca, pagamentos com split, comissões, painel financeiro e avaliações.

### Fase 5: ecossistema integrado
Recomendações da LuminIA cruzando desempenho, grupos e marketplace; grupos estudando cursos juntos; desafios coletivos; personalização; expansão para outros vestibulares e outras áreas educacionais.

## 8. Riscos e dependências
| Risco / dependência | Impacto | Mitigação |
| --- | --- | --- |
| Menores de idade em recursos sociais e de compra | Jurídico e reputação | Regras por idade, consentimento do responsável, padrões fechados |
| Tempo real sem infraestrutura | Groups atrasado ou instável | Polling primeiro; websocket e Redis depois |
| Escolha do provedor de pagamento | Retrabalho em assinaturas e marketplace | Um provedor com split para os dois |
| Custo de vídeo (storage e streaming) | Margem do marketplace | Provedor por uso; limites por plano de vendedor |
| Qualidade e direitos do conteúdo vendido | Reclamação e responsabilidade | Verificação, revisão do 1º produto, termos, denúncia |
| Ranking estimulando estudo sem descanso | Saúde do aluno | Constância como padrão, teto diário, opt-out |
| Cotas dos modelos de IA gratuitos | LuminIA e correção limitadas | Plano pago ou provedor alternativo (já com fallback multi-provedor) |
| Escopo: frentes novas competindo com a Fase 1 | MVP atrasado | Groups só depois da Fase 1; Marketplace na Fase 4 |

## 9. Documentação desatualizada ou contraditória (encontrada nesta revisão)
1. **Landing (`lumina-landing`, FAQ):** promete planos Free e Premium ("Premium libera simulados ilimitados, correção de redação e a LuminIA sem restrições") e um plano para professores. **Ainda não existem planos nem cobrança** (item 55 planejado). Ajustar o texto da landing ou priorizar os planos.
2. **`STATUS_FUNCIONAL.md`, seção "Não iniciado":** lista como não iniciados itens que foram entregues depois (provas antigas, redação com correção por competências, LuminIA conversacional em parte, scanner de cartão-resposta). A seção ganhou nota de desatualização, e o estado correto está no §2 acima.
3. **`STATUS_FUNCIONAL.md`, itens 19 e 20 (27/09/2026):** o texto estava com acentuação corrompida (codificação). Foi recodificado sem mudar o conteúdo.
4. **`STATUS_FUNCIONAL.md`, item 17 (26/09/2026):** descreve um processamento "simulado" que foi substituído pelo OMR real em 31/10/2026. A entrada mais nova prevalece.
5. **`FUNCIONALIDADES_GERAIS.txt`:** a numeração se repete (há dois itens 22, 23 e 24, nos cadernos e na LuminIA), e o item 19 diz "UI pendente", embora a interface básica de provas anteriores exista desde 27/09/2026.
6. **`README.md`:** descreve o backend só como "API de autenticação". Foi atualizado.

## 10. Dúvidas que precisam de decisão
- Idade mínima por recurso (grupos, chat, compra) e fluxo de consentimento do responsável.
- Provedor de pagamentos (assinaturas e split do marketplace).
- Percentual de comissão e variação por categoria.
- Websocket próprio ou Supabase Realtime.
- Provedor de vídeo e nível de proteção.
- Limites do plano gratuito (correções, simulados, LuminIA) e o que muda no pago.
- Curadoria do marketplace: aberto a qualquer professor verificado ou por convite no começo.
- Se instituições podem vender no marketplace e comprar licenças em lote para turmas.
