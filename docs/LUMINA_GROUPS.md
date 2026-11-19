# Lumina Groups — grupos e salas coletivas de estudo

> **Status: PLANEJADO (Fase 2 do roadmap).** Nada deste documento está implementado. Ele descreve a visão funcional, as regras de negócio e uma proposta técnica para quando a frente for priorizada. Ver [ROADMAP_ECOSSISTEMA.md](ROADMAP_ECOSSISTEMA.md).

## 1. Objetivo

Dar ao aluno um jeito de estudar **junto com amigos**: formar grupos, ver quem está estudando agora, acompanhar o tempo e a constância uns dos outros e criar responsabilidade coletiva. A referência de experiência é o sistema de grupos do Yeolpumta (YPT): tempo de estudo, ranking e salas em que todos estudam ao mesmo tempo. A Lumina não vai copiar a interface nem a marca do YPT.

Não é "mais um chat". O centro é **tempo de estudo real, metas e presença**. Mensagens vêm depois.

### Grupos ≠ turmas

| | Grupo de estudo (Groups) | Turma institucional (já existe) |
| --- | --- | --- |
| Quem cria | Qualquer usuário | Professor/instituição |
| Para quê | Motivação, constância, estudo social | Ensino, atividades, simulados, notas |
| Dados visíveis | Só o que cada membro escolhe compartilhar | O que a instituição tem direito de ver |
| Modelo | `StudyGroup*` (novo) | `Class`, `ClassMember`, `ClassTeacher` |

Um aluno pode estar em grupos e em turmas ao mesmo tempo. As duas coisas **não se misturam**: o professor não vê o grupo de amigos do aluno, e o grupo não vê notas da turma.

## 2. Funcionalidades

### 2.1 Criação e gestão de grupos
- Criar grupo privado com nome, descrição, imagem e propósito (ex.: "ENEM 2027", "Grupo de redação", "Medicina").
- Convidar por **código** e por **link**. O convite por link de turma (assinado, com validade, sem tabela) já existe em `SimulationsService.classInviteLink` e serve de modelo.
- Aceitar ou recusar convite; ver membros; sair do grupo.
- Papéis no grupo: **dono**, **administrador**, **moderador** e **membro**. Remover participante, promover e rebaixar conforme o papel.
- Excluir grupo (só o dono; arquivamento antes da exclusão definitiva).
- Configurar privacidade (fechado/por convite, limite de membros, aprovação de entrada) e regras.
- Metas coletivas (ex.: 200 h na semana, 5 dias seguidos com todos estudando).
- Um aluno participa de vários grupos (limite configurável, sugestão inicial: 10).

### 2.2 Perfil de estudo no grupo
Cada membro pode exibir aos colegas:
- nome e foto (`UserProfile.avatarUrl`, já existe);
- tempo estudado hoje, na semana e no total;
- matérias estudadas;
- meta diária e progresso;
- sequência de dias;
- última atividade;
- status: estudando, em pausa ou offline.

**Privacidade por padrão:** cada item tem um interruptor, por grupo. Desempenho detalhado, notas, redações, caderno de erros e histórico de questões **nunca** são expostos automaticamente, porque não fazem parte do perfil de grupo.

### 2.3 Cronômetro e sessões
- Iniciar, pausar e finalizar uma sessão escolhendo a matéria.
- Sessão individual ou dentro de uma sala do grupo.
- Entrar numa sessão que outro membro abriu.
- Ver em tempo real quem está estudando e há quanto tempo.
- Histórico de sessões.

**Regra contra tempo duplicado (obrigatória).** Já existem o cronômetro (`FocusTimer`, aba Cronômetro do cronograma) e o registro de tempo por matéria em `StudyTimeLog` (`schedules.service.ts`). O Groups **não cria uma segunda contabilidade**:
- `StudyTimeLog` continua sendo a fonte única do tempo estudado pelo aluno (cronograma, estatísticas, perfil);
- uma sessão de grupo é um contexto. Ao terminar, cada participante gera um `StudyTimeLog` com o tempo **dele** e um vínculo opcional com a sessão do grupo;
- se o aluno estiver cumprindo uma tarefa do cronograma, o mesmo log aponta para a tarefa (`taskId`), sem log extra.

