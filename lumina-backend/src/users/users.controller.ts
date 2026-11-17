import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserWithProfile } from './users.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';
import { AcceptTermsDto } from './dto/accept-terms.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/profile')
  @ApiOperation({ summary: 'Retorna o perfil do usuário autenticado.' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  getProfile(@CurrentUser() user: UserWithProfile): UserResponseDto {
    return this.usersService.toPublicUser(user);
  }

  @Post('me/accept-terms')
  @ApiOperation({ summary: 'Registra o aceite da versão vigente dos Termos de Uso e da Política de Privacidade.' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  acceptTerms(@CurrentUser() user: UserWithProfile, @Body() dto: AcceptTermsDto): Promise<UserResponseDto> {
    return this.usersService.acceptTerms(user.id, dto.version);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Atualiza os dados públicos do perfil autenticado.' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 409, description: 'Username já está em uso.' })
  updateProfile(
    @CurrentUser() user: UserWithProfile,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(user.id, dto);
  }
}
