import { Injectable } from '@nestjs/common';

type Listener = (classId: string) => void;

/** Avisa quem acompanha uma turma que a sala dela mudou (o gateway assina). */
@Injectable()
export class ClassRoomEvents {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(classId: string): void {
    for (const listener of this.listeners) listener(classId);
  }
}
