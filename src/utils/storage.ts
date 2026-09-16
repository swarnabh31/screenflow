import { AppSettings, SavedRecording } from '../types';

const DB_NAME = 'ScreenRecorderDB';
const DB_VERSION = 1;
const STORE_RECORDINGS = 'recordings';
const SETTINGS_KEY = 'screen_recorder_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: true,
  countdownDuration: 3,
  frameRate: 60,
  quality: 'high',
  recordMicByDefault: true,
  recordSystemAudio: true,
  theme: 'dark',
};

// Open or initialize IndexedDB
function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
        db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecordingToStorage(recording: SavedRecording): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDINGS);
    const request = store.put({
      id: recording.id,
      title: recording.title,
      blob: recording.blob,
      thumbnailUrl: recording.thumbnailUrl,
      duration: recording.duration,
      width: recording.width,
      height: recording.height,
      fileSize: recording.fileSize,
      createdAt: recording.createdAt,
      folderPath: recording.folderPath,
      fileName: recording.fileName,
      isAutoSaved: recording.isAutoSaved,
      mimeType: recording.mimeType,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllRecordingsFromStorage(): Promise<SavedRecording[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RECORDINGS, 'readonly');
      const store = tx.objectStore(STORE_RECORDINGS);
      const request = store.getAll();
      request.onsuccess = () => {
        const items = request.result || [];
        // Re-create object URLs for blobs
        const formatted: SavedRecording[] = items.map((item) => ({
          ...item,
          url: URL.createObjectURL(item.blob),
        }));
        // Sort descending by date
        formatted.sort((a, b) => b.createdAt - a.createdAt);
        resolve(formatted);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Error fetching recordings from IndexedDB:', e);
    return [];
  }
}

export async function deleteRecordingFromStorage(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDINGS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

/**
 * Generate a visual thumbnail from a video blob or URL
 */
export async function generateThumbnailFromVideo(videoUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    const finish = (dataUrl: string) => {
      video.removeAttribute('src');
      video.load();
      resolve(dataUrl);
    };

    // Hard safety net so the post-recording flow can never hang on the thumbnail
    const safety = window.setTimeout(() => finish(''), 4000);

    const drawFromVideo = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (ctx && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.clearTimeout(safety);
        finish(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        window.clearTimeout(safety);
        finish('');
      }
    };

    video.onerror = () => {
      window.clearTimeout(safety);
      finish('');
    };

    video.onseeked = () => drawFromVideo();

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      } catch {
        drawFromVideo();
      }
    };

    video.src = videoUrl;
    video.play().catch(() => {});
  });
}

export function formatTimecode(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Read the video's actual duration (in seconds) from a MediaURL.
 * Returns null if metadata cannot be loaded within `timeoutMs`, so callers
 * can fall back to their own best estimate.
 */
export function readVideoDurationSec(videoUrl: string, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(safety);
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };

    const safety = window.setTimeout(() => finish(null), timeoutMs);

    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(isFinite(d) && d > 0 ? d : null);
    };

    video.onerror = () => finish(null);
    video.src = videoUrl;
    // Kick the load; ignore play() (not required for metadata).
  });
}
