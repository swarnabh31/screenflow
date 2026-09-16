import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Film, 
  Plus, 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2, 
  MoveLeft, 
  MoveRight, 
  Scissors, 
  Volume2, 
  VolumeX, 
  Music, 
  Type, 
  Download, 
 
  Check, 
  Layers, 
  Smartphone, 
  Monitor, 
  Square, 
  ArrowRight, 
  Folder, 
  Copy, 
  Sliders,
  ChevronRight,
  RefreshCw,
  Eye
} from 'lucide-react';
import { 
  ImportedClip, 
  ReelAspectRatio, 
  ReelFitMode, 
  ReelTextOverlay, 
  TransitionType, 
  AudioTrackConfig, 
  SavedRecording,
  ReelExportOptions 
} from '../types';
import { getSessionFolder, writeBlobToFolder } from '../utils/folderStorage';
import { formatTimecode, formatFileSize, generateThumbnailFromVideo } from '../utils/storage';
import { 
  getReelDimensions, 
  drawVideoFrame, 
  drawReelTextOverlay, 
  preloadClipVideos, 
  exportMergedReel 
} from '../utils/reelMergerExport';
import { ExportProgress } from '../utils/mediaExport';

interface ReelsMergerStudioProps {
  destinationFolder?: string;
  savedRecordings: SavedRecording[];
  onClose: () => void;
  onSaveToLibrary: (recording: SavedRecording) => void;
  onShowToast: (msg: string) => void;
}

