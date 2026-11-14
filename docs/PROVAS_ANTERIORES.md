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

## PDF embutido e importação em lote (13/11/2026)

### Importação em lote dos cadernos do INEP
- Na página, a administração vê o painel **Importar cadernos do ENEM**: uma linha por caderno, `ano; dia; URL da prova; URL do gabarito` (só PDFs de `https://download.inep.gov.br/`).
- Para cada caderno, `POST /exam-papers/import/enem`:
  1. importa as questões no banco central, pelo mesmo pipeline do importador do ENEM (sem duplicar as que já existem);
  2. cria ou atualiza a prova no acervo, com o PDF, o gabarito oficial, o total de páginas, o dia e a cor do caderno lida do gabarito. A edição fica, por exemplo, `D2-AZUL`;
  3. refaz o vínculo questão → página (a página onde cada questão começa no PDF).
- Um caderno que falha não interrompe os outros; o relatório diz o resultado de cada um.
- Quem importa: a administração da plataforma (`ADMIN`) ou quem tem o cargo de gestor do banco de questões. As duas coisas são separadas no app: o admin não recebe o cargo do banco automaticamente, e o "admin" do seed (`admin@lumina.app`) é um aluno com esse cargo. O painel na tela aparece só para `ADMIN`.
- Migration `20261113120000_exam_paper_edition`: a prova passa a ser única por `(prova, ano, edição)`, para caber os dois dias do ENEM no mesmo ano.

### Visualizador de PDF embutido
- "Ver a prova aqui" abre o PDF dentro da página, com Anterior/Próxima e campo de página (`de 32`).
- Na lista de questões, "pág. N" abre o visualizador direto na página da questão.
- O PDF vem do backend (`GET /exam-papers/:id/pdf`): o navegador não baixa direto do INEP (sem CORS e com cadeia de certificados incompleta). O backend busca uma vez, guarda em `.cache/exam-pdfs/` e serve daí. Exige login, só prova publicada (rascunho só para admin), só PDF do INEP, e `Cache-Control: no-store` para o navegador não guardar a resposta.
- O link "PDF oficial do INEP" continua disponível.

### Resolver a questão a partir da prova
- Cada questão da lista tem o botão **Resolver**, que abre `/app/questoes?questionId=…`. O banco de questões mostra essa questão destacada no topo, com a resolução, as dicas e a LuminIA.
- A comparação entre edições agora vale entre anos diferentes do mesmo vestibular (o ENEM tem um registro de prova por ano; a regra passou a ser o nome).

### Validação real (13/11/2026)
- Importação do ENEM 2024, 2º dia (caderno 7): 52 s; edição `D2-AZUL`; 32 páginas; 71 questões já existiam, 4 novas, 15 puladas por depender de imagem; **79 questões ligadas às páginas**.
- PDF pelo backend: 5,2 MB; 11 s na primeira vez e 1,7 s pelo cache. Sem login, 401.
- Na tela, "pág. 16" da Questão 136 abriu o visualizador na página 16 de 32, e o "Resolver" aponta para a questão no banco.
- **Não conferido na tela:** a questão destacada no topo do banco ao abrir pelo "Resolver" (a sessão do navegador caiu durante o teste).

## Limites atuais

- Só o ENEM (INEP) é importado em lote; outras bancas exigem mapear o formato do PDF e avaliar os direitos de reprodução.
- As 15 questões com figura ficam fora do banco (o importador não extrai imagens), mas continuam visíveis no PDF.
- A comparação automática entre edições continua medindo só questões repetidas.
