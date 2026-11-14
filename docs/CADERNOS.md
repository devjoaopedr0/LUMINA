# Cadernos de Repertórios e de Fórmulas

> **Status: Implementado (12/11/2026), aguardando validação no navegador.** Migration `20261112120000_notebooks_complete` (só adições; os repertórios antigos ganham uma categoria a partir do tema). Código e testes prontos; falta abrir as telas com o banco ativo.

## Caderno de Repertórios (especificação de 01/11/2026)

Biblioteca pessoal de repertórios socioculturais para a redação. Rota `/app/caderno-repertorio`.

| Seção da especificação | Como ficou |
| --- | --- |
| 1. Objetivo | Cadastro próprio, acervo da plataforma, categorias, busca, favoritos, coleções, anotações, uso na redação e LuminIA |
| 2. Tela inicial | Total salvo (com o limite do plano), categorias usadas, favoritos, acervo disponível, recentes, busca, filtros e os botões "Adicionar" e "Sugestões da LuminIA" |
| 3. Categorias | As 13 da especificação + "Outra" + categorias criadas pelo aluno (campo `category` livre; as fixas em maiúsculas) |
| 4. Campos | título, categoria, autor/responsável, tipo de referência, contexto, explicação do conceito, importância, como usar, temas relacionados, exemplo de uso, fonte, ano (aceita a.C.), palavras-chave, anotações, favorito, "já domino". Título, categoria e explicação são obrigatórios; o detalhe mostra o que falta para ficar completo |
| 5. Detalhe | Seções: identificação, contexto, conceito, importância, como usar, temas, exemplo, fonte, anotações; botões copiar trecho, copiar tudo, favoritar, editar, excluir |
| 6. Busca | Texto (título, autor, categoria, conceito, contexto, uso, fonte, palavras-chave, temas) + categoria, tema, tipo, favoritos, coleção e origem (meu caderno, acervo, tudo); ordem: recentes, antigos, favoritos, A–Z |
| 7. Coleções | Nome e descrição; um repertório pode estar em várias; apagar a coleção não apaga os repertórios |
| 8. LuminIA | A) sugerir para um tema; B) explicar; C) usar na introdução ou no desenvolvimento; D) conexões entre 2 a 4 repertórios; E) conferir pertinência (pertinente, superficial, forçado, fora de contexto); F) a sugestão só entra no caderno depois que o aluno revisa no formulário (origem `AI`) |
| 9. Editor de redação | Botão "Repertórios" no editor abre um painel lateral sem sair do texto: busca no caderno e no acervo, detalhe, conferir pertinência ao tema da redação, copiar, **inserir no ponto do cursor** e sugestões da LuminIA para o tema, salvando no caderno sem sair do editor |

A especificação recebida terminava no meio da seção 9; o que vier depois dela ainda não foi implementado.

**Regra de honestidade da LuminIA:** o prompt (`lumina-backend/src/notebooks/notebook-ai.ts`, versão `cadernos-v1`) proíbe inventar autor, obra, citação literal, número ou data, e pede que a IA diga o que o aluno deve conferir. Toda resposta vem com o aviso "Confira autores, datas e dados antes de usar". As sugestões são lidas e validadas no servidor (categoria e tipo fora da lista viram "Outra"/"Outro"; sem título ou sem relação com o tema, a sugestão é descartada).

## Caderno de Repertórios Socioculturais (especificação v2, 13/11/2026)

Migration `20261113130000_repertoire_spec_v2` (só adições; os repertórios antigos ganham o eixo a partir do tema). Aplicada no banco em 13/11/2026, com o acervo republicado (`notebooks:seed-platform`: 5 repertórios novos, 38 itens atualizados).

| Seção | Como ficou |
| --- | --- |
| 1. Eixos temáticos | 10 eixos (Educação, Desigualdade, Política e cidadania, Cultura e identidade, Tecnologia, Meio ambiente, Saúde, Trabalho e economia, Direitos humanos, Mídia e comportamento). Um repertório pode ter vários (`axes`); filtro por eixo na busca |
| 2. Estrutura (10 itens) | Autor/obra/documento, contexto, ideia central, conceitos-chave (`concepts`), problemas sociais que explica (`socialProblems`), relação com o Brasil (`brazilRelation`), como usar, exemplo (com o parágrafo onde entra, `exampleSlot`: introdução ou D1/D2), conexões (`connections`) e cuidados para não usar de forma decorativa (`pitfalls`). O detalhe mostra os 10 itens numerados |
| 3. Mapa de aplicação | 8 funções na argumentação (`argumentFunctions`): desigualdades estruturais, omissão estatal, falhas educacionais, comportamentos coletivos, problemas históricos, violações de direitos, impactos tecnológicos, relações de poder. Filtro por função e visão "Mapa de aplicação" que agrupa o caderno por função |
| 4. Referências iniciais | Acervo com 20 repertórios completos, entre eles Caio Prado Júnior, Bauman, Bourdieu, Paulo Freire, Milton Santos, Hannah Arendt, Carolina Maria de Jesus, Byung-Chul Han, CF/88 e DUDH |
| 5. Prática | Guia de 5 perguntas no detalhe (o que defende, que problema explica, como relacionar ao tema, como sustentar a tese, como desenvolver sem só mencionar) e o botão **Aplicar ao meu tema** (LuminIA): pertinência ALTA/MÉDIA/BAIXA, as 5 respostas e um parágrafo modelo |
| 6. Integração com a redação | No editor, aba **Analisar meu parágrafo** (pega o parágrafo do cursor): produtivo, superficial, decorativo, forçado, incorreto ou sem repertório, com o trecho e dicas |
| 7. Qualidade | Citação literal só em campo próprio e com fonte obrigatória (`quote`, `quoteSource`); sem fonte, ela vai para as anotações como "Citação a conferir". Fora disso, o detalhe avisa que o texto é paráfrase. O acervo não tem citação literal |

