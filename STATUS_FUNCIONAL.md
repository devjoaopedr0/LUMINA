# Status funcional da Lumina

> **Como ler este documento.** Cada seção é o registro de uma entrega, da mais nova para a mais antiga, e uma entrada nova pode substituir o que uma antiga dizia. O resumo consolidado do estado atual, a legenda de status (Implementado · Parcial · Em andamento · Planejado · Futuro), a visão de longo prazo (Lumina Groups e Lumina Marketplace) e o roadmap em fases estão em [docs/ROADMAP_ECOSSISTEMA.md](docs/ROADMAP_ECOSSISTEMA.md).

## Atualização de 09/11/2026 — Fase 3: acompanhamento pedagógico do professor

- **Nova rota `/app/acompanhamento`:** o professor vê participação, média de acerto, tempo de estudo, evolução diária, questões mais difíceis e sinais pedagógicos por turma. O atalho **Acompanhamento analítico** foi adicionado ao painel do professor.
- **Endpoint `GET /institutional-analytics/teacher`:** aceita `days` (7–180) e `classId` opcional. A consulta parte apenas das turmas em que o professor está vinculado; um `classId` de outra pessoa retorna 404 para não revelar a existência da turma.
- **Indicadores:** resumo consolidado sem duplicar aluno no total, cartões por turma, tabela de alunos com último acesso, sequência de erros e motivos de risco, agregação por questão/disciplina e evolução por dia de calendário de Brasília. A ausência de respostas aparece como `—`, não como 0%.
- **Sinais pedagógicos:** desempenho abaixo de 60%, inatividade há mais de 7 dias, sequência de 3+ erros, turma com média baixa e questão com menos de 60% de acerto (mínimo de 3 respostas). Cada sinal traz uma sugestão de intervenção. Nesta entrega os sinais são calculados na leitura, sem tabela, histórico, reconhecimento ou atribuição de responsável.
- **Exportação:** a tela gera CSV dos alunos da seleção, com acerto, tempo, risco e motivos. O relatório pedagógico persistido e o plano automático de recuperação continuam pendentes.
- **Privacidade e escopo:** somente perfil de professor acessa o endpoint; coordenação e direção continuam usando os painéis institucionais existentes. Nenhum dado de outro professor é consultado.
- **Testes:** 6 testes de backend para consolidação, agregação por `questionId`, ausência de dados, bloqueio de aluno e 404 de turma alheia; novo check puro do app para percentuais, minutos, ordenação de sinais e CSV. **Sem migration.**
- **Documentação:** detalhes em [docs/ACOMPANHAMENTO_PEDAGOGICO.md](docs/ACOMPANHAMENTO_PEDAGOGICO.md).

## Atualização de 08/11/2026 — Correções da revisão espaçada

- **Fuso correto:** o dia da revisão é o de Brasília, gravado como meia-noite UTC. Vencimento compara data com data, não instante com `new Date()`. Às 20:59/21:00 de Brasília “amanhã” continua sendo o dia seguinte local, sem pular um dia quando o UTC vira.
- **Concorrência:** o acerto incrementa `correctStreak` atomicamente no banco; a decisão de dominar usa o valor devolvido. A marcação manual é removida na mesma transação quando a questão é dominada no caderno.
- **Dívida visível:** entrada aberta do caderno sem data agora entra na central como “Sem data” e no filtro `due=true`, em vez de desaparecer. A fila manual exclui erros abertos por relação no banco, sem carregar todos os ids.
- **Validação e privacidade:** datas como `2026-02-31` são recusadas; o enunciado da fila é truncado em 220 caracteres.
- **Interface:** falha ao limpar a marcação e sessão expirada mostram mensagem; a tela não fica em spinner infinito.
- **Testes:** suíte de backend com 899 testes e checks do app cobrindo limites 20:59/21:00, data inválida, entrada sem data, truncamento e incremento atômico. App passa em `test`, `typecheck`, `build` e `lint` (9 avisos preexistentes, 0 erros).
- **Sem migration:** os campos e índices existentes continuam suficientes.

## Atualização de 07/11/2026 — Revisão espaçada unificada

- **Fila única:** `GET /users/me/review-queue` reúne tópicos com domínio vencido, entradas abertas do caderno de erros e questões marcadas para revisar. A fila manual fica separada do total do dia e não repete uma questão já aberta no caderno.
- **Agendamento automático:** erro no caderno volta no dia seguinte; primeiro acerto empurra para três dias; dois acertos seguidos encerram a revisão como `DOMINADA`. Inclusão manual e scanner de questões também recebem a primeira data. O agendamento manual continua possível, mas a próxima tentativa recalcula a data.
- **Central do aluno:** nova rota `/app/revisao-espacada`, com resumo por origem, ordenação pela revisão mais antiga, resolução inline das questões e atalho para o banco filtrado por tópico. O painel exibe um aviso in-app quando há itens pendentes.
- **Integração com o caderno:** a central abre o caderno já filtrado por vencidas, matéria e assunto. Tópicos levam ao banco de questões com `subjectId` e `topicId`.
- **Escopo honesto:** flashcards dependem do item 32 e não foram simulados. A notificação é in-app; não há push ou e-mail. A entrega não exige migration.
- **Testes:** 12 testes de backend para regras de data, repositório e agregação da fila; check de frontend para vencimento, origem e detalhe dos itens. Backend e app passam em `typecheck`; o app passa em `test` e `build`.
- **Documentação:** regras e limites em [docs/REVISAO_ESPACADA.md](docs/REVISAO_ESPACADA.md).

## Atualização de 06/11/2026 — Mapa de domínio por matéria e assunto (item 30)

- **Nova página `/app/dominio`:** consome `GET /users/me/topic-mastery` e mostra o domínio já registrado por matéria e assunto, com resumo de dominados, atenção, crítico e revisão pendente.
- **Mapa de calor:** cada assunto tem cor por `masteryScore` (0, 1–24, 25–49, 50–74, 75–100), com número, percentual de acerto e próxima revisão visíveis; a cor nunca é a única informação. Clicar no assunto abre o banco de questões filtrado por `subjectId`/`topicId`.
- **Filtros e leitura:** matéria, estado (`Dominado`, `Em progresso`, `Atenção`, `Crítico`, `Não estudado`), busca sem acento/caixa e “só revisão pendente”. O cabeçalho de cada matéria mostra média, total e revisões vencidas.
- **Estados vazios:** sem tentativas registradas, a página explica que o mapa nasce das respostas e oferece banco de questões, simulado e cronograma — não inventa domínio.
- **Integração:** atalho “Ver mapa completo de domínio” no painel de domínio do cronograma e item “Mapa de domínio” na navegação.
- **Sem migration e sem mudança de backend:** o endpoint e o cálculo já existiam. Subassunto e habilidade não existem no modelo atual (`Subject` → `Topic`) e não foram simulados na interface; histórico diário fica para o próximo incremento.
- **Testes:** novo `lumina-app/test/mapa-dominio.check.ts` cobre faixas, calor, revisão, resumo, filtros e agrupamento; `npm test`, `npm run typecheck`, `npm run build` e `npm run lint` do app passando. Detalhes em [docs/MAPA_DOMINIO.md](docs/MAPA_DOMINIO.md).

## Atualização de 06/11/2026 — LuminIA: criar questão parecida

