import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { EditorApiService } from './editor-api.service';
import { AssetComment, EditorAsset, ProjectPayload } from './editor.models';

@Component({
  selector: 'app-review-page',
  imports: [DatePipe, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white border-b border-gray-200 px-6 py-4">
        <h1 class="text-xl font-bold text-gray-800">{{ payload()?.project?.name ?? 'Review' }}</h1>
        <p class="text-xs text-gray-500">Shared review link — read-only project view</p>
      </header>

      @if (error()) {
        <div class="max-w-3xl mx-auto p-10 text-center text-rose-600">{{ error() }}</div>
      } @else if (payload(); as p) {
        <main class="max-w-6xl mx-auto p-6">
          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            @for (asset of p.assets; track asset.id) {
              <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm cursor-pointer hover:border-blue-300"
                (click)="select(asset)">
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
              </div>
            } @empty {
              <div class="col-span-full text-center text-gray-400 text-sm py-16">No assets in this project yet.</div>
            }
          </div>
        </main>

        <!-- Asset review modal -->
        @if (selected(); as asset) {
          <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" (click)="selected.set(null)">
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" (click)="$event.stopPropagation()">
              <div class="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <h2 class="font-semibold text-gray-800">{{ asset.name }}</h2>
                  <p class="text-xs text-gray-500">{{ asset.versions.length }} version(s)</p>
                </div>
                <button (click)="selected.set(null)" class="text-gray-400 hover:text-gray-600 text-xl px-2">&times;</button>
              </div>

              <div class="flex items-center gap-2 px-5 py-2 border-b border-gray-100">
                <select class="border rounded px-2 py-1 text-xs" [ngModel]="versionId()" (ngModelChange)="versionId.set($event)">
                  @for (v of asset.versions; track v.id) {
                    <option [ngValue]="v.id">v{{ v.version_number }} — {{ v.status }}</option>
                  }
                </select>
                @if (currentVersion(); as v) {
                  <span class="text-[10px] px-2 py-0.5 rounded-full"
                    [class.bg-emerald-100]="v.status === 'approved'"
                    [class.text-emerald-700]="v.status === 'approved'"
                    [class.bg-rose-100]="v.status === 'rejected'"
                    [class.text-rose-700]="v.status === 'rejected'"
                    [class.bg-amber-100]="v.status === 'pending'"
                    [class.text-amber-700]="v.status === 'pending'">
                    {{ v.status }}
                  </span>
                }
              </div>

              <div class="flex-1 overflow-auto bg-gray-100 p-6 min-h-48">
                @if (currentVersion(); as v) {
                  @if (v.mime_type.startsWith('image/')) {
                    <img [src]="api.fileUrl(v.url)" class="max-w-full max-h-[50vh] mx-auto rounded-lg shadow" />
                  } @else if (v.mime_type.startsWith('video/')) {
                    <video [src]="api.fileUrl(v.url)" controls class="max-w-full max-h-[50vh] mx-auto rounded-lg shadow"></video>
                  } @else {
                    <div class="text-center text-gray-500 py-10">
                      <a [href]="api.fileUrl(v.url)" target="_blank" class="text-blue-600 hover:underline">{{ v.original_name }}</a>
                    </div>
                  }
                }
              </div>

              <div class="border-t p-4 max-h-48 overflow-y-auto">
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
                  <input type="text" [(ngModel)]="reviewerName" placeholder="Your name" class="w-32 px-2 py-1.5 border border-gray-300 rounded text-xs" />
                  <input type="text" [(ngModel)]="commentText" placeholder="Leave feedback..."
                    class="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
                    (keydown.enter)="addComment()" />
                  <button (click)="addComment()" [disabled]="!commentText.trim()"
                    class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg">Post</button>
                </div>
              </div>
            </div>
          </div>
        }
      } @else {
        <div class="p-10 text-center text-gray-400 text-sm">Loading...</div>
      }
    </div>
  `,
})
export class ReviewPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  api = inject(EditorApiService);

  payload = signal<ProjectPayload | null>(null);
  error = signal<string | null>(null);
  selected = signal<EditorAsset | null>(null);
  versionId = signal<string>('');
  comments = signal<AssetComment[]>([]);
  commentText = '';
  reviewerName = 'Reviewer_' + Math.floor(Math.random() * 1000);

  currentVersion() {
    const asset = this.selected();
    if (!asset) return null;
    return asset.versions.find((v) => v.id === this.versionId()) ?? asset.versions.at(-1) ?? null;
  }

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token')!;
    try {
      this.payload.set(await this.api.reviewByToken(token));
    } catch {
      this.error.set('This review link is invalid or has expired.');
    }
  }

  async select(asset: EditorAsset): Promise<void> {
    this.selected.set(asset);
    this.versionId.set(asset.latestVersionId ?? asset.versions.at(-1)?.id ?? '');
    this.comments.set(await this.api.comments(asset.id));
  }

  latest(asset: EditorAsset) {
    return asset.versions.at(-1) ?? null;
  }

  assetStatus(asset: EditorAsset): string {
    return this.latest(asset)?.status ?? 'pending';
  }

  async addComment(): Promise<void> {
    const asset = this.selected();
    const text = this.commentText.trim();
    if (!asset || !text) return;
    await this.api.addComment(asset.id, text, this.reviewerName, this.versionId() || null);
    this.commentText = '';
    this.comments.set(await this.api.comments(asset.id));
  }
}
