# Meta de nota pela nota de corte do Sisu

O aluno informa no perfil o **curso desejado**, a **universidade-alvo** e a
**modalidade de concorrência**. A Lumina mostra a nota de corte do Sisu
projetada para a próxima edição, pela tendência das três últimas — a média
do ENEM que ele precisa alcançar.

## A escala do ENEM

- A redação vale de 0 a 1000.
- As quatro provas objetivas usam TRI e não têm teto fixo; na prática ficam
  abaixo de 1000 (em 2024 as máximas foram 962 em Matemática, 867 em
  Natureza, 820 em Humanas e 796 em Linguagens).
- A nota que o Sisu usa é a **média** das cinco, com os pesos que cada curso
  define. Por isso a nota de corte nunca passa de 1000 — um objetivo como
  "1400 pontos" não existe nessa escala.

## De onde vêm os dados

Dos relatórios "Inscrições e notas de corte" que o MEC publica por edição em
sisu.mec.gov.br (aba Relatório). Não há API oficial: a API interna do site
só serve a edição corrente, mudou de endereço três vezes entre 2020 e 2025 e
recusa acesso externo.

As planilhas de 2023-1, 2024 e 2025 foram obtidas do espelho público
`github.com/maiakanegae/sisu-data` (o portal de dados abertos do MEC recusou
o download direto). Vale conferir com a fonte oficial ao atualizar.

## Atualizar com uma edição nova

A partir de `lumina-backend/`:

```bash
python scripts/sisu_xlsx_to_csv.py sisu-2024.xlsx sisu-2025.xlsx sisu-2026.xlsx
```

```bash
npx tsx src/prisma/import-sisu-cutoffs.cli.ts
```

O primeiro comando regrava `prisma/seed-data/sisu-cutoffs.csv.gz` (passe
sempre as três edições que devem ficar no arquivo). O segundo apaga e
regrava no banco as edições presentes no arquivo; o seed faz o mesmo.

## Como funciona

- `sisu_cutoffs`: uma linha por curso ofertado (curso + campus + turno) e
  ano, com a nota de cada modalidade em coluna — ampla concorrência e as oito
  da Lei de Cotas (LB = renda até o limite da lei, LI = qualquer renda; PPI,
  quilombolas, PCD e demais egressos de escola pública). Ações afirmativas
  próprias de cada universidade e bônus ficam de fora.
- `GET /cutoffs/target`: casa o texto livre do perfil com os dados (sem
  acento nem caixa; universidade por sigla ou nome) e devolve, por
  campus/turno, a nota de cada edição, a média, a tendência e a projeção. A
  meta é a maior projeção entre eles.
- **A meta acompanha a prova.** A nota de corte sobe e desce de uma edição
  para outra com a dificuldade da prova e a concorrência. Em vez de uma
  média parada, a meta segue a reta que melhor passa pelas edições conhecidas
  (mínimos quadrados) até a edição seguinte: nota subindo puxa a meta para
  cima, nota caindo puxa para baixo. A projeção nunca se afasta mais de 30
  pontos da última edição (com três pontos, um ano fora da curva não pode
  levar a meta junto) e, com uma edição só, é a própria nota. Importar uma
  edição nova recalcula tudo sozinho.
- Quando não encontra, a resposta diz por quê: cadastro incompleto, curso
  não encontrado, universidade não encontrada (com sugestões de siglas) ou
  curso sem vaga naquela modalidade.
- A meta aparece no perfil, no topo do cronograma e na etapa "Objetivo" da
  criação do cronograma, e entra no contexto da LuminIA.

## Limites

- Só cobre cursos que entram pelo Sisu. Universidades com vestibular próprio
  (USP, Unicamp e outras) não aparecem ou aparecem só com as vagas do Sisu.
- A nota de corte muda a cada edição: é referência, não garantia.
- Os pesos por área de cada curso não estão nas planilhas; a meta é uma
  média geral, sem dizer qual prova pesa mais.
