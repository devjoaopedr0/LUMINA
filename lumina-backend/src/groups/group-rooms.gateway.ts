import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../database/prisma.service';
import { GroupRoomEvents } from './group-room-events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roomKey = (groupId: string) => `group:${groupId}`;

/**
 * Tempo real das salas (Socket.IO próprio, decidido em 14/11/2026).
 *
 * O socket só avisa "as salas deste grupo mudaram"; o app busca o estado por
 * HTTP, onde ficam as regras de privacidade. Assim nenhum dado pessoal passa
 * pelo socket. Conexão exige o mesmo access token do app (handshake
 * `auth.token`), e só membro ativo acompanha um grupo.
 *
 * Com mais de uma instância do backend, trocar para o adaptador Redis.
 */
@WebSocketGateway({ namespace: '/groups' })
export class GroupRoomsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: Namespace;
  private readonly logger = new Logger(GroupRoomsGateway.name);
  private readonly jwt: JwtService;
  private unsubscribe: (() => void) | null = null;

  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly events: GroupRoomEvents,
  ) {
    this.jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') });
  }

  afterInit() {
    this.unsubscribe = this.events.subscribe((groupId) => {
      this.server.to(roomKey(groupId)).emit('rooms:changed', { groupId });
    });
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  handleConnection(client: Socket) {
    // O cliente recebe "connect" antes de esta validação (assíncrona) terminar
    // e pode pedir para acompanhar um grupo na sequência: as mensagens
    // esperam esta promessa em vez de ler um userId ainda vazio.
    client.data.auth = this.authenticate(client);
    return client.data.auth;
  }

  private async authenticate(client: Socket): Promise<string | null> {
    try {
      const token = typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : '';
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.auth.validateUserById(payload.sub, payload.sessionVersion, payload.sessionId);
      return user.id;
    } catch {
      client.emit('auth:error', { message: 'Sessão inválida.' });
      client.disconnect(true);
      return null;
    }
  }

  @SubscribeMessage('group:watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: { groupId?: unknown }) {
    const userId = (await (client.data.auth as Promise<string | null> | undefined)) ?? null;
    const groupId = typeof body?.groupId === 'string' ? body.groupId : '';
    if (!userId || !UUID.test(groupId)) return { ok: false };
    const member = await this.prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true },
    });
    if (member?.status !== 'ACTIVE') return { ok: false };
    // Um grupo por vez por conexão: troca de grupo sai do anterior.
    for (const room of client.rooms) if (room.startsWith('group:')) await client.leave(room);
    await client.join(roomKey(groupId));
    return { ok: true };
  }

  @SubscribeMessage('group:unwatch')
  async unwatch(@ConnectedSocket() client: Socket) {
    for (const room of client.rooms) if (room.startsWith('group:')) await client.leave(room);
    return { ok: true };
  }
}
