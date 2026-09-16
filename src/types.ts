export type RecordingMode = 'fullscreen' | 'window' | 'region';

export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: 'original' | '16:9' | '9:16' | '1:1' | '4:3' | 'custom';
}

export interface TrimRange {
  start: number; // in seconds
  end: number;   // in seconds
}

export interface AudioTrackConfig {
  id: string;
  name: string;
  file?: File;
  url: string;
  volume: number; // 0 to 1
  offset: number; // seconds
  duration: number;
}

export interface VoiceoverTake {
  id: string;
  blob: Blob;
  url: string;
  startTime: number;
  duration: number;
  volume: number;
}

export interface SavedRecording {
  id: string;
  title: string;
  blob: Blob;
  url: string;
  thumbnailUrl: string;
  duration: number; // in seconds
  width: number;
  height: number;
  fileSize: number; // in bytes
  createdAt: number;
  folderPath: string;
  fileName: string;
  isAutoSaved: boolean;
  mimeType: string;
}

export interface AppSettings {
  destinationFolder?: string;
  autoSaveEnabled: boolean;
  countdownDuration: number; // 0, 3, 5 seconds
  frameRate: 30 | 60;
  quality: 'standard' | 'high' | 'ultra';
  recordMicByDefault: boolean;
  recordSystemAudio: boolean;
  theme: 'dark' | 'light';
}

export type ExportFormat = 'mp4' | 'mov' | 'gif';

export interface ExportOptions {
  format: ExportFormat;
  resolution: 'original' | '1080p' | '720p' | '480p';
  fps: number;
  includeAudio: boolean;
  includeVoiceover: boolean;
  includeBgm: boolean;
  quality: number; // 0.1 to 1.0
}

// Multi-video Reel & Shorts Merger Types
export type TransitionType = 'cut' | 'crossfade' | 'fade-black' | 'slide-left' | 'zoom';
export type ReelAspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type ReelFitMode = 'blur-fill' | 'cover' | 'fit-black';

export interface ImportedClip {
  id: string;
  name: string;
  sourceType: 'file' | 'library';
  file?: File;
  url: string;
  thumbnailUrl: string;
  duration: number;        // total duration in seconds
  trimStart: number;       // trimmed in point in seconds
  trimEnd: number;         // trimmed out point in seconds
  volume: number;          // 0 to 1
  isMuted: boolean;
  width: number;
  height: number;
  fileSize: number;
  transitionToNext: TransitionType;
  transitionDuration: number; // in seconds (e.g. 0.5)
}

export interface ReelTextOverlay {
  enabled: boolean;
  text: string;
  position: 'top' | 'center' | 'bottom';
  style: 'banner' | 'pill' | 'outline' | 'neon';
  color: string;
  bgColor: string;
  fontSize: number; // 18 to 48
}

export interface ReelExportOptions {
  format: ExportFormat;
  resolution: '1080p' | '720p' | '480p';
  fps: number;
  aspectRatio: ReelAspectRatio;
  fitMode: ReelFitMode;
  includeClipAudio: boolean;
  includeBgm: boolean;
  bgmVolume: number;
  quality: number;
}
