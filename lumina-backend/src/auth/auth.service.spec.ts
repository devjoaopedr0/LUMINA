import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
  let passwordResetTokensRepository: any;
  let emailVerificationCodesRepository: any;
  let mailerService: any;
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
      markEmailVerified: vi.fn(),
    };

    usersService = {
      toPublicUser: vi.fn((u: any) => ({ id: u.id, email: u.email })),
    };

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-token'),
    };

    configService = {
      get: vi.fn((key: string) =>
        ({
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '7d',
          FRONTEND_URL: 'http://localhost:5174',
        })[key],
      ),
    };

    passwordResetTokensRepository = {
      create: vi.fn(),
      findValidByTokenHash: vi.fn(),
      invalidateForUser: vi.fn(),
      markUsed: vi.fn(),
    };

    emailVerificationCodesRepository = {
      create: vi.fn(),
      findValidByCodeHash: vi.fn(),
      invalidateForUser: vi.fn(),
      markUsed: vi.fn(),
    };

    mailerService = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendVerificationCodeEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      prisma,
      usersRepository,
      usersService,
      jwtService,
      configService,
      passwordResetTokensRepository,
      emailVerificationCodesRepository,
      mailerService,
    );
  });

  const registerDto = {
    firstName: 'Maria',
    lastName: 'Silva',
    username: 'maria.silva',
    email: 'maria@exemplo.com',
    password: 'SenhaForte123',
  };

  describe('register', () => {
    it('cria o usuário + workspace pessoal, emite código de verificação e retorna tokens', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByUsername.mockResolvedValue(null);
      usersRepository.createWithProfile.mockResolvedValue(baseUser);
      usersRepository.findById.mockResolvedValue(baseUser);

      const result = await service.register(registerDto);

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(usersRepository.createWithProfile).toHaveBeenCalledWith(
        expect.objectContaining({ email: registerDto.email, username: registerDto.username }),
        expect.anything(),
      );
      // Conta nasce sem e-mail verificado + código enviado por e-mail.
      expect(baseUser.emailVerified).toBe(false);
      expect(emailVerificationCodesRepository.invalidateForUser).toHaveBeenCalledWith(baseUser.id);
      expect(emailVerificationCodesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: baseUser.id,
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      const sentCode = mailerService.sendVerificationCodeEmail.mock.calls[0][1] as string;
      expect(sentCode).toMatch(/^\d{6}$/);
      const storedHash = emailVerificationCodesRepository.create.mock.calls[0][0].codeHash;
      expect(storedHash).not.toBe(sentCode);
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

  describe('requestPasswordReset', () => {
    it('invalida tokens anteriores, cria um novo e envia o e-mail com o link', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);
      passwordResetTokensRepository.findValidByTokenHash.mockResolvedValue(null);

      await service.requestPasswordReset(baseUser.email);

      expect(passwordResetTokensRepository.invalidateForUser).toHaveBeenCalledWith(baseUser.id);
      expect(passwordResetTokensRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: baseUser.id,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );

      const createCall = passwordResetTokensRepository.create.mock.calls[0][0];
      const sentUrl = mailerService.sendPasswordResetEmail.mock.calls[0][1] as string;
      const tokenFromUrl = new URL(sentUrl).searchParams.get('token');

      expect(mailerService.sendPasswordResetEmail).toHaveBeenCalledWith(
        baseUser.email,
        expect.stringContaining('token='),
      );
      // O token armazenado é o SHA-256 do token enviado — o token cru nunca é persistido.
      expect(tokenFromUrl).not.toBe(createCall.tokenHash);
    });

    it('não faz nada (e não envia e-mail) quando o e-mail não está cadastrado', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await service.requestPasswordReset('ninguem@exemplo.com');

      expect(passwordResetTokensRepository.invalidateForUser).not.toHaveBeenCalled();
      expect(passwordResetTokensRepository.create).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('marca o token como usado e atualiza o hash de senha', async () => {
      const record = {
        id: 'token-1',
        userId: baseUser.id,
        tokenHash: 'hash-do-token',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      };
      passwordResetTokensRepository.findValidByTokenHash.mockResolvedValue(record);

      await service.resetPassword('token-valido', 'NovaSenhaForte123');

      expect(passwordResetTokensRepository.markUsed).toHaveBeenCalledWith(record.id);
      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(
        baseUser.id,
        expect.any(String),
      );
      expect(await bcrypt.compare('NovaSenhaForte123', usersRepository.updatePasswordHash.mock.calls[0][1])).toBe(true);
    });

    it('lança UnauthorizedException para token inválido ou expirado', async () => {
      passwordResetTokensRepository.findValidByTokenHash.mockResolvedValue(null);

      await expect(service.resetPassword('token-invalido', 'NovaSenhaForte123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('marca o código como usado e verifica o e-mail do usuário', async () => {
      const record = {
        id: 'code-1',
        userId: baseUser.id,
        codeHash: 'hash-do-codigo',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      };
      usersRepository.findById.mockResolvedValueOnce(baseUser);
      emailVerificationCodesRepository.findValidByCodeHash.mockResolvedValue(record);
      usersRepository.findById.mockResolvedValueOnce({ ...baseUser, emailVerified: true });

      const result = await service.verifyEmail(baseUser.id, '123456');

      expect(emailVerificationCodesRepository.markUsed).toHaveBeenCalledWith(record.id);
      expect(usersRepository.markEmailVerified).toHaveBeenCalledWith(baseUser.id);
      expect(result).toEqual({ id: baseUser.id, email: baseUser.email });
    });

    it('lança BadRequestException para código inválido ou expirado', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);
      emailVerificationCodesRepository.findValidByCodeHash.mockResolvedValue(null);

      await expect(service.verifyEmail(baseUser.id, '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersRepository.markEmailVerified).not.toHaveBeenCalled();
    });

    it('é idempotente e não toca o banco quando o e-mail já está verificado', async () => {
      const verifiedUser = { ...baseUser, emailVerified: true };
      usersRepository.findById.mockResolvedValue(verifiedUser);

      const result = await service.verifyEmail(baseUser.id, '123456');

      expect(emailVerificationCodesRepository.findValidByCodeHash).not.toHaveBeenCalled();
      expect(usersRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(result).toEqual({ id: baseUser.id, email: baseUser.email });
    });
  });

  describe('resendVerificationCode', () => {
    it('invalida o código anterior, cria um novo e reenvia o e-mail', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);

      await service.resendVerificationCode(baseUser.id);

      expect(emailVerificationCodesRepository.invalidateForUser).toHaveBeenCalledWith(baseUser.id);
      expect(emailVerificationCodesRepository.create).toHaveBeenCalled();
      expect(mailerService.sendVerificationCodeEmail).toHaveBeenCalledWith(
        baseUser.email,
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('não faz nada quando o e-mail já está verificado', async () => {
      usersRepository.findById.mockResolvedValue({ ...baseUser, emailVerified: true });

      await service.resendVerificationCode(baseUser.id);

      expect(emailVerificationCodesRepository.invalidateForUser).not.toHaveBeenCalled();
      expect(mailerService.sendVerificationCodeEmail).not.toHaveBeenCalled();
    });
  });
});