- **O que mudou:** a resolução de questões ganhou o botão **Criar questão parecida**. A LuminIA gera uma variação inédita da questão aberta, mostra-a logo abaixo para responder sem sair da tela e a salva no banco pessoal do aluno. O recurso aparece no Banco de Questões e no Caderno de Erros, porque os dois usam o mesmo componente de resolução.
- **Contexto no servidor:** o cliente envia somente `{ questionId }` em `POST /ai/questions/similar`. Enunciado, alternativas, gabarito, disciplina e dificuldade são carregados no backend com a mesma checagem de workspace; o navegador não consegue ditar o conteúdo da referência.
- **Validação antes de gravar:** o prompt versionado `similar-question-2026-11-06` devolve JSON, e o servidor exige a mesma quantidade de alternativas, exatamente uma correta, alternativas não repetidas e enunciado diferente do original. Resposta inválida vira 502 e nada é salvo; sem provedor configurado, 503.
- **Governança e transparência:** a questão nasce como `GENERATED`/`LuminIA`, sem ano, número ou vínculo com prova oficial, e com metadados de modelo, prompt e questão de origem. A interface avisa que é conteúdo gerado por IA, não oficial e sem revisão humana (`UNREVIEWED`); não há geração em cascata.
- **Testes:** backend com **872 testes em 60 arquivos**, incluindo prompt, validação estrutural, orquestração, controller e persistência; app com o novo check de payload (só `questionId`). `npm test`, `npm run typecheck` e `npm run build` do backend e do app passando; `npm run lint` do app sem erros. **Sem migration.**
- **Documentação:** detalhes em [docs/RESOLUCAO_QUESTOES.md](docs/RESOLUCAO_QUESTOES.md) e [docs/AI_CHAT.md](docs/AI_CHAT.md).

## Atualização de 06/11/2026 — LuminIA: modo socrático

- **O que mudou:** o chat flutuante ganhou um alternador **Modo socrático**, e cada questão tem o botão de mesmo nome ao lado de “Pedir ajuda à LuminIA”. O aluno recebe uma pergunta por vez e pistas progressivas em vez da resolução pronta.
- **Como conduz:** o prompt versionado (`socratic-2026-11-06`) começa pelo diagnóstico do que o aluno já entendeu e onde travou; depois avança para conceito, estratégia e acompanhamento. O servidor deriva a etapa do número de mensagens do aluno, sem confiar em estado enviado pelo cliente.
- **Sem vazar gabarito:** antes da tentativa, o contexto da questão continua sem a alternativa correta e sem o comentário. Depois dela, o resultado pode ser confirmado porque já aparece na tela, mas o aluno precisa explicar o raciocínio antes de receber a explicação. Sem questão vinculada, o modo não presume matéria nem inventa exemplo.
- **Sem provedor:** o mock devolve um roteiro fixo de perguntas, avisa que a IA não está configurada e não inventa conteúdo.
- **Testes:** backend com **864 testes em 58 arquivos**, incluindo prompt, progressão por turno, contexto antes/depois da tentativa e fallback; app com o novo check de payload/modo socrático. `npm test`, `npm run typecheck` do backend e do app passando. **Sem migration.**
- **Documentação:** detalhes em [docs/AI_CHAT.md](docs/AI_CHAT.md).

## Atualização de 05/11/2026 — Gabarito Inteligente: sugestão por IA medida em prova inteira

## Atualização de 05/11/2026 — Revisão humana da redação (human-in-the-loop)

- **Fluxo vertical:** fila de revisões, workspace do avaliador com texto/OCR, notas da IA, evidências destacadas, notas editáveis, decisão por competência e nota final, chat contextual e histórico. A seleção de um trecho ancora a pergunta e a evidência. O autor vê apenas revisões validadas, em modo somente leitura.
- **Chat técnico:** a LuminIA separa critério oficial do Inep, interpretação do avaliador e interpretação da IA; cita trechos oficiais e só aceita evidência literal da redação. Sem provedor, o fallback determinístico não cria nota e pede critério + evidência. Prompt versionado em `REVIEW_CHAT_PROMPT_VERSION`.
- **Aprendizado estruturado:** `RECEIVED → STRUCTURED → VALIDATED → CONSOLIDATED`, por competência, com critério, notas, evidências, justificativas, divergência, confiança, aplicabilidade e origem. Editar revisão validada rebaixa para `STRUCTURED`, arquiva versões anteriores e registra `REVIEW_RESET`. Consolidação exige validação independente, consentimento e anonimização.
- **RAG e correção futura:** só aprendizados validados/consolidados, anonimizados, consentidos e não arquivados entram na recuperação; a redação em correção é excluída. A correção por competência passou a receber até três exemplos por competência e registra na auditoria quais foram usados. Isso evita contaminação treino/teste e impede que uma mensagem isolada vire regra.
- **Governança:** permissões `ESSAY_REVIEW`/`ESSAY_VALIDATE`, cargos canônicos, autor não revisa nem valida a própria redação, auditoria append-only com snapshot completo das notas/justificativas, filtros de privacidade no endpoint por id e revisão por redação separa treino/teste.
- **Relatórios:** taxa de concordância, diferença média/assinada por C1–C5, critérios recorrentes e exemplos de divergência. O relatório é descritivo e não reduz a decisão à média.
- **Medição held-out:** harness `essay:human-eval` agrupa por redação, calibra só no treino e mede MAE/viés/concordância Inep antes e depois no teste. Sem duas redações validadas distintas, ele informa a insuficiência e não inventa métrica. O teste sintético prova o desenho e a ausência de vazamento; a medição real fica registrada quando houver amostra de produção.
- **Testes:** 16 cenários de revisão/chat/governança, ranking do RAG validado e desenho held-out; backend `npm test` e `npm run typecheck` passando. Migrations `20261105120000_essay_human_review` e `20261105130000_essay_review_permissions` aplicadas. Detalhes em [docs/REVISAO_HUMANA_REDACAO.md](docs/REVISAO_HUMANA_REDACAO.md).

## Atualização de 05/11/2026 — Provas anteriores: navegação por páginas

- **Leitura da prova:** a lista de páginas agora mostra miniaturas e abre a página em tamanho de leitura; cada página traz a posição (`2 de 4`) e os botões **Anterior** / **Próxima**, desabilitados nos limites.
- **Questão → página:** na lista de questões mapeadas, `pág. X` virou atalho para abrir a página correspondente; se a página não estiver no acervo, o texto continua simples.
- **Questões na página:** a página mostra quais questões do banco estão mapeadas nela, sem repetir a lista inteira.
- **Testes:** novo check puro `lumina-app/test/provas-anteriores.check.ts` cobre primeira/última página, página inexistente, prova vazia, posição e filtro de questões; incluído em `npm test`. Typecheck, lint, checks e build do app passando. Sem migration e sem mudança de backend.
- **Ainda pendente:** visualizador de PDF embutido e importação em lote de PDFs oficiais. O botão **Abrir PDF** continua condicionado a `ExamPaper.pdfUrl`; o acervo de demonstração usa páginas em SVG. Detalhes em [docs/PROVAS_ANTERIORES.md](docs/PROVAS_ANTERIORES.md).

## Atualização de 05/11/2026 — Redação v3 medida em 29+30: sem ganho, calibração não gravada

- **Amostra:** 30 redações de calibração + 30 de teste com `gemini:gemini-3.5-flash-lite`; ficaram **29 + 30** (uma de calibração falhou por 503). Foram 174 chamadas em 795 s (mediana de 2,7 s/chamada). Execução com `--write false`; nenhuma calibração v3 foi persistida.
- **Teste held-out (30 redações):** v3 bruto 33,3% de concordância pela regra do Inep, MAE 150,7, viés −6,7; v3 calibrado 36,7%, MAE 152,0, viés −45,3. A calibração held-out só mexeu na C3 (reta `a = 1,277`, `b = −60,5`) e piorou a C3 (42,7 → 44,0).
- **Comparação pareada com a v2 nas mesmas 30 redações:** v2 bruto 46,7%/MAE 129,3; v2 calibrado 43,3%/141,3. A diferença de MAE v3 − v2 foi +21,3 bruto (IC 95%: −2,7 a +46,7) e +10,7 calibrado (IC 95%: −9,3 a +30,7). A v3 não mostrou ganho; a C3 piorou de forma consistente (+12,0; IC 95%: +2,7 a +21,3), a C4 melhorou direcionalmente (−6,7; IC 95%: −14,7 a +1,3) e C2/C5 ficaram no ruído.
- **Decisão:** manter `v2-competencia` ativa e o prompt `v3-c2-c4-oficial-2026` com identidade. O ajuste final em n=59 escolheu isotônica em C3/C5, mas não foi validado fora da amostra e não foi gravado. Próximo ataque: prompt de C3/C1 (e a instabilidade da C2), não a calibração.
- **Provedores:** Grok 4.3 via OpenRouter passou num teste isolado, mas a execução completa recebeu **402**; o limite de US$ 1.000 no `/key` é teto de gasto, não crédito disponível. Grok 4.7/4.6/4.5 rejeitam `reasoning: { enabled: false }`; 4.3 é a única opção compatível sem mudar o `AiService`. O OpenRouter gratuito ficou em **429** (50/dia, restante 0, reset em `2026-11-06T00:00:00Z`).
- **Sem migration.** O cache e o relatório da execução ficam em `.cache/` (não versionados); os números acima são o registro auditável.

