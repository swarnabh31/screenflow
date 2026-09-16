const FOLDER_FLAG_KEY = 'screen_recorder_save_folder_selected';

export interface DirectoryHandleLike {
  name: string;
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<string>;
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<string>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<any>;
}

declare global {
  interface Window {
    __screenflowFolderHandle?: DirectoryHandleLike;
    __screenflowFolderFallbackName?: string;
  }
}

export function isFileSystemAccessAvailable(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  if (!isFileSystemAccessAvailable()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({ id: 'screenflow-save-folder' });
    return handle as DirectoryHandleLike;
  } catch {
    return null;
  }
}

export function getSavedFolderName(): string | null {
  try {
    return window.sessionStorage.getItem(FOLDER_FLAG_KEY);
  } catch {
    return null;
  }
}

export function rememberFolderName(name: string | null): void {
  try {
    if (name) window.sessionStorage.setItem(FOLDER_FLAG_KEY, name);
    else window.sessionStorage.removeItem(FOLDER_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function setSessionFolder(handle: DirectoryHandleLike | null): void {
  window.__screenflowFolderHandle = handle ?? undefined;
  rememberFolderName(handle ? handle.name : null);
}

export function getSessionFolder(): DirectoryHandleLike | null {
  const handle = window.__screenflowFolderHandle;
  if (handle) return handle;
  if (getSavedFolderName()) {
    window.__screenflowFolderFallbackName = getSavedFolderName();
    return {
      name: window.__screenflowFolderFallbackName as string,
      getFileHandle: () => Promise.reject(new Error('Folder permission needs to be re-granted this session')),
    } as unknown as DirectoryHandleLike;
  }
  return null;
}

export async function hasWriteAccess(handle: DirectoryHandleLike): Promise<boolean> {
  if (!handle.queryPermission) return true;
  try {
    const status = await handle.queryPermission({ mode: 'readwrite' });
    if (status === 'granted') return true;
    if (handle.requestPermission) {
      const requested = await handle.requestPermission({ mode: 'readwrite' });
      return requested === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

export async function writeBlobToFolder(handle: DirectoryHandleLike, fileName: string, blob: Blob): Promise<boolean> {
  try {
    if (!(await hasWriteAccess(handle))) return false;
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
