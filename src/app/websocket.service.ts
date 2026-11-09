import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';

import { Message } from './shared/models/message.model';

@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private socket: Socket = io('http://localhost:3000');

  public messages = signal<Message[]>([]);
  public connectionStatus = signal<'connected' | 'disconnected' | 'connecting'>('connecting');

  constructor() {
    this.socket.on('connect', () => {
      this.connectionStatus.set('connected');
    });

    this.socket.on('disconnect', () => {
      this.connectionStatus.set('disconnected');
    });

    this.socket.on('message', (msg: Message) => {
      this.messages.update((prev) => [...prev, msg]);
    });
  }

  sendMessage(text: string, sender: string): void {
    this.socket.emit('message', { text, sender });
  }
}