## Atualização de 05/11/2026 — Redação v3: calibração auditável, execução parcial protegida e retry de 503

- **Calibração anterior preservada:** ao gravar uma calibração de prompt novo, `model/llm-calibration.json` não é mais sobrescrito sem histórico; a versão anterior é copiada para `model/archive/llm-calibration.<promptVersion>.json`. A calibração `v2-competencia` (174 redações, `gemini:gemini-3.5-flash-lite`) está em `model/archive/llm-calibration.v2-competencia.json`, e o arquivo ativo foi restaurado para v2. Enquanto não houver calibração v3 válida, a correção com `v3-c2-c4-oficial-2026` usa a identidade.
- **Execução parcial não grava calibração:** `essay:eval` agora exige pelo menos 10 redações de **teste** medidas para gravar a calibração final. Antes, uma execução interrompida por cota gravava uma função ajustada só na amostra de calibração. Em 05/11/2026, o Gemini respondeu 503 e o Nemotron gratuito do OpenRouter atingiu 429 após 10 redações de calibração; a execução parou sem teste. A calibração parcial de 10 redações foi descartada e o arquivo ativo restaurado para v2; com a guarda nova, uma execução assim não grava. A segunda tentativa em 05/11/2026 (30 redações de calibração + 30 de teste) foi retomada e concluída; o resultado está na entrada mais recente acima e nenhuma calibração v3 foi gravada.
- **Retry de 5xx:** o `AiService` repete a mesma chamada em 502/503/504 com esperas de 2 s e 5 s antes de passar ao próximo modelo. Isso cobre o 503 "high demand" do Gemini sem transformar toda falha transitória em erro para o aluno.
- **Testes:** backend com **817 testes em 52 arquivos**, incluindo o arquivamento da calibração, a guarda contra calibração parcial e o retry de 503. `tsc --noEmit` e `tsc -p tsconfig.build.json` passam. **Sem migration.**
- **Medição concluída:** a amostra 29+30 foi medida com **um avaliador**, para comparar com a mesma metodologia da linha de base v2; a v3 não mostrou ganho e a calibração não foi gravada. A validação da produção com os dois avaliadores continua sendo uma etapa separada.


## Atualização de 04/11/2026 — Redação: calibração ampliada para 180 redações

- **Amostra:** 90 redações de calibração + 90 de teste (temas inéditos), contra 99 antes. Ficaram 87 + 87 completas; 6 foram descartadas por 503/timeout do Gemini e não entraram nos números. Custo: 395 chamadas em 33,5 min, mediana de 2,8 s/chamada.
- **Teste honesto (87 redações):** concordância pela regra do Inep **41,4% → 42,5%** (diferença dentro do ruído: McNemar p = 1,0); erro médio **124,6 → 126,9** (não caiu; IC 95% da diferença: −4,6 a +9,2); viés **−54,7 → −30,3** (subestimação caiu quase pela metade); correlação 0,807 → 0,798.
- **Por competência:** C1 com erro 35,9 → 33,6, mas QWK 0,455 → 0,311 (a isotônica junta níveis vizinhos); C2 27,6 → 26,7 com QWK estável; C3, C4 e C5 ficaram na identidade. **C4 continua o gargalo** (erro 46,4, QWK 0,393, exato 21,8%): 44 das 87 notas do modelo estão em 120.
- **Calibração final:** ajustada nas 174 redações completas; isotônica em C1 e C2, identidade em C3/C4/C5. Leave-one-out: C1 35,2 → 24,4; C2 29,2 → 26,0; C3 27,4; C4 41,1; C5 35,4. Arquivo `model/llm-calibration.json` atualizado.
- **Leitura honesta:** o ganho de 46,7% da medição com 30 redações era otimismo de amostra pequena. A calibração reduz o viés e melhora C1/C2 no erro absoluto, mas não muda o quadro geral. O próximo ataque à C4/C2 é no prompt, não na calibração.
- **Nota mil do Inep:** 1000/880/920, mantidas. **Sem migration.** Testes de redação: 48/48.

## Atualização de 04/11/2026 — Gabarito Inteligente: vínculo com o banco e LuminIA por questão

- **Vínculo do gabarito com o banco:** cada item pode apontar para uma questão (`AnswerKeyItem.questionId`). O vínculo automático roda ao criar, importar do INEP, corrigir e recalcular o comunitário; o botão “Vincular questões” também permite refazer em “Meus gabaritos”. Só entram questões do workspace público `banco@lumina.app`.
- **Como casa:** ENEM pelo `sourceId` canônico (`enem-2024-d2-q91`, `enem-2023-d1-q1-ingles`); outras provas pelo número dentro da mesma prova. Itens de língua de outras provas ficam de fora.
- **LuminIA por questão:** após a conferência, questões erradas ou em branco mostram “Explicar com a LuminIA”. A IA recebe enunciado, alternativas, resposta correta e resposta do aluno. Sem IA configurada (ou se ela falhar), a resposta é um roteiro de revisão determinístico marcado como `rules`, sem conteúdo inventado. Sem questão ligada, a API responde 422 e a tela explica que falta o vínculo.
- **Testes:** backend com 30 casos no `answer-keys.spec.ts` (8 novos: sourceId, escolha do banco público, fallback honesto, vínculo, IA com sucesso, IA com falha, ausência de vínculo e limpeza de markdown na resposta da IA). App com `tsc -b`, lint, checks e build passando.
- **Sem migration:** o campo `AnswerKeyItem.questionId` já existia; não houve alteração de schema.
- **Dados reais (04/11/2026):** o caderno do ENEM 2024 (2º dia, Amarelo) foi importado no workspace público com **75 das 90 questões** (0 duplicatas, 0 erros; 15 puladas com motivo). Ficaram de fora, com motivo explícito: 9 dependem de imagem/figura ou de layout não separável com segurança (100, 106, 109, 110, 135, 146, 153, 156, 162), 5 têm fórmulas/figuras ilegíveis (139, 147, 149, 179, 180) e 1 foi anulada (102). O vínculo ficou em **75/90** e a explicação foi validada ponta a ponta com a IA real (questão 91, `source: ai`) e com 422 na questão sem vínculo (100).
- **Parser do ENEM 2024:** passou a aceitar o marcador de alternativa de uma letra (o PDF de 2023 usa duas) e a descartar rodapé/cabeçalho de página que contaminava questões que atravessam páginas; alternativas que viram “sopa de números” são puladas em vez de importadas.
- **Pendente naquela entrega:** o gabarito sugerido por IA (medido em 05/11/2026; ver entrada acima); confirmar a data de publicação do gabarito importado (20/11/2024).

## Atualização de 03/11/2026 — Documentação da visão do ecossistema (só documentação)

- Novos documentos: [docs/ROADMAP_ECOSSISTEMA.md](docs/ROADMAP_ECOSSISTEMA.md) (visão, modelo de negócio, camadas transversais, roadmap em 5 fases, riscos e decisões pendentes), [docs/LUMINA_GROUPS.md](docs/LUMINA_GROUPS.md) (grupos e salas coletivas de estudo) e [docs/LUMINA_MARKETPLACE.md](docs/LUMINA_MARKETPLACE.md) (mercado educacional).
- **Lumina Groups: Planejado (Fase 2). Lumina Marketplace: Futuro (Fase 4).** Nenhum código, tabela ou endpoint dessas frentes foi criado.
- Esta seção de status recodificou o texto corrompido das entregas de 27/09/2026 (itens 19 e 20) e marcou como desatualizada a lista "Não iniciado".

## Atualização de 03/11/2026 — Gabarito Inteligente: INEP, foto, painel do professor e comunitário