São três tempos diferentes, e a tela precisa deixar isso claro:
1. **duração da sala/sessão coletiva:** do primeiro que entrou ao último que saiu;
2. **tempo individual na sessão:** o que cada um estudou, descontadas as pausas;
3. **tempo no histórico pessoal:** a soma dos `StudyTimeLog` do aluno, venha de onde vier.

Estudar na mesma sala não implica a mesma matéria: cada participante escolhe a sua.

### 2.4 Salas coletivas
- Lista de participantes com status, matéria e cronômetro individual.
- Cronômetro coletivo da sala.
- Histórico das sessões da sala e metas da sala.
- Entrar e sair sem interromper os outros.
- Sala fecha sozinha quando fica vazia por um tempo (sugestão: 30 min).
- Precisa de presença e cronômetros em tempo real (ver §4.3).

> O item 47 de `FUNCIONALIDADES_GERAIS.txt` ("Sala de estudo", com professor acompanhando) é a versão **institucional** da sala, ligada à turma. A sala do Groups é a versão **social**. As duas podem compartilhar o motor de presença e de cronômetro.

### 2.5 Ranking e gamificação (opcionais)
- Rankings do grupo: horas no dia, horas na semana, constância (dias com estudo ÷ dias do período), metas cumpridas, maior sequência.
- Desafios semanais, metas coletivas, conquistas, medalhas, eventos e desafios entre grupos.
- **Saúde antes de horas:**
  - o ranking padrão é o de **constância**, não o de horas brutas;
  - teto diário contabilizado no ranking (sugestão: 10 h);
  - sessões sem pausa por muitas horas pedem confirmação de presença, e não "valem mais";
  - nenhuma mensagem do tipo "estude sem parar".
- Qualquer membro pode **sair do ranking** e continuar no grupo.
- Para menores de idade, o ranking fica desligado por padrão (ver §5).

### 2.6 Comunicação (fase posterior)
Avisos dos administradores, mensagens no grupo, conversa individual entre membros, notificações (convite, entrada e saída, meta atingida, sessão agendada), compartilhamento de conquistas e eventos agendados. **O chat fica fora do primeiro lançamento** por exigir moderação, denúncia e retenção de mensagens, e por exigir cuidado com menores.

### 2.7 Integração com a Lumina
| Módulo | Integração | Status do módulo |
| --- | --- | --- |
| Cronograma | Sessão ligada a uma tarefa planejada; o tempo entra no mesmo `StudyTimeLog` | Implementado |
| Simulados | Desafio/simulado coletivo do grupo, com comparação opcional | Implementado (simulados); coletivo planejado |
| Questões | Desafio de questões entre membros | Implementado (questões); desafio planejado |
| Caderno de erros | Estudo individual; **nunca** exposto ao grupo | Implementado |
| Redações | Atividade de produção textual no grupo (sem expor nota sem consentimento) | Implementado (redação); atividade planejada |
| LuminIA | Sugestão de atividades e desafios coletivos | Parcial (chat existe) |
| Perfil | Histórico consolidado de estudo | Implementado (parcial) |
| Gamificação | Conquistas e metas compartilhadas | Planejado (itens 44–46, 52) |

## 3. Fluxos principais

1. **Criar e convidar:** criar grupo → definir propósito e privacidade → gerar código/link → amigo abre o link → (login) → aceita → entra como membro.
2. **Estudar junto:** abrir a sala → escolher matéria → iniciar → os outros veem "estudando · Matemática · 00:42" → pausar ou retomar → finalizar → o tempo individual vira `StudyTimeLog` → ranking e metas atualizam.
3. **Privacidade:** no grupo → "o que eu compartilho" → desligar, por exemplo, "matérias" e "ranking" → os colegas passam a ver só status e tempo do dia.

## 4. Proposta técnica

