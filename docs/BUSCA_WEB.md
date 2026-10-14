# Busca de questões na web (item 10)

Permite pesquisar questões públicas na internet por conteúdo, prova, disciplina,
assunto e dificuldade, identificar a fonte e o link original, classificar a
questão automaticamente e salvá-la no banco interno da Lumina.

## Endpoints

| Método | Rota                     | Descrição                                             |
| ------ | ------------------------ | ----------------------------------------------------- |
| `GET`  | `/search/web`            | Busca questões públicas e devolve metadados + classificação |
| `POST` | `/search/save`           | Salva a questão transcrita no banco interno           |

Ambas exigem autenticação (`Authorization: Bearer <accessToken>`).

### `GET /search/web`

Parâmetros de query:

| Campo        | Tipo                                | Obrigatório | Observações                          |
| ------------ | ----------------------------------- | ----------- | ------------------------------------ |
| `q`          | string                              | sim         | mínimo de 3 caracteres              |
| `exam`       | string                              | não         | ex: `ENEM`, `UECE`                   |
| `subject`    | string                              | não         | ex: `Matemática`                     |
| `topic`      | string                              | não         | ex: `Funções exponenciais`           |
| `difficulty` | `FACIL` \| `MEDIA` \| `DIFICIL`     | não         |                                      |
| `limit`      | number                              | não         | 1–20, padrão 10                      |

Resposta:

```json
{
  "provider": "demo",
  "demoMode": true,
  "query": { "q": "funções exponenciais" },
  "items": [
    {
      "title": "ENEM 2023 — Funções exponenciais",
      "link": "https://exemplo.org/questoes/7",
      "snippet": "Considere f(x)=2^x...",
      "sourceName": "exemplo.org",
      "sourceId": "https://exemplo.org/questoes/7",
      "classification": {
        "subject": "Matemática",
        "topic": "Funções exponenciais",
        "exam": "ENEM",
        "year": 2023,
        "difficulty": "MEDIA"
      }
    }
  ],
  "total": 1
}
```

`provider` e `demoMode` são **sempre** devolvidos: `demoMode: true` significa que
a busca **não saiu da internet** (as chaves do Google CSE não estão
configuradas) e o resultado veio do próprio banco da Lumina. A interface
exibe esse estado ao usuário com um aviso explícito.

### `POST /search/save`

```json
{
  "sourceUrl": "https://exemplo.org/questoes/7",
  "sourceName": "exemplo.org",
  "question": {
    "sourceType": "IMPORTED",
    "subject": "Matemática",
    "topic": "Funções exponenciais",
    "difficulty": "MEDIA",
    "stem": "Considere f(x) = 2^x. O valor de f(3) é igual a:",
    "options": [
      { "text": "8", "correct": true },
      { "text": "6" }
    ],
    "correctOptionIndex": 0
  }
}
```

`sourceUrl` precisa ser uma URL `http`/`https` válida — é ela que vira o
`sourceId` da questão salva. O TLD **não** é exigido: em desenvolvimento o
link do modo demonstração é a URL do próprio app (`http://localhost:5174/...`).
Esquemas diferentes de `http(s)` (`javascript:`, `data:`, `ftp:`) são recusados
com 400, e a interface só transforma o link em alvo de clique quando ele é
seguro — um resultado com outro esquema aparece como texto.

O payload precisa trazer **o conteúdo transcrito** e **exatamente uma
alternativa correta** (`options[i].correct = true`, ou `correctLetter` /
`correctOptionIndex`). Sem gabarito a questão é recusada como inválida — a
Lumina nunca inventa a resposta.

Resposta (`ImportReportDto`):

```json
{ "total": 1, "imported": 1, "duplicates": 0, "invalid": 0, "errors": 0, "details": [] }
```

## Busca sem acento

A busca por conteúdo é insensível a acento **e** a maiúsculas: digitar
`funcoes` encontra `Funções exponenciais`, e digitar `funções` continua
encontrando. Isso vale para a busca web (`GET /search/web`) e para a busca por
palavra-chave do banco de questões (`GET /questions?search=`).

