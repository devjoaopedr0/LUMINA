import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Prisma, PrismaClient } from '@prisma/client';
import { institutionKey, normalizeKey } from '../cutoffs/sisu-modality';

/** Gerado por scripts/sisu_xlsx_to_csv.py a partir das planilhas do MEC. */
export const SISU_CUTOFFS_FILE = join(__dirname, '..', '..', 'prisma', 'seed-data', 'sisu-cutoffs.csv.gz');

const BATCH_SIZE = 2000;

/** CSV simples com aspas duplas (o que o `csv` do Python escreve). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...lines] = rows;
  return lines.map((line) => Object.fromEntries(header.map((name, index) => [name, line[index] ?? ''])));
}

const score = (value: string): number | null => (value === '' ? null : Number(value));

export function toCutoffRow(record: Record<string, string>): Prisma.SisuCutoffCreateManyInput {
  return {
    year: Number(record.year),
    courseCode: Number(record.courseCode),
    institutionCode: Number(record.institutionCode),
    institutionName: record.institutionName,
    institutionAcronym: record.institutionAcronym,
    campus: record.campus,
    city: record.city,
    state: record.state,
    courseName: record.courseName,
    degree: record.degree,
    shift: record.shift,
    courseKey: normalizeKey(record.courseName),
    institutionKey: institutionKey(record.institutionAcronym, record.institutionName),
    scoreAc: score(record.AC),
    scoreLbPpi: score(record.LB_PPI),
    scoreLbQ: score(record.LB_Q),
    scoreLbPcd: score(record.LB_PCD),
    scoreLbEp: score(record.LB_EP),
    scoreLiPpi: score(record.LI_PPI),
    scoreLiQ: score(record.LI_Q),
    scoreLiPcd: score(record.LI_PCD),
    scoreLiEp: score(record.LI_EP),
  };
}

/**
 * Carrega as notas de corte do Sisu do arquivo do repositório. Idempotente:
 * cada edição presente no arquivo é apagada e regravada, então reimportar
 * (ou importar uma edição corrigida) nunca duplica.
 */
export async function importSisuCutoffs(
  prisma: PrismaClient,
  file: string = SISU_CUTOFFS_FILE,
): Promise<{ years: number[]; rows: number }> {
  const records = parseCsv(gunzipSync(readFileSync(file)).toString('utf-8'));
  const rows = records.map(toCutoffRow);
  const years = [...new Set(rows.map((row) => row.year))].sort();

  await prisma.sisuCutoff.deleteMany({ where: { year: { in: years } } });
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await prisma.sisuCutoff.createMany({ data: rows.slice(start, start + BATCH_SIZE) });
  }
  return { years, rows: rows.length };
}
