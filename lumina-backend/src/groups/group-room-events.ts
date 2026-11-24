import { Injectable } from '@nestjs/common';

/** O que mudou: as salas ou a conversa (chat e avisos) do grupo. */
export type GroupChangeKind = 'rooms' | 'chat';
type Listener = (groupId: string, kind: GroupChangeKind) => void;

/** Avisa quem está olhando um grupo que as salas dele mudaram. O gateway do
 * Socket.IO assina; o serviço das salas só emite. O cliente busca o estado
 * de novo por HTTP — assim as regras de privacidade ficam num lugar só. */
@Injectable()
export class GroupRoomEvents {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(groupId: string, kind: GroupChangeKind = 'rooms'): void {
    for (const listener of this.listeners) listener(groupId, kind);
  }
}