A implementação é uma extensão `unaccent` do PostgreSQL, aplicada aos dois
lados do `ILIKE` — colunas e termo procurado:

- migration `20260926120000_add_unaccent_text_search` cria a extensão;
- `QuestionTextSearchRepository` (`src/questions/question-text-search.repository.ts`)
  resolve, por SQL parametrizado, **quais ids** casam com o termo dentro dos
  workspaces do usuário;
- a listagem segue com `id IN (...)` no Prisma — paginação, ordenação, `total`
  e estatísticas continuam sendo decididos pelo Prisma, sem SQL cru;
- se a extensão não existir no banco (ambiente sem a migration aplicada), o
  serviço registra um aviso e cai no `contains` tradicional, em vez de
  derrubar a busca com erro 500.

Sem índice de propósito: `unaccent(text)` é `STABLE` no PostgreSQL e função
`STABLE` não pode aparecer em expressão de índice sem um wrapper `IMMUTABLE`. A
busca já é restrita aos workspaces do usuário. Se o volume um dia justificar, o
caminho é o wrapper `IMMUTABLE` documentado na própria doc do `unaccent` mais um
índice GIN com `pg_trgm`.

## Interface

`/app/busca-web` (link "Buscar questões na web" no menu do aluno):

- filtros de conteúdo, prova, disciplina e dificuldade; o botão só habilita com
  3 caracteres ou mais;
- cada resultado mostra título, trecho, selos de classificação automática e a
  fonte com o link original; botão **Ver original** abre a página de origem em
  nova aba;
- o aviso de modo demonstração explica que a busca não saiu da internet e como
  configurar as chaves do Google CSE;
- **Salvar** abre o formulário de transcrição: enunciado (pré-preenchido com o
  trecho da busca, para o usuário completar e corrigir), alternativas A–F com
  marcação do gabarito, gabarito comentado e a classificação (disciplina,
  assunto, prova, ano, dificuldade) editável. Nada é gravado enquanto o
  formulário não é enviado — clicar em "Salvar" sozinho não cria nada.

## Ativando a busca real (Google CSE)

Sem configuração, a functionality opera em **modo demonstração**. Para buscar
na web de verdade:

1. Crie um [Programmable Search Engine](https://programmablesearchengine.google.com/)
   e anote o **Search engine ID** (o `cx`).
2. Habilite a API "Custom Search JSON API" no Google Cloud e crie uma **API key**.
3. Adicione as duas chaves no `.env` do backend:

   ```env
   GOOGLE_CSE_ID=seu-search-engine-id
   GOOGLE_CSE_API_KEY=sua-api-key
   ```

4. Reinicie o backend.

Nenhuma mudança de código é necessária. Com as duas chaves presentes, o
`SearchService` passa a usar o `GoogleCseSearchProvider` automaticamente e o
response passa a trazer `"provider": "google-cse"` com `demoMode: false`.

Para voltar ao modo demonstração, basta remover as chaves do `.env`.

## Direitos autorais

A Lumina trata a busca como um **catálogo de referências**, não como um
mirror de conteúdo de terceiros:

- **Guardamos apenas metadados públicos**: título, link, trecho retornado pelo
  buscador e a identificação da fonte (`sourceName`, `sourceId`).
- **Nunca baixamos nem armazenamos** o texto integral de páginas de terceiros.
  O conteúdo que vai para o banco é **transcrito pelo usuário**, que é
  responsável por respeitar os termos de uso da fonte original.
- Toda questão salva por esse caminho entra como `sourceType = IMPORTED`, com o
  **link da fonte original preservado** em `sourceId` e o nome do site em
  `sourceName`. A atribuição é sobrescrita pelo servidor a partir do resultado
  da busca — um cliente não consegue atribuir a questão a outra fonte.
- A deduplicação usa o mesmo pipeline de importação já existente no banco de
  questões, evitando cópias do mesmo conteúdo.

O usuário é encorajado (e a interface o deixa explícito) a conferir o
enunciado e as alternativas no site de origem antes de salvar.
