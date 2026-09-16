import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Play, 
  Pause, 
  Square, 
  Mic, 
  MicOff, 
  Maximize2, 
  GripHorizontal,
  Volume2,
  VolumeX,
  Sparkles
} from 'lucide-react';

interface FloatingOrbProps {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  isMicMuted: boolean;
  isSysAudioMuted: boolean;
  onTogglePause: () => void;
  onStopRecording: () => void;
  onToggleMic: () => void;
  onToggleSysAudio: () => void;
  onRestoreWindow: () => void;
}

export const FloatingOrb: React.FC<FloatingOrbProps> = ({
  isRecording,
  isPaused,
  duration,
  isMicMuted,
  isSysAudioMuted,
  onTogglePause,
  onStopRecording,
  onToggleMic,
  onToggleSysAudio,
  onRestoreWindow,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      id="floating-orb-overlay"
      drag
      dragMomentum={false}
      initial={{ scale: 0.7, opacity: 0, y: 50 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.7, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-10 right-10 z-50 select-none cursor-move"
    >
      <div className="relative group">
        {/* Glow ambient background ring */}
        <div 
          className={`absolute -inset-1 rounded-full blur-md opacity-75 transition-colors duration-500 ${
            isPaused 
              ? 'bg-amber-500/40' 
              : 'bg-rose-500/50 animate-pulse'
          }`}
        />

        {/* Main Floating Orb Pill Container */}
        <div className="relative flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 shadow-2xl px-4 py-2.5 rounded-full text-white">
          {/* Drag Handle */}
          <div className="text-slate-500 hover:text-slate-300 p-0.5 cursor-grab active:cursor-grabbing">
            <GripHorizontal className="w-4 h-4" />
          </div>

          {/* Glowing Recording Status Indicator & Timer */}
          <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
            <div className="relative flex items-center justify-center">
              <span 
                className={`w-3 h-3 rounded-full ${
                  isPaused ? 'bg-amber-400' : 'bg-rose-500 animate-ping absolute inset-0'
                }`} 
              />
              <span 
                className={`w-3 h-3 rounded-full relative ${
                  isPaused ? 'bg-amber-400' : 'bg-rose-500'
                }`} 
              />
            </div>
            
            <div className="flex flex-col">
              <span className="font-mono text-xs font-bold tracking-wider text-slate-100">
                {formatTimer(duration)}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold -mt-0.5">
                {isPaused ? 'Paused' : 'Recording'}
              </span>
            </div>
          </div>

          {/* Play / Pause Toggle Button */}
          <button
            id="orb-btn-pause"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePause();
            }}
            className={`p-2 rounded-full transition-all duration-200 ${
              isPaused 
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md' 
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
            }`}
            title={isPaused ? 'Resume Recording' : 'Pause Recording'}
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
          </button>

          {/* Stop Recording Button */}
          <button
            id="orb-btn-stop"
            onClick={(e) => {
              e.stopPropagation();
              onStopRecording();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-medium text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-95"
            title="Stop Recording and Auto-Save"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span className="font-semibold">Stop</span>
          </button>

          {/* Audio Toggles: Microphone */}
          <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
            <button
              id="orb-btn-mic"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMic();
              }}
              className={`p-2 rounded-full transition-colors ${
                isMicMuted 
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
            </button>

            {/* System Audio Toggle */}
            <button
              id="orb-btn-sysaudio"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSysAudio();
              }}
              className={`p-2 rounded-full transition-colors ${
                isSysAudioMuted 
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              title={isSysAudioMuted ? 'Unmute System Audio' : 'Mute System Audio'}
            >
              {isSysAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-sky-400" />}
            </button>
          </div>

          {/* Maximize / Restore to Main Window button */}
          <button
            id="orb-btn-restore"
            onClick={(e) => {
              e.stopPropagation();
              onRestoreWindow();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition-colors"
            title="Restore Main Window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Floating tooltip hint on drag */}
        {isHovered && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800/90 text-slate-300 text-[10px] px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap border border-slate-700">
            Drag to reposition overlay
          </div>
        )}
      </div>
    </motion.div>
  );
};
