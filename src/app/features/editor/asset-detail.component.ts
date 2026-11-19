import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { EditorApiService } from './editor-api.service';
import { EditorWsService } from './editor-ws.service';
import { AssetComment, AssetVersion, EditorAsset } from './editor.models';

@Component({
  selector: 'app-version-preview',
  template: `
    @if (version(); as v) {
      @if (v.mime_type.startsWith('image/')) {
        <img [src]="fileUrl()(v.url)" [alt]="v.original_name" class="max-w-full max-h-[28rem] mx-auto rounded-lg shadow" />
      } @else if (v.mime_type.startsWith('video/')) {
        <video [src]="fileUrl()(v.url)" controls class="max-w-full max-h-[28rem] mx-auto rounded-lg shadow"></video>
      } @else {
        <div class="flex flex-col items-center justify-center h-48 text-gray-500">
          <span class="text-4xl mb-2">&#128196;</span>
          <a [href]="fileUrl()(v.url)" target="_blank" class="text-blue-600 hover:underline text-sm">{{ v.original_name }}</a>
        </div>
      }
    }
  `,
})
class PreviewComponent {
  version = input<AssetVersion | null>(null);
  fileUrl = input.required<(url: string) => string>();
}

@Component({
  selector: 'app-asset-detail',
  imports: [DatePipe, FormsModule, PreviewComponent],
  template: `
    <div class="flex flex-col h-full">
      <div class="flex items-start justify-between gap-3 p-4 border-b border-gray-200">
        <div class="min-w-0">
          <h2 class="font-semibold text-gray-800 truncate">{{ asset().name }}</h2>
          <p class="text-xs text-gray-500">{{ asset().versions.length }} version(s)</p>
        </div>
        <button (click)="closed.emit()" class="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">&times;</button>
      </div>

      <!-- Version bar -->
      <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-100 text-sm">
        @if (compareMode()) {
          <select class="border rounded px-2 py-1 text-xs" [ngModel]="compareA()" (ngModelChange)="compareA.set($event)">
            @for (v of asset().versions; track v.id) {
              <option [ngValue]="v.id">v{{ v.version_number }}</option>
            }
          </select>
          <span class="text-gray-400">vs</span>
          <select class="border rounded px-2 py-1 text-xs" [ngModel]="compareB()" (ngModelChange)="compareB.set($event)">
            @for (v of asset().versions; track v.id) {
              <option [ngValue]="v.id">v{{ v.version_number }}</option>
            }
          </select>
        } @else {
          <select class="border rounded px-2 py-1 text-xs" [ngModel]="selectedVersionId()" (ngModelChange)="selectedVersionId.set($event)">
            @for (v of asset().versions; track v.id) {
              <option [ngValue]="v.id">v{{ v.version_number }} — {{ v.original_name }}</option>
            }
          </select>
        }
        @if (asset().versions.length > 1) {
          <button (click)="toggleCompare()" class="text-xs text-blue-600 hover:underline">
            {{ compareMode() ? 'Single view' : 'Compare' }}
          </button>
        }
        <div class="flex-1"></div>
        <label class="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer">
          Upload new version
          <input type="file" class="hidden" (change)="onFile($event)" />
        </label>
      </div>

      <!-- Preview -->
      <div class="flex-1 overflow-auto bg-gray-100 p-4 min-h-48">
        @if (compareMode()) {
          <div class="grid grid-cols-2 gap-3 h-full">
            @for (vid of [compareA(), compareB()]; track vid) {
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">v{{ versionById(vid)?.version_number }}</span>
                <app-version-preview [version]="versionById(vid) ?? null" [fileUrl]="api.fileUrl.bind(api)" />
              </div>
            }
          </div>
        } @else if (selectedVersion(); as v) {
          <app-version-preview [version]="v" [fileUrl]="api.fileUrl.bind(api)" />
          <div class="mt-3 flex items-center gap-2 text-xs">
            <span class="px-2 py-0.5 rounded-full font-medium"
              [class.bg-emerald-100]="v.status === 'approved'"
              [class.text-emerald-700]="v.status === 'approved'"
              [class.bg-rose-100]="v.status === 'rejected'"
              [class.text-rose-700]="v.status === 'rejected'"
              [class.bg-amber-100]="v.status === 'pending'"
              [class.text-amber-700]="v.status === 'pending'">
              {{ v.status }}
            </span>
            <span class="text-gray-500">by {{ v.author || 'unknown' }} &middot; {{ v.created_at | date:'medium' }}</span>
            <div class="flex-1"></div>
            @if (v.status !== 'approved') {
              <button (click)="setStatus(v.id, 'approved')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">Approve</button>
            }
            @if (v.status !== 'rejected') {
              <button (click)="setStatus(v.id, 'rejected')" class="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg">Reject</button>
            }
            @if (v.status !== 'pending') {
              <button (click)="setStatus(v.id, 'pending')" class="px-3 py-1 border border-gray-300 hover:bg-gray-50 rounded-lg">Reset</button>
            }
          </div>
        }
      </div>

      <!-- Comments -->
      <div class="border-t border-gray-200 p-4 max-h-64 overflow-y-auto">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Comments ({{ comments().length }})</h3>
        <div class="space-y-2 mb-3">
          @for (c of comments(); track c.id) {
            <div class="text-sm">
              <span class="font-medium text-gray-800">{{ c.author }}</span>
              <span class="text-xs text-gray-400 ml-2">{{ c.created_at | date:'short' }}</span>
              <p class="text-gray-600">{{ c.text }}</p>
            </div>
          } @empty {
            <p class="text-xs text-gray-400">No comments yet.</p>
          }
        </div>
        <div class="flex gap-2">
          <input type="text" placeholder="Add a comment..." [(ngModel)]="commentText"
            class="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            (keydown.enter)="addComment()" />
          <button (click)="addComment()" [disabled]="!commentText.trim()"
            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg">Post</button>
        </div>
      </div>
    </div>
  `,
})
export class AssetDetailComponent {
  asset = input.required<EditorAsset>();
  author = input.required<string>();
  changed = output<void>();
  closed = output<void>();

