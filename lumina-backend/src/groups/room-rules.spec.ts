import { describe, expect, it } from 'vitest';
import {
  ParticipantClock,
  ROOM_RULES,
  creditableUntil,
  isStale,
  leave,
  pause,
  presence,
  resume,
  roomDurationSeconds,
  shouldCloseRoom,
  studiedSeconds,
  visibleParticipant,
} from './room-rules';

const T0 = new Date('2026-11-17T13:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function studying(overrides: Partial<ParticipantClock> = {}): ParticipantClock {
  return { status: 'STUDYING', joinedAt: T0, lastHeartbeatAt: T0, activeSince: T0, accumulatedSeconds: 0, ...overrides };
}

describe('room-rules: tempo individual', () => {
  it('conta o trecho atual enquanto há sinal', () => {
    const p = studying({ lastHeartbeatAt: at(60) });
    expect(studiedSeconds(p, at(80))).toBe(80);
  });

  it('pausa não conta e o acumulado é preservado', () => {
    const p = studying({ lastHeartbeatAt: at(300) });
    const paused = { ...p, ...pause(p, at(300)) };
    expect(paused.accumulatedSeconds).toBe(300);
    expect(studiedSeconds(paused, at(900))).toBe(300);
    const back = { ...paused, ...resume(at(900)) };
    expect(studiedSeconds({ ...back, lastHeartbeatAt: at(960) }, at(960))).toBe(360);
  });

  it('quem some conta só até o último sinal (não infla horas)', () => {
    const p = studying({ lastHeartbeatAt: at(120) });
    expect(isStale(p, at(120 + ROOM_RULES.offlineAfterSeconds + 1))).toBe(true);
    expect(studiedSeconds(p, at(3600))).toBe(120);
    expect(creditableUntil(p, at(3600))).toEqual(at(120));
  });

  it('passagem é cortada no limite de horas', () => {
    const limit = ROOM_RULES.maxParticipationHours * 3600;
    const p = studying({ lastHeartbeatAt: at(limit + 30) });
    expect(studiedSeconds(p, at(limit + 40))).toBe(limit);
  });
});

describe('room-rules: sair', () => {
  it('gera minutos inteiros para o histórico pessoal', () => {
    const out = leave(studying({ lastHeartbeatAt: at(25 * 60 + 40) }), at(25 * 60 + 40));
    expect(out).toEqual({ accumulatedSeconds: 25 * 60 + 40, leftAt: at(25 * 60 + 40), loggedMinutes: 25 });
  });

  it('menos de 1 minuto não vira log', () => {
    expect(leave(studying({ lastHeartbeatAt: at(50) }), at(50)).loggedMinutes).toBe(0);
  });

  it('quem sumiu sai no horário do último sinal', () => {
    const out = leave(studying({ lastHeartbeatAt: at(600) }), at(5000));
    expect(out.leftAt).toEqual(at(600));
    expect(out.loggedMinutes).toBe(10);
  });

  it('saindo pausado leva só o acumulado', () => {
    const p = studying({ status: 'PAUSED', activeSince: null, accumulatedSeconds: 900, lastHeartbeatAt: at(2000) });
    expect(leave(p, at(2000)).loggedMinutes).toBe(15);
  });
});

describe('room-rules: presença e sala', () => {
  it('presença: estudando, pausado, offline', () => {
    expect(presence(studying({ lastHeartbeatAt: at(0) }), at(30))).toBe('STUDYING');
    expect(presence(studying({ status: 'PAUSED', lastHeartbeatAt: at(0) }), at(30))).toBe('PAUSED');
    expect(presence(studying({ lastHeartbeatAt: at(0) }), at(200))).toBe('OFFLINE');
  });

  it('sala só fecha vazia e depois de 30 min', () => {
    const room = { lastActivityAt: T0 };
    expect(shouldCloseRoom(room, 1, at(99_999))).toBe(false);
    expect(shouldCloseRoom(room, 0, at(29 * 60))).toBe(false);
    expect(shouldCloseRoom(room, 0, at(30 * 60))).toBe(true);
  });

  it('duração da sala vai do início ao fim (ou até agora)', () => {
    expect(roomDurationSeconds({ startedAt: T0, endedAt: at(3600) }, at(9999))).toBe(3600);
    expect(roomDurationSeconds({ startedAt: T0, endedAt: null }, at(120))).toBe(120);
  });
});

describe('room-rules: privacidade', () => {
  const data = { name: 'Ana', subject: 'Matemática', studiedSeconds: 600 };
  it('sem permissão o colega vê só nome e status', () => {
    expect(visibleParticipant(data, false, false)).toEqual({ name: 'Ana', subject: null, studiedSeconds: null });
  });
  it('com permissão, ou para si mesmo, vê matéria e tempo', () => {
    expect(visibleParticipant(data, true, false)).toEqual(data);
    expect(visibleParticipant(data, false, true)).toEqual(data);
  });
});
