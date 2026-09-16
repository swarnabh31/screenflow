import React from 'react';
import { 
  Minus, 
  Square, 
  X, 
  Video, 
  Settings, 
  Folder, 
  Sparkles, 
  Film,
  Layers,
  Minimize2,
  Maximize2
} from 'lucide-react';

interface TitleBarProps {
  isRecording: boolean;
  recordingDuration?: number;
  destinationFolder?: string;
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onOpenReelsMerger?: () => void;
  onMinimizeToOrb?: () => void;
  recordingsCount: number;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isRecording,
  recordingDuration = 0,
  destinationFolder,
  onOpenSettings,
  onOpenLibrary,
  onOpenReelsMerger,
  onMinimizeToOrb,
  recordingsCount,
  isMaximized = true,
  onToggleMaximize,
}) => {
  const formatSecs = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header 
      id="windows-titlebar" 
      className="h-10 bg-slate-900/95 border-b border-slate-800/80 flex items-center justify-between px-3 select-none text-xs text-slate-300 backdrop-blur-md z-30"
    >
      {/* Left: Window Brand and Status */}
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white shadow-sm">
          <Video className="w-3.5 h-3.5" />
        </div>
        <span className="font-semibold text-slate-100 tracking-tight flex items-center gap-2 text-sm">
          Screenflow
        </span>

        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[11px] animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            REC {formatSecs(recordingDuration)}
          </div>
        )}
      </div>

      {/* Middle: Save Path breadcrumb */}
      {destinationFolder && (
        <div
          onClick={onOpenSettings}
          className="hidden md:flex items-center gap-1.5 text-slate-400 bg-slate-800/60 hover:bg-slate-800 hover:text-slate-200 transition-colors px-2.5 py-1 rounded-md cursor-pointer max-w-xs truncate border border-slate-700/40"
          title={`Saved to: ${destinationFolder} (Click to change)`}
        >
          <Folder className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          <span className="truncate text-[11px] font-mono">{destinationFolder}</span>
        </div>
      )}

      {/* Right: Actions & Windows Controls */}
      <div className="flex items-center gap-1">
        {onOpenReelsMerger && (
          <button
            id="btn-nav-reels"
            onClick={onOpenReelsMerger}
            className="flex items-center gap-1.5 px-2.5 py-1 text-slate-200 hover:bg-rose-500/20 hover:text-rose-300 rounded transition-colors text-[11px] border border-transparent hover:border-rose-500/30"
            title="Import and merge videos from PC into Reels & YouTube Shorts"
          >
            <Layers className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-medium">Reels & Merger</span>
          </button>
        )}

        <button
          id="btn-nav-library"
          onClick={onOpenLibrary}
          className="flex items-center gap-1.5 px-2.5 py-1 text-slate-300 hover:bg-slate-800 hover:text-white rounded transition-colors text-[11px]"
          title="View Saved Recordings"
        >
          <Film className="w-3.5 h-3.5 text-indigo-400" />
          <span>Library</span>
          {recordingsCount > 0 && (
            <span className="bg-indigo-500/30 text-indigo-300 text-[10px] px-1.5 py-0.2 rounded-full font-medium">
              {recordingsCount}
            </span>
          )}
        </button>

        <button
          id="btn-nav-settings"
          onClick={onOpenSettings}
          className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Settings & Storage Destination"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Windows Standard Window Buttons */}
        <button
          id="btn-win-minimize"
          onClick={onMinimizeToOrb}
          className="p-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title="Minimize to Floating Orb Overlay"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          id="btn-win-maximize"
          onClick={onToggleMaximize}
          className="p-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded transition-colors"
          title={isMaximized ? "Restore Window Size" : "Maximize / Cover Full Screen"}
        >
          {isMaximized ? (
            <Minimize2 className="w-2.5 h-2.5" />
          ) : (
            <Square className="w-2.5 h-2.5" />
          )}
        </button>
        <button
          id="btn-win-close"
          className="p-2 text-slate-400 hover:bg-rose-600 hover:text-white rounded transition-colors"
          title="Close Window"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
};
