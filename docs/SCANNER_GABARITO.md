# Scanner de cartão-resposta (leitura óptica real)

O aluno ou o professor imprime o cartão-resposta da Lumina e o aluno marca com caneta. Quem tem permissão fotografa os cartões, e **cada foto vira uma página de um PDF**. O servidor lê as marcações do PDF (OMR determinístico, sem IA). Depois, **o corretor confere a folha e pode ajustar qualquer bolha**, inclusive uma pintada que a leitura não pegou. Só então a nota é lançada no simulado, pelo mesmo caminho do envio online.

Rotas:
- `/app/gabarito-scanner`: leitura, revisão e histórico.
- `/app/gabarito-scanner/imprimir/:simulationId`: cartões para imprimir (também com link na página do simulado).

## Cartão (layout v2, `lumina-backend/src/simulations/omr/sheet-layout.ts`)

Definido em milímetros numa A4 retrato. O mesmo layout serve para desenhar (app, SVG em mm) e para ler (servidor).

- **4 quadrados pretos** de 10 mm nos cantos: usados no alinhamento.
- **Faixa de 24 quadrados** com o código da folha (20 bits de dados + 4 de verificação). Identifica o simulado e, na folha personalizada, o aluno. Quando o professor escaneia a folha de qualquer aluno, a nota vai para esse aluno. Folha de cabeça para baixo ou deitada é reconhecida testando as 4 rotações até o código conferir.
- **Bolhas A–E**, uma linha por questão, em até 4 colunas (de 1 a 180 questões; 90 questões ficam em 3 colunas de 30).
- Na impressão, o professor recebe uma folha personalizada por aluno da turma, mais uma genérica; o aluno recebe a dele.

## Foto → PDF (`lumina-app/src/lib/pdf-writer.ts`, `omr/pdf.ts`)

- Cada foto passa pela mesma digitalização da redação (acha a folha, corrige a perspectiva, uniformiza a luz) e vira uma página A4, em tons de cinza, de 1.100 px de largura.
- O app monta o PDF no próprio navegador, sem dependência. Cada página é uma imagem `DeviceGray` comprimida com FlateDecode (`CompressionStream`), o formato de imagem padrão do PDF: abre em qualquer leitor e é lido no servidor com o zlib do Node, sem biblioteca de JPEG.
- **Várias folhas num PDF só** (até 60). Como o código de cada folha diz o simulado e o aluno, o professor fotografa a turma inteira e manda de uma vez. Uma página com problema (sem marcadores, de outro simulado, sem permissão) aparece com o erro e não derruba as outras.
- O PDF fica guardado (`answer_sheet_batches`). Quem enviou pode baixá-lo; também dá para baixá-lo antes de enviar.
- Dá para mandar um **PDF pronto** gerado pelo scanner da Lumina. PDFs de apps de terceiros que guardam a foto em JPEG são recusados com explicação.

## Leitura (`omr/omr.ts`)

1. O servidor extrai a imagem de cada página do PDF e guarda um PNG dela para a conferência.
2. O servidor acha os 4 quadrados pretos (em cada canto, a mancha escura mais "quadrado cheio" do tamanho esperado) e calcula a homografia folha (mm) → imagem. Isso corrige o erro que o recorte do aparelho deixou.
3. Cada bolha é amostrada no espaço da folha. O preenchimento é (papel − interior) / papel:
   - o interior usa 65% do raio, então o contorno impresso fica de fora;
   - o "papel" é medido num anel em volta da bolha.
4. **Limiar por folha** (Otsu sobre todos os preenchimentos, entre 0,30 e 0,50), que se adapta a caneta azul clara ou papel acinzentado.
5. **Decisão por questão**, pela regra do Enem (branco ou mais de uma marcação conta como erro):
   - `OK`: marca nítida, com as demais bem abaixo.
   - `BLANK`: nenhuma marca.
   - `MULTIPLE`: duas marcas fortes.
   - `AMBIGUOUS`: marca fraca (lápis) ou segunda marca fraca (rasura).
   - `BLANK` e `MULTIPLE` nítidos contam como erro sem revisão. `AMBIGUOUS`, ou qualquer confiança abaixo de 0,75, precisa de decisão na conferência.
