import { describe, expect, it, vi } from 'vitest';
import { QuestionDifficulty } from '@prisma/client';
import { QuestionHintsService, createDefaultHintProvider } from './question-hints.service';
import { HintProvider, HintRequest } from './hint-provider.interface';
import { StudyGuideHintProvider } from './study-guide-hint.provider';
import { MAX_HINT_LEVEL, MIN_HINT_LEVEL } from '../dto/question-resolution.dto';

const MATEMATICA: HintRequest = {
  stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
  subject: 'Matemática',
  topic: 'Funções exponenciais',
  difficulty: QuestionDifficulty.MEDIA,
  alternativesCount: 4,
  level: 1,
};

function normalizar(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('StudyGuideHintProvider', () => {
  const provider = new StudyGuideHintProvider();

  it('se identifica como provedor de regras (funciona sem chave externa)', () => {
    expect(provider.name).toBe('rules');
  });

  it('nível 1 aponta o assunto e pede recuperar o conceito antes das alternativas', () => {
    const dica = provider.build({ ...MATEMATICA, level: 1 });

    expect(dica).toContain('Matemática');
    expect(dica).toContain('Funções exponenciais');
    expect(dica).toMatch(/reveja como a função se comporta/i);
    expect(dica).toContain('antes de olhar as alternativas');
  });

  it('reconhece a área mesmo com assunto e enunciado sem acento', () => {
    // O banco pode guardar "Funcoes exponenciais" (a busca do item 10 é sem
    // acento): a dica não pode deixar de reconhecer a área por causa disso.
    const dica = provider.build({
      ...MATEMATICA,
      subject: 'Matematica',
      topic: 'Funcoes exponenciais',
      stem: 'Considere a funcao f(x) = 2^x. O valor de f(3) e igual a:',
      level: 2,
    });

    expect(dica).toMatch(/imagem|inversa|raiz/i);
  });

  it('reconhece a área com o enunciado real do banco ("funcoes exponenciais")', () => {
    const dica = provider.build({
      ...MATEMATICA,
      subject: 'Matematica',
      topic: 'Funcoes exponenciais',
      stem: 'Questao de validacao visual da transcricao (item 10) sobre funcoes exponenciais.',
      level: 2,
    });

    expect(dica).toMatch(/imagem|inversa|raiz/i);
  });

  it('nível 2 traz a checagem específica da área (função exponencial)', () => {
    const dica = provider.build({ ...MATEMATICA, level: 2 });

    expect(dica).toMatch(/imagem|inversa|raiz/i);
    expect(dica).toMatch(/enunciado/i);
  });

  it('nível 3 ensina a eliminar sem dizer qual alternativa é a correta', () => {
    const dica = provider.build({ ...MATEMATICA, level: 3 });

    expect(dica).toMatch(/eliminar/i);
    // A estratégia é método, não resposta: nenhuma alternativa é citada.
    expect(dica).not.toMatch(/\b8\b/);
  });

  it('usa as dicas genéricas quando a disciplina não é reconhecida', () => {
    const dica = provider.build({
      ...MATEMATICA,
      subject: 'Filosofia',
      topic: 'Ética',
      stem: 'Sobre o conceito de boa vontade em Kant, assinale a alternativa correta.',
      level: 2,
    });

    expect(dica).toContain('o que está sendo calculado');
  });

  it('avisa que a questão é difícil quando o nível 3 vem de questão marcada como difícil', () => {
    const dica = provider.build({ ...MATEMATICA, difficulty: QuestionDifficulty.DIFICIL, level: 3 });

    expect(dica).toContain('difícil');
  });

  it('não deixa pontuação pendurada quando a questão não tem assunto', () => {
    // Questão importada sem assunto é comum; a dica não pode sair "assunto: .".
    const dica = provider.build({ ...MATEMATICA, topic: '   ', level: 1 });

    expect(dica).toContain('Esta questão é de Matemática.');
    expect(dica).not.toMatch(/assunto:\s*\./);
  });
});

describe('QuestionHintsService', () => {
  const questao = {
    stem: 'Considere a função f(x) = 2^x. O valor de f(3) é igual a:',
    subject: 'Matemática',
    topic: 'Funções exponenciais',
    difficulty: QuestionDifficulty.MEDIA,
    alternatives: [
      { text: '4', isCorrect: false },
      { text: '6', isCorrect: false },
      { text: '8', isCorrect: true },
      { text: '10', isCorrect: false },
    ],
  };

  it('nunca entrega a alternativa correta, em nenhum nível', async () => {
    const service = new QuestionHintsService(createDefaultHintProvider());

    for (let level = MIN_HINT_LEVEL; level <= MAX_HINT_LEVEL; level += 1) {
      const { hint } = await service.hint(questao, level);
      // o gabarito desta questão é "8" e o provedor por regras não emite número
      // nenhum: a dica é método, não resposta.
      expect(hint).not.toMatch(/\b8\b/);
    }
  });

  it('não entrega a alternativa correta mesmo quando ela é um texto longo', async () => {
    const service = new QuestionHintsService(createDefaultHintProvider());
    const discursiva = {
      ...questao,
      subject: 'Geografia',
      topic: 'População urbana',
      stem: 'Sobre a urbanização brasileira, assinale a alternativa correta.',
      alternatives: [
        { text: 'A industrialização acelerada do século XX', isCorrect: false },
        { text: 'A industrialização acelerada do século XXI', isCorrect: true },
      ],
    };

    const { hint } = await service.hint(discursiva, 1);

    expect(normalizar(hint)).not.toContain(normalizar('século XXI'));
  });

  it('descarta a dica de um provedor que vaza o gabarito e devolve uma neutra', async () => {
    const vazador: HintProvider = {
      name: 'llm',
      generate: vi.fn().mockResolvedValue('A industrialização acelerada do século XXI é a correta.'),
    };
    const service = new QuestionHintsService(vazador);

    const resultado = await service.hint(
      {
        ...questao,
        subject: 'Geografia',
        topic: 'População urbana',
        stem: 'Sobre a urbanização brasileira, assinale a alternativa correta.',
        alternatives: [
          { text: 'A industrialização acelerada do século XX', isCorrect: false },
          { text: 'A industrialização acelerada do século XXI', isCorrect: true },
        ],
      },
      1,
    );

    expect(resultado.hint).not.toMatch(/século XXI/);
    expect(resultado.hint).toContain('Releia o enunciado');
    // o serviço continua anunciando o provedor: a interface não mente sobre a origem
    expect(resultado.provider).toBe('llm');
  });

  it('descarta a dica mesmo com acento e pontuação diferentes da resposta', async () => {
    const vazador: HintProvider = {
      name: 'llm',
      generate: vi.fn().mockResolvedValue('Marque "doze metros" como a alternativa correta.'),
    };
    const service = new QuestionHintsService(vazador);

    const resultado = await service.hint(
      {
        ...questao,
        alternatives: [
          { text: '8', isCorrect: false },
          { text: 'doze metros', isCorrect: true },
        ],
      },
      2,
    );

    expect(resultado.hint).not.toMatch(/doze\s+metros/i);
  });

  it('não descarta por respostas curtas (evita falso positivo)', async () => {
    const curto: HintProvider = {
      name: 'llm',
      generate: vi.fn().mockResolvedValue('Some os valores 8 e 4 e veja o que dá.'),
    };
    const service = new QuestionHintsService(curto);

    const resultado = await service.hint(
      {
        ...questao,
        alternatives: [
          { text: '8', isCorrect: true },
          { text: '16', isCorrect: false },
        ],
      },
      3,
    );

    expect(resultado.hint).toBe('Some os valores 8 e 4 e veja o que dá.');
  });

  it('repassa ao provedor só o enunciado e a classificação — nunca o gabarito', async () => {
    const generate = vi.fn().mockResolvedValue('dica');
    const service = new QuestionHintsService({ name: 'llm', generate });

    await service.hint(questao, 2);

    const [request] = generate.mock.calls[0];
    expect(Object.keys(request).sort()).toEqual(
      ['alternativesCount', 'difficulty', 'level', 'stem', 'subject', 'topic'].sort(),
    );
  });

  it('limita o nível a 1..3 e usa 1 como padrão', async () => {
    const service = new QuestionHintsService(createDefaultHintProvider());

    expect((await service.hint(questao, undefined)).level).toBe(1);
    expect((await service.hint(questao, 99)).level).toBe(3);
    expect((await service.hint(questao, 0)).level).toBe(1);
    expect((await service.hint(questao, -5)).level).toBe(1);
    expect(QuestionHintsService.clampLevel(Number.NaN)).toBe(1);
  });

  it('informa o nível máximo junto da dica (a interface sabe quando parar)', async () => {
    const service = new QuestionHintsService(createDefaultHintProvider());

    const resultado = await service.hint(questao, 3);

    expect(resultado.maxLevel).toBe(3);
  });

  it('a dica neutra também não inventa assunto quando a questão não tem', async () => {
    const vazador: HintProvider = {
      name: 'llm',
      generate: vi.fn().mockResolvedValue('A resposta é a industrialização acelerada do século XXI.'),
    };
    const service = new QuestionHintsService(vazador);

    const resultado = await service.hint(
      {
        ...questao,
        topic: '',
        subject: 'Geografia',
        alternatives: [
          { text: 'A industrialização acelerada do século XX', isCorrect: false },
          { text: 'A industrialização acelerada do século XXI', isCorrect: true },
        ],
      },
      1,
    );

    expect(resultado.hint).toContain('esta questão é de Geografia.');
    expect(resultado.hint).not.toMatch(/assunto:\s*\./);
  });
});
