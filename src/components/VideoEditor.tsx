import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Scissors, 
  Crop as CropIcon, 
  Music, 
  Mic, 
  Square, 
  Download, 
  Trash2, 
  Save, 
  Folder, 
  Check, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Plus, 
  X,
  Sparkles,
  ArrowLeft,
  Layers
} from 'lucide-react';
import { 
  SavedRecording, 
  TrimRange, 
  CropArea, 
  AudioTrackConfig, 
  VoiceoverTake 
} from '../types';
import { formatTimecode, formatFileSize } from '../utils/storage';

interface VideoEditorProps {
  recording: SavedRecording;
  destinationFolder?: string;
  onExport: () => void;
  onDelete: () => void;
  onSaveCopy: () => void;
  onBackToSetup: () => void;
  onUpdateRecordingMeta: (title: string) => void;
  onOpenReelsMerger?: (recording: SavedRecording) => void;
  // Shared edit state for export
  trim: TrimRange;
  setTrim: React.Dispatch<React.SetStateAction<TrimRange>>;
  crop: CropArea | null;
  setCrop: React.Dispatch<React.SetStateAction<CropArea | null>>;
  bgmTracks: AudioTrackConfig[];
  setBgmTracks: React.Dispatch<React.SetStateAction<AudioTrackConfig[]>>;
  voiceovers: VoiceoverTake[];
  setVoiceovers: React.Dispatch<React.SetStateAction<VoiceoverTake[]>>;
}

type ActiveTab = 'trim' | 'crop' | 'audio' | 'voiceover';

