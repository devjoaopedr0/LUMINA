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
      findByGoogleId: vi.fn(),
      createWithProfile: vi.fn(),
      createFromGoogle: vi.fn(),
      linkGoogleId: vi.fn(),
      updateLastLogin: vi.fn(),
      updatePasswordHash: vi.fn(),
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

  const googleProfile = {
    googleId: 'google-sub-123',
    email: 'ana@gmail.com',
    firstName: 'Ana',
    lastName: 'Souza',
    avatarUrl: 'https://lh3.googleusercontent.com/a/foto.jpg',
  };

  describe('validateGoogleUser', () => {
    it('retorna o usuário existente quando já está vinculado por google_id', async () => {
      const googleUser = { ...baseUser, googleId: googleProfile.googleId };
      usersRepository.findByGoogleId.mockResolvedValue(googleUser);

      const result = await service.validateGoogleUser(googleProfile);

      expect(result).toEqual(googleUser);
      expect(usersRepository.findByEmail).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('vincula uma conta local existente (mesmo e-mail) na primeira vez que loga com Google', async () => {
      usersRepository.findByGoogleId.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue(baseUser);
      usersRepository.linkGoogleId.mockResolvedValue({ ...baseUser, googleId: googleProfile.googleId });

      const result = await service.validateGoogleUser({ ...googleProfile, email: baseUser.email });

      expect(usersRepository.linkGoogleId).toHaveBeenCalledWith(baseUser.id, googleProfile.googleId);
      expect(result.googleId).toBe(googleProfile.googleId);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cria uma conta nova (sem senha) + workspace pessoal quando não existe usuário', async () => {
      usersRepository.findByGoogleId.mockResolvedValue(null);
      usersRepository.findByEmail.mockResolvedValue(null);
      const createdGoogleUser = {
        ...baseUser,
        id: 'user-2',
        email: googleProfile.email,
        passwordHash: null,
        googleId: googleProfile.googleId,
      };
      usersRepository.createFromGoogle.mockResolvedValue(createdGoogleUser);

      const result = await service.validateGoogleUser(googleProfile);

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(usersRepository.createFromGoogle).toHaveBeenCalledWith(
        expect.objectContaining({ email: googleProfile.email, googleId: googleProfile.googleId }),
        expect.anything(),
      );
      expect(result.passwordHash).toBeNull();
    });
  });

  describe('finishOAuthLogin', () => {
    it('atualiza last_login e retorna tokens para um usuário ACTIVE', async () => {
      usersRepository.updateLastLogin.mockResolvedValue(baseUser);
      usersRepository.findById.mockResolvedValue(baseUser);

      const result = await service.finishOAuthLogin(baseUser);

      expect(result.accessToken).toBe('signed-token');
      expect(usersRepository.updateLastLogin).toHaveBeenCalledWith(baseUser.id);
    });

    it('lança ForbiddenException quando a conta não está ACTIVE', async () => {
      await expect(
        service.finishOAuthLogin({ ...baseUser, status: UserStatus.SUSPENDED }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('setPassword', () => {
    it('define a senha quando a conta ainda não tem uma (ex: criada via Google)', async () => {
      const googleUser = { ...baseUser, passwordHash: null };
      usersRepository.findById
        .mockResolvedValueOnce(googleUser)
        .mockResolvedValueOnce({ ...googleUser, passwordHash: 'novo-hash' });

      const result = await service.setPassword(googleUser.id, 'NovaSenhaForte123');

      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(
        googleUser.id,
        expect.any(String),
      );
      expect(result).toEqual({ id: googleUser.id, email: googleUser.email });
    });

    it('lança ConflictException se a conta já tem senha', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);

      await expect(service.setPassword(baseUser.id, 'OutraSenha123')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('lança UnauthorizedException se o usuário não existe', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.setPassword('inexistente', 'SenhaForte123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
