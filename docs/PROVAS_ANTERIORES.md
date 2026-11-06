# Provas anteriores (item 19)

Acervo de provas por vestibular e ano, com páginas, questões mapeadas,
comparação entre edições e atalhos de estudo. Esta nota cobre a **navegação
por páginas** entregue em 05/11/2026.

## Fluxo

1. **Lista** (`/app/provas-anteriores`): mostra as provas publicadas, o status,
   os anexos disponíveis (PDF, gabarito, caderno) e o botão para abrir.
2. **Prova**: exibe as páginas em miniatura, a lista de questões mapeadas e a
   comparação com outra edição do mesmo vestibular.
3. **Página**: mostra a imagem em tamanho de leitura, a posição (`2 de 4`),
   os botões **Anterior** / **Próxima** e as questões mapeadas naquela página.
   O texto extraído, quando existe, continua disponível em “Ver texto extraído
   da página”.

Na lista de questões, o número da página (`pág. 3`) é um atalho: abre
diretamente a página correspondente. Quando a questão aponta para uma página
que não está no acervo, o texto fica simples e não vira link.

## Regra de navegação

A ordem vem das páginas devolvidas pelo backend (`pageNumber` crescente). As
funções de apoio ficam em `src/lib/exam-paper-navigation.ts` e são puras:

- `pageByNumber`: encontra a página pelo número;
- `adjacentPage`: devolve a anterior/próxima, ou `null` nos limites;
- `pagePosition`: devolve a posição legível em base 1;
- `questionsOnPage`: filtra as questões da página preservando a ordem.

Elas existem para que a navegação não dependa do estado do componente e para
que os limites (primeira/última página, página inexistente, prova sem
questões) sejam testáveis sem navegador.

## Arquivos

- Página: `lumina-app/src/pages/PastExams.tsx`
- Navegação pura: `lumina-app/src/lib/exam-paper-navigation.ts`
- Check: `lumina-app/test/provas-anteriores.check.ts` (incluído em `npm test`)
- Tipos da API: `ExamPaper`, `ExamPaperPage` e `ExamPaperQuestion` em
  `lumina-app/src/lib/api.ts`
- Backend: `GET /exam-papers`, `GET /exam-papers/:id/pages` e
  `GET /exam-papers/:id/questions` em `question-catalog.controller.ts`

## Limites atuais

- O botão **Abrir PDF** só aparece quando `ExamPaper.pdfUrl` existe. O acervo
  de demonstração usa páginas em SVG e não tem PDF anexado.
- O PDF ainda abre em outra aba; não há visualizador embutido.
- Ainda não há importação em lote de PDFs oficiais nem geração automática das
  comparações entre edições.
- O mapeamento questão → página é exibido, mas não leva ao banco de questões:
  o DTO de `ExamPaperQuestion` não expõe o `questionId` da questão vinculada.
