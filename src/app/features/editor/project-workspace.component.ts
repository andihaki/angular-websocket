import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { EditorApiService } from './editor-api.service';
import { EditorWsService } from './editor-ws.service';
import { AssetDetailComponent } from './asset-detail.component';
import { EditorAsset, EditorFolder, ProjectPayload } from './editor.models';

interface FolderNode {
  folder: EditorFolder;
  depth: number;
}

@Component({
  selector: 'app-project-workspace',
  imports: [DatePipe, FormsModule, RouterLink, AssetDetailComponent],
  template: `
    <div class="h-screen flex flex-col bg-gray-50">
      <!-- Header -->
      <header class="flex items-center gap-4 px-5 py-3 bg-white border-b border-gray-200">
        <a routerLink="/editor" class="text-gray-400 hover:text-gray-600">&larr;</a>
        <h1 class="font-bold text-gray-800 truncate">{{ payload()?.project?.name ?? 'Loading...' }}</h1>
        <div class="flex-1"></div>
        <input type="text" [(ngModel)]="authorName" title="Your name"
          class="w-36 px-2 py-1 border border-gray-300 rounded text-xs" />
        <button (click)="copyReviewLink()"
          class="px-3 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 rounded-lg">
          {{ copied() ? 'Copied!' : 'Copy review link' }}
        </button>
        <span class="text-xs px-2 py-1 rounded-full"
          [class.bg-emerald-50]="ws.connectionStatus() === 'connected'"
          [class.text-emerald-700]="ws.connectionStatus() === 'connected'"
          [class.bg-amber-50]="ws.connectionStatus() !== 'connected'"
          [class.text-amber-700]="ws.connectionStatus() !== 'connected'">
          {{ ws.connectionStatus() }}
        </span>
      </header>

      <div class="flex-1 flex min-h-0">
        <!-- Folders sidebar -->
        <aside class="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div class="p-3 border-b border-gray-100">
            <button (click)="selectedFolderId.set(null)"
              class="w-full text-left px-2 py-1.5 rounded text-sm"
              [class.bg-blue-50]="selectedFolderId() === null"
              [class.text-blue-700]="selectedFolderId() === null"
              [class.font-medium]="selectedFolderId() === null">
              All assets
            </button>
            <button (click)="selectedFolderId.set('__unfiled')"
              class="w-full text-left px-2 py-1.5 rounded text-sm text-gray-600"
              [class.bg-blue-50]="selectedFolderId() === '__unfiled'">
              Uncategorized
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-2">
            @for (node of folderTree(); track node.folder.id) {
              <div class="group flex items-center rounded hover:bg-gray-50"
                [style.padding-left.px]="8 + node.depth * 14">
                <button (click)="selectedFolderId.set(node.folder.id)"
                  class="flex-1 text-left px-2 py-1.5 rounded text-sm truncate"
                  [class.bg-blue-50]="selectedFolderId() === node.folder.id"
                  [class.text-blue-700]="selectedFolderId() === node.folder.id"
                  [class.font-medium]="selectedFolderId() === node.folder.id">
                  &#128193; {{ node.folder.name }}
                </button>
                <button (click)="removeFolder(node.folder)" title="Delete folder"
                  class="hidden group-hover:block text-gray-300 hover:text-rose-500 px-1 text-xs">&times;</button>
              </div>
            }
          </div>
          <div class="p-3 border-t border-gray-100 flex gap-1">
            <input type="text" [(ngModel)]="newFolderName" placeholder="New folder"
              class="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-xs"
              (keydown.enter)="addFolder()" />
            <button (click)="addFolder()" [disabled]="!newFolderName.trim()"
              class="px-2 py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-xs rounded">+</button>
          </div>
        </aside>

        <!-- Center: grid or detail -->
        <main class="flex-1 min-w-0 flex flex-col bg-gray-50">
          @if (selectedAsset(); as asset) {
            <app-asset-detail [asset]="asset" [author]="authorName" (closed)="selectedAssetId.set(null)" (changed)="reload()" />
          } @else {
            <div class="flex items-center gap-3 px-5 py-3">
              <h2 class="text-sm font-semibold text-gray-600">
                {{ folderLabel() }} ({{ visibleAssets().length }})
              </h2>
              <div class="flex-1"></div>
              <label class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer">
                Upload asset
                <input type="file" class="hidden" (change)="onUpload($event)" />
              </label>
            </div>
            <div class="flex-1 overflow-y-auto p-5">
              <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                @for (asset of visibleAssets(); track asset.id) {
                  <div class="relative bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm group cursor-pointer hover:border-blue-300"
                    (click)="selectedAssetId.set(asset.id)">
                    <div class="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                      @if (latest(asset)?.mime_type?.startsWith('image/')) {
                        <img [src]="api.fileUrl(latest(asset)!.url)" [alt]="asset.name" class="w-full h-full object-cover" loading="lazy" />
                      } @else {
                        <span class="text-3xl text-gray-300">&#128196;</span>
                      }
                    </div>
                    <div class="p-3">
                      <p class="text-sm font-medium text-gray-800 truncate">{{ asset.name }}</p>
                      <div class="flex items-center gap-2 mt-1">
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full"
                          [class.bg-emerald-100]="assetStatus(asset) === 'approved'"
                          [class.text-emerald-700]="assetStatus(asset) === 'approved'"
                          [class.bg-rose-100]="assetStatus(asset) === 'rejected'"
                          [class.text-rose-700]="assetStatus(asset) === 'rejected'"
                          [class.bg-amber-100]="assetStatus(asset) === 'pending'"
                          [class.text-amber-700]="assetStatus(asset) === 'pending'">
                          {{ assetStatus(asset) }}
                        </span>
                        <span class="text-[10px] text-gray-400">v{{ asset.versions.length }}</span>
                      </div>
                    </div>
                    <button (click)="removeAsset(asset, $event)" title="Delete asset"
                      class="hidden group-hover:block absolute top-1 right-1 w-6 h-6 bg-black/50 hover:bg-rose-600 text-white rounded-full text-xs leading-6">&times;</button>
                  </div>
                } @empty {
                  <div class="col-span-full text-center text-gray-400 text-sm py-16">
                    No assets here. Upload one to get started.
                  </div>
                }
              </div>
            </div>
          }
        </main>

        <!-- Chat -->
        <aside class="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col">
          <div class="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Project chat</div>
          <div #chatList class="flex-1 overflow-y-auto p-3 space-y-2">
            @for (m of ws.chatMessages(); track m.id) {
              <div class="text-sm">
                <span class="font-medium text-gray-800">{{ m.author }}</span>
                <span class="text-[10px] text-gray-400 ml-1">{{ m.timestamp | date:'shortTime' }}</span>
                <p class="text-gray-600 wrap-break-word">{{ m.text }}</p>
              </div>
            } @empty {
              <p class="text-xs text-gray-400">No messages yet.</p>
            }
          </div>
          <div class="p-3 border-t border-gray-100 flex gap-2">
            <input type="text" [(ngModel)]="chatText" placeholder="Message..."
              class="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-xs"
              (keydown.enter)="sendChat()" />
            <button (click)="sendChat()" [disabled]="!chatText.trim()"
              class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded">Send</button>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class ProjectWorkspaceComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  api = inject(EditorApiService);
  ws = inject(EditorWsService);

  payload = signal<ProjectPayload | null>(null);
  selectedFolderId = signal<string | null>(null);
  selectedAssetId = signal<string | null>(null);
  newFolderName = '';
  chatText = '';
  authorName = 'User_' + Math.floor(Math.random() * 1000);
  copied = signal(false);

  selectedAsset = computed<EditorAsset | null>(() => {
    const id = this.selectedAssetId();
    return this.payload()?.assets.find((a) => a.id === id) ?? null;
  });

  folderTree = computed<FolderNode[]>(() => {
    const folders = this.payload()?.folders ?? [];
    const nodes: FolderNode[] = [];
    const walk = (parentId: string | null, depth: number) => {
      folders
        .filter((f) => f.parent_id === parentId)
        .forEach((f) => {
          nodes.push({ folder: f, depth });
          walk(f.id, depth + 1);
        });
    };
    walk(null, 0);
    return nodes;
  });

  visibleAssets = computed<EditorAsset[]>(() => {
    const assets = this.payload()?.assets ?? [];
    const fid = this.selectedFolderId();
    if (fid === null) return assets;
    if (fid === '__unfiled') return assets.filter((a) => a.folder_id === null);
    return assets.filter((a) => a.folder_id === fid);
  });

  folderLabel = computed(() => {
    const fid = this.selectedFolderId();
    if (fid === null) return 'All assets';
    if (fid === '__unfiled') return 'Uncategorized';
    return this.payload()?.folders.find((f) => f.id === fid)?.name ?? 'Folder';
  });

  constructor() {
    effect(() => {
      const events = this.ws.events();
      const last = events.at(-1);
      if (last && ['assets-changed', 'folders-changed'].includes(last.type)) {
        void this.reload();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.ws.connect(id);
    await this.reload();
  }

  ngOnDestroy(): void {
    this.ws.ngOnDestroy();
  }

  async reload(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.payload.set(await this.api.project(id));
  }

  latest(asset: EditorAsset) {
    return asset.versions.at(-1) ?? null;
  }

  assetStatus(asset: EditorAsset): string {
    return this.latest(asset)?.status ?? 'pending';
  }

  async addFolder(): Promise<void> {
    const name = this.newFolderName.trim();
    if (!name) return;
    const pid = this.payload()?.project.id;
    if (!pid) return;
    await this.api.createFolder(pid, name);
    this.newFolderName = '';
    await this.reload();
  }

  async removeFolder(folder: EditorFolder): Promise<void> {
    await this.api.deleteFolder(folder.id);
    if (this.selectedFolderId() === folder.id) this.selectedFolderId.set(null);
    await this.reload();
  }

  async onUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const pid = this.payload()?.project.id;
    if (!pid) return;
    const folderId = this.selectedFolderId();
    const target = folderId && folderId !== '__unfiled' ? folderId : null;
    this.payload.set(await this.api.uploadAsset(pid, file, file.name, target, this.authorName));
    input.value = '';
  }

  async removeAsset(asset: EditorAsset, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`Delete "${asset.name}" and all its versions?`)) return;
    await this.api.deleteAsset(asset.id);
    if (this.selectedAssetId() === asset.id) this.selectedAssetId.set(null);
    await this.reload();
  }

  sendChat(): void {
    const text = this.chatText.trim();
    if (!text) return;
    this.ws.sendChat(text, this.authorName);
    this.chatText = '';
  }

  copyReviewLink(): void {
    const token = this.payload()?.project.review_token;
    if (!token) return;
    navigator.clipboard.writeText(`${location.origin}/editor/review/${token}`).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