- **Importação do gabarito oficial do INEP:** testada com o PDF real do ENEM 2024 (2º dia, Amarelo; questão 102 anulada). O download agora completa a cadeia TLS do INEP, que não envia o certificado intermediário, e tenta de novo em caso de falha de rede.
- **Cartão por foto:** o aluno imprime o cartão da Lumina do gabarito, fotografa, e a leitura óptica preenche a grade, com as duvidosas em amarelo. O aluno confere antes de corrigir.
- **Painel do professor:** alunos das turmas dele por gabarito, com acerto médio, acerto por área, questões mais difíceis com o distrator mais escolhido e lista de alunos.
- **Gabarito comunitário:**
  - os votos dos alunos geram a resposta mais votada, a partir de 3 votos, com a concordância;
  - é sempre pendente e não oficial, com uma estimativa provisória separada do resultado;
  - some quando sai o oficial;
  - moderação só pela administração.
- **Bug corrigido no importador de questões do ENEM:** as questões 1–9 do 1º dia ficavam sem gabarito, e as de língua (1–5) colidiam no `sourceId`.
- **Testes:** validação no navegador sem erros. Backend com 774 testes (22 do Gabarito Inteligente); app com verificação de tipos real (`tsc -b`), lint e checks.
- **Migrations aplicadas:** `20261103150000_answer_keys` e `20261103200000_answer_key_votes`.
- **Pendente naquela entrega:** confirmar a data de publicação usada no gabarito importado (20/11/2024); LuminIA por questão (feito em 04/11) e gabarito sugerido por IA (medido em 05/11/2026; ver entrada acima).

## Atualização de 03/11/2026 — Em andamento (sem commit)

- **Cartão-resposta configurável pelo gestor:** cabeçalho no estilo do cartão do Enem (instituição, nome em quadrados, instruções, frase, cor do caderno, língua) que se adapta ao número de questões; numeração 91–180 no 2º dia; trava depois da primeira folha lida. Testes de layout e de leitura passando. Status: **em andamento** (sem commit).
- **Turma por link de convite:** aluno independente não entra por código, só pelo link assinado que o professor gera. Status: **em andamento** (sem commit).
- **Gabarito Inteligente (fase 1):** gabarito oficial (só administrador, com fonte e data) e de professor; seleção da prova, grade de respostas com revisão antes de corrigir, resultado com cores e por área, histórico e painel de desempenho (sem conversão para TRI). Página `/app/gabarito-inteligente` e item no menu. Testes: backend com 762 (11 novos). Importação do gabarito oficial direto do PDF do INEP (ano, dia, cor e as duas línguas lidos do PDF; incompleto é recusado). Migration `20261103150000_answer_keys` **aplicada** em 03/11; validado no navegador (ver entrada acima). Detalhes: [docs/GABARITO_INTELIGENTE.md](docs/GABARITO_INTELIGENTE.md). Status: **em andamento**.


## Atualização de 01/11/2026 — Correção de redação por competência, calibração funcional e cota mensal

- **Por competência:** cada avaliador avalia as cinco competências em chamadas separadas, com a grade, os trechos da cartilha e os sinais só daquela competência. O terceiro avaliador reavalia só as competências que divergiram. Cada competência traz "como melhorar", que aparece na tela.
- **Calibração funcional por competência e por modelo:** identidade, reta ou isotônica, escolhida por validação cruzada, com ganho mínimo de 3 pontos e preservação dos extremos (0 e 200).
- **Resultado** (flash-lite, 30 redações de temas inéditos): concordância pela regra do Inep de 36,7% → 46,7%, erro médio 149 → 129, nota mil do Inep 1000/880/920 (antes 1000/800/760). C4 continua fraca. **Amostra pequena:** a medição com 87 redações em 04/11/2026 mostrou ganho bem menor (41,4% → 42,5%; ver entrada acima).
- **Vários provedores:** `AI_ESSAY_MODELS`/`AI_VISION_MODELS` aceitam `gemini:`, `groq:`, `openrouter:` e `openai:` numa mesma lista, com fallback entre eles. Há limitador por minuto por modelo (`AI_RPM_LIMITS`) e espera curta quando o provedor manda aguardar (429).
- **Cota:** 4 correções por IA por aluno por mês (`ESSAY_CORRECTION_MONTHLY_LIMIT`). Falha ou nota sem IA devolve o crédito. Contador e bloqueio no editor e no scanner. `GET /essay-corrections/quota`.
- Migration `20261101120000_essay_correction_monthly_quota` (só adição). **Ainda não aplicada no banco.**
- Testes: backend com 742 (todos passando); app com os checks de sempre.
- **Pendente:** aplicar a migration; definir no `.env` `AI_ESSAY_MODELS`/`AI_VISION_MODELS` com o flash-lite; ampliar a calibração (cota de 500/dia); melhorar C2/C4; validar com fotos reais.

## Atualização de 31/10/2026 — Cartão-resposta: domínio por tópico só no lançamento final

- Lançar e corrigir a nota pelo cartão-resposta não mexem mais no domínio por tópico. Ele é aplicado uma única vez, com as respostas definitivas, quando o corretor finaliza a correção. A finalização trava a folha.
- Verificado contra o banco: lançar e corrigir mantiveram o domínio; finalizar somou só as respostas finais; finalizar de novo não duplicou; ajustar depois foi recusado.
- Migration `20261031233000_answer_sheet_finalize` (folhas antigas marcadas como finalizadas). Testes: backend com 724.

## Atualização de 31/10/2026 — Cartão-resposta: foto → PDF e conferência com ajuste de qualquer bolha

- **Foto → PDF:** cada foto digitalizada vira uma página A4 de um PDF gerado no navegador. É esse PDF que o servidor lê, e ele aceita várias folhas por envio (a turma inteira). O PDF fica guardado e pode ser baixado.
- **Conferência obrigatória:** nenhuma nota é lançada sem confirmação. O corretor vê a folha com cada bolha marcada por cima e pode ajustar qualquer questão, inclusive uma bolha pintada que a leitura não identificou. Também pode corrigir a nota depois de lançada.
- "Lançar as sem pendências" lança de uma vez as folhas sem dúvida.
- Migrations `20261031230000_answer_sheet_pdf` e `20261031231000_answer_sheet_adjusted` (só adições).
- Testes: backend com 721; app com o novo `pdf-writer.check.ts`.
- Ponta a ponta no navegador: PDF de 2 páginas, ajuste, lançamento e correção posterior conferidos com o gabarito.

## Atualização de 31/10/2026 — Scanner de cartão-resposta com leitura óptica real (item 17)

O scanner de gabarito deixou de ser simulado (antes escolhia respostas aleatórias). Agora tem:

- cartão-resposta da Lumina para imprimir, com marcadores nos cantos e um código que identifica o simulado e o aluno;
- digitalização no app, reaproveitando a do scanner de redação;
- leitura óptica determinística no servidor, com limiar por folha e confiança por questão;
- revisão das questões duvidosas com o recorte da foto;
- nota lançada no simulado pelo mesmo caminho do envio online.

Os endpoints antigos tinham falhas de permissão e foram removidos. Detalhes: [docs/SCANNER_GABARITO.md](docs/SCANNER_GABARITO.md).

- Migration `20261031220000_answer_sheet_omr` (só adições).
- Testes: backend com 717 (eram 708), incluindo OMR sintético (perspectiva, folha de cabeça para baixo, 90 questões, branco, dupla marcação, lápis e rasura).
- Ponta a ponta no navegador, com o banco real: impressão → marcação → foto → leitura → revisão → nota, conferida com o gabarito oficial.
- **Pendente:** teste com impressão real e marcações à mão em 2–3 celulares.

## Atualização de 31/10/2026 — Correção de redação por foto (scanner + IA com RAG e MCP)

O aluno fotografa a folha, o app digitaliza no estilo CamScanner (cantos, perspectiva, remoção de sombra, filtros, até 2 páginas), a LuminIA lê a letra sem corrigir os erros, o aluno confere o texto e a redação é corrigida pelas cinco competências do Enem. Os critérios vêm da cartilha 2025 do Inep, servidos à IA por um RAG próprio através de um servidor MCP próprio (`lumina-redacao`). A correção segue o processo do Inep: dois avaliadores e um terceiro na discrepância. O editor de redação digitada ganhou o botão **Corrigir com a LuminIA**, que usa a mesma correção.

