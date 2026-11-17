import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from '../auth/dto/register.dto';
import { CURRENT_TERMS_VERSION } from '../common/legal';
import { UsersRepository, UserWithProfile } from './users.repository';
import { UsersService } from './users.service';

const baseUser = {
  id: 'user-1',
  email: 'maria@exemplo.com',
  passwordHash: 'hash',
  emailVerified: true,
  status: 'ACTIVE',
  accountType: 'STUDENT_INDEPENDENT',
  termsAcceptedAt: null,
  termsVersion: null,
  lastLogin: null,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
  profile: null,
  teacherProfile: null,
} as unknown as UserWithProfile;

describe('UsersService — aceite dos Termos', () => {
  const repository = { acceptTerms: vi.fn() } as unknown as Mocked<UsersRepository>;
  const service = new UsersService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('marca termsCurrent=false para quem nunca aceitou (ex.: cadastro pelo Google)', () => {
    expect(service.toPublicUser(baseUser).termsCurrent).toBe(false);
  });

  it('marca termsCurrent=false para quem aceitou uma versão antiga', () => {
    const old = { ...baseUser, termsVersion: '2020-01-01', termsAcceptedAt: new Date() } as UserWithProfile;
    expect(service.toPublicUser(old).termsCurrent).toBe(false);
  });

  it('registra o aceite da versão vigente', async () => {
    const accepted = { ...baseUser, termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } as UserWithProfile;
    repository.acceptTerms.mockResolvedValue(accepted);

    const result = await service.acceptTerms('user-1', CURRENT_TERMS_VERSION);

    expect(repository.acceptTerms).toHaveBeenCalledWith('user-1', CURRENT_TERMS_VERSION);
    expect(result.termsCurrent).toBe(true);
  });

  it('expõe os campos dos Termos na resposta serializada (@Expose)', () => {
    const plain = instanceToPlain(service.toPublicUser(baseUser));
    expect(plain).toMatchObject({ termsVersion: null, termsAcceptedAt: null, termsCurrent: false });
  });

  it('recusa aceite de uma versão que não é a vigente', async () => {
    await expect(service.acceptTerms('user-1', '2020-01-01')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.acceptTerms).not.toHaveBeenCalled();
  });
});

describe('RegisterDto — acceptTerms', () => {
  const base = { firstName: 'Maria', lastName: 'Silva', username: 'maria.silva', email: 'maria@exemplo.com', password: 'SenhaForte123' };
  const errorsFor = (payload: object) =>
    validateSync(plainToInstance(RegisterDto, payload)).filter((e) => e.property === 'acceptTerms');

  it('exige o aceite', () => {
    expect(errorsFor(base)).toHaveLength(1);
    expect(errorsFor({ ...base, acceptTerms: false })).toHaveLength(1);
    expect(errorsFor({ ...base, acceptTerms: 'true' })).toHaveLength(1);
  });

  it('aceita acceptTerms=true', () => {
    expect(errorsFor({ ...base, acceptTerms: true })).toHaveLength(0);
  });
});
