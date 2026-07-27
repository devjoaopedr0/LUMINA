import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let usersRepository: any;
  let usersService: any;
  let jwtService: any;
  let configService: any;
  let baseUser: any;

  beforeEach(async () => {
    // Menos rounds só para os testes rodarem rápido — o valor de produção
    // (12) continua sendo o usado pelo AuthService de verdade.
    const passwordHash = await bcrypt.hash('SenhaForte123', 4);

    baseUser = {
      id: 'user-1',
      email: 'maria@exemplo.com',
      passwordHash,
      emailVerified: false,
      status: UserStatus.ACTIVE,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      profile: {
        id: 'profile-1',
        userId: 'user-1',
        firstName: 'Maria',
        lastName: 'Silva',
        username: 'maria.silva',
        avatarUrl: null,
        phone: null,
        birthDate: null,
        bio: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    prisma = {
      $transaction: vi.fn((cb: any) =>
        cb({
          workspace: { create: vi.fn().mockResolvedValue({ id: 'ws-1' }) },
          role: { create: vi.fn().mockResolvedValue({ id: 'role-1' }) },
          workspaceMember: { create: vi.fn().mockResolvedValue({}) },
        }),
      ),
    };

    usersRepository = {
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      findById: vi.fn(),
      createWithProfile: vi.fn(),
      updateLastLogin: vi.fn(),
    };

    usersService = {
      toPublicUser: vi.fn((u: any) => ({ id: u.id, email: u.email })),
    };

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-token'),
    };

    configService = {
      get: vi.fn((key: string) =>
        ({ JWT_REFRESH_SECRET: 'refresh-secret', JWT_REFRESH_EXPIRES_IN: '7d' })[key],
      ),
    };

    service = new AuthService(prisma, usersRepository, usersService, jwtService, configService);
  });

  const registerDto = {
    firstName: 'Maria',
    lastName: 'Silva',
    username: 'maria.silva',
    email: 'maria@exemplo.com',
    password: 'SenhaForte123',
  };

  describe('register', () => {
    it('cria o usuário + workspace pessoal e retorna tokens', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByUsername.mockResolvedValue(null);
      usersRepository.createWithProfile.mockResolvedValue(baseUser);

      const result = await service.register(registerDto);

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(usersRepository.createWithProfile).toHaveBeenCalledWith(
        expect.objectContaining({ email: registerDto.email, username: registerDto.username }),
        expect.anything(),
      );
    });

    it('lança ConflictException se o e-mail já está cadastrado', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lança ConflictException se o username já está em uso', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByUsername.mockResolvedValue(baseUser);

      await expect(service.register(registerDto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('autentica com credenciais corretas e atualiza last_login', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);
      usersRepository.updateLastLogin.mockResolvedValue(baseUser);
      usersRepository.findById.mockResolvedValue(baseUser);

      const result = await service.login({ email: baseUser.email, password: 'SenhaForte123' });

      expect(result.accessToken).toBe('signed-token');
      expect(usersRepository.updateLastLogin).toHaveBeenCalledWith(baseUser.id);
    });

    it('lança UnauthorizedException para e-mail inexistente', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ninguem@exemplo.com', password: 'qualquer-senha' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lança UnauthorizedException para senha incorreta', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.login({ email: baseUser.email, password: 'senha-errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lança ForbiddenException quando a conta não está ACTIVE', async () => {
      usersRepository.findByEmail.mockResolvedValue({ ...baseUser, status: UserStatus.SUSPENDED });

      await expect(
        service.login({ email: baseUser.email, password: 'SenhaForte123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('validateUserById', () => {
    it('retorna o usuário quando ele existe e está ACTIVE', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);

      await expect(service.validateUserById(baseUser.id)).resolves.toEqual(baseUser);
    });

    it('lança UnauthorizedException quando o usuário não existe', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.validateUserById('inexistente')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lança UnauthorizedException quando o usuário não está ACTIVE', async () => {
      usersRepository.findById.mockResolvedValue({ ...baseUser, status: UserStatus.SUSPENDED });

      await expect(service.validateUserById(baseUser.id)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
