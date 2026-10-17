/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface FileSystemHandle {
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: unknown;
  }): Promise<FileSystemDirectoryHandle>;
  __TAURI_INTERNALS__?: unknown;
}
