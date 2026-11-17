# Relatórios (item 59)

> **Status: Implementado (16/11/2026).** Migration `20261115180000_report_snapshots` (só adições), aplicada. Última entrega da Fase 3.

Rota `/app/relatorios` (atalho "Relatórios" no painel).

## Tipos e quem vê

| Relatório | Conteúdo | Quem pode gerar |
|---|---|---|
| **Individual** | questões avulsas (total, acerto e por matéria, com matérias fortes e fracas), simulados, tempo de estudo, assuntos que pedem atenção e dominados, habilidades do ENEM com menor acerto, redações corrigidas (quantidade, média, últimas) e planos de recuperação | o próprio aluno ("Eu"); professor, coordenação e direção para alunos das turmas deles |
| **Turma** | alunos (respostas, acerto, estudo, risco), participação, acerto, tempo de estudo, por matéria, questões mais difíceis, sinais pedagógicos, alertas abertos e planos de recuperação | professor da turma; coordenação e direção da escola |
| **Matéria** | acerto da matéria em cada turma e as questões com menor acerto | professor (suas turmas); coordenação e direção (turmas da escola) |
| **Institucional** | turmas (alunos, participação, acerto, estudo, em atenção), por matéria, sinais por gravidade e planos de recuperação | coordenação e direção |

Fora do escopo, a turma ou o aluno não existem para quem pede (404). O institucional para quem não é da coordenação nem da direção, e o de matéria para quem não tem turma, devolvem 403.

As turmas e os simulados vêm do mesmo cálculo do painel do professor (`TeacherAnalyticsService.analyticsForClasses`), agora reutilizável para qualquer conjunto de turmas. Tudo é **percentual de acerto, nunca nota do ENEM** (a nota TRI depende dos parâmetros de cada item).

## Período

Últimos 7, 30 ou 90 dias, ou o **mês passado** (mês civil no horário de Brasília).

## Exportação

- **PDF:** "Exportar PDF" abre a impressão do navegador com uma versão limpa (sem menus nem o botão da LuminIA); "Salvar como PDF" gera o arquivo.
- **Planilha (CSV):** a tabela principal do relatório (alunos, turmas ou matérias), separada por `;`, com BOM para abrir com acentos no Excel e fórmulas neutralizadas.
- **Dados (JSON):** o relatório completo.

## Relatórios salvos e periódicos

- "Salvar relatório" guarda o retrato do período (`report_snapshots`), para consultar depois mesmo que os dados mudem.
- **Mensal automático:** no primeiro acesso a "Relatórios salvos" em cada mês, a Lumina gera o relatório do mês anterior de cada turma do professor (até 20) e o institucional da coordenação e da direção. O que já existe não é refeito.
- Cada pessoa vê só os relatórios que pediu ou que foram gerados para ela.

## API

| Método | Rota |
|---|---|
| GET | `/reports/scope` |
| GET | `/reports/class/:id?days=` ou `?month=true` |
| GET | `/reports/subject?subject=&classId=&days=` |
| GET | `/reports/institution?days=` |
| GET | `/reports/student/:id` (`me` = o próprio aluno) |
| GET / POST | `/reports/snapshots` |
| GET | `/reports/snapshots/:id` |

## Validado em 16/11/2026

Com as contas de `docs/USUARIOS_DE_TESTE.md`:
- o professor gerou o relatório da turma "3º ano A" e o individual do aluno, e salvou;
- o relatório de outubro da turma apareceu sozinho em "Relatórios salvos";
- a coordenação gerou o institucional da Escola Teste Lumina de outubro de 2026, e o mensal automático foi criado;
- o professor recebeu 403 no institucional e o aluno recebeu 404 no relatório da turma;
- o aluno gerou o próprio relatório.

## Limites

- O mensal automático acontece no primeiro acesso do mês, não por agendamento: quem não abre a tela não tem o relatório salvo até abrir.
- O PDF depende da impressão do navegador (não há geração de PDF no servidor).
- Questões avulsas não entram no acerto da turma (o vínculo questão avulsa → turma continua indefinido); entram no relatório individual.