### 4.1 Entidades sugeridas (não criar agora)
| Entidade | Papel | Observações / reaproveitamento |
| --- | --- | --- |
| `StudyGroup` | Grupo: nome, descrição, imagem, propósito, privacidade, limite, dono, arquivado | Independente de `Workspace` e `Class` |
| `StudyGroupMember` | Vínculo usuário × grupo, papel (OWNER/ADMIN/MODERATOR/MEMBER), preferências de privacidade, opt-out do ranking | `@@unique([groupId, userId])` |
| `StudyGroupInvite` | Convite nominal (aceitar/recusar) e código | O link pode ser assinado, como o da turma, sem linha no banco |
| `GroupStudySession` | Sessão coletiva da sala: início, fim, criador | **Não usar o nome `StudySession`**: já existe (o dia do cronograma) |
| `GroupStudyParticipant` | Participação: entrou, saiu, pausas, matéria, minutos efetivos | Ao fechar, gera/atualiza `StudyTimeLog` |
| `StudyTimeLog` (existente) | Ganha `groupSessionId` opcional | Fonte única do tempo, sem duplicar |
| `StudyGroupGoal` | Meta coletiva (tipo, alvo, período, progresso calculado) | Pode reaproveitar o "Sistema de metas" (item 52) quando existir |
| `StudyGroupChallenge` | Desafio (questões, simulado, horas) com participantes e resultado | Usa `Simulation`/`Question` existentes |
| `StudyGroupMessage` | Mensagens (fase posterior) | Retenção, edição, denúncia e moderação |
| `StudyGroupNotification` | Melhor um módulo de notificações genérico (item 51) do que um específico | Evita uma notificação por módulo |

### 4.2 Permissões
- Autenticação e usuários: os existentes (JWT, Google OAuth, `User`, `UserProfile`). **Não** usar `Role`/`Permission` do `Workspace` para os papéis do grupo: esses papéis valem dentro do grupo, ficam em `StudyGroupMember.role` e são conferidos no serviço.
- Toda leitura de dado de um membro passa pela preferência de privacidade dele. O padrão é não expor.
- O ADMIN da plataforma modera (denúncias), mas não lê mensagens privadas sem denúncia.

### 4.3 Tempo real
Hoje não há websocket no backend (só HTTP/REST com `@nestjs/platform-express`). Opções compatíveis:
1. **Começo (recomendado para a 1ª entrega):** *polling* curto (10–15 s) do estado da sala mais *heartbeat* do participante. Não exige infraestrutura nova, e o cronômetro roda no cliente a partir de `startedAt`.
2. **Evolução:** `@nestjs/websockets` com Socket.IO (gateway por sala, presença e eventos). Com mais de uma instância do backend, precisa de adaptador Redis (pub/sub).
3. Alternativa sem servidor próprio de socket: Supabase Realtime (o banco já está no Supabase), avaliando custo e o acoplamento ao provedor.

Regras de presença: heartbeat a cada 30 s, "offline" após 90 s sem sinal, e a sessão do participante fecha sozinha (com o tempo até o último heartbeat) para não inflar horas.

### 4.4 Segurança e privacidade
- **Menores:** ver §5 e [ROADMAP_ECOSSISTEMA.md §6](ROADMAP_ECOSSISTEMA.md).
- **Abuso:**
  - limite de grupos criados por dia e de convites;
  - denúncia de grupo, membro e mensagem;
  - nome e imagem do grupo passam por filtro de conteúdo.
- **LGPD:**
  - finalidade explícita (estudo em grupo);
  - consentimento para compartilhar cada dado;
  - exportação e exclusão (sair do grupo apaga a presença; o `StudyTimeLog` pessoal continua sendo do aluno).

## 5. Regras para menores de idade
`UserProfile.birthDate` já existe e permite aplicar regras por faixa etária:
- abaixo de 18 anos: ranking desligado por padrão, nenhum dado além de nome, foto e status visível sem ação do próprio aluno, chat (quando existir) restrito a grupos ligados a uma turma ou com consentimento do responsável;
- abaixo da idade mínima definida pelo jurídico: entrada em grupos só com consentimento do responsável (o "Painel dos responsáveis", item 53, é planejado).

