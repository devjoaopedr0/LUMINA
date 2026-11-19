import { describe, expect, it } from 'vitest';
import { checkGroupText, checkMessage, findContactInfo, findOffensive, normalizeForFilter } from './content-filter';

describe('filtro de conteúdo: ofensas', () => {
  it('pega palavrão com acento, maiúscula, leetspeak e letras repetidas', () => {
    expect(findOffensive('Que PORRA é essa')).toBe('porra');
    expect(findOffensive('p0rr4')).toBe('porra');
    expect(findOffensive('poooorra')).toBe('porra');
    expect(findOffensive('seu desgraçado')).toBe('desgracado');
  });

  it('pega letras separadas e raízes dentro de palavras', () => {
    expect(findOffensive('p u t a')).toBe('puta');
    expect(findOffensive('p.u.t.a')).toBe('puta');
    expect(findOffensive('caralhoooo')).toBeTruthy();
  });

  it('não acusa palavras normais que contêm pedaços parecidos', () => {
    for (const ok of ['computador', 'cuidado com a curva', 'disputa de vagas', 'macacão azul', 'Pintor famoso', 'reputação', 'imputar', 'curso de cálculo']) {
      expect(findOffensive(ok), ok).toBeNull();
    }
    expect(findOffensive('Vamos estudar funções afins hoje às 19h?')).toBeNull();
  });

  it('normaliza acento, maiúscula, leetspeak e repetição', () => {
    expect(normalizeForFilter('ÁGUA Pooorra 4')).toBe('agua porra a');
  });
});

describe('filtro de conteúdo: contato fora da plataforma', () => {
  it('bloqueia e-mail, telefone e convite para outras redes', () => {
    expect(findContactInfo('me chama: ana.souza@gmail.com')).toBe('email');
    expect(findContactInfo('ana arroba gmail.com')).toBe('email');
    expect(findContactInfo('(85) 99876-5432')).toBe('phone');
    expect(findContactInfo('85 9 9876 5432')).toBe('phone');
    expect(findContactInfo('me add no insta @ana.estuda')).not.toBeNull();
    expect(findContactInfo('me segue no insta @ana_estuda')).toBe('external');
  });

  it('deixa passar números de estudo', () => {
    expect(findContactInfo('Questão 136 do ENEM 2023, letra C')).toBeNull();
    expect(findContactInfo('fiz 45 questões em 2 h')).toBeNull();
    expect(findContactInfo('Bora às 19h no zap? brincadeira, aqui mesmo')).toBeNull();
  });
});

describe('filtro de conteúdo: veredito', () => {
  it('mensagem ofensiva e de contato têm motivos diferentes', () => {
    expect(checkMessage('vai se foder')).toMatchObject({ ok: false, reason: 'offensive' });
    expect(checkMessage('meu whats 85999998888')).toMatchObject({ ok: false, reason: 'contact' });
    expect(checkMessage('Alguém revisa genética comigo?')).toEqual({ ok: true });
  });

  it('nome e descrição do grupo', () => {
    expect(checkGroupText(['Turma da porra', null])).toMatchObject({ ok: false });
    expect(checkGroupText(['Medicina 2027', 'Foco no ENEM'])).toEqual({ ok: true });
  });
});
