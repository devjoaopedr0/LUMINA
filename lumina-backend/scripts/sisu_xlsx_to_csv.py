"""Converte as planilhas "Inscrições e notas de corte" do Sisu no CSV que o
backend importa (prisma/seed-data/sisu-cutoffs.csv.gz).

As planilhas são as que o MEC publica por edição em sisu.mec.gov.br (aba
Relatório). Uso, a partir de lumina-backend/:

    python scripts/sisu_xlsx_to_csv.py sisu-2023-1.xlsx sisu-2024.xlsx sisu-2025.xlsx

Só usa a biblioteca padrão (um .xlsx é um zip de XML). Sai UMA linha por
curso ofertado e ano, com a nota de corte de cada modalidade em colunas:
ampla concorrência (AC) e as oito combinações da Lei de Cotas — renda (LB =
até o limite de renda, LI = independente de renda) x grupo (PPI, Q, PCD, EP).
Ações afirmativas próprias de cada universidade (V) e bônus (B) ficam de
fora: não são comparáveis entre instituições.
"""
import csv
import gzip
import io
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
MODALITIES = ['AC', 'LB_PPI', 'LB_Q', 'LB_PCD', 'LB_EP', 'LI_PPI', 'LI_Q', 'LI_PCD', 'LI_EP']
OUTPUT = Path(__file__).resolve().parent.parent / 'prisma' / 'seed-data' / 'sisu-cutoffs.csv.gz'
FIELDS = [
    'year', 'courseCode', 'institutionCode', 'institutionName', 'institutionAcronym',
    'campus', 'city', 'state', 'courseName', 'degree', 'shift', *MODALITIES,
]


def column_index(ref):
    index = 0
    for char in ref:
        if not char.isalpha():
            break
        index = index * 26 + (ord(char) - 64)
    return index - 1


def read_rows(path):
    """Linhas da aba de dados (a segunda) como dicionários {coluna: texto}."""
    archive = zipfile.ZipFile(path)
    shared = []
    for _, element in ET.iterparse(archive.open('xl/sharedStrings.xml')):
        if element.tag == M + 'si':
            shared.append(''.join(t.text or '' for t in element.iter(M + 't')))
            element.clear()
    header = None
    for _, element in ET.iterparse(archive.open('xl/worksheets/sheet2.xml')):
        if element.tag != M + 'row':
            continue
        cells = {}
        for cell in element.findall(M + 'c'):
            value = cell.find(M + 'v')
            if value is None:
                continue
            text = shared[int(value.text)] if cell.get('t') == 's' else value.text
            cells[column_index(cell.get('r'))] = (text or '').strip()
        element.clear()
        if header is None:
            header = cells
            continue
        yield {name: cells.get(index, '') for index, name in header.items()}


def modality_of(row):
    """Modalidade padronizada da linha, ou None quando ela não entra."""
    kind = row.get('TP_MOD_CONCORRENCIA', '')
    if kind == 'A':
        return 'AC'
    if kind != 'L':
        return None
    code = row.get('TIPO_CONCORRENCIA', '')
    description = row.get('DS_MOD_CONCORRENCIA', '').lower()
    if code:
        # 2024 em diante: o próprio relatório traz o código (LB_PPI, LI_Q...).
        income, _, group = code.partition('_')
        if income not in ('LB', 'LI'):
            return None
    else:
        # Até 2023 só vinha a descrição por extenso.
        income = 'LI' if 'independentemente da renda' in description else 'LB'
        group = ''
    if group == 'PCD' or 'defici' in description:
        return f'{income}_PCD'
    if group == 'Q' or 'quilombola' in description:
        return f'{income}_Q'
    # Algumas universidades separam pretos/pardos de indígenas (PP, I): todos
    # caem em PPI, e entre eles vale a maior nota.
    if group in ('PPI', 'PP', 'I') or any(word in description for word in ('pretos', 'pardos', 'indígenas')):
        return f'{income}_PPI'
    return f'{income}_EP'


def main(paths):
    offers = {}
    for path in paths:
        kept = 0
        for row in read_rows(path):
            modality = modality_of(row)
            score_text = row.get('NU_NOTACORTE', '')
            if not modality or not score_text:
                continue
            score = round(float(score_text), 2)
            if score <= 0:
                continue
            year = int(row.get('EDICAO') or row.get('NU_ANO'))
            key = (year, int(row['CO_IES_CURSO']))
            offer = offers.setdefault(key, {
                'year': year,
                'courseCode': key[1],
                'institutionCode': int(row['CO_IES']),
                'institutionName': row['NO_IES'],
                'institutionAcronym': row['SG_IES'],
                'campus': row['NO_CAMPUS'],
                'city': row['NO_MUNICIPIO_CAMPUS'],
                'state': row['SG_UF_CAMPUS'],
                'courseName': row['NO_CURSO'],
                'degree': row['DS_GRAU'],
                'shift': row['DS_TURNO'],
            })
            offer[modality] = max(score, offer.get(modality, 0))
            kept += 1
        print(f'{Path(path).name}: {kept} notas de corte aproveitadas')

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator='\n')
    writer.writeheader()
    for key in sorted(offers):
        writer.writerow(offers[key])
    # mtime fixo: o mesmo conteúdo gera o mesmo arquivo, sem diff à toa.
    with open(OUTPUT, 'wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as gz:
            gz.write(buffer.getvalue().encode('utf-8'))
    print(f'{len(offers)} cursos/ano gravados em {OUTPUT}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
