# Habilidades do ENEM no banco de questões e no mapa de domínio

> **Status: Implementado (14/11/2026).** Migration `20261114120000_question_enem_skill` (só adições), aplicada. Último item de código da Fase 1 ("Subassunto e habilidade no mapa de domínio").

## O que é

Cada questão do banco pode ter uma **habilidade da Matriz de Referência do ENEM** (H1 a H30 de uma das quatro áreas). Com isso:

- o **mapa de domínio** ganha a visão **Por habilidade do ENEM** (`/app/dominio?visao=habilidades`): área → competência → H1–H30, coloridos pelo percentual de acerto do aluno;
- o **banco de questões** filtra por habilidade (`/app/questoes?enemSkill=MT-H17`) e mostra a habilidade em cada questão;
- quem gerencia o banco **valida ou corrige** a habilidade na edição da questão.

## Fonte da matriz

O texto das competências e habilidades é o oficial do Inep, extraído sem edição do PDF `https://download.inep.gov.br/download/enem/matriz_referencia.pdf` em 13/11/2026 (`lumina-backend/src/questions/enem-skills/enem-matrix-data.ts`). Os testes conferem as 4 áreas, H1–H30 em ordem e o número de competências por área (Linguagens 9, Humanas 6, Natureza 8, Matemática 7). O app não guarda cópia: lê a matriz de `GET /enem-matrix`.

## Classificação das questões

| Origem | Como nasce | Estado |
| --- | --- | --- |
| `AI` | Script `npm run questions:classify-skills` (lotes de 8 questões da mesma área por chamada; a IA recebe a matriz oficial da área e só pode responder um número de 1 a 30 ou `null`) | Pendente (selo amarelo "sugestão da IA") |
| `MANUAL` | Professor ou gestão do banco escolhe ou confirma a habilidade na edição da questão (`PATCH /questions/:id` com `enemSkill`) | Validada |

- A área vem da matéria (Matemática → MT; Física, Química, Biologia → CN; História, Geografia, Filosofia, Sociologia → CH; Português, Literatura, línguas, Artes, Educação Física → LC). A edição recusa uma habilidade de outra área.
- O script nunca sobrescreve uma classificação manual, aceita `--dry-run`, `--limit`, `--area`, `--batch`, `--max-calls`, `--redo` e `--models` (padrão: `AI_ANSWER_KEY_MODELS`, depois `AI_ESSAY_MODELS`) e grava uma justificativa curta (`enemSkillNote`), que aparece para quem valida.
- Questão sem texto suficiente (ex.: depende de figura) recebe `null` e fica para a classificação manual.
- **Execução de 13–14/11/2026:** a primeira passada (13/11) usou o `gemini-3.5-flash-lite` só em parte: a cota acabou e 34 dos 52 lotes caíram no reserva (`nemotron` do OpenRouter). Em 14/11 tudo foi refeito com `--redo` e só modelos Gemini: 54 chamadas, todas no `gemini-3.5-flash-lite`, **415 das 416 questões do banco central com habilidade sugerida** e 1 sem habilidade segura (essa mantém a sugestão anterior, também pendente). Uma amostra de 16 questões de Matemática foi conferida à mão: as habilidades batem com o comando das questões, e os casos discutíveis (área do círculo, seno de 30°) ficam para o professor validar. Todas as sugestões continuam pendentes até a validação docente.

## Mapa por habilidade

`GET /users/me/skill-mastery` junta as respostas avulsas (`QuestionAttempt`) e as dos simulados enviados, sempre pela habilidade **atual** da questão (corrigir a classificação corrige o mapa). Questão deixada em branco no simulado não conta.

- Faixas: crítico (< 40%), atenção (40–59%), em progresso (60–79%), dominada (≥ 80%). Com menos de **3 respostas**, a habilidade aparece como "poucas respostas", sem cor.
- **Praticar agora:** até 3 habilidades, primeiro as mais fracas com amostra suficiente e questões disponíveis, depois as nunca respondidas com mais questões no banco.
- O mapa avisa quantas questões têm habilidade só por sugestão da IA e marca as habilidades cujo acerto veio de questões ainda não validadas.
- **É percentual de acerto, nunca nota TRI.**

## Testes

- `lumina-backend/src/questions/enem-skills/enem-skills.spec.ts`: integridade da matriz, área por matéria, prompt e leitura da resposta da IA, agregação por habilidade, respostas de simulado e validação manual.
- `lumina-app/test/habilidades-enem.check.ts`: área por matéria, código, faixas, leitura da matriz e "praticar agora".
- Validado no navegador em 14/11/2026: mapa por habilidade, link "praticar" abrindo o banco filtrado, 3 respostas atualizando H3 (33%, crítico) e a confirmação da sugestão da IA pela gestão do banco.
