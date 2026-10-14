import { describe, expect, it } from 'vitest';
import { compareByTrack, orderNewTopicsBySequence, topicLevel } from './topic-sequence';

describe('trilha de tópicos', () => {
  it('diz o nível do tópico na matéria; fora da trilha, null', () => {
    expect(topicLevel('Matemática', 'Frações')).toBe('BASE');
    expect(topicLevel('Matemática', 'Função afim')).toBe('INTERMEDIARIO');
    expect(topicLevel('Matemática', 'Função logarítmica')).toBe('AVANCADO');
    expect(topicLevel('Matemática', 'Tópico importado ontem')).toBeNull();
    expect(topicLevel('Matéria que não existe', 'Frações')).toBeNull();
  });

  it('o pré-requisito vem antes de quem depende dele', () => {
    const sorted = (subject: string, names: string[]) =>
      [...names].sort((a, b) => compareByTrack(subject, a, b));
    expect(sorted('Matemática', ['Função logarítmica', 'Regra de três', 'Função exponencial', 'Frações', 'Razão e proporção']))
      .toEqual(['Frações', 'Razão e proporção', 'Regra de três', 'Função exponencial', 'Função logarítmica']);
    expect(sorted('Química', ['Estequiometria', 'Eletroquímica', 'Mol', 'Estrutura atômica']))
      .toEqual(['Estrutura atômica', 'Mol', 'Estequiometria', 'Eletroquímica']);
    expect(sorted('Física', ['Circuitos elétricos', 'Leis de Newton', 'Cinemática', 'Trabalho e energia']))
      .toEqual(['Cinemática', 'Leis de Newton', 'Trabalho e energia', 'Circuitos elétricos']);
  });

  it('tópico fora da trilha vai para o fim, em ordem alfabética', () => {
    const names = ['Zeta', 'Probabilidade', 'Alfa', 'Frações'];
    expect(names.sort((a, b) => compareByTrack('Matemática', a, b))).toEqual(['Frações', 'Probabilidade', 'Alfa', 'Zeta']);
  });

  describe('orderNewTopicsBySequence', () => {
    const candidate = (subjectName: string, topicName: string, priority: number, isNew = true) => ({
      subjectName, topicName, priority, isNew,
    });
    const run = (candidates: ReturnType<typeof candidate>[]) =>
      orderNewTopicsBySequence(candidates, (c) => c)
        .sort((a, b) => b.priority - a.priority)
        .map((c) => c.topicName);

    it('entre os tópicos novos da matéria, a prioridade mais alta vai para o primeiro da trilha', () => {
      // Probabilidade é a mais cobrada, mas depende da base.
      expect(run([
        candidate('Matemática', 'Probabilidade', 90),
        candidate('Matemática', 'Frações', 60),
        candidate('Matemática', 'Função afim', 75),
      ])).toEqual(['Frações', 'Função afim', 'Probabilidade']);
    });

    it('tópico já começado mantém a prioridade que tinha', () => {
      const result = orderNewTopicsBySequence([
        candidate('Matemática', 'Probabilidade', 90),
        candidate('Matemática', 'Trigonometria', 80, false),
        candidate('Matemática', 'Frações', 60),
      ], (c) => c);
      expect(result.map((c) => [c.topicName, c.priority])).toEqual([
        ['Frações', 90],
        ['Trigonometria', 80],
        ['Probabilidade', 60],
      ]);
    });

    it('com prioridades empatadas, a ordem da lista já é a da trilha', () => {
      const result = orderNewTopicsBySequence([
        candidate('Matemática', 'Probabilidade', 50),
        candidate('Matemática', 'Função afim', 50),
        candidate('Matemática', 'Frações', 50),
      ], (c) => c);
      expect(result.map((c) => c.topicName)).toEqual(['Frações', 'Função afim', 'Probabilidade']);
    });

    it('uma matéria não mexe na fila da outra', () => {
      const result = orderNewTopicsBySequence([
        candidate('Matemática', 'Probabilidade', 90),
        candidate('Física', 'Circuitos elétricos', 85),
        candidate('Matemática', 'Frações', 60),
        candidate('Física', 'Cinemática', 40),
      ], (c) => c);
      expect(Object.fromEntries(result.map((c) => [c.topicName, c.priority]))).toEqual({
        Frações: 90, Probabilidade: 60, Cinemática: 85, 'Circuitos elétricos': 40,
      });
    });
  });
});
