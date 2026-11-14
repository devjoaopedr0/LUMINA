# Scanner de questões (item 18)

> **Status: Implementado (13/11/2026).** A leitura simulada (que devolvia sempre a mesma questão sobre f(x) = 2^x, com confiança sorteada) foi substituída por OCR real com modelo de visão. Validado ponta a ponta com o banco ativo e a IA real.

Rota no app: `/app/question-scanner`.

## Fluxo

1. O aluno escolhe uma foto ou print da questão (JPEG, PNG ou WebP; até 20 MB). PDF não: o modelo de visão lê imagem, então o caminho é um print da questão.
2. O app reduz a imagem no aparelho para no máximo 1.800 px no lado maior, em JPEG (`lumina-app/src/lib/question-scan-image.ts`), e envia as dimensões reais.
3. `POST /simulations/question-scans/upload/:id/complete` confere o dono e o estado do envio, valida a imagem pelos bytes (JPEG, PNG ou WebP, até 3 MB) e faz a leitura. A resposta já traz o resultado, sem o app precisar consultar de novo.
4. O aluno confere o texto com a foto, corrige o que for preciso, marca a alternativa correta e salva no banco de questões ou no caderno de erros.

## Leitura (`lumina-backend/src/simulations/question-ocr.ts`)

O modelo de visão (cadeia `AI_VISION_MODELS`, a mesma que lê as redações) transcreve:
- o enunciado e as alternativas **como estão**, sem resolver, sem corrigir e sem completar. O que não dá para ler vira `[ilegível]`;
- a disciplina (lista fixa), o assunto e a dificuldade;
- se há figura, gráfico ou tabela. A descrição entra no enunciado como `[Figura: ...]`, copiando só os valores legíveis, e gera um aviso.

O servidor ainda:
- tira o cabeçalho da prova ("QUESTÃO 97") do enunciado;
- descarta alternativas repetidas ou com letra fora de A–E;
- baixa a confiança a cada trecho ilegível e a cada alternativa faltando, e avisa quando ela fica abaixo de 70%;
- **não gera explicação por alternativa.** A leitura não sabe qual é a correta; quem marca é o aluno. A ajuda da LuminIA fica na resolução da questão já salva.

Sem IA configurada, a leitura falha com uma mensagem clara, em vez de inventar uma questão. Foto sem questão legível também falha, com o motivo, para o aluno tentar outra foto.

## Segurança e plano

- Só o dono conclui o próprio envio, e só uma vez. Reenviar o mesmo envio responde 409. Antes, qualquer usuário autenticado podia concluir o envio de outro.
- Limite de corpo próprio para a rota (5 MB); o resto da API continua com 100 kB.
- Cada leitura gasta 1 mensagem da LuminIA do plano (Gratuito: 10/dia). Se a leitura falhar, a mensagem volta.

## Validação real (13/11/2026)

| Imagem de teste | Resultado |
| --- | --- |
| Questão de Física só com texto | Enunciado e 5 alternativas exatos, Física / Velocidade média / Fácil, em 7 s |
| Questão com gráfico de colunas sem números no eixo | Enunciado e alternativas exatos; gráfico detectado e descrito sem inventar valores; aviso de figura |
| Reenvio do mesmo envio | 409, sem nova chamada à IA |

Ainda falta testar com fotos de celular de provas impressas, com sombra, inclinação e papel curvo.

## Testes

- `lumina-backend/src/simulations/question-ocr.spec.ts`: leitura, figura, ilegíveis, cabeçalho, letras inválidas, disciplina, dono do envio, reenvio, imagem falsa e falta de IA.
- `lumina-app/test/scanner-questoes.check.ts`: redução da imagem e tamanho da data URL.
