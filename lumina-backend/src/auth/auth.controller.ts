import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { UserWithProfile } from '../users/users.repository';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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
    const auth = await this.authService.finishOAuthLogin(user);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    // Redireciona de volta pro app com os tokens na query string. O
    // frontend lê os tokens na rota de callback e limpa a URL em seguida
    // (history.replaceState) para não deixá-los no histórico do navegador.
    const redirectUrl = new URL('/oauth/callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', auth.accessToken);
    redirectUrl.searchParams.set('refreshToken', auth.refreshToken);
    res.redirect(redirectUrl.toString());
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
