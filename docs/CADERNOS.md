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

## Caderno de Fórmulas

Rota `/app/caderno-formulas`. Campos: nome, disciplina, assunto, fórmula (texto ou LaTeX), o que cada símbolo significa, quando usar, exemplo resolvido, anotações, favorita e "já sei de cor". Busca com filtros (disciplina, favoritas, "só as que faltam decorar", coleção, origem) e ordenação. Coleções. LuminIA: explicar a fórmula, exercício resolvido no estilo ENEM e dica para memorizar.

## Acervo da plataforma

Itens com `isPlatform = true`, criados pela administração (contas `ADMIN` veem "Publicar no acervo da Lumina" no formulário). Os alunos leem e podem "Salvar no meu caderno", que cria uma cópia (`origin = PLATFORM_COPY`, `platformSourceId`). Salvar de novo devolve a mesma cópia. O acervo começa vazio: o conteúdo precisa ser curado e conferido antes de publicar.

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
