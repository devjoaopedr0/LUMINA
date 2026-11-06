# Revisão humana da redação (human-in-the-loop)

## Objetivo

Permitir que professores, coordenadores e direção contestem a correção da IA com
critério e evidência, sem transformar opinião isolada em regra. A IA defende a
interpretação registrada, cita a cartilha do Inep e trechos literais da redação,
pode concordar ou discordar com respeito, mas nunca altera a nota sozinha. A
decisão final é humana, versionada e auditável.

O recurso complementa a correção por competências existente; não substitui o
`EssayCorrection` nem o RAG oficial.

## Fluxo

1. **Correção da IA** — o aluno recebe C1–C5, nota total, justificativas,
   evidências, confiança e auditoria da correção.
2. **Revisão humana** — o avaliador vê o texto, o OCR, as notas da IA, as
   evidências destacadas e pode:
   - manter ou editar cada nota;
   - concordar, discordar ou ajustar por competência;
   - registrar critério, justificativa, evidência e trecho;
   - selecionar um trecho da redação e perguntar à LuminIA sobre ele;
   - conversar sobre uma competência ou sobre a nota final.
3. **Aprendizado estruturado** — cada competência gera um registro com nota da
   IA, nota humana, critério, evidências, justificativas, divergência, decisão,
   confiança, aplicabilidade e origem. O chat é matéria-prima; o registro é o
   que pode virar conhecimento.
4. **Validação independente** — coordenação/direção (ou permissão específica)
   valida e consolida. Quem avaliou não pode validar a própria revisão.
5. **Uso futuro** — somente exemplos validados, anonimizados, consentidos e não
   arquivados entram no RAG da correção e do chat. A redação em correção é
   excluída da recuperação para não contaminar treino e teste.

## Níveis de validação

| Nível | Significado | Pode alimentar a IA? |
| --- | --- | --- |
| `RECEIVED` | Aprendizado avulso registrado no chat, ainda sem revisão | Não |
| `STRUCTURED` | Revisão enviada, com notas e evidências | Não |
| `VALIDATED` | Validação independente por coordenador/diretor/permissão | Sim |
| `CONSOLIDATED` | Validação + consentimento + anonimização conferidos | Sim, com precedência |

Regras aplicadas:

- uma submissão isolada nunca cria conhecimento global;
- `CONSOLIDATED` só é permitido depois de `VALIDATED`;
- consolidar exige consentimento e anonimização;
- editar uma revisão já validada rebaixa o material para `STRUCTURED`, arquiva
  os aprendizados ativos e registra `REVIEW_RESET`;
- o aprendizado tem `version`, `supersedesId`, `archivedAt` e trilha de auditoria;
- a exclusão é lógica (arquivamento), preservando a possibilidade de auditoria
  e reversão.

## Modelo de dados

Migration `20261105120000_essay_human_review`:

- `essay_reviews` — snapshot da IA, notas humanas, decisão, divergência, nível de
  validação, validador e observações;
- `essay_review_details` — uma linha por competência, com nota da IA, nota
  humana, decisão, critério, justificativa e evidência;
- `essay_review_messages` — chat por redação, com autor, papel, trecho
  selecionado, citações e modelo usado;
- `essay_learning_records` — aprendizado estruturado por competência, com
  origem, versão, consentimento, anonimização, confiança e aplicabilidade;
- `essay_audit_events` — trilha append-only de submissão, validação,
  consolidação, reset, criação/arquivamento de aprendizado e mensagens.

Migration `20261105130000_essay_review_permissions` cria as permissões
`ESSAY_REVIEW` e `ESSAY_VALIDATE` para cargos personalizados. Os cargos
canônicos também funcionam por `AccountType`.

## Permissões e privacidade

- Revisar: professor, coordenador, diretor, administrador, com acesso à redação
  (turma ou workspace); o autor nunca revisa a própria redação.
- Validar: coordenação, direção, administração ou permissão
  `ESSAY_VALIDATE`; o avaliador não valida a própria revisão.
- O aluno autor vê apenas revisões `VALIDATED`/`CONSOLIDATED`, sem chat bruto,
  e o endpoint por id aplica o mesmo filtro.
- Chat e auditoria exigem acesso à redação e não são abertos ao autor.
- O trecho do OCR e a confiança da leitura ficam visíveis ao avaliador; o texto
  revisado é o do aluno, nunca o OCR bruto.
- Trechos usados como aprendizado só entram no RAG após consentimento e
  anonimização.

## Chat contextual

`POST /essays/:id/review-chat` recebe mensagem, competência opcional, trecho
selecionado e revisão opcional. A resposta:

- separa **critério oficial**, **interpretação profissional** e
  **interpretação da IA**;
