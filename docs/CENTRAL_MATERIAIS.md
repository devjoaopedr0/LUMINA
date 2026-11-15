# Central de materiais (itens 48, 49 e 50)

> **Status: Implementado (15/11/2026).** Migration `20261115160000_materials` (só adições), aplicada. Fase 3 do roadmap.

Rota `/app/materiais` (atalho "Materiais da turma" no painel).

## Item 48: central de materiais

| Ponto | Como ficou |
|---|---|
| Tipos | PDF, slides, apostila e lista de exercícios (arquivo em **PDF**, até **15 MB** e 300 páginas), link e vídeo (endereço http/https) |
| Organização | por **turma** (sem turma = "Minha biblioteca", só o professor vê), por **matéria** e por assunto (`topicId`, na API) |
| Quem envia | só professor (`TeacherProfile`), e só nas turmas em que leciona (403) |
| Quem vê | o dono e os alunos e professores da turma do material; para os demais, o material não existe (404) |
| Quem exclui | o dono ou um professor da turma |
| Armazenamento | o PDF fica no banco (`materials.file`), como os PDFs de provas; download por `GET /materials/:id/file` com `Cache-Control: no-store` |

Slides e apostilas precisam ser exportados em PDF: o texto é o que alimenta a busca e a LuminIA. PDF digitalizado (imagem, sem texto selecionável) é aceito, abre normalmente e aparece marcado: não entra na busca nem na LuminIA.

## Item 50: busca nos materiais

`GET /materials/search?q=&classId=`: o texto de cada página (extraído com `pdfjs-dist` no envio, tabela `material_pages`) é comparado com a consulta sem diferenciar acentos e maiúsculas, ignorando palavras vazias ("onde o professor explicou…" vira os termos do assunto). Cada página recebe pontos pelos termos encontrados (termo mais raro vale mais). O resultado mostra **material, página e um trecho em volta do termo**; o clique abre o PDF na página (`#page=N`). Títulos e descrições também entram, para achar links e vídeos.

## Item 49: LuminIA sobre os materiais

- **Perguntar:** `POST /materials/ask` pega as 4 páginas mais relevantes dos materiais visíveis (ou de um material, ou de uma página, para "explicar este trecho") e pede à LuminIA uma resposta **só com base nesses trechos**, citando "Título, p. N". As citações são conferidas: só ficam as que apontam para trechos enviados; sem citação válida, a resposta vai como "não encontrado". Sem nenhum trecho relevante, a resposta é "não encontrei esse assunto nos materiais", sem chamar a IA.
- **Gerar questões:** `POST /materials/:id/questions` (dono ou professor da turma) gera de 1 a 5 questões no estilo ENEM só com o conteúdo do material (páginas escolhidas ou o material inteiro). Elas voltam como **rascunho**: a tela mostra a correta e a explicação, e o professor salva cada uma no próprio banco de questões depois de revisar. A validação descarta questão com menos de 4 alternativas, alternativas repetidas ou índice de correta inválido.
- Cada pergunta ou geração gasta **uma mensagem da LuminIA** do plano (`LUMINIA_MESSAGE`). Modelos: `AI_NOTEBOOK_MODELS`, senão `AI_ESSAY_MODELS`.

## Validado em 15/11/2026

Com a Matriz de Referência do ENEM (PDF oficial do Inep, 24 páginas) enviada pelo professor de teste para a turma "3º ano A":
- o texto das 24 páginas foi extraído em cerca de 3 s;
- o aluno da turma buscou "probabilidade e estatística" e o resultado apontou a página 7;
- o aluno perguntou à LuminIA "Onde o material fala de probabilidade e estatística?" e ela respondeu citando as páginas 7 e 16;
- a geração de 2 questões a partir da página 7 voltou em 4,6 s com respostas apoiadas no texto (`gemini-3.5-flash-lite`);
- uma conta fora da turma recebeu 404 ao pedir o arquivo.

## Limites

- Busca por palavras (sem embeddings): sinônimos que não aparecem no texto não são achados. A LuminIA recebe só as páginas encontradas.
- PDF digitalizado precisaria de OCR para entrar na busca.
- Organização por assunto existe na API (`topicId`), mas o formulário ainda não oferece a escolha do assunto.
