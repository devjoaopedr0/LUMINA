import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') as string,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') as string,
      scope: ['email', 'profile'],
    });
  }

  /** Passport já trocou o "code" do Google pelo profile aqui — não lidamos
   * com o handshake OAuth manualmente. `profile` é o retorno da Google
   * People API para o escopo email+profile. */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('O Google não retornou um e-mail para esta conta.'), false);
      return;
    }

    const user = await this.authService.validateGoogleUser({
      googleId: profile.id,
      email,
      firstName: profile.name?.givenName || profile.displayName || 'Usuário',
      lastName: profile.name?.familyName || '',
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });

    done(null, user);
  }
}