- Detalhes, arquitetura, API, configuração e resultados da validação: [docs/CORRECAO_REDACAO_SCANNER.md](docs/CORRECAO_REDACAO_SCANNER.md).
- Treino e validação com o Essay-BR (6.577 redações avaliadas) e com as redações nota mil da cartilha.
  - Modelo estatístico: concordância pela regra do Inep de 52,8% (média: 29,9%).
  - IA: correlação de 0,88 no total, mas com compressão de escala (erro médio 123–135). Precisa de mais dados de calibração.
- Migration `20261031200000_essay_scanner_correction` (só adições).
- Testes: backend 708 (eram 678); app com o novo `doc-scanner.check.ts`.
- **Pendente:** validar com fotos reais de alunos; ampliar a calibração; plano pago ou outro provedor para fugir da cota diária dos modelos gratuitos; definir `AI_ESSAY_MODELS` no `.env`.

## Atualização de 26/09/2026 — funcionalidade 11: Resolução de questões (explicação por alternativa, marcar para revisar e dicas)

Entrega vertical fechada em 7 de 10 subitens do inventário. Os três primeiros (responder na plataforma, correção automática, feedback imediato) já existiam desde o item 9; o "gabarito comentado" (explicação da resposta correta) também. Esta entrega acrescenta os três que faltavam, menos dois que dependem de outras entregas.

- **Explicação de cada alternativa errada** (subitem "Explicação das alternativas erradas"). A explicação mora na alternativa (`question_alternatives.explanation`, migration `20260926160000_question_review_and_alternative_explanations`), não no gabarito: o gabarito responde "qual é a resposta", a explicação da alternativa responde "por que esse distrator existe". O autor escreve pelo formulário do banco de questões e pelo formulário de transcrição da busca web (campo opcional por alternativa, cujo rótulo vira "Por que esta é a correta" na alternativa marcada). A explicação **não viaja na visão de responder** — entregá-la antes de responder entregaria o gabarito junto, porque a alternativa correta está entre as explicadas: só sai em `?includeAnswer=true` (visão de autor) e no resultado de `POST /questions/:id/attempt`, no painel "Por que cada alternativa está assim" com a marcação `(sua resposta)`.
- **Marcar questão para revisar** (subitem "Marcar questão para revisar"). `user_question_progress.marked_for_review` é coluna **independente** de `is_favorite`, com índice dedicado: favoritar é gostar (coleção), marcar é compromisso de retomada (fila de trabalho) — os dois estados coexistem sem interferir. `POST`/`DELETE /questions/:id/review` e `GET /users/me/questions/review` (fila de retomada). O estado volta na listagem e no detalhe (`progress.markedForReview`) para o botão mostrar a verdade sem segunda chamada. Marcar não registra tentativa nem mexe nas estatísticas.
- **Pedir dica sem ver a resposta** (mesmo subitem). `GET /questions/:id/hint?level=1..3`: nível 1 aponta o assunto e o conceito a recuperar, 2 diz o que conferir no enunciado, 3 dá o método de eliminação; a escada para em 3 ("Sem mais dicas") e nível fora da faixa é 400. A garantia de que a dica não vaza o gabarito tem **duas camadas**: (1) estrutural — o `HintProvider` recebe só enunciado, disciplina, assunto, dificuldade e a *quantidade* de alternativas, então não tem como saber a resposta; (2) defensiva — o texto gerado é normalizado (sem acento, sem pontuação) e conferido contra a alternativa correta, sendo descartado no lugar por uma dica neutra quando a contiver (só para alternativas com 4+ caracteres, senão "8" geraria falso positivo em qualquer frase). Provedor padrão: `StudyGuideHintProvider` (`provider: "rules"`), determinístico e sem chave de API, com reconhecimento de área por casamento **insensível a acento** (o banco guarda "Funcoes exponenciais" e a dica não pode depender da acentuação). Para plugar um modelo de linguagem basta registrar outro `HintProvider` no token `QUESTION_HINTS_PROVIDER`. Pedir dica não conta como tentativa.
- **Fila de revisão na interface**: cartão "Para revisar" no painel do aluno (`/app`), alimentado pela fila real. Quando a chamada falha, o cartão diz que não carregou em vez de afirmar "nada marcado para revisar" — uma interface que afirma o vazio quando o que falhou foi a carga mente sobre o estado do aluno.
- Validação visual no navegador (Chromium via Playwright, ambiente efêmero fora do repositório) contra backend e aplicativo reais: **59 verificações, todas aprovadas** — campo de justificativa por alternativa e sua reconfiguração ao marcar o gabarito, arrasto correto das justificativas ao remover e re-adicionar alternativa, payload de salvamento com as quatro justificativas e o gabarito na posição certa, marcar/desmarcar com `POST`/`DELETE` corretos, sobrevivência ao recarregar, independência de favorito, escada de três dicas com botão desabilitado no limite e nenhuma dica contendo o gabarito, painel de explicação por alternativa no acerto e no erro com `(sua resposta)`, "Responder novamente" limpando o painel e preservando as dicas, formulário de edição reabrindo com as justificativas na ordem salva, fila do painel aparecendo e esvaziando, e a honestidade do cartão quando a fila está indisponível. Sem erro de JavaScript e sem resposta HTTP ≥ 400.
- Duas lições da validação, ambas resolvidas: (a) o cartão da fila, recém-criado, herdou o padrão `Promise.allSettled` do painel e **afirmava "nada marcado para revisar" quando a requisição falhava** — passou a distinguir erro de vazio, com verificação no navegador (requisição abortada de propósito); (b) a dica de nível 1 interpolava o assunto sem cuidado e saía "assunto: ." em questão sem assunto (comum em questão importada) — passou por `descricaoDaQuestao`, com teste para o caso sem assunto no provedor e na dica neutra do serviço.
- Ruído de ambiente explicitado: o limitador local (100 requisições por minuto por IP) reagiu à carga da própria validação — em desenvolvimento o `StrictMode` do React executa cada efeito duas vezes e o painel do aluno dispara 7 requisições por carga, com sondagem a cada 30 s. Isso não é defeito do produto: o script passou a ler `RateLimit-Remaining`, esperar a janela abrir e repetir a leitura, e reporta as respostas 429 separadamente das falhas reais.
- Testes: **359 aprovados em 23 arquivos no backend** (era 321 em 22) e **3 checks rápidos no aplicativo** (era 2) — 18 unitários do provedor/serviço de dicas (nível 1/2/3, área reconhecida com e sem acento, área genérica, questão difícil, ausência de assunto, o provedor nunca recebendo o gabarito, descarte de dica que vaza, não-descarte por resposta curta, clamp de nível, `maxLevel`), 12 unitários do serviço de questões (marcar para revisar sem mexer no favorito, alternância sem preferência, 404 em questão inacessível, dica sem gravar tentativa, explicação por alternativa no resultado da tentativa e a ausência dela na visão de responder, `progress` em lote na listagem) e 8 novos e2e (visão de responder nunca entrega a explicação, visão de autor entrega, tentativa devolve as justificativas, dica sem revelar a alternativa correta, nível inválido 400, dica não conta como tentativa, marcar para revisar volta na listagem, 404 em questão inacessível). No aplicativo, as regras da transcrição da busca web saíram do componente para `src/lib/question-transcription.ts` (alinhamento alternativa/justificativa, reposicionamento do gabarito, alternativa em branco com a justificativa órfã) e ganharam o check `test/transcricao-questoes.check.ts`: a lógica que o typecheck não pega agora é verificada em milissegundos, e o navegador fica só com o que ele é bom de provar. Typecheck, build e lint aprovados nos dois projetos.
- Documentação: `docs/RESOLUCAO_QUESTOES.md` descreve os endpoints, a regra de onde a explicação pode aparecer, a independência entre favoritar e revisar, a escada de dicas com a dupla garantia e como trocar o provedor.
- **"Pedir ajuda à LuminIA" entregue em 05/11/2026**: o botão vive no cartão de resolução (banco de questões e caderno de erros) e abre o chat flutuante já com a pergunta. O cliente envia só o `questionId` em `POST /ai/chat`; o servidor carrega enunciado, alternativas e a última tentativa e monta o contexto — o texto da questão e o gabarito nunca são enviados pelo cliente. Antes de responder, o contexto omite a alternativa correta e o comentário do gabarito e instrui a IA a ajudar no raciocínio; depois da tentativa, inclui a alternativa marcada, a correta, o resultado e as explicações. O `questionId` continua ativo nas mensagens seguintes até o aluno trocar de tela, e uma questão inacessível apenas omite o contexto (sem quebrar a conversa). Questão com imagem avisa que a IA não recebeu a imagem. Ajuda contextual em `docs/RESOLUCAO_QUESTOES.md`. Testes: **14 novos** (6 do contexto puro, 3 do serviço de questões, 4 do controller e 1 do mock), suíte em **822 testes/53 arquivos**.

