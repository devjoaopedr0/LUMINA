import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma, UserStatus, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UserWithProfile, UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  // 12 é um passo acima do default histórico do bcrypt (10) — mais custoso
  // para ataques de força bruta offline, ainda rápido o suficiente (~200ms)
  // para não impactar UX de login em hardware atual.
  private static readonly BCRYPT_SALT_ROUNDS = 12;

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
  ) {
    this.dummyPasswordHash = bcrypt.hashSync(
      'lumina-timing-safety-placeholder',
      AuthService.BCRYPT_SALT_ROUNDS,
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
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
        },
        tx,
      );

      await this.createPersonalWorkspace(tx, createdUser.id, dto.firstName);

      return createdUser;
    });

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
  async validateUserById(userId: string): Promise<UserWithProfile> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    return user;
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

  private async buildAuthResponse(user: UserWithProfile): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

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