## 6. Fases de implementação
1. **Groups MVP:** grupos, código/link, membros e papéis, perfil de estudo com privacidade, sessão individual com matéria, tempo no `StudyTimeLog`.
2. **Salas coletivas:** sala, presença, cronômetros (polling e depois websocket).
3. **Engajamento:** rankings opcionais, metas coletivas, desafios, conquistas.
4. **Comunicação:** notificações (módulo genérico), avisos, chat com moderação.

## 7. Dúvidas em aberto
- ~~Idade mínima e fluxo de consentimento do responsável~~ **Decidido em 14/11/2026:** sem idade mínima por enquanto. Menores de 18 ficam com as proteções do §5 por padrão. A idade mínima e o consentimento do responsável voltam quando o jurídico definir.
- ~~Limite de membros por grupo e de grupos por usuário~~ **Decidido no MVP:** até 10 grupos por aluno, 3 criados a cada 24 h, de 2 a 100 membros por grupo (padrão 30). Os valores ficam em `GROUP_LIMITS`.
- ~~Websocket próprio ou Supabase Realtime~~ **Decidido em 14/11/2026:** Socket.IO próprio (`@nestjs/websockets`, adaptador Redis quando houver várias instâncias), nas salas coletivas. O MVP usa só HTTP.
- Se o perfil de grupo aparece também para amigos fora do grupo (rede social) ou só dentro do grupo (recomendação: só dentro).

## 8. Implementação do MVP (backend, 14/11/2026)

**Feito** (`lumina-backend/src/groups/`, migration `20261114200000_study_groups`, só adições):
- `StudyGroup` e `StudyGroupMember`, fora de `Workspace`/`Class`, com papel e status (`ACTIVE`/`PENDING`) por membro.
- **Criar e gerenciar:** nome, descrição, propósito, imagem (https), regras, limite de membros e aprovação de entrada. Editar, trocar o código, arquivar, reativar e excluir (só o dono, e só depois de arquivar).
- **Entrar:** por código (8 caracteres, sem 0/O/1/I/L) ou por link assinado, válido por 7 dias e sem tabela, no modelo do convite da turma. Trocar o código invalida os links antigos. Há uma prévia do grupo antes de entrar. Com aprovação ligada, a entrada fica pendente até um moderador aprovar ou recusar.
- **Convites:** qualquer membro ativo vê o código e gera o link (grupo de amigos). Para um grupo fechado, liga-se a aprovação de entrada.
- **Papéis:**
  - o dono promove a administrador, moderador ou membro;
  - o administrador promove a moderador ou membro, e só quem está abaixo dele;
  - a partir de moderador, remove quem está abaixo;
  - o dono só sai depois de transferir a posse.
- **Perfil de estudo com privacidade:**
  - todos os itens começam desligados, para qualquer idade;
  - cada aluno liga, por grupo, o tempo (hoje, 7 dias e total), as matérias dos últimos 7 dias, a sequência de dias e a última atividade;
  - os números vêm do `StudyTimeLog`, no fuso de Brasília, e o grupo não grava tempo próprio;
  - notas, redações e caderno de erros não aparecem em nenhum caso;
  - a data de nascimento não é exposta: só o próprio aluno recebe o aviso de que é menor de idade.
- **Segurança:** quem não é membro recebe 404. Toda permissão é conferida no serviço, e os DTOs têm whitelist.
- **Testes:** `group-rules.spec.ts` (papéis, código e link, idade, estatísticas e privacidade) e `groups.service.spec.ts` (fluxos com banco em memória): 19 testes.

**Endpoints** (`/groups`, autenticados):
- consulta e entrada: `GET /`, `POST /`, `GET /preview?code=|token=`, `POST /join`, `POST /join-link`;
- grupo: `GET /:id`, `PATCH /:id`, `POST /:id/code`, `POST /:id/invite-link`, `PATCH /:id/me/sharing`, `POST /:id/leave`;
- membros: `POST /:id/members/:userId/approve|reject`, `PATCH /:id/members/:userId/role`, `DELETE /:id/members/:userId`;
- posse e arquivo: `POST /:id/transfer`, `POST /:id/archive|unarchive`, `DELETE /:id`.