## Atualização de 26/09/2026 — itens 12 e 13: Caderno de erros e classificação do motivo do erro

Entrega vertical fechada dos dois itens do inventário. O caderno nasce dentro do módulo `Questions` (rotas `/users/me/error-notebook`), reutilizando `QuestionsRepository` e `QuestionAccessService` já exportados pelo `QuestionsModule`. A regra central é: **todo erro cria ou reabre a entrada; dois acertos seguidos dominam a questão** — a entrada continua no histórico (a evolução "EEAA" prova o progresso), mas sai da fila do que precisa ser refeito (filtro padrão `ABERTA`).

- **Registro automático** dentro da transação de `POST /questions/:id/attempt` (mesma transação da tentativa, para que o erro nunca exista sem a tentativa que o produziu). O estado da entrada volta no campo `errorNotebook` do `AttemptResultDto`, para a interface já mostrar o novo estado sem recarregar.
- **Motivo do erro** (item 13) é `ENUM Prisma ErrorReason` (7 motivos + `OUTRO`; texto livre nunca substitui a classificação). "Sem motivo" é facet (`SEM_MOTIVO`), não ausência: o aluno vê o que ainda falta classificar. Correção de contrato: o filtro `SEM_MOTIVO` promete que `value` vai no filtro, mas o serviço rejeitava com 400 — agora `where.reason = null` (unit spec + e2e).
- **Dificuldade** não é duplicada no caderno (fonte única = a da questão; no caderno ela é recorte, não escolha).
- **Evolução** = `"EEAA"`, truncada à direita em 40 caracteres; `DOMINADA` com 2 acertos seguidos (`ERROR_NOTEBOOK_MASTERED_STREAK = 2`), entrada permanece no histórico.
- **Revisão combinada** = meia-noite UTC do dia digitado; `due = reviewScheduledAt <= now` (vencida inclusive); filtro inválido → 400; POST duplicado → 409; PATCH/DELETE fora do caderno → 404; filtro padrão = `ABERTA`.
- **Resumo** com totais e recortes (`bySubject`, `byTopic`, `byReason` com desempate por `label.localeCompare(..., 'pt-BR')`), agregado em memória a partir de `slices()`.
- **Interface**: página `/app/caderno-de-erros` (filtros, cartões, evolução, revisão, remoção, banner de dominada); componente `QuestionResolution` extraído de `QuestionBank` para reuso no caderno (com `onAnswered` e `answerLabel`); cartão no `Dashboard` (seção ajustada para `xl:grid-cols-3`); item de menu "Caderno de erros" com ícone `NotebookPen`.
- **Front refatorado**: `positionLetter`, `ROTULO_DIFICULDADE`, `CLASSE_DIFICULDADE`, `origemDaQuestao` movidos para `src/lib/question-labels.ts` (fonte única), com `question-transcription.ts` reexportando `positionLetter`.
- **Testes**: `error-notebook.service.spec.ts` (30 unit), `questions.e2e-spec.ts` (bloco caderno, 13 casos; `RATE_LIMIT_MAX=5000`), suíte completa **404 testes/24 arquivos verdes**; `test/fake-prisma.ts` estendido (`errorNotebookEntry`); app: `test/caderno-de-erros.check.ts` (módulo puro `error-notebook.ts` + `question-labels.ts`) + entrada no script `test` (hoje 4 checks); `npm run typecheck`, `npx oxlint src`, `npm test`, `npm run build` no app limpos.
- **Validação visual (Playwright)**: **71 verificações, todas aprovadas** — caderno abre com as duas questões erradas, resumo conta abertas/dominadas/sem-motivo/para-revisar, matéria/assunto/procedência vêm da questão, linha do tempo começa com "E" e frase "sem acerto ainda", 8 motivos + "Sem motivo" no select, cada motivo tem rótulo legível, motivo gravado no servidor, recortes por motivo aparecem e filtram corretamente, revisão amanhã/hoje/data digitada/sem data, filtro "só o vencido", observação do aluno com botão que só aparece com texto novo e persiste após salvar, reapresentar a questão dentro do caderno, errar de novo (linha do tempo "EE", frase "2 tentativas", "Errou 2 vezes"), primeiro acerto ("Em recuperação: 1 de 2"), segundo acerto (dominada, sai da fila aberta, aviso "continua no histórico"), filtro Dominadas mostra a questão com selo e frase do progresso, filtros por matéria/assunto/dificuldade/situação, recorte vazio diz "Nenhuma questão neste recorte" (não "caderno vazio"), limpar filtros volta a fila, painel do aluno mostra o cartão com contagens e link, remover do caderno apaga no servidor e na tela, abortar propositalmente o resumo/lista faz a página dizer "Não foi possível carregar" em vez de mentir que está vazio. **Zero erros de JavaScript, zero HTTP ≥ 400 fora do abort proposital**.
- Documentação: `docs/CADERNO_DE_ERROS.md` descreve endpoints, regra de evolução, motivo como recorte, revisão combinada, dominação e como a interface evita mentir quando a chamada falha.

## Atualização de 26/09/2026 — itens 14, 15 e 16: Simulados com cronômetro, modo prova real e simulado adaptativo

Entrega vertical dos itens 14 (Simulados), 15 (Modo prova real) e 16 (Simulado adaptativo) do inventário. A base de simulados já existia (criação, listagem, envio, correção, cartão-resposta); esta entrega acrescenta o cronômetro, o modo "prova real" e o simulado adaptativo com algoritmo IRT simplificado.

### Itens 14 e 15: Cronômetro e Modo Prova Real

- **Migração** `20260926211841_add_simulation_timer_real_exam`:
  - `simulation.duration_minutes` (Int, opcional): duração em minutos
  - `simulation.is_real_exam` (Boolean, default false): modo prova real
  - `simulation.started_at` (DateTime): quando o aluno iniciou a resolução
  - `simulation_item.area` (String, opcional): área do conhecimento (estilo ENEM)

- **Backend** (`SimulationsService`):
  - `CreateSimulationDto` com `durationMinutes` (1–600) e `isRealExam`
  - Validação: modo prova real exige duração
  - `submit` grava `startedAt` no submission
  - `submission` devolve `startedAt`, `timeSpentMinutes` calculado, `area` por item
  - `list`/`get` expõem `durationMinutes` e `isRealExam`

- **Frontend** (`Simulations.tsx`):
  - Cronômetro visual (MM:SS) no header durante a resolução
  - **Modo prova real**: timer obrigatório, badge vermelho, envio automático ao fim do tempo, botão manual desabilitado enquanto timer roda
  - Área do conhecimento exibida no cartão da questão (print + responder)
  - Formulário de criação: campos Duração (min) e checkbox "Modo prova real"
  - Lista de simulados mostra badges de duração e "Prova real"
  - Resultado inclui tempo gasto e hora de início

### Item 16: Simulado Adaptativo (IRT simplificado)