6. Para cada bolha, a leitura devolve o centro e o raio na imagem: a conferência desenha os círculos exatamente sobre a foto.

## Conferência do corretor (`components/answer-sheets/AnswerSheetConference.tsx`)

- **Nenhuma nota é lançada sem confirmação.** A folha aparece com uma marcação colorida em cada bolha:
  - verde: o que a leitura achou;
  - azul: o que o corretor ajustou;
  - amarelo: duvidosa.
- **Qualquer questão pode ser ajustada:** tocar numa bolha marca aquela alternativa, e tocar de novo deixa em branco. Isso cobre a bolha pintada que a leitura não identificou, assim como uma leitura errada. As duvidosas precisam ser decididas: tocar na certa ou "Manter" o que a leitura achou.
- **"Lançar as sem pendências"** lança de uma vez as folhas do PDF sem nenhuma duvidosa e informa quantas ainda precisam de conferência.
- **Correção depois de lançada:** o corretor ajusta e salva. Respostas e acertos são refeitos no simulado e no cartão.
- **Domínio por tópico só no lançamento final.** Lançar e corrigir a nota não mexem no domínio por tópico do aluno. Ele é aplicado uma única vez, com as respostas definitivas, quando o corretor clica em **"Finalizar correção"** (ou "Finalizar as lançadas", para o PDF inteiro). A finalização trava a folha: ajustes depois disso são recusados, e finalizar de novo não conta duas vezes (a marcação e o domínio vão na mesma transação). Assim, notas intermediárias não deixam rastro no cronograma nem na nota estimada. O envio online do simulado continua aplicando o domínio na hora.
- As questões que o corretor mudou em relação à leitura ficam registradas (`adjusted_json`), e o revisor também (`reviewed_by`).

Medido em folhas sintéticas (testes):

| Situação | Preenchimento medido |
| --- | --- |
| Bolha vazia com a letra impressa | ~0,09 |
| Caneta cheia | ~0,88 |
| Caneta clara | 0,56 (lida com segurança) |
| Lápis fraco | 0,29 (vai para revisão) |
| Rasura | 0,38 (vai para revisão) |

## Fluxo e permissões (`omr/answer-sheet-scan.service.ts`, rota `/answer-sheets`)

| Método | Rota | |
| --- | --- | --- |
| POST | `/answer-sheets/simulations/:id/sheets` | Folhas para imprimir (`studentIds` opcional, só para professor). |
| POST | `/answer-sheets/scan` | `{ pdf: dataURL, simulationId? }` → uma leitura por página, todas em conferência. |
| GET | `/answer-sheets/scans` / `:id` / `:id/image` | Histórico, resultado (com a posição de cada bolha) e PNG da página. |
| POST | `/answer-sheets/scans/:id/review` | Ajustes do corretor (qualquer questão) → lança a nota, ou corrige se já lançada. |
| POST | `/answer-sheets/batches/:id/confirm` | Lança as folhas do PDF sem duvidosas. |
| POST | `/answer-sheets/scans/:id/finalize` | Lançamento final: aplica o domínio por tópico e trava a folha. |
| POST | `/answer-sheets/batches/:id/finalize` | Finaliza as folhas do PDF com nota lançada. |
| GET | `/answer-sheets/batches/:id/pdf` | Baixa o PDF enviado (só quem enviou). |

Regras de permissão:

- O código vem da própria folha. O `simulationId` enviado pelo cliente só serve para conferir (e de reserva quando o código está ilegível; nesse caso a folha é atribuída a quem escaneou).
- A folha de outro aluno só pode ser escaneada pelo autor ou por um professor da turma. O aluno da folha precisa ser da turma.
- Leitura, imagem e revisão: só o aluno da folha, quem escaneou ou a equipe do simulado. Os demais recebem 404, sem revelar que a leitura existe.
- A nota passa por `SimulationsService.submit` com branco permitido: atualiza o domínio por tópico como o envio online. Se o aluno já tinha enviado, o resultado anterior é mantido e a leitura avisa.

