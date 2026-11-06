import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LlmCalibration } from './essay-grader';

/**
 * A calibração final só pode ser gravada quando as duas amostras foram
 * medidas: a de calibração e a de teste (temas inéditos). Sem a amostra de
 * teste, uma execução interrompida por cota gravaria uma função ajustada e
 * não validada, substituindo a calibração ativa.
 */
export function canWriteFinalCalibration(calibrationSize: number, testSize: number, minimum = 10): boolean {
  return calibrationSize >= minimum && testSize >= minimum;
}

/**
 * Guarda a calibração de um prompt antigo antes de o arquivo ativo ser
 * reescrito para uma versão nova.
 *
 * A calibração é ajustada por prompt e por modelo. Quando o prompt muda, a
 * função antiga deixa de valer (o corretor usa a identidade), mas o arquivo
 * não pode ser apagado: ele é a evidência de como a versão anterior foi
 * medida. O arquivo ativo continua em `model/llm-calibration.json`; as
 * versões anteriores ficam em `model/archive/llm-calibration.<prompt>.json`.
 *
 * Devolve o caminho do arquivo arquivado, ou `null` quando não há nada a
 * arquivar (arquivo inexistente, mesma versão ou arquivo já arquivado).
 */
export function archiveCalibrationIfNeeded(path: string, nextPromptVersion: string): string | null {
  if (!existsSync(path)) return null;
  const current = JSON.parse(readFileSync(path, 'utf8')) as Partial<LlmCalibration>;
  if (!current.promptVersion || current.promptVersion === nextPromptVersion) return null;

  const archivePath = join(dirname(path), 'archive', `llm-calibration.${current.promptVersion}.json`);
  if (existsSync(archivePath)) return archivePath;

  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, `${JSON.stringify(current, null, 2)}\n`);
  return archivePath;
}
