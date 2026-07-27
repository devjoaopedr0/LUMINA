import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Registra o JwtService com o secret/expiração do ACCESS token. O
    // refresh token usa um secret e expiração diferentes, passados
    // explicitamente na chamada de sign() dentro do AuthService.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // `expiresIn` é tipado como um template-literal ("15m", "7d", ...)
        // vindo do pacote `ms`; um valor de env é sempre `string` em tempo
        // de compilação, daí o cast — o formato real é validado em runtime
        // por env.validation.ts / pela própria lib ao assinar o token.
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
