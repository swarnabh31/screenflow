import React from 'react';
import { 
  Monitor, 
  AppWindow, 
  Crosshair, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Play, 
  Folder, 
  Settings, 
  Film, 
  Sparkles,
  Camera,
  CheckCircle2,
  Clock,
  Sliders,
  Layers,
  Smartphone,
  ArrowRight
} from 'lucide-react';
import { RecordingMode, RegionBounds, SavedRecording } from '../types';

interface RecordingSetupProps {
  mode: RecordingMode;
  onSelectMode: (mode: RecordingMode) => void;
  region: RegionBounds | null;
  onOpenRegionSelector?: () => void;
  recordMic: boolean;
  onToggleMic: () => void;
  recordSysAudio: boolean;
  onToggleSysAudio: () => void;
  includeCamera: boolean;
  onToggleCamera: () => void;
  destinationFolder?: string;
  onChangeFolder: () => void;
  onOpenSettings: () => void;
  onStartRecording: () => void;
  isStarting: boolean;
  recentRecordings: SavedRecording[];
  onOpenRecording: (recording: SavedRecording) => void;
  onOpenLibrary: () => void;
  onOpenReelsMerger: () => void;
}

export const RecordingSetup: React.FC<RecordingSetupProps> = ({
  mode,
  onSelectMode,
  region,
  onOpenRegionSelector,
  recordMic,
  onToggleMic,
  recordSysAudio,
  onToggleSysAudio,
  includeCamera,
  onToggleCamera,
  destinationFolder,
  onChangeFolder,
  onOpenSettings,
  onStartRecording,
  isStarting,
  recentRecordings,
  onOpenRecording,
  onOpenLibrary,
  onOpenReelsMerger,
}) => {
  return (
    <div className="flex-1 min-h-0 p-4 sm:p-6 md:p-8 flex flex-col overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full my-auto space-y-5 sm:space-y-6 md:space-y-7 py-2 sm:py-4">
        {/* Header Title & Description */}
        <div className="text-center space-y-1.5 sm:space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Capture Your Screen
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto">
            Choose what you want to capture, configure audio preferences, and start recording. 
            The app will automatically collapse into an overlay Orb while recording.
          </p>
        </div>

        {/* 1. Source Selection Cards (Full Screen / Window / Region) */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
            1. Select Capture Source
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Full Screen */}
            <button
              id="source-fullscreen"
              type="button"
              onClick={() => onSelectMode('fullscreen')}
              className={`p-4 sm:p-5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                mode === 'fullscreen'
                  ? 'bg-sky-950/40 border-sky-500/80 shadow-lg shadow-sky-500/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className={`p-2.5 sm:p-3 rounded-lg ${mode === 'fullscreen' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                  <Monitor className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                {mode === 'fullscreen' && (
                  <CheckCircle2 className="w-5 h-5 text-sky-400" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100 mb-1">Full Screen</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Record your entire desktop monitor with multi-tasking windows.
                </p>
              </div>
            </button>

            {/* Specific Window */}
            <button
              id="source-window"
              type="button"
              onClick={() => onSelectMode('window')}
              className={`p-4 sm:p-5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                mode === 'window'
                  ? 'bg-indigo-950/40 border-indigo-500/80 shadow-lg shadow-indigo-500/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className={`p-2.5 sm:p-3 rounded-lg ${mode === 'window' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  <AppWindow className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                {mode === 'window' && (
                  <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100 mb-1">Specific Window</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Isolate and capture a single window or browser tab via the picker.
                </p>
              </div>
            </button>

            {/* Select Region */}
            <div
              className={`p-4 sm:p-5 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                mode === 'region'
                  ? 'bg-emerald-950/40 border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div className="cursor-pointer" onClick={() => onSelectMode('region')}>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className={`p-2.5 sm:p-3 rounded-lg ${mode === 'region' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                    <Crosshair className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  {mode === 'region' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mb-1">Custom Region</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Crop and record a specific rectangular coordinate area on screen.
                </p>
              </div>

              <button
                id="btn-select-region"
                type="button"
                onClick={onOpenRegionSelector}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
                {region ? `${region.width} × ${region.height} px (Change)` : 'Select Region Bounds'}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Audio & Video Settings Toggles */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 sm:p-4 md:p-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2.5 sm:mb-3">
            2. Audio & Input Settings
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {/* Microphone Toggle */}
            <button
              id="toggle-mic"
              type="button"
              onClick={onToggleMic}
              className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                recordMic
                  ? 'bg-slate-800/90 border-slate-700 text-white'
                  : 'bg-slate-950/60 border-slate-850 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded ${recordMic ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                  {recordMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <div className="text-xs font-medium">Microphone</div>
                  <div className="text-[10px] text-slate-400">{recordMic ? 'Enabled' : 'Muted'}</div>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${recordMic ? 'bg-emerald-500' : 'bg-slate-700'}`} />
            </button>

            {/* System Audio Toggle */}
            <button
              id="toggle-sys-audio"
              type="button"
              onClick={onToggleSysAudio}
              className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                recordSysAudio
                  ? 'bg-slate-800/90 border-slate-700 text-white'
                  : 'bg-slate-950/60 border-slate-850 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded ${recordSysAudio ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-500'}`}>
                  {recordSysAudio ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <div className="text-xs font-medium">System Sound</div>
                  <div className="text-[10px] text-slate-400">{recordSysAudio ? 'Enabled' : 'Muted'}</div>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${recordSysAudio ? 'bg-sky-500' : 'bg-slate-700'}`} />
            </button>

            {/* Webcam PiP Toggle */}
            <button
              id="toggle-pip-camera"
              type="button"
              onClick={onToggleCamera}
              className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                includeCamera
                  ? 'bg-slate-800/90 border-slate-700 text-white'
                  : 'bg-slate-950/60 border-slate-850 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded ${includeCamera ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-500'}`}>
                  <Camera className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-medium">Camera Overlay</div>
                  <div className="text-[10px] text-slate-400">{includeCamera ? 'PiP Active' : 'Off'}</div>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${includeCamera ? 'bg-purple-500' : 'bg-slate-700'}`} />
            </button>
          </div>
        </div>

        {/* 3. Destination folder bar & Start Recording Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          {/* Destination Path indicator */}
          <div
            id="btn-change-folder"
            onClick={onChangeFolder}
            className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-700 hover:border-sky-500/50 cursor-pointer w-full sm:w-auto"
            title={destinationFolder ? `Save to: ${destinationFolder}` : 'Choose where recordings are saved'}
          >
            <Folder className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <div className="truncate">
              <span className="text-slate-500 mr-1">Save to:</span>
              <span className="font-mono text-slate-300 font-medium">{destinationFolder || 'Choose a folder…'}</span>
            </div>
            <span className="text-[10px] text-sky-400 font-medium hover:underline ml-1">Choose</span>
          </div>

          {/* Primary Start Recording CTA */}
          <button
            id="btn-start-recording"
            type="button"
            disabled={isStarting}
            onClick={onStartRecording}
            className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl font-bold text-sm shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2.5 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="w-3.5 h-3.5 rounded-full bg-white animate-pulse" />
            <span>{isStarting ? 'Preparing Screen...' : 'Start Recording'}</span>
          </button>
        </div>

        {/* 4. Reels & Shorts Video Merger Banner */}
        <div 
          onClick={onOpenReelsMerger}
          className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-indigo-950/30 border border-rose-500/30 hover:border-rose-500/60 shadow-lg cursor-pointer transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-rose-600/30 group-hover:scale-105 transition-transform flex-shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-sm font-bold text-white">Reels & Video Merger</h3>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-semibold px-2 py-0.5 rounded-full border border-rose-500/30">
                  New Feature
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-lg">
                Import videos from your PC (one by one or all at once), sequence & trim clips, apply vertical 9:16 Reels/Shorts framing with ambient background blur, transitions, hooks, and export.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="px-4 py-2 bg-rose-600 group-hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all flex-shrink-0"
          >
            <span>Open Merger Studio</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* 5. Recent Recordings Strip (if any) */}
        {recentRecordings.length > 0 && (
          <div className="pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-indigo-400" />
                Recent Recordings
              </span>
              <button
                onClick={onOpenLibrary}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium"
              >
                View all ({recentRecordings.length})
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentRecordings.slice(0, 4).map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => onOpenRecording(rec)}
                  className="group relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-lg"
                >
                  <div className="aspect-video bg-slate-950 relative flex items-center justify-center overflow-hidden">
                    {rec.thumbnailUrl ? (
                      <img 
                        src={rec.thumbnailUrl} 
                        alt={rec.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <Film className="w-8 h-8 text-slate-700" />
                    )}
                    <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/10 flex items-center justify-center transition-colors">
                      <div className="w-8 h-8 rounded-full bg-sky-500/90 text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1 right-1 bg-slate-950/80 text-[10px] font-mono text-slate-300 px-1 rounded">
                      {Math.floor(rec.duration)}s
                    </span>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-medium text-slate-200 truncate">{rec.title}</div>
                    <div className="text-[10px] text-slate-500">{new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
