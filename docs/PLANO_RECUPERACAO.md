# Plano de recuperação (item 42)

> **Status: Implementado (15/11/2026).** Migration `20261115140000_recovery_plans` (só adições), aplicada. Fase 3 do roadmap.

Um caminho curto para um assunto em que o aluno tem dificuldade: rever o conteúdo, praticar com dificuldade crescente, revisar dias depois e medir o domínio de novo.

## Quem cria

| Quem | Onde | Assunto |
|---|---|---|
| O próprio aluno | Mapa de domínio: botão "Plano de recuperação" (ícone de boia) nos assuntos em **atenção** ou **críticos** | o assunto clicado |
| O professor | Alertas pedagógicos de desempenho (baixo acerto, queda, sequência de erros): "Criar plano de recuperação" | **automático:** o assunto mais fraco do aluno (menor domínio entre os que têm tentativas) |

O professor só cria plano para aluno de turma ativa em que leciona (403). Cada aluno tem no máximo **3 planos ativos** e **um por assunto** (409).

## Etapas (item 42 da especificação)

| # | Etapa | Regra |
|---|---|---|
| 1 | Revisar o conteúdo | videoaulas do assunto no nível do aluno (`VideoLessonsModal`); o aluno marca "Já assisti". Recomendada, não bloqueia |
| 2 | Começar pelas fáceis | até 4 questões fáceis |
| 3 | Subir para as médias | até 4 médias; libera quando a etapa fácil bate a meta ("evoluir dificuldade") |
| 4 | Desafio com as difíceis | até 2 difíceis; libera quando a média bate a meta |
| 5 | Revisão agendada | 3 dias depois de criar o plano: refaz as questões que errou **na primeira tentativa** dentro do plano (sem erros, até 3 das praticadas) |
| 6 | Reavaliar o domínio | ao terminar a revisão, o plano é concluído e guarda o domínio do assunto (antes → depois) |

- **Meta:** com até 2 questões, todas; acima disso, 70% arredondado (3 → 2, 4 → 3).
- A **última resposta** de cada questão conta (refazer corrige), e a etapa que bateu a meta **fica concluída**: errar de novo na revisão não desfaz.
- A revisão só conta respostas dadas depois da data agendada e do fim das etapas de questões.
- As questões são respondidas dentro do plano, com o mesmo componente do banco (dica, LuminIA, gabarito comentado). O progresso é recalculado a cada resposta, sem apagar o gabarito que o aluno acabou de ver; ao bater a meta, a tela mostra "Etapa concluída" e o aluno escolhe quando seguir.

## De onde vêm as questões

O banco é esparso (em 15/11/2026, metade dos 151 assuntos tinha até 2 questões). As questões vêm de um funil:

1. do próprio **assunto**;
2. das **habilidades do ENEM** das questões do assunto (`docs/HABILIDADES_ENEM.md`), na mesma matéria;
3. da **matéria**.

Dentro de cada nível: nunca respondidas primeiro, depois as que o aluno errou, por último as que já acertou. Se faltar questão de uma dificuldade, a etapa completa com o nível vizinho e avisa; sem nenhuma, a etapa é pulada e o plano diz por quê. A tela explica quando o assunto sozinho não bastou ("o plano usa 1 do assunto, 9 da mesma habilidade do ENEM, 38 da matéria"). As questões vêm do banco central e do workspace pessoal do aluno.

## API

| Método | Rota | Uso |
|---|---|---|
| POST | `/recovery-plans` | cria (`topicId` opcional; `studentId`, `classId`, `alertId` para o professor) |
| GET | `/recovery-plans/mine` | planos do aluno, com progresso |
| GET | `/recovery-plans/teacher?studentId=` | planos dos alunos das turmas do professor |
| GET | `/recovery-plans/:id` | um plano (aluno, quem criou ou professor da turma; 404 para os demais) |
| POST | `/recovery-plans/:id/video` | marca a videoaula como assistida |
| POST | `/recovery-plans/:id/cancel` | cancela (aluno ou quem criou) |

## Telas

- `/app/recuperacao`: planos do aluno, etapas com estado (agora, concluída, bloqueada, agendada, pulada), barra de progresso e as questões da etapa atual.
- `/app/acompanhamento`: seção "Planos de recuperação" com aluno, assunto, situação, progresso e domínio antes → depois.

## Validado no navegador (15/11/2026)

Com o aluno de teste: o plano de Logaritmos foi criado pelo mapa de domínio (o assunto tinha 1 questão; o plano usou a habilidade MT-H3 e a matéria e explicou isso). Três acertos na etapa fácil liberaram as médias, e as respostas seguintes mantiveram o gabarito na tela. O professor de teste viu o plano do aluno na lista dele.

## Limites

- Notificação ao aluno quando o professor cria um plano depende do módulo de notificações (item 51).
- A videoaula usa a busca do YouTube; a lista de vídeos depende de `YOUTUBE_API_KEY`.
- Sem questões geradas por IA para completar assuntos esparsos: a geração existe ("criar questão parecida"), mas gastaria a cota gratuita e as questões não teriam revisão.