**Tela no app (14/11/2026):** `lumina-app/src/pages/Groups.tsx`, item "Grupos de estudo" no menu:
- `/app/grupos`: meus grupos, pedidos pendentes, criar grupo e entrar com código;
- `/app/grupos/entrar?codigo=|convite=`: prévia do grupo e entrada, ou pedido de entrada quando há aprovação;
- `/app/grupos/:id`: membros com o que cada um compartilha, pedidos de entrada, convite (código e link), "o que eu compartilho", edição, gerenciar membros (papel, posse, remover), sair, arquivar e excluir.

As regras da tela ficam em `src/lib/groups.ts`, com teste em `test/groups.check.ts`. A migration foi aplicada no banco em 14/11/2026. A tela foi conferida no navegador contra o banco, com as contas de teste de aluno e professor: criar, compartilhar, gerar link, entrar pelo link, promover, arquivar e excluir. O grupo usado no teste foi excluído em seguida.

**Falta para fechar o MVP:**
- ~~vincular a sessão com matéria ao grupo~~ feito na etapa 2 (§9);
- convite nominal (aceitar ou recusar um convite enviado a uma pessoa), denúncia e filtro de conteúdo do nome e da imagem.

A sequência de dias olha os últimos 60 dias de log; sequências maiores aparecem como 60 até a fase de engajamento trazer um cálculo próprio.

## 9. Salas coletivas (etapa 2, 17/11/2026)

**Feito** (`lumina-backend/src/groups/group-rooms.*`, `room-rules.ts`; migration `20261117150000_group_study_rooms`, só adições):
- **Modelo:** `GroupStudySession` (a sala: título, quem abriu, aberta/fechada, início e fim) e `GroupSessionParticipant` (a passagem de cada aluno: matéria, status, pausas, último sinal). `StudyTimeLog.groupSessionId` liga o tempo à sala como **contexto**.
- **Sem segunda contabilidade:** a sala não guarda horas. Ao sair, o tempo do aluno (sem pausas, em minutos inteiros) vira um `StudyTimeLog` comum e atualiza o progresso do cronograma, se houver. A saída é "reivindicada" com um `updateMany` condicional, então requisições repetidas não duplicam o tempo. Menos de 1 minuto não vira log.
- **Três tempos na tela:** duração da sala (do início até o fim, ou até agora), tempo individual de cada um e, no histórico do grupo, quanto o próprio aluno estudou em cada sala.
- **Presença:** o app manda sinal a cada 30 s (pela barra global `RoomPresenceBar`, enquanto o aluno usa qualquer tela). Sem sinal por 90 s, a passagem fecha **no último sinal**, sem inflar horas; uma passagem também é cortada em 8 h. Uma varredura a cada 60 s fecha passagens esquecidas e salas vazias há 30 min (`endedAt` = último momento com gente).
- **Regras:** um aluno fica em uma sala por vez (em qualquer grupo); até 5 salas abertas por grupo; cada um escolhe a própria matéria. Trocar de matéria fecha o trecho na matéria antiga e abre outro. Grupo arquivado fecha as salas e não abre novas; sair ou ser removido do grupo tira o aluno da sala (o tempo continua dele).
- **Privacidade (§5 para todos):** os colegas veem nome, foto e status (estudando, em pausa, sem sinal). Matéria e cronômetro só aparecem se o próprio aluno ligar "mostrar minha matéria e meu tempo" — desligado por padrão, ao abrir, ao entrar e dentro da sala.
- **Tempo real (Socket.IO próprio, namespace `/groups`):** o socket exige o access token no handshake, só membro ativo acompanha um grupo, e o servidor só avisa `rooms:changed`; o app busca o estado por HTTP, onde ficam as regras de privacidade (nenhum dado pessoal passa pelo socket). Sem socket, o app consulta a cada 15 s. CORS do socket = `CORS_ORIGIN`. Com mais de uma instância do backend, usar o adaptador Redis.
- **Endpoints** (`/groups`, autenticados): `GET rooms/me`; `GET|POST :id/rooms`; `POST rooms/:sessionId/join|heartbeat|pause|resume|leave`; `PATCH rooms/:sessionId/me`.
- **Tela:** seção "Sala de estudo" no topo da página do grupo (abrir sala, entrar com matéria, participantes ao vivo, pausar, trocar matéria, mostrar ou esconder, sair, salas anteriores) e a barra flutuante com o cronômetro em qualquer tela do app.
- **Testes:** `room-rules.spec.ts` (13) e `group-rooms.service.spec.ts` (12), mais `test/salas-grupo.check.ts` no app. Ponta a ponta contra o banco em 17/11: duas contas na mesma sala, privacidade, um aluno por sala (409), não membro (404), socket recusando token inválido e avisando as mudanças, e 1 minuto de cada uma no histórico ao sair.

