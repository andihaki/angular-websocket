import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { EditorApiService } from './editor-api.service';
import { EditorProject } from './editor.models';

@Component({
  selector: 'app-editor-dashboard',
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Creative Editor</h1>
          <p class="text-xs text-gray-500">Projects, assets, review links</p>
        </div>
        <a routerLink="/" class="text-sm text-blue-600 hover:underline">&larr; Back to chat</a>
      </header>

      <main class="max-w-5xl mx-auto p-6">
        <div class="flex gap-2 mb-6">
          <input type="text" placeholder="New project name..."
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            [(ngModel)]="newName" (keydown.enter)="create()" />
          <button (click)="create()" [disabled]="!newName.trim() || creating()"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm">
            {{ creating() ? 'Creating...' : 'Create project' }}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (p of projects(); track p.id) {
            <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-3">
              <div>
                <h2 class="font-semibold text-gray-800 truncate">{{ p.name }}</h2>
                <p class="text-xs text-gray-500 mt-1">{{ p.assetCount ?? 0 }} assets &middot; {{ p.created_at | date:'mediumDate' }}</p>
              </div>
              <div class="flex items-center gap-2 mt-auto">
                <a [routerLink]="['/editor/project', p.id]"
                  class="flex-1 text-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
                  Open
                </a>
                <button (click)="copyReviewLink(p)" title="Copy review link"
                  class="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm rounded-lg">
                  {{ copiedId() === p.id ? 'Copied!' : 'Review link' }}
                </button>
              </div>
            </div>
          } @empty {
            <div class="col-span-full text-center text-gray-400 text-sm py-16">
              No projects yet. Create one to get started.
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class EditorDashboardComponent implements OnInit {
  private api = inject(EditorApiService);

  projects = signal<EditorProject[]>([]);
  newName = '';
  creating = signal(false);
  copiedId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.projects.set(await this.api.projects());
  }

  async create(): Promise<void> {
    const name = this.newName.trim();
    if (!name) return;
    this.creating.set(true);
    try {
      await this.api.createProject(name);
      this.newName = '';
      this.projects.set(await this.api.projects());
    } finally {
      this.creating.set(false);
    }
  }

  copyReviewLink(p: EditorProject): void {
    const url = `${location.origin}/editor/review/${p.review_token}`;
    navigator.clipboard.writeText(url).then(() => {
      this.copiedId.set(p.id);
      setTimeout(() => this.copiedId.set(null), 1500);
    });
  }
}