export const VideoEditor: React.FC<VideoEditorProps> = ({
  recording,
  destinationFolder,
  onExport,
  onDelete,
  onSaveCopy,
  onBackToSetup,
  onUpdateRecordingMeta,
  onOpenReelsMerger,
  trim,
  setTrim,
  crop,
  setCrop,
  bgmTracks,
  setBgmTracks,
  voiceovers,
  setVoiceovers,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(recording.duration || 0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('trim');
  const [videoTitle, setVideoTitle] = useState(recording.title);
  const [videoVolume, setVideoVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [autoSaveNotice, setAutoSaveNotice] = useState(recording.isAutoSaved);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setEditorNotice(msg);
    setTimeout(() => setEditorNotice(null), 4500);
  };

  // Voiceover recording state. `voiceoverElapsedRef` mirrors React state so the
  // `recorder.onstop` closure reads live values (state captured by closure is
  // stale across re-renders — see the earlier clock bug we fixed in
  // src/utils/recordingClock.ts).
  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);
  const [voiceoverElapsed, setVoiceoverElapsed] = useState(0);
  const voiceoverElapsedRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceoverStartRef = useRef<number>(0);
  const voiceoverTimerRef = useRef<number | null>(null);

  // Initialize duration on video load
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      // WebM blobs from MediaRecorder report video.duration === Infinity
      // (no duration header), so only trust it when it's a finite number.
      const rawDur = videoRef.current.duration;
      const dur = isFinite(rawDur) && rawDur > 0 ? rawDur : (recording.duration || 1);
      setDuration(dur);
      // If trim end is 0 or uninitialized, set to duration
      if (trim.end === 0 || trim.end > dur) {
        setTrim({ start: 0, end: dur });
      }
    }
  };

  // Video time update handler
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // Loop within trim range if playing
      if (isPlaying && cur >= trim.end) {
        videoRef.current.currentTime = trim.start;
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime >= trim.end) {
        videoRef.current.currentTime = trim.start;
      }
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, time));
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // 1. Add Background Audio from Local File System
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const newTrack: AudioTrackConfig = {
      id: 'bgm_' + Date.now(),
      name: file.name,
      file,
      url,
      volume: 0.7,
      offset: 0,
      duration: 0,
    };
    setBgmTracks((prev) => [...prev, newTrack]);
    e.target.value = '';
  };

  const removeBgmTrack = (id: string) => {
    setBgmTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const updateBgmVolume = (id: string, vol: number) => {
    setBgmTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, volume: vol } : t))
    );
  };

  // 2. Record Audio while Video Playback (Voiceover Commentary)
  const startVoiceoverRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const durationSec = Number(voiceoverElapsedRef.current.toFixed(2));
        const newVoiceover: VoiceoverTake = {
          id: 'vo_' + Date.now(),
          blob: audioBlob,
          url: audioUrl,
          startTime: voiceoverStartRef.current,
          duration: durationSec,
          volume: 1.0,
        };
        setVoiceovers((prev) => [...prev, newVoiceover]);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      voiceoverStartRef.current = videoRef.current ? videoRef.current.currentTime : 0;
      voiceoverElapsedRef.current = 0;
      setVoiceoverElapsed(0);
      setIsRecordingVoiceover(true);

      // Start recording mic
      recorder.start(100);

      // Start video playback synchronously
      if (videoRef.current) {
        videoRef.current.muted = true; // prevent mic echo
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }

      voiceoverTimerRef.current = window.setInterval(() => {
        voiceoverElapsedRef.current += 0.1;
        setVoiceoverElapsed(voiceoverElapsedRef.current);
      }, 100);
    } catch (err) {
      showNotice('Could not access microphone for voiceover recording. Please check microphone permissions.');
    }
  };

  const stopVoiceoverRecording = () => {
    if (voiceoverTimerRef.current) {
      clearInterval(voiceoverTimerRef.current);
      voiceoverTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = isMuted;
      setIsPlaying(false);
    }
    setIsRecordingVoiceover(false);
  };

  const removeVoiceover = (id: string) => {
    setVoiceovers((prev) => prev.filter((v) => v.id !== id));
  };

  // Crop Preset handler
  const setCropPreset = (preset: 'original' | '16:9' | '9:16' | '1:1' | '4:3') => {
    if (!videoRef.current) return;
    const w = videoRef.current.videoWidth || 1920;
    const h = videoRef.current.videoHeight || 1080;

    if (preset === 'original') {
      setCrop(null);
      return;
    }

    let targetW = w;
    let targetH = h;

    if (preset === '16:9') {
      targetH = Math.min(h, Math.round(w * (9 / 16)));
      targetW = Math.round(targetH * (16 / 9));
    } else if (preset === '9:16') {
      targetW = Math.min(w, Math.round(h * (9 / 16)));
      targetH = Math.round(targetW * (16 / 9));
    } else if (preset === '1:1') {
      const size = Math.min(w, h);
      targetW = size;
      targetH = size;
    } else if (preset === '4:3') {
      targetH = Math.min(h, Math.round(w * (3 / 4)));
      targetW = Math.round(targetH * (4 / 3));
    }

    setCrop({
      x: Math.round((w - targetW) / 2),
      y: Math.round((h - targetH) / 2),
      width: targetW,
      height: targetH,
      aspectRatio: preset,
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-slate-950 overflow-hidden relative">
      {editorNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-amber-500/40 text-amber-200 text-xs px-4 py-2 rounded-lg shadow-xl shadow-black/60 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>{editorNotice}</span>
        </div>
      )}
      {/* Top Bar: Title, Breadcrumb & Primary Actions */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/90 px-4 md:px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToSetup}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Back to Record Screen"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Editable Video Title */}
          <div className="flex flex-col">
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => {
                setVideoTitle(e.target.value);
                onUpdateRecordingMeta(e.target.value);
              }}
              className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-sky-500 text-sm font-semibold text-white focus:outline-none px-1 py-0.5"
            />
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{formatTimecode(duration)}</span>
              <span>•</span>
              <span>{formatFileSize(recording.fileSize)}</span>
              {autoSaveNotice && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-medium">
                    <Check className="w-3 h-3" /> Auto-saved to destination
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Destination Path indicator pill */}
        {destinationFolder && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <Folder className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-500">Stored at:</span>
            <span className="font-mono text-slate-300 truncate max-w-xs">{destinationFolder}</span>
          </div>
        )}

        {/* Main Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="btn-delete-recording"
            onClick={onDelete}
            className="p-2 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
            title="Delete Recording"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            id="btn-save-copy"
            onClick={onSaveCopy}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            title="Save Project Copy"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          {onOpenReelsMerger && (
            <button
              onClick={() => onOpenReelsMerger(recording)}
              className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-rose-500/30"
              title="Open in Reels & Video Merger Studio"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Merge to Reel</span>
            </button>
          )}

          <button
            id="btn-open-export"
            onClick={onExport}
            className="px-4 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center gap-1.5 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export (MP4 / MOV / GIF)</span>
          </button>
        </div>
      </div>

      {/* Main Workspace (Preview Player on top/center, Editing Panels below) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left / Center: Video Stage & Player */}
        <div className="flex-1 flex flex-col bg-slate-950 p-4 md:p-6 items-center justify-center relative select-none">
          {/* Video Container with Crop Outline overlay */}
          <div className="relative max-h-[50vh] lg:max-h-[60vh] max-w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl flex items-center justify-center border border-slate-800">
            <video
              ref={videoRef}
              src={recording.url}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              className="max-h-full max-w-full object-contain"
              playsInline
            />

            {/* Visual Crop Frame indicator on screen if active */}
            {crop && (
              <div 
                className="absolute border-2 border-dashed border-sky-400 pointer-events-none bg-sky-500/10"
                style={{
                  width: `${(crop.width / (recording.width || 1920)) * 100}%`,
                  height: `${(crop.height / (recording.height || 1080)) * 100}%`,
                }}
              >
                <span className="absolute top-1 left-1 bg-sky-500 text-slate-950 font-mono text-[10px] font-bold px-1 rounded">
                  Crop: {crop.aspectRatio || 'Custom'}
                </span>
              </div>
            )}

            {/* Big center play icon when paused */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute w-14 h-14 rounded-full bg-slate-900/80 hover:bg-sky-600 text-white flex items-center justify-center shadow-xl backdrop-blur-sm transition-all transform hover:scale-110"
              >
                <Play className="w-6 h-6 fill-current ml-1" />
              </button>
            )}
          </div>

          {/* Player Controls Bar */}
          <div className="w-full max-w-2xl mt-4 bg-slate-900/80 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between gap-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <button
                id="btn-player-play"
                onClick={togglePlay}
                className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => seekTo(trim.start)}
                className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                title="Rewind to Trim Start"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <span className="font-mono text-xs text-slate-300">
                {formatTimecode(currentTime)} / {formatTimecode(duration)}
              </span>
            </div>

            {/* Scrubber slider */}
            <div className="flex-1 mx-2 relative flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.01}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>

            {/* Volume control */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="text-slate-400 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right / Bottom: Video Editing Tools Panel */}
        <div className="w-full lg:w-96 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-auto lg:h-full">
          {/* Tool Navigation Tabs */}
          <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/60 p-1">
            <button
              onClick={() => setActiveTab('trim')}
              className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                activeTab === 'trim'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scissors className="w-4 h-4" />
              <span>Trim / Clip</span>
            </button>

            <button
              onClick={() => setActiveTab('crop')}
              className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                activeTab === 'crop'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CropIcon className="w-4 h-4" />
              <span>Crop</span>
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                activeTab === 'audio'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Music</span>
            </button>

            <button
              onClick={() => setActiveTab('voiceover')}
              className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                activeTab === 'voiceover'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Voiceover</span>
            </button>
          </div>

          {/* Active Tool Content */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6">
            {/* TAB 1: TRIM / CLIP VIDEO */}
            {activeTab === 'trim' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Clip & Trim Video</h4>
                  <p className="text-xs text-slate-400">
                    Set the in-point and out-point to cut unwanted beginning or end footage.
                  </p>
                </div>

                {/* Timeline Range Visualizer */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>Start: <b className="text-sky-400">{formatTimecode(trim.start)}</b></span>
                    <span>Duration: <b className="text-indigo-300">{formatTimecode(Math.max(0, trim.end - trim.start))}</b></span>
                    <span>End: <b className="text-sky-400">{formatTimecode(trim.end)}</b></span>
                  </div>

                  {/* Dual handles */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Start In-Point (Sec)</label>
                      <input
                        type="range"
                        min={0}
                        max={trim.end - 0.2}
                        step={0.1}
                        value={trim.start}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrim((prev) => ({ ...prev, start: val }));
                          seekTo(val);
                        }}
                        className="w-full accent-sky-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">End Out-Point (Sec)</label>
                      <input
                        type="range"
                        min={trim.start + 0.2}
                        max={duration}
                        step={0.1}
                        value={trim.end}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTrim((prev) => ({ ...prev, end: val }));
                          seekTo(val);
                        }}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Quick Trim Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-850">
                    <button
                      onClick={() => setTrim((prev) => ({ ...prev, start: currentTime }))}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 transition-colors"
                    >
                      Set Start to Current Time
                    </button>
                    <button
                      onClick={() => setTrim((prev) => ({ ...prev, end: currentTime }))}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 transition-colors"
                    >
                      Set End to Current Time
                    </button>
                  </div>

                  <button
                    onClick={() => setTrim({ start: 0, end: duration })}
                    className="w-full py-1.5 rounded text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Reset Trim to Full Length
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: CROP VIDEO */}
            {activeTab === 'crop' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Crop Dimensions</h4>
                  <p className="text-xs text-slate-400">
                    Refocus the video frame for specific social media or widescreen aspect ratios.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCropPreset('original')}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      !crop ? 'bg-sky-500/20 border-sky-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="text-xs font-semibold">Original Frame</div>
                    <div className="text-[10px] text-slate-500">{recording.width} × {recording.height}</div>
                  </button>

                  <button
                    onClick={() => setCropPreset('16:9')}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      crop?.aspectRatio === '16:9' ? 'bg-sky-500/20 border-sky-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="text-xs font-semibold">16:9 Widescreen</div>
                    <div className="text-[10px] text-slate-500">YouTube / Desktop</div>
                  </button>

                  <button
                    onClick={() => setCropPreset('9:16')}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      crop?.aspectRatio === '9:16' ? 'bg-sky-500/20 border-sky-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="text-xs font-semibold">9:16 Vertical</div>
                    <div className="text-[10px] text-slate-500">Shorts / Reels</div>
                  </button>

                  <button
                    onClick={() => setCropPreset('1:1')}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      crop?.aspectRatio === '1:1' ? 'bg-sky-500/20 border-sky-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="text-xs font-semibold">1:1 Square</div>
                    <div className="text-[10px] text-slate-500">Instagram / Feed</div>
                  </button>
                </div>

                {crop && (
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-1">
                    <div className="font-semibold text-sky-400">Crop Applied</div>
                    <div>Width: {crop.width}px • Height: {crop.height}px</div>
                    <button
                      onClick={() => setCrop(null)}
                      className="text-[11px] text-rose-400 hover:underline pt-1 block"
                    >
                      Remove crop filter
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ADD AUDIO FROM LOCAL FILE SYSTEM */}
            {activeTab === 'audio' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Background Audio & Music</h4>
                  <p className="text-xs text-slate-400">
                    Import audio tracks from your Windows filesystem to blend with your screen recording.
                  </p>
                </div>

                {/* Upload Trigger */}
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                />

                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full py-3 px-4 border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-xl bg-slate-950 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-white transition-colors"
                >
                  <Plus className="w-5 h-5 text-sky-400" />
                  <span className="text-xs font-medium">Add Audio File from PC</span>
                  <span className="text-[10px] text-slate-500">Supports MP3, WAV, AAC, M4A, OGG</span>
                </button>

                {/* Added Tracks List */}
                <div className="space-y-3">
                  {bgmTracks.map((track) => (
                    <div key={track.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <Music className="w-4 h-4 text-sky-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-slate-200 truncate">{track.name}</span>
                        </div>
                        <button
                          onClick={() => removeBgmTrack(track.id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Volume Slider */}
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={track.volume}
                          onChange={(e) => updateBgmVolume(track.id, parseFloat(e.target.value))}
                          className="flex-1 accent-sky-500"
                        />
                        <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                          {Math.round(track.volume * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                  {bgmTracks.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-2">
                      No external audio tracks added yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: RECORD AUDIO WHILE VIDEO PLAYBACK (VOICEOVER) */}
            {activeTab === 'voiceover' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Record Live Voiceover</h4>
                  <p className="text-xs text-slate-400">
                    Record microphone audio commentary while watching the video playback in real time.
                  </p>
                </div>

                {/* Voiceover Control Box */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col items-center text-center space-y-3">
                  {isRecordingVoiceover ? (
                    <>
                      <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold animate-pulse">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                        RECORDING DUBBING: {voiceoverElapsed.toFixed(1)}s
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Speak into your microphone. Video is playing live!
                      </p>
                      <button
                        onClick={stopVoiceoverRecording}
                        className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Stop Voiceover
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
                        <Mic className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">Ready to Dub Commentary</div>
                        <div className="text-[10px] text-slate-500">Video will play automatically while recording</div>
                      </div>
                      <button
                        onClick={startVoiceoverRecording}
                        className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all active:scale-95"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Record Voiceover Now
                      </button>
                    </>
                  )}
                </div>

                {/* Recorded Voiceovers List */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Dubbed Audio Tracks ({voiceovers.length})
                  </div>
                  {voiceovers.map((vo, i) => (
                    <div key={vo.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mic className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="text-xs font-medium text-slate-200">Voiceover Take {i + 1}</div>
                          <div className="text-[10px] text-slate-500">
                            Starts at {formatTimecode(vo.startTime)} ({vo.duration.toFixed(1)}s)
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeVoiceover(vo.id)}
                        className="p-1 text-slate-500 hover:text-rose-400"
                        title="Delete voiceover take"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {voiceovers.length === 0 && !isRecordingVoiceover && (
                    <p className="text-xs text-slate-500 text-center py-2">
                      No voiceover takes recorded yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
