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
- Idade mínima e fluxo de consentimento do responsável (jurídico).
- Limite de membros por grupo e de grupos por usuário.
- Websocket próprio ou Supabase Realtime.
- Se o perfil de grupo aparece também para amigos fora do grupo (rede social) ou só dentro do grupo (recomendação: só dentro).
