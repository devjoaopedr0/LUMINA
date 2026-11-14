import { describe, expect, it } from 'vitest';
import {
  canChangeRole,
  canManageGroup,
  canModerate,
  canRemoveMember,
  generateJoinCode,
  GROUP_INVITE_TTL_MS,
  isMinor,
  normalizeJoinCode,
  signGroupInvite,
  studyStats,
  verifyGroupInvite,
  visibleStats,
} from './group-rules';

const GROUP = '7d2f6c1e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';

describe('papéis do grupo', () => {
  it('dono e administrador gerenciam; moderador só modera', () => {
    expect(canManageGroup('OWNER')).toBe(true);
    expect(canManageGroup('ADMIN')).toBe(true);
    expect(canManageGroup('MODERATOR')).toBe(false);
    expect(canModerate('MODERATOR')).toBe(true);
    expect(canModerate('MEMBER')).toBe(false);
  });

  it('remove só quem está abaixo', () => {
    expect(canRemoveMember('MODERATOR', 'MEMBER')).toBe(true);
    expect(canRemoveMember('MODERATOR', 'MODERATOR')).toBe(false);
    expect(canRemoveMember('ADMIN', 'OWNER')).toBe(false);
    expect(canRemoveMember('MEMBER', 'MEMBER')).toBe(false);
  });

  it('promove até um nível abaixo do próprio; ninguém vira dono por aqui', () => {
    expect(canChangeRole('OWNER', 'MEMBER', 'ADMIN')).toBe(true);
    expect(canChangeRole('ADMIN', 'MEMBER', 'MODERATOR')).toBe(true);
    expect(canChangeRole('ADMIN', 'MEMBER', 'ADMIN')).toBe(false);
    expect(canChangeRole('ADMIN', 'ADMIN', 'MEMBER')).toBe(false);
    expect(canChangeRole('OWNER', 'ADMIN', 'OWNER')).toBe(false);
    expect(canChangeRole('MODERATOR', 'MEMBER', 'MODERATOR')).toBe(false);
  });
});

describe('código e link de convite', () => {
  it('gera código sem caracteres ambíguos e normaliza o digitado', () => {
    const code = generateJoinCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(normalizeJoinCode(' k7m2-qx9p ')).toBe('K7M2QX9P');
  });

  it('o link vale com o código atual e cai quando o código muda ou expira', () => {
    const now = Date.UTC(2026, 10, 14);
    const { token } = signGroupInvite(GROUP, 'ABCD2345', 'segredo', now);
    expect(verifyGroupInvite(token, 'ABCD2345', 'segredo', now + 1000)).toBe(GROUP);
    expect(verifyGroupInvite(token, 'ZZZZ9999', 'segredo', now + 1000)).toBeNull();
    expect(verifyGroupInvite(token, 'ABCD2345', 'outro', now + 1000)).toBeNull();
    expect(verifyGroupInvite(token, 'ABCD2345', 'segredo', now + GROUP_INVITE_TTL_MS + 1)).toBeNull();
    expect(verifyGroupInvite('lixo', 'ABCD2345', 'segredo', now)).toBeNull();
    const forged = `${Buffer.from(`nao-e-uuid.${now + 1000}`).toString('base64url')}.x`;
    expect(verifyGroupInvite(forged, 'ABCD2345', 'segredo', now)).toBeNull();
  });
});

describe('idade', () => {
  it('menor de 18 pela data de nascimento; sem data não é tratado como menor', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(isMinor(new Date('2009-11-15'), now)).toBe(true);
    expect(isMinor(new Date('2008-11-14'), now)).toBe(false);
    expect(isMinor(null, now)).toBe(false);
  });
});

describe('estatísticas de estudo do StudyTimeLog', () => {
  // 14/11/2026 às 15h em Brasília.
  const now = new Date('2026-11-14T18:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('soma hoje, semana e total; sequência termina hoje ou ontem; usa o fuso de Brasília', () => {
    const stats = studyStats(
      [
        { endTime: at('2026-11-14T13:00:00Z'), durationMinutes: 50, subjectName: 'Matemática' },
        // 01h30 do dia 14 em UTC = 22h30 do dia 13 em Brasília.
        { endTime: at('2026-11-14T01:30:00Z'), durationMinutes: 30, subjectName: 'Física' },
        { endTime: at('2026-11-12T15:00:00Z'), durationMinutes: 40, subjectName: 'Matemática' },
        { endTime: at('2026-11-01T15:00:00Z'), durationMinutes: 100, subjectName: 'Química' },
        { endTime: at('2026-11-14T14:00:00Z'), durationMinutes: 0, subjectName: 'Biologia' },
      ],
      now,
    );
    expect(stats.todayMinutes).toBe(50);
    expect(stats.weekMinutes).toBe(120);
    expect(stats.totalMinutes).toBe(220);
    expect(stats.subjects).toEqual(['Matemática', 'Física']);
    expect(stats.streakDays).toBe(3);
    expect(stats.lastActivityAt).toEqual(at('2026-11-14T13:00:00Z'));
  });

  it('sequência conta a partir de ontem se ainda não estudou hoje, e zera depois de um dia sem estudo', () => {
    expect(studyStats([{ endTime: at('2026-11-13T15:00:00Z'), durationMinutes: 20 }], now).streakDays).toBe(1);
    expect(studyStats([{ endTime: at('2026-11-12T15:00:00Z'), durationMinutes: 20 }], now).streakDays).toBe(0);
  });
});

describe('privacidade', () => {
  const stats = { todayMinutes: 10, weekMinutes: 70, totalMinutes: 900, subjects: ['Física'], streakDays: 4, lastActivityAt: new Date() };
  const off = { shareStudyTime: false, shareSubjects: false, shareStreak: false, shareLastActivity: false };

  it('colega não vê nada que o aluno não ligou', () => {
    expect(visibleStats(stats, off, false)).toEqual({ todayMinutes: null, weekMinutes: null, totalMinutes: null, subjects: null, streakDays: null, lastActivityAt: null });
  });

  it('cada interruptor libera só o seu item; o próprio aluno vê tudo', () => {
    const seen = visibleStats(stats, { ...off, shareStreak: true }, false);
    expect(seen.streakDays).toBe(4);
    expect(seen.weekMinutes).toBeNull();
    expect(visibleStats(stats, off, true).totalMinutes).toBe(900);
  });
});
