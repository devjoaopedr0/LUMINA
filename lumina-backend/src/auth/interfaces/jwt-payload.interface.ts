/** Payload assinado dentro do JWT (access e refresh). `sub` é o id do usuário
 * (convenção do padrão JWT para "subject"). */
export interface JwtPayload {
  sub: string;
  email: string;
}