  api = inject(EditorApiService);
  private ws = inject(EditorWsService);

  comments = signal<AssetComment[]>([]);
  commentText = '';
  selectedVersionId = signal<string>('');
  compareMode = signal(false);
  compareA = signal<string>('');
  compareB = signal<string>('');

  selectedVersion = computed<AssetVersion | undefined>(() =>
    this.asset().versions.find((v) => v.id === this.selectedVersionId()),
  );

  constructor() {
    // Default to latest version whenever the asset changes
    effect(() => {
      const versions = this.asset().versions;
      const latest = versions.at(-1);
      if (latest && this.selectedVersionId() !== latest.id) {
        this.selectedVersionId.set(latest.id);
        this.compareA.set(latest.id);
        this.compareB.set(versions.at(-2)?.id ?? latest.id);
      }
    });

    // Live comment updates for this asset
    effect(() => {
      const events = this.ws.events();
      const last = events.at(-1);
      if (last?.type === 'comments-changed' && last.assetId === this.asset().id) {
        void this.loadComments();
      }
    });

    effect(() => {
      this.asset().id;
      void this.loadComments();
    });
  }

  versionById(id: string): AssetVersion | undefined {
    return this.asset().versions.find((v) => v.id === id);
  }

  toggleCompare(): void {
    this.compareMode.update((v) => !v);
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.api.uploadVersion(this.asset().id, file, this.author());
    this.changed.emit();
    input.value = '';
  }

  async setStatus(versionId: string, status: 'approved' | 'rejected' | 'pending'): Promise<void> {
    await this.api.reviewVersion(versionId, status);
    this.changed.emit();
  }

  async addComment(): Promise<void> {
    const text = this.commentText.trim();
    if (!text) return;
    await this.api.addComment(this.asset().id, text, this.author(), this.selectedVersionId() || null);
    this.commentText = '';
    void this.loadComments();
  }

  private async loadComments(): Promise<void> {
    this.comments.set(await this.api.comments(this.asset().id));
  }
}
