import { describe, expect, it, vi } from 'vitest';
import { normalizeSubject, parseQuestionOcr, QuestionNotReadableError } from './question-ocr';
import { QuestionScanService } from './question-scan.service';

const answer = (data: Record<string, unknown>) => JSON.stringify(data);
const full = {
  legivel: true,
  enunciado: 'Um carro percorre 120 km em 2 horas. Qual é a velocidade média do carro?',
  alternativas: ['30 km/h', '40 km/h', '60 km/h', '80 km/h', '120 km/h'].map((texto, i) => ({ letra: 'ABCDE'[i], texto })),
  tem_figura: false,
  figura: null,
  disciplina: 'Fisica',
  assunto: 'Cinemática',
  dificuldade: 'FACIL',
  confianca: 0.95,
  observacoes: null,
};

describe('leitura da questão (OCR por modelo de visão)', () => {
  it('lê enunciado, cinco alternativas e a classificação, sem avisos', () => {
    const result = parseQuestionOcr(answer(full));
    expect(result.alternatives).toHaveLength(5);
    expect(result.alternatives[2]).toEqual({ position: 3, text: '60 km/h' });
    expect(result).toMatchObject({ subject: 'Física', topic: 'Cinemática', difficulty: 'FACIL', confidence: 0.95, hasFigure: false, warnings: [] });
  });

  it('tira o cabeçalho "QUESTÃO 97" do enunciado', () => {
    expect(parseQuestionOcr(answer({ ...full, enunciado: `QUESTÃO 97
${full.enunciado}` })).stemText).toBe(full.enunciado);
    expect(parseQuestionOcr(answer({ ...full, enunciado: `Questão 12 – ${full.enunciado}` })).stemText).toBe(full.enunciado);
  });

  it('figura entra no enunciado entre colchetes e gera aviso', () => {
    const result = parseQuestionOcr(answer({ ...full, tem_figura: true, figura: 'Gráfico de velocidade por tempo, de 0 a 10 s.' }));
    expect(result.stemText).toContain('[Figura: Gráfico de velocidade por tempo, de 0 a 10 s.]');
    expect(result.warnings.join(' ')).toMatch(/figura, gráfico ou tabela/);
  });

  it('trechos ilegíveis e alternativas faltando derrubam a confiança e avisam', () => {
    const result = parseQuestionOcr(answer({ ...full, enunciado: 'Um carro percorre [ilegível] km em 2 horas. Qual é a velocidade?', alternativas: full.alternativas.slice(0, 3) }));
    expect(result.confidence).toBeCloseTo(0.95 - 0.05 - 0.1, 5);
    expect(result.warnings.join(' ')).toMatch(/Foram lidas 3 alternativas/);
    expect(result.warnings.join(' ')).toMatch(/1 trecho\(s\) ficaram como \[ilegível\]/);
  });

  it('foto sem questão legível vira erro para tentar outra foto', () => {
    expect(() => parseQuestionOcr(answer({ legivel: false, observacoes: 'foto desfocada' }))).toThrow(QuestionNotReadableError);
    expect(() => parseQuestionOcr(answer({ legivel: false, observacoes: 'foto desfocada' }))).toThrow(/foto desfocada/);
    expect(() => parseQuestionOcr('sem json')).toThrow(/não deu para interpretar/);
  });

  it('disciplina fora da lista fica em branco; dificuldade desconhecida também', () => {
    expect(normalizeSubject('portugues')).toBe('Língua Portuguesa');
    expect(normalizeSubject('Astrologia')).toBeNull();
    expect(parseQuestionOcr(answer({ ...full, dificuldade: 'MUITO_DIFICIL' })).difficulty).toBeNull();
  });

  it('letras repetidas ou fora de A–E são descartadas e a ordem é a das letras', () => {
    const result = parseQuestionOcr(answer({ ...full, alternativas: [{ letra: 'B', texto: 'dois' }, { letra: 'A', texto: 'um' }, { letra: 'B', texto: 'repetida' }, { letra: 'F', texto: 'fora' }] }));
    expect(result.alternatives).toEqual([{ position: 1, text: 'um' }, { position: 2, text: 'dois' }]);
  });
});

describe('QuestionScanService.completeUpload', () => {
  const png = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2048, 1)]).toString('base64')}`;

  function setup(ai: unknown, upload: Record<string, unknown> | null = { id: 'u1', userId: 'aluno', status: 'PENDING', fileUrl: png }) {
    const prisma = {
      questionScanUpload: {
        findFirst: vi.fn().mockResolvedValue(upload),
        findUnique: vi.fn().mockResolvedValue({ ...upload, fileUrl: png }),
        update: vi.fn().mockResolvedValue({}),
      },
      questionScanProcessing: { create: vi.fn(async ({ data }: any) => ({ id: 'p1', ...data })) },
    };
    const planUsage = { withQuota: vi.fn((_u: string, _f: string, run: () => Promise<unknown>) => run()) };
    const service = new QuestionScanService(prisma as any, {} as any, ai as any, planUsage as any);
    return { service, prisma, planUsage };
  }

  it('lê de verdade, grava o resultado e não inventa explicação por alternativa', async () => {
    const ai = { generateStructured: vi.fn().mockResolvedValue({ text: answer(full), model: 'gemini:teste' }) };
    const { service, prisma, planUsage } = setup(ai);
    const result: any = await service.completeUpload('aluno', 'u1', { fileUrl: png, width: 800, height: 1200, sizeBytes: 3000 });
    expect(ai.generateStructured.mock.calls[0][0]).toMatchObject({ imageDataUrl: png, temperature: 0 });
    expect(planUsage.withQuota).toHaveBeenCalledWith('aluno', 'LUMINIA_MESSAGE', expect.any(Function));
    expect(result).toMatchObject({ status: 'COMPLETED', subject: 'Física', stemText: full.enunciado });
    expect(prisma.questionScanProcessing.create.mock.calls[0][0].data.explanationJson).toBeDefined();
    expect(prisma.questionScanProcessing.create.mock.calls[0][0].data.explanationJson).not.toHaveProperty('1');
  });

  it('sem IA configurada, falha com mensagem clara (sem questão inventada)', async () => {
    const { service } = setup(undefined);
    const result: any = await service.completeUpload('aluno', 'u1', { fileUrl: png, width: 800, height: 1200, sizeBytes: 3000 });
    expect(result).toMatchObject({ status: 'FAILED', stemText: null });
    expect(result.errorMessage).toMatch(/não está configurada/);
  });

  it('upload de outro aluno é 404; o mesmo upload não é lido duas vezes', async () => {
    await expect(setup({}, null).service.completeUpload('intruso', 'u1', { fileUrl: png, width: 1, height: 1, sizeBytes: 1 })).rejects.toThrow('Envio não encontrado.');
    await expect(setup({}, { id: 'u1', userId: 'aluno', status: 'COMPLETED' }).service.completeUpload('aluno', 'u1', { fileUrl: png, width: 1, height: 1, sizeBytes: 1 })).rejects.toThrow('já foi enviada');
  });

  it('imagem que não é imagem é recusada antes de chamar a IA', async () => {
    const ai = { generateStructured: vi.fn() };
    const fake = `data:image/png;base64,${Buffer.alloc(4096, 7).toString('base64')}`;
    await expect(setup(ai).service.completeUpload('aluno', 'u1', { fileUrl: fake, width: 1, height: 1, sizeBytes: 1 })).rejects.toThrow('Formato não suportado');
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });
});
