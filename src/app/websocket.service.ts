import { Injectable, OnDestroy, signal } from '@angular/core';
import { Client } from '@stomp/stompjs';
import type { IMessage } from '@stomp/stompjs';

import { Message } from './shared/models/message.model';

@Injectable({ providedIn: 'root' })
export class WebsocketService implements OnDestroy {
  private client: Client;

  public messages = signal<Message[]>([]);
  public connectionStatus = signal<'connected' | 'disconnected' | 'connecting'>('connecting');

  constructor() {
    this.client = new Client({
      brokerURL: 'ws://localhost:3000/stomp',
      reconnectDelay: 5000,
      onConnect: () => {
        this.connectionStatus.set('connected');
        this.client.subscribe('/topic/chat', (message: IMessage) => {
          this.messages.update((prev) => [...prev, JSON.parse(message.body) as Message]);
        });
      },
      onDisconnect: () => {
        this.connectionStatus.set('disconnected');
      },
      onWebSocketClose: () => {
        this.connectionStatus.set('disconnected');
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message']);
      },
    });

    this.client.activate();
  }

  ngOnDestroy(): void {
    this.client.deactivate();
  }

  sendMessage(text: string, sender: string): void {
    this.client.publish({
      destination: '/app/chat',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, sender }),
    });
  }
}