- **Migração** `20260926213730_add_adaptive_simulation`:
  - `adaptive_simulation_sessions`: `userId`, `examId`, `status` (IN_PROGRESS/COMPLETED/ABANDONED), `estimatedAbility` (0–1), `skills` (JSON por habilidade)
  - `adaptive_simulation_steps`: `sessionId`, `userId`, `questionId`, `difficulty`, `skill`, `subSkill`, `selectedPosition`, `isCorrect`, `abilityBefore`, `abilityAfter`, `timeSpentSeconds`
  - `AssessmentType.ADAPTIVE` adicionado ao enum

- **Backend** (`AdaptiveSimulationService`):
  - `start/examId` → cria sessão com `ability = 0.5`
  - `nextQuestion`: escolhe questão cuja dificuldade mais aproxima da `ability` atual; prioriza habilidades não testadas
  - `answer`: atualiza `ability` via IRT 1PL simplificado — `ability += (isCorrect ? +1 : -1) * stepSize * (1 - difficultyFactor)`; grava step com `abilityBefore/After`
  - Critério de parada: 20 questões OU 3 habilidades "fortes" (ability > 0.8, total ≥ 2) OU 3 "fracas" (ability < 0.2, total ≥ 2)
  - `summary`: diagnóstico com `strongAreas`, `weakAreas`, tabela por habilidade (acertos, total, precisão, ability)
  - Endpoints: `POST /adaptive/start`, `GET /adaptive/:id/next`, `POST /adaptive/:id/answer`, `POST /adaptive/:id/finish`, `POST /adaptive/:id/abandon`, `GET /adaptive/:id/summary`, `GET /adaptive`

- **Frontend** (`AdaptiveSimulation.tsx`):
  - Página `/app/simulados/adaptativo`: lista de sessões, nova sessão com `examId` opcional
  - Durante a sessão: cronômetro, questão atual com alternativas, habilidade e dificuldade visíveis
  - Feedback imediato: certo/errado + mudança de ability
  - Diagnóstico final: pontos fortes, lacunas, tabela detalhada por habilidade

- **Testes**: suíte backend **404 testes / 24 arquivos verdes**; app **4 checks verdes**; builds limpos nos dois projetos.

## Atualização de 26/09/2026 — item 17: Scanner de gabarito

Entrega vertical do item 17 do inventário. A base para correção de cartões-resposta físicos via foto/upload.

- **Migração** `20260926215649_add_answer_sheet_scanner`:
  - `answer_sheet_templates`: template de gabarito com `markersJson` (4 cantos) e `layoutJson` (bolhas por questão)
  - `answer_sheet_uploads`: upload de imagem pelo aluno/professor, link com template e simulado
  - `answer_sheet_processings`: resultado do OCR — `detectedAnswers`, `confidenceJson`, `warningsJson`, `totalQuestions`, `answeredCount`, `lowConfidenceCount`
  - `answer_sheet_submissions`: submissão final linkada ao processing, com `finalAnswers` (após revisão humana), `correct`/`total`
  - Enums: `AnswerSheetStatus`, `AnswerSheetProcessingStatus`
  - Relações User: `answerSheetUploads`, `answerSheetSubmissions`, `answerSheetReviews`
  - Relações Simulation: `answerSheetUploads`, `answerSheetSubmissions`

- **Service** (`AnswerSheetService`):
  - CRUD de templates, presigned URL, processamento assíncrono (simulado), detecção com confiança/warnings, auto-submissão, revisão humana, listagem/stats

- **Controller**: 9 endpoints: templates CRUD, presigned URL, upload complete, listagem uploads/processamentos, review, stats

- **Testes**: backend 404/24 ✓, app 4 checks ✓, builds limpos

## Atualização de 26/09/2026 — ## Atualização de 26/09/2026 — item 18: Scanner de questões

Entrega vertical do item 18 do inventário. Scanner de questões impressas: foto → OCR → classificação → LuminIA → questão oficial ou caderno de erros.

- **Migração** `20260927001348_add_question_scanner`:
  - `question_scan_uploads`: upload de imagem pelo aluno
  - `question_scan_processings`: resultado OCR + classificação (`stemText`, `alternativesJson`, `subject`, `topic`, `difficulty`, `explanationJson`, `confidence`, `warningsJson`)
  - `question_scan_results`: questão salva (pode virar questão oficial ou entrar no caderno de erros)
  - Enums: `QuestionScanStatus`, `QuestionScanProcessingStatus`
  - Relações: `User.questionScanUploads`, `User.questionScanResults`, `Question.scanResults`, `ErrorNotebookEntry.scanResults`

- **Service** (`QuestionScanService`):
  - Presigned upload URL
  - Processamento assíncrono simulado: OCR + classificação disciplina/assunto/dificuldade + explicação LuminIA por alternativa
  - Detecção de warnings (baixa confiança, resolução baixa, orientação)
  - `saveAsQuestion`: cria questão oficial no banco (com `exam` opcional)
  - `saveToErrorNotebook`: adiciona direto ao caderno de erros (`sourceType=IMPORTED`, `reason` opcional)
  - Listagem/uploads/processing/stats

- **Endpoints** (Controller):
  - `POST /question-scans/upload-url` (presigned)
  - `POST /question-scans/upload/:id/complete` (dispara processamento)
  - `GET /question-scans/uploads`, `GET /question-scans/processing/:id`
  - `POST /question-scans/processing/:id/save-question` (cria questão oficial)
  - `POST /question-scans/processing/:id/save-error-notebook` (adiciona ao caderno)
  - `GET /question-scans/stats`

- **Frontend** (`QuestionScanner.tsx`):
  - Página `/app/question-scanner`: upload com pré-visualização, polling de processamento
  - Resultado: enunciado, alternativas, disciplina/assunto/dificuldade, confiança, warnings
  - Explicação LuminIA por alternativa
  - Botões: "Criar questão oficial" (salva no banco) e "Adicionar ao caderno de erros" (com motivo)
  - Aba "Histórico" com lista de digitalizações e status

- **Testes**: backend 404/24 ✓, app 4 checks ✓, builds limpos

- **Próximos passos**: worker real OCR (Tesseract/Sharp), LuminIA real para explicação, UI de revisão com canvas, buscar questões semelhantes

## Não iniciado

> **Desatualizado (nota de 03/11/2026):** esta lista é de 26/09/2026. Provas antigas (item 19), redação com correção por competências (item 20), parte da LuminIA conversacional e o scanner de cartão-resposta foram entregues depois (ver as entradas acima). O estado atual está em [docs/ROADMAP_ECOSSISTEMA.md §2](docs/ROADMAP_ECOSSISTEMA.md). Lista mantida como registro histórico.

- Provas antigas (item 19): ENEM, vestibulares, UECE, filtro por ano/área, resolver online, gabarito, histórico, estatísticas
- Redação (item 20): enviar/digitar/foto, salvamento automático, contagem palavras, correção por competências ENEM, feedback, evolução
- LuminIA conversacional (itens 21-24): explicação de conteúdos, explicação de questões, modo socrático, recomendação de videoaulas
- Scanner de cartão-resposta (item 17 completo, item 18 feito): worker real OCR (Tesseract/Sharp), LuminIA real para explicação, UI de revisão com canvas, buscar questões semelhantes
- Mapa de Domínio e Lumina Score
- Agenda/calendário unificado, lembretes e notificações
- Metas independentes, gamificação, XP, níveis, conquistas, streaks e desafios
- Planos, assinaturas, pagamentos e cobrança institucional
- Denúncias, suporte e gestão editorial completa dos conteúdos

## Prioridade imediata: correções por captura e texto

1. Correção de redação por scanner no estilo CamScanner: câmera ou arquivo, detecção das bordas, recorte e correção de perspectiva, melhoria de contraste/sombras, suporte a várias páginas, OCR, revisão da transcrição e correção pelas competências do ENEM. O original e o texto reconhecido devem permanecer vinculados e toda baixa confiança precisa de confirmação manual.
2. Correção de redação digitada/transcrita dentro da plataforma: editor com salvamento automático, contagem de palavras, versões, seleção de tema e o mesmo relatório por competências usado pelo scanner, permitindo comparar evolução sem depender de imagem.
3. Correção de gabaritos por scanner: modelos identificáveis de cartão-resposta, captura guiada, alinhamento pelos marcadores, leitura de marcações, nível de confiança por resposta, revisão manual das ambíguas e vínculo automático ao simulado/lista antes de calcular nota e desempenho.
4. Treino de raciocínio lógico e cálculo mental rápido: rodadas curtas com operações matemáticas básicas, resposta contra o tempo, sequência de acertos e dificuldade adaptativa. O módulo deve registrar precisão, tempo médio por resposta, evolução por tipo de operação e erros recorrentes, com modos de treino livre e desafio diário inspirados na dinâmica de resposta rápida citada como referência.

