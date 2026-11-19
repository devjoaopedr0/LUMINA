import { OnModuleDestroy } from '@nestjs/common';
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
import { ClassRoomEvents } from './class-room-events';
import { ClassRoomsService } from './class-rooms.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roomKey = (classId: string) => `class:${classId}`;

/**
 * Tempo real da sala da turma (namespace `/classes`). Como no Groups, o
 * socket só avisa "mudou" — o app busca o estado por HTTP, onde fica o que
 * cada papel pode ver. Só professor, coordenação ou aluno da turma acompanha.
 */
@WebSocketGateway({ namespace: '/classes' })
export class ClassRoomsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: Namespace;
  private readonly jwt: JwtService;
  private unsubscribe: (() => void) | null = null;

  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
    private readonly rooms: ClassRoomsService,
    private readonly events: ClassRoomEvents,
  ) {
    this.jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') });
  }

  afterInit() {
    this.unsubscribe = this.events.subscribe((classId) => this.server.to(roomKey(classId)).emit('class-session:changed', { classId }));
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  handleConnection(client: Socket) {
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

  @SubscribeMessage('class:watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: { classId?: unknown }) {
    const userId = (await (client.data.auth as Promise<string | null> | undefined)) ?? null;
    const classId = typeof body?.classId === 'string' ? body.classId : '';
    if (!userId || !UUID.test(classId)) return { ok: false };
    try {
      await this.rooms.roleIn(userId, classId);
    } catch {
      return { ok: false };
    }
    for (const room of client.rooms) if (room.startsWith('class:')) await client.leave(room);
    await client.join(roomKey(classId));
    return { ok: true };
  }
}