**Correção encontrada no caminho:** `timeLogsForSchedule` somava logs por matéria sem filtrar o aluno. Como a matéria é global, o tempo de outros alunos entrava no progresso de qualquer cronograma com a mesma matéria. Agora só conta o dono do cronograma.

**Etapa 3:** ver §10.

**Conferido na tela em 18/11/2026:** abrir sala com matéria e "mostrar" ligado, cronômetros andando, entrada de outra pessoa aparecendo sem recarregar (Socket.IO), privacidade dela (só "Estudando"), barra flutuante em outra tela do app com o tempo contínuo e sair da sala com o aviso do histórico.

## 10. Engajamento (etapa 3, 18/11/2026)

**Feito** (`lumina-backend/src/groups/engagement-rules.ts`, `group-engagement.*`; migration `20261118120000_group_goals`, só adições):
- **Participar é opcional:** a opção "Placar e metas do grupo" (`rankingOptIn`, já existia no MVP) fica no painel "O que eu compartilho" e no próprio placar. Começa desligada para todos; para menores, o aviso diz que só o próprio aluno liga. Quem está fora não aparece no placar, não conta nas metas e **não tem o tempo lido** pelo grupo.
- **Saúde antes de horas:** o placar padrão é **constância** (dias com estudo ÷ dias do período, em %). Também há horas e maior sequência (60 dias). Dia com estudo = pelo menos 15 min. Cada dia conta no máximo **10 h** em qualquer placar ou meta. Empate divide a posição. Nenhuma mensagem do tipo "estude sem parar".
- **Metas coletivas (desafios):** moderador, administrador ou dono cria metas de "horas juntos" ou "dias de estudo somados", de 1 a 31 dias, começando hoje ou nos próximos 30 dias. Até 3 metas ativas por grupo. O progresso é calculado na leitura, a partir do `StudyTimeLog` (nada de segunda contabilidade), e mostra quantas pessoas contribuíram e a parte do próprio aluno. Sugestões prontas na tela ("Desafio da semana: 20 h juntos").
- **Conquistas pessoais**, calculadas na hora e vistas só pelo próprio aluno: primeira sala, 3 de 7 dias, semana completa, 14 dias seguidos e meta em equipe.
- **Endpoints:** `GET /groups/:id/engagement?metric=consistency|hours|streak&period=7|30`, `POST /groups/:id/goals`, `DELETE /groups/:id/goals/:goalId`; `PATCH /groups/:id/me/sharing` aceita `rankingOptIn`.
- **Testes:** `engagement-rules.spec.ts` (12) e `group-engagement.service.spec.ts` (7), mais `test/engajamento-grupo.check.ts` no app. Conferido contra o banco e na tela em 18/11/2026.

**Fica para depois:** desafios entre grupos (dependem de grupos se encontrarem; entram com a comunicação, etapa 4), medalhas visíveis aos colegas e metas pessoais do aluno (item 52, fora do grupo).