Os três fluxos de correção por captura/texto devem compartilhar uma esteira de captura e processamento assíncrono, com estados visíveis, repetição segura, trilha de auditoria, proteção dos arquivos enviados e exclusão configurável. A correção por IA deve apresentar justificativas e permitir revisão humana; uma nota não deve ser tratada como definitiva quando a imagem ou o OCR estiverem abaixo do nível mínimo de confiança.

## Ordem recomendada das demais entregas

5. Criar listas/cadernos e simulados, base necessária para associar gabaritos digitalizados.
6. Finalizar instituições (API e interface de membros, cargos, permissões, turmas e códigos de entrada).
7. Consolidar dashboard e analytics do aluno com os dados já coletados.
8. Implementar Mapa de Domínio e recomendações determinísticas antes da LuminIA generativa.
9. Adicionar provas antigas completas, com imagens, revisão editorial e comparação entre edições.
10. Construir dashboards institucionais e relatórios.
11. Integrar LuminIA conversacional, notificações, gamificação e pagamentos após os fluxos centrais estarem maduros.

Cada item deve ser entregue verticalmente: migração/schema, regras de autorização, API, interface, testes e observabilidade.

## Atualização de 27/09/2026 — item 19: Provas antigas

Entrega vertical do item 19 do inventário. Experiência completa de provas antigas: ENEM, vestibulares, UECE com PDF/imagens, gabarito oficial, caderno de questões, navegação por páginas, comparação entre edições.

- **Migração** 20260927011239_add_past_exams:
  - exam_papers: edição de prova (ex.: ENEM 2023) com PDF, imagens das páginas, metadados, gabarito, caderno
  - exam_paper_pages: páginas individuais com imagem, dimensões, OCR
  - exam_paper_questions: mapeamento questão → número na prova, página, coordenadas, área
  - exam_paper_comparisons: comparação entre edições (questões similares, mudança de dificuldade, novos tópicos)
  - Enum ExamPaperStatus (DRAFT, PUBLISHED, ARCHIVED)
  - Relações: Exam.papers, ExamPaper.pages/questions/comparisons, Question.examPaperQuestions

- **Próximos passos**: UI de navegação da prova (PDF viewer, paginação), busca por questão dentro da prova, importação em lote de PDFs oficiais, geração automática de comparações.

## Atualização de 27/09/2026 — item 20: Redação

Entrega vertical do item 20 do inventário. Correção de redação por competências ENEM (C1 a C5), versionamento, feedback IA/professor, sugestões de melhoria.

- **Migração** 20260927011239_add_past_exams (mesma migração):
  - essay_corrections: correção por competências (C1-C5), nota total, status, corretor (IA/professor), confiança, feedback geral
  - essay_correction_details: detalhe por competência (C1-C5) com nota, justificativa, evidências
  - essay_versions: versionamento automático a cada salvamento (conteúdo, contagem de palavras)
  - essay_feedbacks: feedbacks tipados (AI_SUGGESTION, TEACHER_COMMENT, PEER_REVIEW) com ancoragem a trecho
  - Enum EssayCorrectionStatus (PENDING, IN_PROGRESS, COMPLETED, FAILED)
  - Relações: Essay.correction/versions/feedbacks, User.essayFeedbacks

- **Próximos passos**: UI do editor de redação (contador de palavras, salvamento automático), integração com IA para correção automática por competências, UI de revisão do professor, relatório de evolução por competência ao longo do tempo.

## Atualização de 27/09/2026 — itens 21, 22 e 23 (cadernos e modelos de redação)

Fechamento dos itens 21, 22 e 23 do inventário, com o app inteiro de pé
(backend 3001 + frontend 5174) e as páginas novas validadas no navegador.

### Item 21 — Caderno de fórmulas

- **Migração** 20260927232158_add_formulas_repertoires:
  - formulas: expressão em LaTeX, disciplina, assunto, anotação pessoal, favorito
  - Relação User.formulas (onDelete: Cascade)
  - Índices por (userId, discipline) e (userId, isFavorite)
- **API** `GET/POST /formulas`, `GET/PATCH/DELETE /formulas/:id`
  - Toda leitura/edição filtra por (id, userId): intruso leva 404, sem vazar existência
  - DTOs com `whitelist`/`forbidNonWhitelisted`: disciplina fora da lista é
    recusada e assunto em branco é normalizado para nulo
- **Interface** `/app/caderno-formulas`: formulário, edição em linha, favoritos,
  busca por nome/LaTeX/assunto, filtro por disciplina, item de menu na lateral
- **Testes** 5 casos (padrão, validação, update parcial, intruso, exclusão)

### Item 22 — Caderno de repertórios

- **Migração** 20260927232158_add_formulas_repertoires (mesma migração):
  - repertoires: título, resumo, fonte, ano, tema, palavras-chave, dominado
  - Relação User.repertoires (onDelete: Cascade)
  - Índices por (userId, theme) e (userId, isStudied)
- **API** `GET/POST /repertoires`, `GET/PATCH/DELETE /repertoires/:id`
  - Palavras-chave normalizadas (minúsculas, sem duplicata, teto de 20)
- **Interface** `/app/caderno-repertorio`: chips de palavra-chave com Enter,
  filtro por tema, marcação de dominado, item de menu na lateral
- **Testes** 4 casos (padrão, validação, dominado, intruso)

### Item 23 — Modelos de redação nota mil

- **Migração** 20260927120000_add_essay_models: essay_models (exame, ano, tema,
  texto, nota por competência, total, PDF, destaques)
- **API** `GET /essays/models/list` (filtro por ano/exame/tema, paginado),
  `GET /essays/models/:id`
- **Interface** `/app/redacoes/modelos`: lista com nota por competência, detalhe
  com o texto e as anotações por competência, comparação lado a lado com a
  redação do aluno, link para o PDF oficial, item de menu na lateral
- **Testes** cobertos pela suíte de essays (biblioteca pública, sem vínculo com usuário)

### Item 19 (complemento) — Provas anteriores

- **API** `GET /exam-papers`, `/exam-papers/:id`, `/exam-papers/:id/pages`,
  `/exam-papers/:id/questions`, `/exam-papers/compare?baseId=&compareId=`
  - Movidas para o QuestionCatalogService (tinham ficado com um controller
    duplicado em /notebooks, sem a checagem de workspace)
  - `compare` mede a repetição de questões entre duas edições do mesmo vestibular
  - Prova não publicada responde 404, como se não existisse
- **Interface** `/app/provas-antigas`: lista, páginas, questões mapeadas e o
  bloco de comparação entre edições

### Correções

- `QuestionScanService.listUploads` pedia `result` como relação do upload, mas
  ela é do processing: a rota devolvia 500. Agora aninha
  `processing: { include: { result: true } }`
- Scanner de gabarito chamava `/api/simulations` (prefixo inexistente, 404 no
  console). Passa a usar o cliente `apiSimulations`
- Tipos de `api.ts` alinhados ao schema real (markersJson é objeto indexado
  por nome, e não array; detectedAnswers/confidenceJson com chave string)
- `NEEDS_REVIEW` pertence ao status do upload, não do processing: a tela de
  revisão do gabarito passou a ler o upload

### Estado da suíte

- Backend: 426 testes / 27 arquivos, typecheck limpo
- Frontend: build (tsc -b + vite build) limpo, oxlint sem erros,
  4 checks de node verdes
- Validação visual (Playwright): 7 páginas carregadas sem erro de console nem
  HTTP 4xx/5xx; CRUD completo de fórmula e de repertório exercitado no navegador
