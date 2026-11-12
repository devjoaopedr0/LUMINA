import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { Prisma, UserStatus, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserWithProfile, UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { InstitutionsService } from '../institutions/institutions.service';
import { FoundersService } from '../plans/founders.service';
import { EmailVerificationCodeRepository } from './email-verification-codes.repository';
import { GoogleProfile } from './interfaces/google-profile.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordResetTokenRepository } from './password-reset-tokens.repository';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // 12 é um passo acima do default histórico do bcrypt (10) — mais custoso
  // para ataques de força bruta offline, ainda rápido o suficiente (~200ms)
  // para não impactar UX de login em hardware atual.
  private static readonly BCRYPT_SALT_ROUNDS = 12;

  // Validade do token de redefinição de senha enviado por e-mail.
  private static readonly PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

  // Validade do código de verificação de e-mail enviado após o cadastro.
  private static readonly EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;

  // Hash "de mentira" usado quando o e-mail não existe, para que o tempo de
  // resposta do login não revele se um e-mail está ou não cadastrado
  // (bcrypt.compare sempre roda, com hash real ou este).
  private readonly dummyPasswordHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordResetTokensRepository: PasswordResetTokenRepository,
    private readonly emailVerificationCodesRepository: EmailVerificationCodeRepository,
    private readonly mailerService: MailerService,
    // Opcional: os testes que montam o AuthService à mão não precisam dele.
    @Optional() private readonly foundersService?: FoundersService,
  ) {
    this.dummyPasswordHash = bcrypt.hashSync(
      'lumina-timing-safety-placeholder',
      AuthService.BCRYPT_SALT_ROUNDS,
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const accountType = dto.accountType ?? 'STUDENT_INDEPENDENT';
    if (dto.institution && (dto.accountType || dto.teacherSubject)) {
      throw new BadRequestException('O cadastro institucional não pode ser combinado com outro tipo de conta.');
    }
    if (accountType === 'TEACHER' && !dto.teacherSubject) {
      throw new BadRequestException('A matéria é obrigatória para contas de professor.');
    }
    if (accountType !== 'TEACHER' && dto.teacherSubject) {
      throw new BadRequestException('A matéria só pode ser informada em contas de professor.');
    }
    const existingEmail = await this.usersRepository.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const existingUsername = await this.usersRepository.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException('Este nome de usuário já está em uso.');
    }

    const passwordHash = await bcrypt.hash(dto.password, AuthService.BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await this.usersRepository.createWithProfile(
        {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          username: dto.username,
          teacherSubject: dto.teacherSubject,
          accountType: dto.institution ? 'DIRECTOR' : accountType,
        },
        tx,
      );

      await this.createPersonalWorkspace(tx, createdUser.id, dto.firstName);
      if (dto.institution) await InstitutionsService.createInTransaction(tx, createdUser.id, dto.institution);

      return createdUser;
    });

    // A conta nasce com emailVerified=false; o código confirma o e-mail na
    // sequência. O envio é feito fora da transação e não derruba o cadastro
    // se falhar — a pessoa pode pedir um novo código na tela de confirmação.
    await this.issueVerificationCode(user.id);
    // Benefício de fundador (alunos independentes, enquanto houver vaga).
    // Fora da transação e sem derrubar o cadastro se falhar.
    await this.foundersService?.claimForNewUser(user.id);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersRepository.findByEmail(dto.email);

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Esta conta não está ativa. Entre em contato com o suporte.');
    }

    await this.usersRepository.updateLastLogin(user.id);
    const refreshed = await this.usersRepository.findById(user.id);

    return this.buildAuthResponse(refreshed as UserWithProfile);
  }

  /** Usado pelo JwtStrategy a cada requisição autenticada — garante que o
   * usuário ainda existe e continua ACTIVE, mesmo que o access token em si
   * ainda seja válido (ex: conta suspensa após o token ter sido emitido). */
  async validateUserById(userId: string, sessionVersion?: number, sessionId?: string): Promise<UserWithProfile & { authSessionId?: string }> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    if ((sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) throw new UnauthorizedException('Sessão encerrada. Faça login novamente.');
    if (sessionId) {
      const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
      if (!session) throw new UnauthorizedException('Sessão encerrada. Faça login novamente.');
    }
    return { ...user, authSessionId: sessionId };
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }),
      this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.authSession.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    return sessions.map(({ id, createdAt, lastUsedAt }) => ({ id, createdAt, lastUsedAt, current: id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Troca um refresh token válido por um novo par de tokens. O access token
   * dura pouco (JWT_EXPIRES_IN, ex: 15min) de propósito — é este endpoint
   * que permite a sessão continuar sem pedir login de novo a cada expiração.
   * Reemite também um novo refresh token (rotação): como não há uma tabela
   * de refresh tokens revogados, isto NÃO impede reuso do token antigo antes
   * dele expirar por conta própria — é só JWT stateless, igual ao access
   * token. Uma denylist/rotação com revogação de verdade fica para uma
   * iteração futura, se for necessário. */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await this.validateUserById(payload.sub, payload.sessionVersion, payload.sessionId);
    return this.buildAuthResponse(user, payload.sessionId);
  }

  /** Chamado pelo GoogleStrategy com os dados já extraídos do perfil do
   * Google. Resolve para um User existente (por google_id, ou por e-mail —
   * vinculando a conta local já existente, já que o Google garante que o
   * e-mail é verificado) ou cria uma conta nova com os campos preenchidos
   * automaticamente a partir do perfil. Contas criadas assim nascem sem
   * senha local (ver hasPassword em UserResponseDto / POST /auth/set-password). */
  async validateGoogleUser(profile: GoogleProfile): Promise<UserWithProfile> {
    const existingByGoogleId = await this.usersRepository.findByGoogleId(profile.googleId);
    if (existingByGoogleId) return existingByGoogleId;

    const existingByEmail = await this.usersRepository.findByEmail(profile.email);
    if (existingByEmail) {
      await this.usersRepository.linkGoogleId(existingByEmail.id, profile.googleId);
      return { ...existingByEmail, googleId: profile.googleId };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const createdUser = await this.usersRepository.createFromGoogle(
        {
          email: profile.email,
          googleId: profile.googleId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatarUrl: profile.avatarUrl,
        },
        tx,
      );

      await this.createPersonalWorkspace(tx, createdUser.id, profile.firstName);

      return createdUser;
    });
    await this.foundersService?.claimForNewUser(created.id);
    return created;
  }

  /** Último passo do fluxo OAuth: mesmas checagens/efeitos do login comum
   * (status ACTIVE, last_login, tokens), a partir do User já resolvido por
   * validateGoogleUser. */
  async finishOAuthLogin(user: UserWithProfile): Promise<AuthResponseDto> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Esta conta não está ativa. Entre em contato com o suporte.');
    }

    await this.usersRepository.updateLastLogin(user.id);
    const refreshed = await this.usersRepository.findById(user.id);

    return this.buildAuthResponse(refreshed as UserWithProfile);
  }

  /** Define a senha local de uma conta que ainda não tem uma — o caso de
   * uso é o usuário que se cadastrou via Google e, na sequência, é
   * convidado a criar uma senha. Não é um "trocar senha": se já existir
   * password_hash, recusa (isso é uma funcionalidade futura separada, que
   * exigiria confirmar a senha atual). */
  async setPassword(userId: string, newPassword: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.passwordHash !== null) {
      throw new ConflictException(
        'Esta conta já tem uma senha definida. Troca de senha ainda não está disponível.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, AuthService.BCRYPT_SALT_ROUNDS);
    await this.usersRepository.updatePasswordHash(userId, passwordHash);
    const updated = await this.usersRepository.findById(userId);

    return this.usersService.toPublicUser(updated as UserWithProfile);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user?.passwordHash) {
      throw new BadRequestException('Esta conta ainda não possui uma senha local.');
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('A senha atual está incorreta.');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('A nova senha deve ser diferente da senha atual.');
    }
    const passwordHash = await bcrypt.hash(newPassword, AuthService.BCRYPT_SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
      this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  /** Confirma o e-mail de uma conta recém-cadastrada com o código recebido
   * por e-mail. Idempotente para quem já confirmou: se a conta já está
   * verificada, apenas retorna o usuário atual (sem tocar no banco). */
  async verifyEmail(userId: string, code: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.emailVerified) {
      return this.usersService.toPublicUser(user);
    }

    const record = await this.emailVerificationCodesRepository.findValidByCodeHash(
      this.hashSecret(code),
    );
    if (!record || record.userId !== user.id) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    await this.emailVerificationCodesRepository.markUsed(record.id);
    await this.usersRepository.markEmailVerified(user.id);
    const updated = await this.usersRepository.findById(user.id);

    return this.usersService.toPublicUser(updated as UserWithProfile);
  }

  /** Reenvia o código de verificação (invalida o anterior). Usado quando o
   * e-mail do cadastro se perdeu ou o código expirou. */
  async resendVerificationCode(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.emailVerified) {
      return;
    }

    await this.issueVerificationCode(user.id);
  }

  /** Gera, persiste (SÓ o SHA-256) e envia um código de verificação de
   * 6 dígitos para o usuário. Substitui qualquer código anterior. */
  private async issueVerificationCode(userId: string): Promise<void> {
    const code = randomInt(100_000, 1_000_000).toString();

    await this.emailVerificationCodesRepository.invalidateForUser(userId);
    await this.emailVerificationCodesRepository.create({
      userId,
      codeHash: this.hashSecret(code),
      expiresAt: new Date(Date.now() + AuthService.EMAIL_VERIFICATION_TTL_MS),
    });

    const user = await this.usersRepository.findById(userId);
    if (!user) return;

    try {
      await this.mailerService.sendVerificationCodeEmail(user.email, code);
    } catch (error) {
      this.logger.error(
        `Falha ao enviar código de verificação para ${user.email}`,
        error,
      );
    }
  }

  /** Pedido de redefinição de senha. A resposta é sempre a mesma (sucesso)
   * mesmo quando o e-mail não existe, pra não revelar quais e-mails estão
   * cadastrados — a checagem de existência aqui é só pra saber se há o que
   * fazer. Tokens anteriores do usuário são invalidados no novo pedido. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      this.logger.warn(
        `requestPasswordReset para e-mail não cadastrado (${email}) — resposta mantida neutra.`,
      );
      return;
    }

    await this.passwordResetTokensRepository.invalidateForUser(user.id);

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashSecret(token);

    await this.passwordResetTokensRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + AuthService.PASSWORD_RESET_TTL_MS),
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5174';
    const resetUrl = new URL('/redefinir-senha', frontendUrl);
    resetUrl.searchParams.set('token', token);

    try {
      await this.mailerService.sendPasswordResetEmail(user.email, resetUrl.toString());
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail de redefinição de senha para ${user.email}`, error);
    }
  }

  /** Troca a senha usando o token recebido por e-mail. O token é comparado
   * pelo SHA-256 (nunca armazenado cru) e só vale uma vez, dentro de 30 min. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.passwordResetTokensRepository.findValidByTokenHash(
      this.hashSecret(token),
    );
    if (!record) {
      throw new UnauthorizedException('Link de redefinição inválido ou expirado.');
    }

    await this.passwordResetTokensRepository.markUsed(record.id);

    const passwordHash = await bcrypt.hash(newPassword, AuthService.BCRYPT_SALT_ROUNDS);
    await this.usersRepository.updatePasswordHash(record.userId, passwordHash);
  }

  private hashSecret(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Cria o Workspace pessoal + cargo de sistema "Owner" + vínculo do
   * usuário, dentro da mesma transação do registro. Turmas/instituições
   * ficam fora do escopo desta etapa — aqui só o necessário para o usuário
   * ter um Workspace PERSONAL funcional desde o primeiro login. */
  private async createPersonalWorkspace(
    tx: Prisma.TransactionClient,
    userId: string,
    firstName: string,
  ): Promise<void> {
    const workspace = await tx.workspace.create({
      data: {
        name: `Workspace de ${firstName}`,
        type: WorkspaceType.PERSONAL,
      },
    });

    const ownerRole = await tx.role.create({
      data: {
        workspaceId: workspace.id,
        name: 'Owner',
        description: 'Cargo padrão do dono do workspace pessoal.',
        isSystem: true,
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        roleId: ownerRole.id,
      },
    });
  }

  private async buildAuthResponse(user: UserWithProfile, existingSessionId?: string): Promise<AuthResponseDto> {
    const session = existingSessionId
      ? await this.prisma.authSession.update({ where: { id: existingSessionId }, data: { lastUsedAt: new Date() } })
      : await this.prisma.authSession.create({ data: { userId: user.id } });
    const payload: JwtPayload = { sub: user.id, email: user.email, sessionVersion: user.sessionVersion, sessionId: session.id };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      // ver comentário equivalente em auth.module.ts sobre este cast.
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') as any,
    });

    return {
      accessToken,
      refreshToken,
      user: this.usersService.toPublicUser(user),
    };
  }
}
