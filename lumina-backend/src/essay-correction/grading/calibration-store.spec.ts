import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveCalibrationIfNeeded, canWriteFinalCalibration } from './calibration-store';

describe('archiveCalibrationIfNeeded', () => {
  const dirs: string[] = [];

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'lumina-calibration-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('arquiva a versão anterior antes de o prompt novo assumir', () => {
    const dir = tempDir();
    const path = join(dir, 'llm-calibration.json');
    const previous = { version: 2, promptVersion: 'v2-competencia', byModel: { 'gemini:modelo': { sampleSize: 174 } } };
    writeFileSync(path, JSON.stringify(previous));

    const archived = archiveCalibrationIfNeeded(path, 'v3-c2-c4-oficial-2026');

    expect(archived).toBe(join(dir, 'archive', 'llm-calibration.v2-competencia.json'));
    expect(existsSync(archived!)).toBe(true);
    expect(JSON.parse(readFileSync(archived!, 'utf8'))).toEqual(previous);
  });

  it('não arquiva quando a versão do prompt é a mesma', () => {
    const dir = tempDir();
    const path = join(dir, 'llm-calibration.json');
    writeFileSync(path, JSON.stringify({ version: 2, promptVersion: 'v3-c2-c4-oficial-2026', byModel: {} }));

    expect(archiveCalibrationIfNeeded(path, 'v3-c2-c4-oficial-2026')).toBeNull();
    expect(existsSync(join(dir, 'archive'))).toBe(false);
  });

  it('não sobrescreve um arquivo já arquivado', () => {
    const dir = tempDir();
    const path = join(dir, 'llm-calibration.json');
    writeFileSync(path, JSON.stringify({ version: 2, promptVersion: 'v2-competencia', byModel: { novo: true } }));
    const archived = join(dir, 'archive', 'llm-calibration.v2-competencia.json');
    mkdirSync(join(dir, 'archive'), { recursive: true });
    writeFileSync(archived, '{"preservado":true}');

    expect(archiveCalibrationIfNeeded(path, 'v3-c2-c4-oficial-2026')).toBe(archived);
    expect(readFileSync(archived, 'utf8')).toBe('{"preservado":true}');
  });

  it('não falha quando a calibração ativa ainda não existe', () => {
    const dir = tempDir();
    expect(archiveCalibrationIfNeeded(join(dir, 'llm-calibration.json'), 'v3-c2-c4-oficial-2026')).toBeNull();
  });
});

describe('canWriteFinalCalibration', () => {
  it('recusa gravar calibração quando a amostra de teste está vazia', () => {
    // Execução interrompida por cota: 10 redações de calibração, nenhuma de teste.
    expect(canWriteFinalCalibration(10, 0)).toBe(false);
  });

  it('recusa gravar calibração quando falta amostra de calibração', () => {
    expect(canWriteFinalCalibration(0, 10)).toBe(false);
  });

  it('recusa gravar calibração quando uma das amostras fica abaixo do mínimo', () => {
    expect(canWriteFinalCalibration(9, 10)).toBe(false);
    expect(canWriteFinalCalibration(10, 9)).toBe(false);
  });

  it('libera a gravação quando calibração e teste têm o mínimo', () => {
    expect(canWriteFinalCalibration(10, 10)).toBe(true);
    expect(canWriteFinalCalibration(90, 87)).toBe(true);
  });
});
