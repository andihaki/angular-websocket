import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  signal,
  afterNextRender,
  Injector,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WebsocketService } from '../../websocket.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent {
  public wsService = inject(WebsocketService);
  private injector = inject(Injector);

  @ViewChild('messageList') messageList?: ElementRef<HTMLDivElement>;

  inputText = signal('');
  senderName = signal('User_' + Math.floor(Math.random() * 1000));

  constructor() {
    effect(() => {
      // Track messages updates
      this.wsService.messages();

      afterNextRender(
        () => {
          this.scrollToBottom();
        },
        { injector: this.injector },
      );
    });
  }

  send(): void {
    const text = this.inputText().trim();
    if (text) {
      this.wsService.sendMessage(text, this.senderName());
      this.inputText.set('');
    }
  }

  private scrollToBottom(): void {
    if (this.messageList?.nativeElement) {
      const el = this.messageList.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
