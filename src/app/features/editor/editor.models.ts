export interface EditorProject {
  id: string;
  name: string;
  review_token: string;
  created_at: string;
  assetCount?: number;
}

export interface EditorFolder {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

export type VersionStatus = 'pending' | 'approved' | 'rejected';

export interface AssetVersion {
  id: string;
  asset_id: string;
  version_number: number;
  file_path: string;
  original_name: string;
  mime_type: string;
  size: number;
  status: VersionStatus;
  author: string;
  created_at: string;
  url: string;
}

export interface EditorAsset {
  id: string;
  project_id: string;
  folder_id: string | null;
  name: string;
  created_at: string;
  versions: AssetVersion[];
  latestVersionId: string | null;
}

export interface ProjectPayload {
  project: EditorProject;
  folders: EditorFolder[];
  assets: EditorAsset[];
}

export interface AssetComment {
  id: string;
  asset_id: string;
  version_id: string | null;
  author: string;
  text: string;
  x: number | null;
  y: number | null;
  created_at: string;
}

export interface EditorChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

export interface EditorEvent {
  type: 'assets-changed' | 'folders-changed' | 'comments-changed' | string;
  assetId?: string;
  timestamp: string;
}
