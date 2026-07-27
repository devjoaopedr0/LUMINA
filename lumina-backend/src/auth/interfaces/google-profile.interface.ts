/** Dados já normalizados a partir do perfil retornado pelo Google (ver
 * GoogleStrategy.validate) — é o que AuthService.validateGoogleUser recebe,
 * sem depender diretamente do formato bruto do passport-google-oauth20. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}
