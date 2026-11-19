import { Injectable, OnDestroy, signal } from '@angular/core';
import { Client, type IMessage } from '@stomp/stompjs';

import type { EditorChatMessage, EditorEvent } from './editor.models';

@Injectable({ providedIn: 'root' })
export class EditorWsService implements OnDestroy {
  private client: Client | null = null;
  private connectedProjectId: string | null = null;

  public chatMessages = signal<EditorChatMessage[]>([]);
  public events = signal<EditorEvent[]>([]);
  public connectionStatus = signal<'connected' | 'disconnected' | 'connecting'>('connecting');

  connect(projectId: string): void {
    this.connectedProjectId = projectId;
    this.chatMessages.set([]);
    this.events.set([]);

    if (!this.client) {
      this.client = new Client({
        brokerURL: 'ws://localhost:3000/stomp',
        reconnectDelay: 5000,
        onConnect: () => {
          this.connectionStatus.set('connected');
          const pid = this.connectedProjectId;
          if (!pid) return;
          this.client!.subscribe(`/topic/editor/project/${pid}/chat`, (message: IMessage) => {
            this.chatMessages.update((prev) => [...prev, JSON.parse(message.body) as EditorChatMessage]);
          });
          this.client!.subscribe(`/topic/editor/project/${pid}/events`, (message: IMessage) => {
            this.events.update((prev) => [...prev, JSON.parse(message.body) as EditorEvent]);
          });
        },
        onDisconnect: () => this.connectionStatus.set('disconnected'),
        onWebSocketClose: () => this.connectionStatus.set('disconnected'),
        onStompError: (frame) => console.error('STOMP error:', frame.headers['message']),
      });
      this.client.activate();
    } else if (this.client.connected) {
      // Already connected: re-subscribe for the new project by reactivating subscriptions.
      this.client.deactivate().then(() => this.client!.activate());
    }
  }

  ngOnDestroy(): void {
    this.client?.deactivate();
  }

  sendChat(text: string, author: string): void {
    if (!this.connectedProjectId) return;
    this.client?.publish({
      destination: '/app/editor/chat',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: this.connectedProjectId, author, text }),
    });
  }
}