export const ReelsMergerStudio: React.FC<ReelsMergerStudioProps> = ({
  destinationFolder,
  savedRecordings,
  onClose,
  onSaveToLibrary,
  onShowToast,
}) => {
  // Master Project State
  const [reelTitle, setReelTitle] = useState('My Awesome Reel');
  const [aspectRatio, setAspectRatio] = useState<ReelAspectRatio>('9:16');
  const [fitMode, setFitMode] = useState<ReelFitMode>('blur-fill');
  const [clips, setClips] = useState<ImportedClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Text Hook & Overlay
  const [textOverlay, setTextOverlay] = useState<ReelTextOverlay>({
    enabled: true,
    text: 'WATCH THIS 🚀',
    position: 'top',
    style: 'pill',
    color: '#ffffff',
    bgColor: '#ef4444',
    fontSize: 28,
  });

  // Background Music
  const [bgmTrack, setBgmTrack] = useState<AudioTrackConfig | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.6);
  const [includeClipAudio, setIncludeClipAudio] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'clips' | 'text' | 'audio' | 'settings'>('clips');

  // Preview Player State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0); // 0 to totalDuration
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlayerMuted, setIsPlayerMuted] = useState(false);

  // Clip Trimming Inspector Modal / Drawer
  const [trimmingClip, setTrimmingClip] = useState<ImportedClip | null>(null);

  // Library Picker Modal
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

  // Export Dialog State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'mp4' | 'mov' | 'gif'>('mp4');
  const [exportResolution, setExportResolution] = useState<'1080p' | '720p' | '480p'>('1080p');
  const [exportFps, setExportFps] = useState<number>(30);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  // References for Player Loop
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgmInputRef = useRef<HTMLInputElement>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  // -------------------------------------------------------------
  // Calculate total composite duration
  // -------------------------------------------------------------
  const totalDuration = clips.reduce((acc, c) => {
    const eff = Math.max(0.1, c.trimEnd - c.trimStart);
    return acc + eff;
  }, 0);

  // Initialize selected clip if none
  useEffect(() => {
    if (clips.length > 0 && !selectedClipId) {
      setSelectedClipId(clips[0].id);
    }
  }, [clips, selectedClipId]);

  // -------------------------------------------------------------
  // Manage Video Elements for Canvas Preview
  // -------------------------------------------------------------
  useEffect(() => {
    // Synchronize video element pool
    const map = videoElementsRef.current;
    clips.forEach((clip) => {
      if (!map.has(clip.id)) {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.src = clip.url;
        v.muted = true; // muted during canvas preview; we route audio manually or keep preview quiet
        v.preload = 'auto';
        map.set(clip.id, v);
      }
    });
  }, [clips]);

  // Synchronize BGM element
  useEffect(() => {
    if (bgmTrack?.url) {
      if (!bgmAudioRef.current) {
        bgmAudioRef.current = new Audio(bgmTrack.url);
      } else {
        bgmAudioRef.current.src = bgmTrack.url;
      }
      bgmAudioRef.current.volume = bgmVolume;
      bgmAudioRef.current.loop = true;
    } else if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
      bgmAudioRef.current = null;
    }
  }, [bgmTrack, bgmVolume]);

  // -------------------------------------------------------------
  // Canvas Preview Render Loop
  // -------------------------------------------------------------
  const renderCanvasPreview = (targetTime: number) => {
    const canvas = canvasRef.current;
    if (!canvas || clips.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dims = getReelDimensions(aspectRatio, '720p');
    if (canvas.width !== dims.width || canvas.height !== dims.height) {
      canvas.width = dims.width;
      canvas.height = dims.height;
    }

    // Find active clip corresponding to targetTime
    let accumulated = 0;
    let foundIdx = 0;
    let clipOffset = 0;

    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const eff = Math.max(0.1, c.trimEnd - c.trimStart);
      if (targetTime < accumulated + eff || i === clips.length - 1) {
        foundIdx = i;
        clipOffset = Math.max(0, Math.min(eff, targetTime - accumulated));
        break;
      }
      accumulated += eff;
    }

    setActiveClipIndex(foundIdx);
    const activeClip = clips[foundIdx];
    const video = videoElementsRef.current.get(activeClip.id);

    if (video) {
      const desiredVideoTime = activeClip.trimStart + clipOffset;
      if (Math.abs(video.currentTime - desiredVideoTime) > 0.15) {
        video.currentTime = desiredVideoTime;
      }
      drawVideoFrame(ctx, video, canvas.width, canvas.height, fitMode, 1);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Text Overlay
    if (textOverlay.enabled) {
      drawReelTextOverlay(ctx, textOverlay, canvas.width, canvas.height);
    }
  };

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      lastTimestampRef.current = null;
      if (bgmAudioRef.current) bgmAudioRef.current.pause();
      return;
    }

    if (bgmAudioRef.current && !isPlayerMuted) {
      bgmAudioRef.current.play().catch(() => {});
    }

    const loop = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }
      const delta = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      setPlaybackTime((prev) => {
        const next = prev + delta;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        renderCanvasPreview(next);
        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, totalDuration, clips, aspectRatio, fitMode, textOverlay, isPlayerMuted]);

  // Re-render canvas on pause or setting change
  useEffect(() => {
    if (!isPlaying) {
      renderCanvasPreview(playbackTime);
    }
  }, [playbackTime, clips, aspectRatio, fitMode, textOverlay, isPlaying]);

  // -------------------------------------------------------------
  // File Import Handlers (Multi-select from Windows File System)
  // -------------------------------------------------------------
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processImportedFiles(Array.from(files));
    e.target.value = '';
  };

  const processImportedFiles = async (files: File[]) => {
    onShowToast(`Importing ${files.length} video(s)...`);
    const newClips: ImportedClip[] = [];

    for (const file of files) {
      const url = URL.createObjectURL(file);
      const thumb = await generateThumbnailFromVideo(url);

      // Extract duration and dimensions
      const meta = await new Promise<{ duration: number; width: number; height: number }>((resolve) => {
        const tempV = document.createElement('video');
        tempV.crossOrigin = 'anonymous';
        tempV.src = url;
        tempV.onloadedmetadata = () => {
          resolve({
            duration: tempV.duration || 5,
            width: tempV.videoWidth || 1920,
            height: tempV.videoHeight || 1080,
          });
        };
        tempV.onerror = () => {
          resolve({ duration: 5, width: 1920, height: 1080 });
        };
      });

      newClips.push({
        id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: file.name.replace(/\.[^/.]+$/, ''),
        sourceType: 'file',
        file,
        url,
        thumbnailUrl: thumb,
        duration: meta.duration,
        trimStart: 0,
        trimEnd: meta.duration,
        volume: 1,
        isMuted: false,
        width: meta.width,
        height: meta.height,
        fileSize: file.size,
        transitionToNext: 'crossfade',
        transitionDuration: 0.5,
      });
    }

    setClips((prev) => [...prev, ...newClips]);
    onShowToast(`Added ${newClips.length} video clip(s) to timeline!`);
  };

  // Drag & drop support
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      const videoFiles = files.filter((f) => f.type.startsWith('video/'));
      if (videoFiles.length > 0) {
        await processImportedFiles(videoFiles);
      } else {
        onShowToast('Please drop valid video files (MP4, WebM, MOV).');
      }
    }
  };

  // Add recorded clip from App Library
  const handleAddFromLibrary = (rec: SavedRecording) => {
    const newClip: ImportedClip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: rec.title,
      sourceType: 'library',
      url: rec.url,
      thumbnailUrl: rec.thumbnailUrl,
      duration: rec.duration,
      trimStart: 0,
      trimEnd: rec.duration,
      volume: 1,
      isMuted: false,
      width: rec.width,
      height: rec.height,
      fileSize: rec.fileSize,
      transitionToNext: 'crossfade',
      transitionDuration: 0.5,
    };
    setClips((prev) => [...prev, newClip]);
    setShowLibraryPicker(false);
    onShowToast(`Added "${rec.title}" to Reel!`);
  };

  // -------------------------------------------------------------
  // Clip Manipulation (Reorder, Delete, Duplicate)
  // -------------------------------------------------------------
  const handleMoveClip = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= clips.length) return;
    const newClips = [...clips];
    const temp = newClips[index];
    newClips[index] = newClips[targetIdx];
    newClips[targetIdx] = temp;
    setClips(newClips);
  };

  const handleDeleteClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedClipId === id) {
      setSelectedClipId(null);
    }
  };

  const handleDuplicateClip = (clip: ImportedClip) => {
    const dupe: ImportedClip = {
      ...clip,
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: `${clip.name} (Copy)`,
    };
    setClips((prev) => [...prev, dupe]);
    onShowToast(`Duplicated "${clip.name}"`);
  };

  // Save Trim Changes
  const handleSaveTrim = (start: number, end: number) => {
    if (!trimmingClip) return;
    setClips((prev) =>
      prev.map((c) => (c.id === trimmingClip.id ? { ...c, trimStart: start, trimEnd: end } : c))
    );
    setTrimmingClip(null);
    onShowToast(`Trimmed "${trimmingClip.name}" to ${(end - start).toFixed(1)}s`);
  };

  // -------------------------------------------------------------
  // Background Music File Handler
  // -------------------------------------------------------------
  const handleBgmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBgmTrack({
      id: 'bgm_' + Date.now(),
      name: file.name.replace(/\.[^/.]+$/, ''),
      file,
      url,
      volume: bgmVolume,
      offset: 0,
      duration: 60,
    });
    onShowToast(`Added background music: "${file.name}"`);
    e.target.value = '';
  };

  // -------------------------------------------------------------
  // Master Reel Export & Auto-Save
  // -------------------------------------------------------------
  const handleStartExport = async () => {
    if (clips.length === 0) {
      onShowToast('Please add at least one video clip before exporting.');
      return;
    }

    setIsExporting(true);
    setExportProgress({ stage: 'preparing', percentage: 2, message: 'Initializing video merger...' });

    const options: ReelExportOptions = {
      format: exportFormat,
      resolution: exportResolution,
      fps: exportFps,
      aspectRatio,
      fitMode,
      includeClipAudio,
      includeBgm: !!bgmTrack,
      bgmVolume,
      quality: 0.9,
    };

    try {
      const result = await exportMergedReel(
        clips,
        aspectRatio,
        fitMode,
        textOverlay,
        bgmTrack,
        options,
        (prog) => setExportProgress(prog)
      );

      // Use the real extension from the export result (mp4/mov/webm/gif) so
      // the saved file matches what was actually encoded.
      const realExt = (result.filename.split('.').pop() || 'mp4').toLowerCase();
      const saveName = `${reelTitle.trim().replace(/\s+/g, '_')}_${Date.now()}.${realExt}`;
      const folder = getSessionFolder();
      const written = folder ? await writeBlobToFolder(folder, saveName, result.blob) : false;

      // Fallback: trigger Direct Download to Windows File System
      if (!written) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(result.blob);
        a.download = saveName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Also save into persistent library
      const thumb = await generateThumbnailFromVideo(URL.createObjectURL(result.blob));
      const newRecording: SavedRecording = {
        id: 'rec_reel_' + Date.now(),
        title: reelTitle,
        blob: result.blob,
        url: URL.createObjectURL(result.blob),
        thumbnailUrl: thumb,
        duration: totalDuration,
        width: getReelDimensions(aspectRatio, exportResolution).width,
        height: getReelDimensions(aspectRatio, exportResolution).height,
        fileSize: result.blob.size,
        createdAt: Date.now(),
        folderPath: written ? folder!.name : destinationFolder ?? '',
        fileName: saveName,
        isAutoSaved: true,
        mimeType: result.mimeType,
      };

      await onSaveToLibrary(newRecording);
      setIsExporting(false);
      setShowExportModal(false);
      onShowToast(written ? `Exported "${saveName}" & saved to ${folder!.name}!` : `Exported "${saveName}" & saved to your library!`);
    } catch (err) {
      console.error('Reel export failed:', err);
      onShowToast('Failed to export merged reel. Please verify your clips and try again.');
      setIsExporting(false);
    }
  };

  return (
    <div 
      className="flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 1. Header Toolbar */}
      <div className="h-14 border-b border-slate-800/80 bg-slate-900/90 px-5 flex items-center justify-between gap-4 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Back to Studio"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={reelTitle}
                  onChange={(e) => setReelTitle(e.target.value)}
                  className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-rose-500 text-sm font-bold text-white focus:outline-none px-1 py-0.5 rounded"
                  placeholder="Reel Project Title..."
                />
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-medium px-2 py-0.5 rounded-full border border-rose-500/30">
                  Reels & Shorts Merger
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Aspect Ratio & Fit Mode Quick Toggles */}
        <div className="hidden md:flex items-center gap-2 bg-slate-950/80 border border-slate-800 p-1 rounded-xl text-xs">
          {/* 9:16 Vertical Short */}
          <button
            onClick={() => setAspectRatio('9:16')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition-colors ${
              aspectRatio === '9:16'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="9:16 Vertical (Reels / TikTok / YouTube Shorts)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>9:16 Reel</span>
          </button>

          {/* 16:9 Landscape */}
          <button
            onClick={() => setAspectRatio('16:9')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition-colors ${
              aspectRatio === '16:9'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="16:9 Widescreen"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>16:9 Video</span>
          </button>

          {/* 1:1 Square */}
          <button
            onClick={() => setAspectRatio('1:1')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition-colors ${
              aspectRatio === '1:1'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="1:1 Square"
          >
            <Square className="w-3.5 h-3.5" />
            <span>1:1 Square</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Fit Mode Switcher */}
          <select
            value={fitMode}
            onChange={(e) => setFitMode(e.target.value as ReelFitMode)}
            className="bg-slate-900 text-slate-300 text-xs rounded-lg px-2 py-1 border border-slate-800 focus:outline-none focus:border-rose-500"
            title="How non-matching video dimensions fit the canvas"
          >
            <option value="blur-fill">✨ Blurred Ambient Glow</option>
            <option value="cover">🔍 Zoom to Fill (Cover)</option>
            <option value="fit-black">⬛ Letterbox (Fit Black)</option>
          </select>
        </div>

        {/* Right: Export CTA */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            <span>Duration:</span>
            <span className="text-white font-bold">{formatTimecode(totalDuration)}</span>
            <span className="text-slate-500">({clips.length} clips)</span>
          </div>

          <button
            onClick={() => setShowExportModal(true)}
            disabled={clips.length === 0}
            className="px-4 py-1.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Reel</span>
          </button>
        </div>
      </div>

      {/* 2. Main Studio Workspace (Left: Player + Timeline / Right: Properties) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT / CENTER: Interactive Canvas Preview Player */}
        <div className="flex-1 flex flex-col bg-slate-950 p-4 overflow-hidden">
          {/* Canvas Screen Container */}
          <div className="flex-1 flex items-center justify-center relative min-h-[300px] overflow-hidden">
            {clips.length === 0 ? (
              <div className="w-full max-w-md p-8 rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/40 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-100 mb-1">No Videos in Reel Sequence</h3>
                <p className="text-xs text-slate-400 max-w-xs mb-6">
                  Import video clips from your Windows PC or library to stitch them into a single reel or YouTube Short.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-600/20 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse Windows Files
                  </button>

                  <button
                    onClick={() => setShowLibraryPicker(true)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Film className="w-3.5 h-3.5 text-indigo-400" />
                    Add from Library
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-black flex items-center justify-center max-h-full"
                style={{
                  aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '16:9' ? '16/9' : aspectRatio === '1:1' ? '1/1' : '4/5',
                  height: '100%',
                  maxHeight: '440px'
                }}
              >
                <canvas 
                  ref={canvasRef} 
                  className="w-full h-full object-contain"
                />

                {/* Active Clip Floating Pill */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-medium text-slate-200 border border-slate-800 flex items-center gap-1.5 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>Clip {activeClipIndex + 1} of {clips.length}:</span>
                  <span className="truncate max-w-[120px] text-slate-400">{clips[activeClipIndex]?.name}</span>
                </div>
              </div>
            )}
          </div>

          {/* Player Transport Bar */}
          {clips.length > 0 && (
            <div className="mt-3 bg-slate-900/80 border border-slate-800/90 rounded-xl p-2.5 flex items-center gap-3">
              {/* Play / Pause */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-9 h-9 rounded-lg bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-rose-600/20"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              {/* Reset to Start */}
              <button
                onClick={() => {
                  setPlaybackTime(0);
                  renderCanvasPreview(0);
                }}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Restart from beginning"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Timecode readouts */}
              <div className="text-xs font-mono text-slate-300 flex items-center gap-1">
                <span>{formatTimecode(playbackTime)}</span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
              </div>

              {/* Composite Timeline Scrubber */}
              <div className="flex-1 relative mx-2 flex items-center">
                <input
                  type="range"
                  min={0}
                  max={totalDuration || 1}
                  step={0.05}
                  value={playbackTime}
                  onChange={(e) => {
                    const t = parseFloat(e.target.value);
                    setPlaybackTime(t);
                    renderCanvasPreview(t);
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>

              {/* Mute Preview Toggle */}
              <button
                onClick={() => setIsPlayerMuted(!isPlayerMuted)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title={isPlayerMuted ? 'Unmute preview' : 'Mute preview'}
              >
                {isPlayerMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Bottom: Clip Sequence Timeline Strip */}
          <div className="mt-3 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider text-slate-300">Reel Sequence Timeline</span>
                <span className="text-[11px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                  {clips.length} clip(s)
                </span>
              </div>

              {/* Add More Files buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-rose-400" />
                  Add Videos from PC
                </button>
                <button
                  onClick={() => setShowLibraryPicker(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  <Film className="w-3.5 h-3.5 text-indigo-400" />
                  Add from Library
                </button>
              </div>
            </div>

            {/* Clips Strip Scroll */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 min-h-[110px]">
              {clips.map((clip, index) => {
                const effDur = Math.max(0.1, clip.trimEnd - clip.trimStart);
                const isSelected = selectedClipId === clip.id;

                return (
                  <React.Fragment key={clip.id}>
                    {/* Clip Card */}
                    <div
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`relative flex-shrink-0 w-36 bg-slate-950 rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-rose-500 shadow-md shadow-rose-500/20 ring-1 ring-rose-500'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="h-16 bg-black relative flex items-center justify-center overflow-hidden">
                        {clip.thumbnailUrl ? (
                          <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-full object-cover" />
                        ) : (
                          <Film className="w-6 h-6 text-slate-700" />
                        )}

                        <span className="absolute top-1 left-1 bg-slate-950/80 text-[10px] font-bold text-rose-400 px-1.5 py-0.2 rounded">
                          #{index + 1}
                        </span>

                        <span className="absolute bottom-1 right-1 bg-slate-950/90 text-[10px] font-mono text-white px-1 rounded">
                          {formatTimecode(effDur)}
                        </span>
                      </div>

                      {/* Info & Micro Actions */}
                      <div className="p-2 space-y-1">
                        <div className="text-[11px] font-semibold text-slate-200 truncate" title={clip.name}>
                          {clip.name}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                          {/* Move Buttons */}
                          <div className="flex items-center gap-0.5">
                            <button
                              disabled={index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveClip(index, 'left');
                              }}
                              className="p-1 hover:text-white disabled:opacity-20"
                              title="Move left"
                            >
                              <MoveLeft className="w-3 h-3" />
                            </button>
                            <button
                              disabled={index === clips.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveClip(index, 'right');
                              }}
                              className="p-1 hover:text-white disabled:opacity-20"
                              title="Move right"
                            >
                              <MoveRight className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Trim & Delete */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrimmingClip(clip);
                              }}
                              className="p-1 hover:bg-slate-800 text-sky-400 rounded"
                              title="Trim this clip"
                            >
                              <Scissors className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClip(clip.id);
                              }}
                              className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded"
                              title="Delete clip"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Transition Selector between clips */}
                    {index < clips.length - 1 && (
                      <div className="flex flex-col items-center justify-center flex-shrink-0 px-1">
                        <select
                          value={clip.transitionToNext}
                          onChange={(e) => {
                            const val = e.target.value as TransitionType;
                            setClips((prev) =>
                              prev.map((c) => (c.id === clip.id ? { ...c, transitionToNext: val } : c))
                            );
                          }}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-1 focus:outline-none focus:border-rose-500"
                          title="Transition into next clip"
                        >
                          <option value="cut">✂️ Cut</option>
                          <option value="crossfade">✨ Crossfade</option>
                          <option value="fade-black">🌑 Fade to Black</option>
                          <option value="slide-left">➡️ Slide Left</option>
                          <option value="zoom">🔍 Zoom In</option>
                        </select>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Add Clip Card Placeholder */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 w-28 h-28 rounded-xl border border-dashed border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 flex flex-col items-center justify-center text-slate-400 hover:text-slate-200 transition-all text-xs gap-1.5"
              >
                <Plus className="w-5 h-5 text-rose-500" />
                <span>Add Video</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Inspector & Creative Options (Text, Audio, Reels Presets) */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-800/80 bg-slate-900/70 p-4 flex flex-col overflow-y-auto">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 mb-4 text-xs">
            <button
              onClick={() => setActiveTab('clips')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'clips' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Clips
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'text' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Text Hook
            </button>
            <button
              onClick={() => setActiveTab('audio')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'audio' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Music
            </button>
          </div>

          {/* TAB 1: Selected Clip Properties */}
          {activeTab === 'clips' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Aspect Ratio & Format
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAspectRatio('9:16')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      aspectRatio === '9:16'
                        ? 'bg-rose-950/30 border-rose-500 text-rose-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs">9:16 Vertical</div>
                    <div className="text-[10px] text-slate-500">Shorts & Reels</div>
                  </button>
                  <button
                    onClick={() => setAspectRatio('16:9')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      aspectRatio === '16:9'
                        ? 'bg-rose-950/30 border-rose-500 text-rose-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs">16:9 Standard</div>
                    <div className="text-[10px] text-slate-500">YouTube Landscape</div>
                  </button>
                </div>
              </div>

              {/* Fit Mode */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  Non-9:16 Video Fit Style
                </label>
                <div className="space-y-1.5">
                  {[
                    { id: 'blur-fill', title: '✨ Blurred Ambient Glow', desc: 'Fills background with blurred video' },
                    { id: 'cover', title: '🔍 Zoom & Fill', desc: 'Crops outer edges to fill 100%' },
                    { id: 'fit-black', title: '⬛ Clean Letterbox', desc: 'Shows entire frame with black bars' },
                  ].map((mode) => (
                    <div
                      key={mode.id}
                      onClick={() => setFitMode(mode.id as ReelFitMode)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        fitMode === mode.id
                          ? 'bg-rose-950/30 border-rose-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{mode.title}</div>
                      <div className="text-[10px] text-slate-500">{mode.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selected Clip Quick Controls */}
              {selectedClipId && (
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  {(() => {
                    const clip = clips.find((c) => c.id === selectedClipId);
                    if (!clip) return null;
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200 truncate">{clip.name}</span>
                          <button
                            onClick={() => setTrimmingClip(clip)}
                            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                          >
                            <Scissors className="w-3 h-3" />
                            Trim Clip
                          </button>
                        </div>

                        {/* Volume */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>Clip Volume</span>
                            <span>{Math.round(clip.volume * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={clip.volume}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setClips((prev) =>
                                prev.map((c) => (c.id === clip.id ? { ...c, volume: v } : c))
                              );
                            }}
                            className="w-full accent-rose-500"
                          />
                        </div>

                        {/* Duplicate */}
                        <button
                          onClick={() => handleDuplicateClip(clip)}
                          className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Duplicate Clip in Sequence
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Text Hook / Captions */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Reel Text Hook / Banner
                </label>
                <input
                  type="checkbox"
                  checked={textOverlay.enabled}
                  onChange={(e) => setTextOverlay((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="accent-rose-500 rounded"
                />
              </div>

              {textOverlay.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Headline Text</label>
                    <input
                      type="text"
                      value={textOverlay.text}
                      onChange={(e) => setTextOverlay((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder="e.g. WAIT FOR IT..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  {/* Position */}
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Vertical Position</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      {(['top', 'center', 'bottom'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setTextOverlay((prev) => ({ ...prev, position: pos }))}
                          className={`py-1 rounded-lg capitalize border ${
                            textOverlay.position === pos
                              ? 'bg-rose-500 text-white border-rose-500'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Visual Style */}
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Badge Style</label>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {[
                        { id: 'pill', label: '🔴 Pill Badge' },
                        { id: 'banner', label: '⬛ Dark Banner' },
                        { id: 'neon', label: '✨ Neon Glow' },
                        { id: 'outline', label: '🔤 Clean Outline' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          onClick={() => setTextOverlay((prev) => ({ ...prev, style: st.id as any }))}
                          className={`p-2 rounded-lg border text-left ${
                            textOverlay.style === st.id
                              ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Font Size</span>
                      <span>{textOverlay.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={44}
                      value={textOverlay.fontSize}
                      onChange={(e) =>
                        setTextOverlay((prev) => ({ ...prev, fontSize: parseInt(e.target.value) }))
                      }
                      className="w-full accent-rose-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Background Music (BGM) */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Background Music (BGM)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Mix music across all merged clips for high retention Reels & Shorts.
                </p>
              </div>

              {bgmTrack ? (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <Music className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-200 truncate">{bgmTrack.name}</span>
                    </div>
                    <button
                      onClick={() => setBgmTrack(null)}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Volume */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Music Volume</span>
                      <span>{Math.round(bgmVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={bgmVolume}
                      onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                      className="w-full accent-rose-500"
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => bgmInputRef.current?.click()}
                  className="w-full py-3 rounded-xl border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-300 hover:text-white text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Music className="w-4 h-4 text-rose-400" />
                  <span>Upload Audio / Song File</span>
                </button>
              )}

              {/* Include Clip Audio Checkbox */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-300">Keep Original Video Audio</span>
                <input
                  type="checkbox"
                  checked={includeClipAudio}
                  onChange={(e) => setIncludeClipAudio(e.target.checked)}
                  className="accent-rose-500 rounded"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept="video/mp4,video/webm,video/quicktime,video/mkv,video/*"
        className="hidden"
      />
      <input
        type="file"
        ref={bgmInputRef}
        onChange={handleBgmFileChange}
        accept="audio/mp3,audio/wav,audio/aac,audio/ogg,audio/*"
        className="hidden"
      />

      {/* 3. Clip Trimming Inspector Modal */}
      {trimmingClip && (
        <ClipTrimmingModal
          clip={trimmingClip}
          onSave={handleSaveTrim}
          onClose={() => setTrimmingClip(null)}
        />
      )}

      {/* 4. Library Picker Modal */}
      {showLibraryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-indigo-400" />
                Select from App Recorded Library
              </h3>
              <button onClick={() => setShowLibraryPicker(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {savedRecordings.length === 0 ? (
                <div className="col-span-3 text-center py-10 text-xs text-slate-500">
                  No screen recordings found in the library yet. Record your screen first or import videos from PC.
                </div>
              ) : (
                savedRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => handleAddFromLibrary(rec)}
                    className="group bg-slate-950 border border-slate-800 hover:border-rose-500 rounded-xl overflow-hidden cursor-pointer transition-all"
                  >
                    <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden">
                      {rec.thumbnailUrl ? (
                        <img src={rec.thumbnailUrl} alt={rec.title} className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-6 h-6 text-slate-700" />
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-mono text-white px-1 rounded">
                        {formatTimecode(rec.duration)}
                      </span>
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-semibold text-slate-200 truncate">{rec.title}</div>
                      <div className="text-[10px] text-slate-500">{formatFileSize(rec.fileSize)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Export Dialog */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-rose-400" />
                Export Merged Reel / Video
              </h3>
              <button
                disabled={isExporting}
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isExporting ? (
              <div className="py-6 space-y-4 text-center">
                <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">{exportProgress?.message || 'Processing video...'}</h4>
                  <p className="text-xs text-slate-400">Rendering transitions, audio tracks, and frames...</p>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="bg-rose-500 h-full transition-all duration-300"
                    style={{ width: `${exportProgress?.percentage || 5}%` }}
                  />
                </div>
                <div className="text-xs font-mono text-rose-400 font-bold">{exportProgress?.percentage || 5}%</div>
              </div>
            ) : (
              <>
                {/* Format selection */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block font-medium">Output Format</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(['mp4', 'mov', 'gif'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setExportFormat(fmt)}
                        className={`py-2 rounded-xl uppercase font-bold border ${
                          exportFormat === fmt
                            ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block font-medium">Resolution</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(['1080p', '720p', '480p'] as const).map((res) => (
                      <button
                        key={res}
                        onClick={() => setExportResolution(res)}
                        className={`py-2 rounded-xl font-medium border ${
                          exportResolution === res
                            ? 'bg-slate-800 text-white border-slate-600'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info summary */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Aspect Ratio:</span>
                    <span className="text-white font-mono">{aspectRatio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Duration:</span>
                    <span className="text-white font-mono">{formatTimecode(totalDuration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Destination:</span>
                    <span className="text-slate-300 font-mono truncate max-w-[200px]">{destinationFolder || 'Local Library'}</span>
                  </div>
                </div>

                <button
                  onClick={handleStartExport}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Start Export & Download</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// Sub-component: Clip Trimming Inspector Modal
// -------------------------------------------------------------
interface ClipTrimmingModalProps {
  clip: ImportedClip;
  onSave: (start: number, end: number) => void;
  onClose: () => void;
}

const ClipTrimmingModal: React.FC<ClipTrimmingModalProps> = ({ clip, onSave, onClose }) => {
  const [start, setStart] = useState(clip.trimStart);
  const [end, setEnd] = useState(clip.trimEnd);
  const [currentTime, setCurrentTime] = useState(clip.trimStart);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const duration = clip.duration || 5;

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    setCurrentTime(ct);
    if (ct >= end) {
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime = start;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime < start || videoRef.current.currentTime >= end) {
        videoRef.current.currentTime = start;
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Scissors className="w-4 h-4 text-sky-400" />
            Trim Clip: <span className="text-slate-300 font-normal truncate max-w-xs">{clip.name}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video Preview */}
        <div className="aspect-video bg-black rounded-xl overflow-hidden relative flex items-center justify-center">
          <video
            ref={videoRef}
            src={clip.url}
            onTimeUpdate={handleTimeUpdate}
            className="w-full h-full object-contain"
          />

          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-sky-500/90 text-slate-950 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity shadow-lg"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
        </div>

        {/* Trim Sliders */}
        <div className="space-y-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Trim In: <strong className="text-sky-400 font-mono">{formatTimecode(start)}</strong></span>
            <span>Trim Out: <strong className="text-rose-400 font-mono">{formatTimecode(end)}</strong></span>
            <span>Duration: <strong className="text-white font-mono">{formatTimecode(end - start)}</strong></span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Start Point</label>
              <input
                type="range"
                min={0}
                max={end - 0.2}
                step={0.1}
                value={start}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setStart(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-full accent-sky-400"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">End Point</label>
              <input
                type="range"
                min={start + 0.2}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setEnd(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-full accent-rose-400"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(start, end)}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-colors"
          >
            Apply Trim
          </button>
        </div>
      </div>
    </div>
  );
};
