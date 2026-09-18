import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { UserWithProfile } from '../users/users.repository';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { redirectOAuthError } from './oauth-redirect.util';

/** Controller só recebe a requisição e delega ao AuthService — nenhuma regra
 * de negócio vive aqui. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria uma conta de usuário e seu Workspace pessoal.' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'E-mail ou username já cadastrados.' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica um usuário e retorna os tokens JWT.' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'E-mail ou senha incorretos.' })
  @ApiResponse({ status: 403, description: 'Conta inativa/suspensa.' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Troca um refresh token válido por um novo access token (e um novo refresh token).',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token ausente, inválido ou expirado.' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerra todas as sessões do usuário, incluindo a atual.' })
  logoutAll(@CurrentUser() user: UserWithProfile): Promise<void> {
    return this.authService.logoutAll(user.id);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista as sessões ativas da conta.' })
  listSessions(@CurrentUser() user: UserWithProfile & { authSessionId?: string }) {
    return this.authService.listSessions(user.id, user.authSessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerra uma sessão da conta.' })
  revokeSession(@CurrentUser() user: UserWithProfile, @Param('id') id: string): Promise<void> {
    return this.authService.revokeSession(user.id, id);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Inicia o login/cadastro com Google (redireciona para a tela de consentimento).',
  })
  googleAuth(): void {
    // Corpo vazio de propósito: o GoogleAuthGuard intercepta a requisição e
    // faz o redirect para o Google antes de qualquer código aqui rodar.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Callback do Google — não chamar diretamente pelo frontend.' })
  async googleAuthCallback(
    @CurrentUser() user: UserWithProfile,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5174';

    try {
      const auth = await this.authService.finishOAuthLogin(user);

      // Redireciona de volta pro app com os tokens na query string. O
      // frontend lê os tokens na rota de callback e limpa a URL em seguida
      // (history.replaceState) para não deixá-los no histórico do navegador.
      const redirectUrl = new URL('/oauth/callback', frontendUrl);
      redirectUrl.searchParams.set('accessToken', auth.accessToken);
      redirectUrl.searchParams.set('refreshToken', auth.refreshToken);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      redirectOAuthError(res, frontendUrl, error);
    }
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Define a senha local de uma conta criada via Google (que ainda não tem uma). Não serve para trocar senha existente.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 409, description: 'A conta já tem uma senha definida.' })
  setPassword(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: SetPasswordDto,
  ): Promise<UserResponseDto> {
    return this.authService.setPassword(user.id, dto.password);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Envia um e-mail com link de redefinição de senha. Resposta idêntica quando o e-mail não existe (não revela cadastro).',
  })
  @ApiResponse({ status: 200, description: 'Sempre 200, mesmo para e-mail não cadastrado.' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefine a senha usando o token recebido por e-mail.' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso.' })
  @ApiResponse({ status: 401, description: 'Link inválido ou expirado.' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Confirma o e-mail do usuário autenticado com o código de 6 dígitos recebido no cadastro.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Código inválido ou expirado.' })
  verifyEmail(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: VerifyEmailDto,
  ): Promise<UserResponseDto> {
    return this.authService.verifyEmail(user.id, dto.code);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reenvia o código de verificação de e-mail para o usuário autenticado.',
  })
  @ApiResponse({ status: 200, description: 'Código reenviado (ou nada se já verificado).' })
  resendVerification(@CurrentUser() user: UserWithProfile): Promise<void> {
    return this.authService.resendVerificationCode(user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna o usuário autenticado (valida o access token).' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido ou expirado.' })
  me(@CurrentUser() user: UserWithProfile): UserResponseDto {
    return this.usersService.toPublicUser(user);
  }
}