**Prompts (`cadernos-v2`).** "Aplicar" julga a pertinência antes de escrever (BAIXA quando a ligação é só uma generalização, e então recomenda outro repertório). "Analisar" decide em dois passos: o repertório tem relação com o argumento do parágrafo? Se tem, é desenvolvido? O caso "cita o autor e muda de assunto com 'além disso'" está no prompt como exemplo de decorativo. A LuminIA dos cadernos usa `AI_NOTEBOOK_MODELS` ou, sem ela, a cadeia da redação (`AI_ESSAY_MODELS`, Gemini primeiro).

Teste com modelo real (13/11/2026, gemini-3.5-flash-lite, duas rodadas iguais): Bourdieu para "permanência de jovens de baixa renda no ensino médio" → ALTA; Bourdieu para "desmatamento na Amazônia" → BAIXA; parágrafo que cita Bauman e muda de assunto → DECORATIVO; parágrafo que explica Bourdieu e liga à evasão → PRODUTIVO. Antes do ajuste, com o modelo padrão do chat, os dois primeiros casos saíam ALTA/MÉDIA e o terceiro, SUPERFICIAL.

## Caderno de Fórmulas

Rota `/app/caderno-formulas`. Campos: nome, disciplina, assunto, fórmula (texto ou LaTeX), o que cada símbolo significa, quando usar, exemplo resolvido, anotações, favorita e "já sei de cor". Busca com filtros (disciplina, favoritas, "só as que faltam decorar", coleção, origem) e ordenação. Coleções. LuminIA: explicar a fórmula, exercício resolvido no estilo ENEM e dica para memorizar.

## Acervo da plataforma

Itens com `isPlatform = true`, criados pela administração (contas `ADMIN` veem "Publicar no acervo da Lumina" no formulário). Os alunos leem e podem "Salvar no meu caderno", que cria uma cópia (`origin = PLATFORM_COPY`, `platformSourceId`). Salvar de novo devolve a mesma cópia. **Acervo inicial publicado em 13/11/2026:** 23 fórmulas (Matemática, Física e Química) e 15 repertórios com fonte inequívoca (20 desde a especificação v2) (artigos 6º, 196, 205 e 225 da Constituição; ECA, Lei Maria da Penha, LBI, Marco Civil e LGPD com número e ano; Declaração Universal dos Direitos Humanos; Agenda 2030; Bauman, Arendt, Durkheim e Paulo Freire), sem citação literal. Conteúdo em `lumina-backend/src/notebooks/platform-content.ts`; publicar ou atualizar com `npm run build && npm run notebooks:seed-platform` (idempotente; `--dry-run` para conferir).

## Planos

| | Gratuito | Premium |
| --- | --- | --- |
| Itens por caderno | 20 | ilimitado (teto técnico de 2.000) |
| Coleções por caderno | 2 | ilimitadas (teto técnico de 100) |
| LuminIA nos cadernos | conta nas 10 mensagens/dia | conta nas 200 mensagens/dia |

Ao passar do limite, o servidor responde 429 com `code: PLAN_LIMIT` e a tela aponta para "Meu plano".

## API

Para `formulas` e `repertoires`: `GET /` (busca), `GET /summary`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/copy`, `POST /ai`, `GET|POST /collections`, `PATCH|DELETE /collections/:id`, `POST /collections/:id/items`, `DELETE /collections/:id/items/:itemId`.

## Testes

- `lumina-backend/src/notebooks/notebooks.spec.ts` e `notebooks-complete.spec.ts`: validação, limites do plano, acervo, coleções, busca e LuminIA.
- `lumina-app/test/cadernos.check.ts`: seções, campos faltando, texto inserido na redação, sugestão → rascunho, limites e query string.