Esta mudança **removeu** os endpoints antigos `/simulations/answer-sheets/*`. Eles eram simulados (respostas aleatórias) e tinham falhas de permissão:
- leitura e revisão de leituras de outros alunos;
- listagem de todos os templates;
- exclusão de qualquer template.

Migrations (só adições):
- `20261031220000_answer_sheet_omr`: imagem da página, código, quem escaneou, detalhes por questão, limiar e `answer_sheet_codes`.
- `20261031230000_answer_sheet_pdf`: `answer_sheet_batches`, mais o PDF e a página de cada leitura.
- `20261031231000_answer_sheet_adjusted`: questões ajustadas pelo corretor.
- `20261031233000_answer_sheet_finalize`: `finalized_at` no lançamento do cartão. As folhas lançadas antes dela ficam como finalizadas, porque o fluxo antigo já aplicava o domínio no lançamento.

## Teste ponta a ponta (31/10/2026)

No app e no banco reais:
1. Criei um simulado de 12 questões e gerei o cartão na página de impressão.
2. Desenhei o cartão preenchido a caneta, com um branco, uma dupla marcação e um lápis fraco.
3. "Fotografei" em perspectiva, com sombra e ruído, e enviei no scanner.

Resultado:
- o código identificou o simulado e o aluno;
- as 9 respostas nítidas foram lidas certas;
- o branco e a dupla marcação foram identificados;
- só o lápis foi para revisão, com o recorte da linha certa;
- a nota (1/12) conferiu com o gabarito oficial.

Também verificado:
- reescanear mantém o resultado anterior e avisa;
- outra conta recebe 404 na leitura, na imagem, na revisão e no simulado.

**PDF e conferência (31/10/2026):**
1. Duas fotos de cartões de simulados diferentes foram montadas em um PDF de 2 páginas no navegador.
2. Cada página identificou o próprio simulado pelo código, e nenhuma nota foi lançada antes da conferência.
3. Na página 1, o corretor manteve a duvidosa (Q6) e ajustou uma questão que não era duvidosa (Q12): nota 10/12.
4. Em seguida, corrigiu a Q1 depois de lançada: a nota do simulado foi para 9/12, conferindo com o gabarito oficial, e o registro guardou as ajustadas (Q1 e Q12).

Também verificado:
- "Lançar as sem pendências" não lançou a página 2 (ela tinha uma duvidosa);
- o PDF baixado tem as 2 páginas e abre no pdf.js;
- outra conta recebe 404 ao baixar o PDF.

## Limites conhecidos

- Validado com folhas e fotos sintéticas. Ainda falta imprimir numa impressora de verdade, preencher à mão e testar em 2–3 celulares diferentes.
- O cartão precisa sair em **tamanho real (100%)**. "Ajustar à página" muda a escala, não a proporção; a homografia absorve isso, mas uma margem pequena demais pode cortar os marcadores dos cantos.
- Cartões de outros formatos (Enem oficial, outros vestibulares) não são lidos: a leitura depende dos marcadores e do código da Lumina.

**Domínio por tópico no lançamento final (31/10/2026), contra o banco real:**

| Etapa | Nota | Domínio (tentativas / acertos) |
| --- | --- | --- |
| Antes | — | 30 / 17 |
| Lançada | 5/6 | 30 / 17 (sem mudança) |
| Corrigida (Q2 → A) | 6/6 | 30 / 17 (sem mudança) |
| Finalizada | 6/6 | 36 / 23 (+6 / +6, só as respostas finais) |
| Finalizar de novo | — | 36 / 23 (não conta duas vezes) |
| Ajuste após finalizar | — | recusado (409) |
