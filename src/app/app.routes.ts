import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: 'editor',
    loadComponent: () =>
      import('./features/editor/editor-dashboard.component').then((m) => m.EditorDashboardComponent),
  },
  {
    path: 'editor/project/:id',
    loadComponent: () =>
      import('./features/editor/project-workspace.component').then((m) => m.ProjectWorkspaceComponent),
  },
  {
    path: 'editor/review/:token',
    loadComponent: () =>
      import('./features/editor/review-page.component').then((m) => m.ReviewPageComponent),
  },
  { path: '**', redirectTo: '' },
];
