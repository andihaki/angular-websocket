import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import {
  AssetComment,
  EditorAsset,
  EditorFolder,
  EditorProject,
  ProjectPayload,
  VersionStatus,
} from './editor.models';

export const SERVER_ORIGIN = 'http://localhost:3000';
const API_BASE = `${SERVER_ORIGIN}/api/editor`;

@Injectable({ providedIn: 'root' })
export class EditorApiService {
  private http = inject(HttpClient);

  fileUrl(url: string): string {
    return url.startsWith('http') ? url : `${SERVER_ORIGIN}${url}`;
  }

  projects(): Promise<EditorProject[]> {
    return firstValueFrom(this.http.get<EditorProject[]>(`${API_BASE}/projects`));
  }

  createProject(name: string): Promise<EditorProject> {
    return firstValueFrom(this.http.post<EditorProject>(`${API_BASE}/projects`, { name }));
  }

  project(id: string): Promise<ProjectPayload> {
    return firstValueFrom(this.http.get<ProjectPayload>(`${API_BASE}/projects/${id}`));
  }

  createFolder(projectId: string, name: string, parentId: string | null = null): Promise<EditorFolder> {
    return firstValueFrom(this.http.post<EditorFolder>(`${API_BASE}/projects/${projectId}/folders`, { name, parentId }));
  }

  deleteFolder(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE}/folders/${id}`));
  }

  uploadAsset(projectId: string, file: File, name: string, folderId: string | null, author: string): Promise<ProjectPayload> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    if (folderId) form.append('folderId', folderId);
    if (author) form.append('author', author);
    return firstValueFrom(this.http.post<ProjectPayload>(`${API_BASE}/projects/${projectId}/assets`, form));
  }

  uploadVersion(assetId: string, file: File, author: string): Promise<ProjectPayload> {
    const form = new FormData();
    form.append('file', file);
    if (author) form.append('author', author);
    return firstValueFrom(this.http.post<ProjectPayload>(`${API_BASE}/assets/${assetId}/versions`, form));
  }

  deleteAsset(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE}/assets/${id}`));
  }

  reviewVersion(versionId: string, status: VersionStatus): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API_BASE}/versions/${versionId}/review`, { status }));
  }

  comments(assetId: string): Promise<AssetComment[]> {
    return firstValueFrom(this.http.get<AssetComment[]>(`${API_BASE}/assets/${assetId}/comments`));
  }

  addComment(assetId: string, text: string, author: string, versionId: string | null = null): Promise<AssetComment> {
    return firstValueFrom(
      this.http.post<AssetComment>(`${API_BASE}/assets/${assetId}/comments`, { text, author, versionId }),
    );
  }

  reviewByToken(token: string): Promise<ProjectPayload> {
    return firstValueFrom(this.http.get<ProjectPayload>(`${API_BASE}/review/${token}`));
  }
}