- recebe os trechos oficiais recuperados por BM25 e os exemplos validados;
- só aceita citações de trechos que existam literalmente na redação;
- não inventa nota, página, critério ou citação;
- sem provedor de IA, usa uma resposta determinística que reapresenta a leitura
  registrada e pede critério + evidência para a divergência;
- grava mensagem do avaliador, resposta, citações, modelo e versão do prompt.

O prompt está versionado em `REVIEW_CHAT_PROMPT_VERSION`.

## Uso do aprendizado na correção

O `EssayCorrectionService` consulta os aprendizados antes de montar cada prompt
de competência:

- `level in (VALIDATED, CONSOLIDATED)`;
- `archivedAt = null`;
- `anonymized = true`;
- `consentAt != null`;
- `essayId != redação atual`.

A recuperação ordena por proximidade lexical com o tema e o texto, separa por
competência e injeta no máximo três exemplos naquele prompt. O exemplo é
contexto auxiliar: não substitui a grade oficial, não é citado como cartilha e
não dispensa a verificação do texto atual. A auditoria da correção registra
quais exemplos foram usados e suas versões.

## Relatórios

`GET /essay-reviews/divergences` produz um relatório descritivo:

- total de revisões e taxa de concordância;
- diferença média e diferença assinada por competência;
- critérios mais recorrentes;
- exemplos de divergência para leitura qualitativa.

O relatório não reduz a análise à média: a nota média não decide se uma
divergência é legítima. A decisão continua no parecer humano e na evidência.

## Medição de redução de erro em held-out

O harness fica em `lumina-backend/src/essay-review/eval/human-loop-eval.ts` e
roda depois do build:

```bash
cd lumina-backend
npm run build
npm run essay:human-eval -- --test-ratio 0.3 --write true
```

Desenho:

1. usa apenas revisões `VALIDATED`/`CONSOLIDATED`;
2. agrupa por redação para não colocar a mesma redação em treino e teste;
3. divide por `essayId`, nunca por competência;
4. ajusta a calibração supervisionada por competência somente no treino;
5. aplica ao teste sem usar a nota humana do teste;
6. compara MAE total, viés e concordância pela regra do Inep antes/depois;
7. recusa a medição se houver menos de duas redações distintas — não inventa
   número com amostra insuficiente.

O teste `human-loop-eval.spec.ts` prova o desenho com uma amostra sintética:
o viés de +40 pontos aprendido no treino zera o MAE no teste e os conjuntos são
disjuntos. A medição real depende de revisões humanas validadas em produção;
enquanto não houver amostra, o comando reporta a quantidade existente e não
grava resultado. O número só deve ser divulgado com o tamanho da amostra e o
intervalo/variação correspondentes.

## Interface

- `/app/revisoes` — fila com filtros, cartões de pendências e acesso restrito.
- `/app/revisoes/divergencias` — relatório por C1–C5, critérios e exemplos.
- `/app/redacoes/:id/revisao` — workspace do avaliador:
  - texto e OCR;
  - notas/análise da IA e confiança;
  - evidências destacadas;
  - notas editáveis e decisão por competência;
  - chat contextual com trecho selecionado;
  - histórico, validação, consolidação e auditoria;
  - formulário e lista de aprendizados;
  - modo somente leitura para o aluno autor.

O dashboard mostra “Revisões humanas” para contas que não são de aluno e o
editor de redação oferece “Revisão humana” ao professor.

## Testes

`essay-review.spec.ts` cobre os cenários obrigatórios:

1. concordância não vira conhecimento validado;
2. discordância justificada com evidência fica em `STRUCTURED`;
3. concordância com notas divergentes é recusada;
4. validação com consentimento anonimiza;
5. avaliador não valida a própria revisão;
6. consolidação exige validação independente;
7. consolidação exige consentimento;
8. RAG usa base oficial, ignora não validados e exclui a redação atual;
9. chat preserva resposta/modelo do provedor;
10. autor não abre o chat;
11. autor vê apenas revisões validadas e não recebe chat bruto;
12. divergências agregam por competência e critério;
13. prompt separa critério oficial, interpretação humana e interpretação da IA;
14. fallback não cria nota e pede critério + evidência;
15. autor não abre por id uma revisão ainda não validada;
16. fallback de nota final mostra o total e pede a competência a revisar.

Complementos: ranking do RAG validado e desenho held-out sem vazamento.

## Limitações e próximos passos

- A medição real de redução de erro depende de volume validado em produção.
- O RAG de exemplos melhora contexto, mas não substitui a calibração
  supervisionada por competência nem uma avaliação cega com dois avaliadores.
- Fine-tuning especializado e validação independente continuam como etapas
  posteriores; não se treina a cada mensagem.
- O relatório de divergência é descritivo e não decide automaticamente qual
  avaliador está certo.
