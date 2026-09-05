# Importação de questões

Administradores do banco central podem importar arquivos `.json` e `.csv` pela tela **Banco de questões → Importar arquivo**. Cada lote passa por normalização, validação de gabarito e deduplicação antes da gravação.

## JSON

O arquivo pode ser uma lista de questões ou um objeto `{ "questions": [...] }`. Campos em português (`disciplina`, `assunto`, `enunciado`, `alternativas`, `resposta`, `fonte`) e em inglês são aceitos. Alternativas podem ser textos ou objetos com `text` e `correct`.

## CSV

Use cabeçalhos como `disciplina`, `assunto`, `enunciado`, `A`, `B`, `C`, `D`, `E`, `resposta`, `fonte`, `prova`, `ano` e `dificuldade`. Vírgula e ponto e vírgula são aceitos como delimitadores; campos entre aspas podem conter o delimitador.

## Segurança editorial

- O banco central só aceita importações de usuários com a permissão `QUESTION_MANAGE`.
- É obrigatório indicar exatamente uma resposta correta.
- Questões repetidas são identificadas pelo ID da fonte e pelo hash do conteúdo.
- O relatório informa quantas questões foram importadas, duplicadas, inválidas ou falharam.
- Só importe conteúdo oficial, autoral ou com licença de uso compatível.
