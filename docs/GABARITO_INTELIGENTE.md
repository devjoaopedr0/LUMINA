# Gabarito Inteligente

> **Status: Em andamento (fase 1 pronta no código, sem commit).** A migration `20261103150000_answer_keys` foi criada e **ainda não foi aplicada** no banco. A interface não foi validada no navegador.

O aluno escolhe a prova, marca as respostas e vê na hora acertos, erros, brancos e desempenho por área, com histórico. O gabarito oficial aparece marcado como **Oficial**, com fonte e data. Os demais aparecem sempre como **não oficiais**.

## Fase 1 (no código)
- **Tipos de gabarito (`AnswerKeyOrigin`):**
  - `OFFICIAL`: só o administrador cadastra, e só com fonte (banca e link) e data de publicação. É único por prova, aplicação, dia e cor (índice parcial no banco). Quando a banca publica uma correção, a versão sobe e as conferências antigas avisam que o gabarito mudou.
  - `TEACHER`: professor, coordenação ou direção cadastra. Quando publicado, fica visível aos alunos das turmas dele.
  - `AI_SUGGESTED` e `COMMUNITY`: previstos no banco (`validated = false` aparece em amarelo), mas ainda não podem ser cadastrados.
- **Seleção:** prova (`Exam` existente, ou nova sem duplicar nome + ano), ano, aplicação, dia, cor do caderno e área. Áreas do Enem preenchidas pela numeração (1–45 LC, 46–90 CH, 91–135 CN, 136–180 MT).
- **Língua estrangeira (Enem, 1º dia):** um item por língua nas questões 1–5, e o aluno escolhe a dele.
- **Conferência:** grade A–E (ou colar a sequência), revisão antes de confirmar e correção. As cores são verde (acerto), vermelho (erro), cinza (em branco) e amarelo (pendente de validação). Anulada e pendente não entram no percentual. **O percentual não é convertido em nota TRI.**
- **Desempenho:** provas conferidas, acerto geral, acerto por área (da mais fraca para a mais forte), histórico e questões que o aluno mais erra.

### API (`/answer-keys`, autenticada)
| Método | Rota | O quê |
| --- | --- | --- |
| GET | `/answer-keys?examId&year&day&origin` | Gabaritos visíveis (oficial primeiro) |
| GET | `/answer-keys/exams` | Provas cadastradas |
| GET | `/answer-keys/:id?answers=true` | Detalhe; as respostas só vêm com `answers=true` |
| POST | `/answer-keys` | Cadastro (oficial: ADMIN, com fonte e data; professor: staff) |
| PUT | `/answer-keys/:id/items` | Correção do gabarito (sobe a versão, com nota) |
| PATCH | `/answer-keys/:id/status` | Publicar, voltar a rascunho, arquivar |
| POST | `/answer-keys/:id/checks` | Conferir e guardar no histórico |
| GET | `/answer-keys/checks/:checkId` | Conferência refeita contra o gabarito atual |
| GET | `/answer-keys/performance` | Painel de desempenho |

- **Código:** `lumina-backend/src/answer-keys/` (a lógica de correção pura está em `answer-key.grading.ts`) e `lumina-app/src/pages/SmartAnswerKey.tsx` (rota `/app/gabarito-inteligente`).
- **Testes:** `answer-keys.spec.ts`, com 11 casos.

## Dados reais
O banco ainda **não tem nenhum gabarito oficial completo**. Os `exam_papers` com gabarito são dados de exemplo (o ENEM 2023, por exemplo, tem 5 respostas) e não foram migrados para cá. Os oficiais entram pelo cadastro do administrador, copiando o documento da banca. A importação direta do PDF do INEP (`parseGabaritoText`, já usado em `enem-import.service.ts`) é o próximo passo.

## Próximas fases
1. Importar o gabarito oficial do PDF do INEP (só host `download.inep.gov.br`).
2. Foto do cartão-resposta para preencher as respostas (reaproveitando o OMR do scanner), com revisão antes de confirmar.
3. Gabarito sugerido por IA (justificativa por questão, confiança só quando calculável) com validação do professor.
4. Gabarito comunitário com estatística por questão e moderação, nunca tratado como oficial.
5. LuminIA por questão com o texto real da questão e das alternativas (exige vincular `AnswerKeyItem.questionId` às questões do banco).
6. Painel do professor: estatísticas dos alunos por gabarito.
