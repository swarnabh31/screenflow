import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RecordingMode,
  RegionBounds,
  SavedRecording,
  AppSettings,
  TrimRange,
  CropArea,
  AudioTrackConfig,
  VoiceoverTake
} from './types';
import {
  loadSettings,
  saveSettings,
  saveRecordingToStorage,
  getAllRecordingsFromStorage,
  deleteRecordingFromStorage,
  generateThumbnailFromVideo,
  readVideoDurationSec
} from './utils/storage';
import {
  pickDirectory,
  setSessionFolder,
  getSessionFolder,
  writeBlobToFolder
} from './utils/folderStorage';

import { TitleBar } from './components/TitleBar';
import { FloatingOrb } from './components/FloatingOrb';
import { RecordingSetup } from './components/RecordingSetup';
import { CountdownOverlay } from './components/CountdownOverlay';
import {
  ClockState,
  clockStart,
  clockPause,
  clockResume,
  clockStop,
  computeElapsedSeconds,
} from './utils/recordingClock';
const VideoEditor = lazy(() => import('./components/VideoEditor').then((m) => ({ default: m.VideoEditor })));
const ReelsMergerStudio = lazy(() => import('./components/ReelsMergerStudio').then((m) => ({ default: m.ReelsMergerStudio })));
import { RegionSelectorModal } from './components/RegionSelectorModal';
import { ExportModal } from './components/ExportModal';
import { LibraryModal } from './components/LibraryModal';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  // Application Settings
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Capture Configuration
  const [mode, setMode] = useState<RecordingMode>('fullscreen');
  const [region, setRegion] = useState<RegionBounds | null>({
    x: 320,
    y: 180,
    width: 1280,
    height: 720,
  });
  const [recordMic, setRecordMic] = useState(settings.recordMicByDefault);
  const [recordSysAudio, setRecordSysAudio] = useState(settings.recordSystemAudio);
  const [includeCamera, setIncludeCamera] = useState(false);

  // Active Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isMinimizedToOrb, setIsMinimizedToOrb] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSysAudioMuted, setIsSysAudioMuted] = useState(false);

  // Views & Modals
  const [view, setView] = useState<'setup' | 'editor' | 'merger'>('setup');
  const [isMaximized, setIsMaximized] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Save folder selection (File System Access API)
  const [destinationFolder, setDestinationFolder] = useState<string | null>(() => getSessionFolder()?.name ?? null);

  const handlePickFolder = async () => {
    const handle = await pickDirectory();
    if (!handle) {
      showToast('Could not open the folder picker in this browser.');
      return;
    }
    setSessionFolder(handle);
    setDestinationFolder(handle.name);
    showToast(`Recordings will now be saved to "${handle.name}".`);
  };

  const [showLibrary, setShowLibrary] = useState(false);
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Library & Selected Recording
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [currentRecording, setCurrentRecording] = useState<SavedRecording | null>(null);

  // Video Editor Specific State
  const [trim, setTrim] = useState<TrimRange>({ start: 0, end: 0 });
  const [crop, setCrop] = useState<CropArea | null>(null);
  const [bgmTracks, setBgmTracks] = useState<AudioTrackConfig[]>([]);
  const [voiceovers, setVoiceovers] = useState<VoiceoverTake[]>([]);

  // Recording Hardware Refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const sysAudioTracksRef = useRef<MediaStreamTrack[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const durationTimerRef = useRef<number | null>(null);
  const compositeAnimRef = useRef<number | null>(null);

  // Pure-logic clock (see src/utils/recordingClock.ts). Kept in a ref so
  // closures (onstop, setInterval, etc.) always read fresh values.
  const clockRef = useRef<ClockState>({ startMs: null, pausedSinceMs: null, pausedAccumMs: 0 });

  // -------------------------------------------------------------
  // Load recordings on startup
  useEffect(() => {
    getAllRecordingsFromStorage().then((list) => {
      setRecordings(list);
    });
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // -------------------------------------------------------------
  // RECORDING PIPELINE
  // -------------------------------------------------------------
  const handleInitiateRecording = () => {
    if (settings.countdownDuration > 0) {
      setShowCountdown(true);
    } else {
      startActualRecording();
    }
  };

  const startActualRecording = async () => {
    setShowCountdown(false);
    if (isStarting || isRecording) return;
    setIsStarting(true);

    try {
      // Request system audio when enabled. The browser surfaces this as the native
      // "Also share audio from this tab/window" control in the picker, which yields
      // an audio track we record into the output alongside the desktop video.
      let captureStream: MediaStream;
      try {
        captureStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: mode === 'window' ? 'window' : 'monitor',
            frameRate: settings.frameRate,
          },
          audio: recordSysAudio,
        });
      } catch (err) {
        console.warn('Screen capture via getDisplayMedia was cancelled or restricted:', err);
        setIsStarting(false);
        showToast('Screen capture was cancelled or unavailable. Allow screen-sharing permission and try again.');
        return;
      }

      // Track the system-audio tracks (if the user opted into "share audio") so we
      // can mute/unmute them independently from the microphone later.
      sysAudioTracksRef.current = recordSysAudio ? [...captureStream.getAudioTracks()] : [];

      mediaStreamRef.current = captureStream;

      // Webcam PiP (real): acquire the camera and composite it as an inset overlay.
      let camStream: MediaStream | null = null;
      if (includeCamera) {
        try {
          camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 480, height: 360, facingMode: 'user' },
          });
          camStreamRef.current = camStream;
        } catch (camErr) {
          console.warn('Camera access denied or unavailable:', camErr);
          showToast('Camera could not be enabled — check permissions.');
        }
      }

      // Compose the final video track: region-crop (if region mode) + camera PiP.
      // If neither is needed we record the raw capture track directly.
      let finalStream = captureStream;
      const needsComposite =
        (mode === 'region' && region) || (camStream && camStream.getVideoTracks().length > 0);
      if (needsComposite) {
        finalStream = buildCompositeStream(captureStream, region, camStream);
      }

      // Add Microphone Audio if enabled (kept as a separate track)
      if (recordMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;
          const micTrack = micStream.getAudioTracks()[0];
          if (micTrack) {
            finalStream.addTrack(micTrack);
          }
        } catch (micErr) {
          console.warn('Microphone permission not granted:', micErr);
        }
      }

      // If the user enabled "System Sound" but did not opt into the browser's
      // "share audio" control, surface a clear toast once the stream settles.
      if (recordSysAudio && sysAudioTracksRef.current.length === 0) {
        showToast('System Sound was ON but no audio source was shared. Re-record and tick “Also share audio” in the picker.');
      }

      // MediaRecorder Setup
      recordedChunksRef.current = [];
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: settings.quality === 'ultra' ? 8000000 : 4000000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        await handleRecordingFinished(mimeType);
      };

      // Listen for stream ended (e.g. user clicks "Stop sharing" in browser native bar)
      captureStream.getVideoTracks()[0].onended = () => {
        if (isRecording) {
          stopRecording();
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;

      // Start recording state & minimize window into Floating Orb
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      setIsStarting(false);
      setIsMinimizedToOrb(true);

      // Duration counter. Elapsed time comes from a pure clock (recordingClock.ts)
      // held in a ref so onstop / intervals read fresh values, not stale React state.
      clockRef.current = clockStart(Date.now());
      durationTimerRef.current = window.setInterval(() => {
        setRecordingDuration(computeElapsedSeconds(clockRef.current, Date.now()));
      }, 500);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsStarting(false);
      showToast('Could not start screen recording. Please verify permissions or open in a new tab.');
    }
  };

  // Compose the final video track: region-cropped (if region mode) + webcam PiP inset.
  const buildCompositeStream = (
    srcStream: MediaStream,
    region: RegionBounds | null,
    camStream: MediaStream | null
  ): MediaStream => {
    const srcVideo = document.createElement('video');
    srcVideo.srcObject = srcStream;
    srcVideo.muted = true;
    srcVideo.playsInline = true;
    srcVideo.play().catch(() => {});

    let camVideo: HTMLVideoElement | null = null;
    if (camStream) {
      camVideo = document.createElement('video');
      camVideo.srcObject = camStream;
      camVideo.muted = true;
      camVideo.playsInline = true;
      camVideo.play().catch(() => {});
    }

    const getDims = () => {
      // If the source has real metadata use it, otherwise use the track dimensions, otherwise a 1080p fallback.
      const track = srcStream.getVideoTracks()[0];
      const settingsAny = track?.getSettings ? (track.getSettings() as unknown as { width?: number; height?: number }) : undefined;
      const vw = srcVideo.videoWidth || settingsAny?.width || 1920;
      const vh = srcVideo.videoHeight || settingsAny?.height || 1080;
      return {
        outW: region ? region.width : vw,
        outH: region ? region.height : vh,
      };
    };

    const canvas = document.createElement('canvas');
    let { outW, outH } = getDims();
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    // If we didn't have the real dimensions, resize the canvas once we learn them.
    srcVideo.onloadedmetadata = () => {
      const d = getDims();
      if (d.outW !== canvas.width) canvas.width = d.outW;
      if (d.outH !== canvas.height) canvas.height = d.outH;
      outW = d.outW;
      outH = d.outH;
    };

    const render = () => {
      if (srcStream.active && srcVideo.readyState >= 2) {
        if (region) {
          ctx.drawImage(
            srcVideo,
            region.x, region.y, region.width, region.height,
            0, 0, outW, outH
          );
        } else {
          ctx.drawImage(srcVideo, 0, 0, outW, outH);
        }

        // Draw PiP inset (bottom-right, preserving camera aspect)
        if (camVideo && camVideo.readyState >= 2 && camVideo.videoWidth > 0) {
          const pipW = Math.round(outW * 0.2);
          const pipH = Math.round(pipW * (camVideo.videoHeight / camVideo.videoWidth));
          const pad = Math.round(Math.min(outW, outH) * 0.02);
          const px = outW - pipW - pad;
          const py = outH - pipH - pad;
          const r = Math.min(10, pipW / 8);
          ctx.save();
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(px, py, pipW, pipH, r);
          } else {
            ctx.rect(px, py, pipW, pipH);
          }
          ctx.clip();
          ctx.drawImage(camVideo, px, py, pipW, pipH);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = Math.max(2, outW / 800);
          ctx.stroke();
        }
      }
      compositeAnimRef.current = requestAnimationFrame(render);
    };

    render();
    const outStream = canvas.captureStream(settings.frameRate);
    // Copy over the source audio tracks (system audio)
    srcStream.getAudioTracks().forEach((t) => outStream.addTrack(t));
    return outStream;
  };

  // Toggle Pause/Resume
  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      // Resume: fold the in-progress pause into accumulated pauses, clock keeps running.
      clockRef.current = clockResume(clockRef.current, Date.now());
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      durationTimerRef.current = window.setInterval(() => {
        setRecordingDuration(computeElapsedSeconds(clockRef.current, Date.now()));
      }, 500);
    } else {
      // Pause: mark the pause start so wall-clock time is excluded from elapsed.
      clockRef.current = clockPause(clockRef.current, Date.now());
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      setRecordingDuration(computeElapsedSeconds(clockRef.current, Date.now()));
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (compositeAnimRef.current) {
      cancelAnimationFrame(compositeAnimRef.current);
      compositeAnimRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop all hardware streams
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    sysAudioTracksRef.current = [];
    setIsRecording(false);
    setIsPaused(false);

    // Finalize the clock (folds any in-progress pause back in). handleRecordingFinished
    // (invoked via onstop) reads this ref to compute the stored duration.
    clockRef.current = clockStop(clockRef.current, Date.now());
  };

  // Handle Recording Finished & Auto-Save
  const handleRecordingFinished = async (mimeType: string) => {
    const blob = new Blob(recordedChunksRef.current, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const fallbackDuration = Math.max(1, computeElapsedSeconds(clockRef.current, Date.now()));
    // Prefer the real video duration from metadata (accounts for actual frames recorded);
    // fall back to the computed elapsed-time value.
    const realDuration = (await readVideoDurationSec(url)) ?? fallbackDuration;
    const thumbnail = await generateThumbnailFromVideo(url);

    const now = Date.now();
    const fileName = `ScreenRec_${new Date(now).toISOString().replace(/[:.]/g, '-')}.webm`;
    const finalDuration = Math.max(1, realDuration);

    const recordTitle = `Recording ${new Date(now).toLocaleDateString()} ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const newRecord: SavedRecording = {
      id: 'rec_' + now,
      title: recordTitle,
      blob,
      url,
      thumbnailUrl: thumbnail,
      duration: finalDuration,
      width: mode === 'region' && region ? region.width : 1920,
      height: mode === 'region' && region ? region.height : 1080,
      fileSize: blob.size,
      createdAt: now,
      folderPath: getSessionFolder()?.name ?? settings.destinationFolder ?? '',
      fileName,
      isAutoSaved: settings.autoSaveEnabled,
      mimeType,
    };

    // Auto-save to local persistent storage (IndexedDB)
    if (settings.autoSaveEnabled) {
      await saveRecordingToStorage(newRecord);
      setRecordings((prev) => [newRecord, ...prev]);
    }

    // Save a copy directly into the user's chosen folder
    const folder = getSessionFolder();
    if (folder) {
      const written = await writeBlobToFolder(folder, fileName, blob);
      showToast(
        written
          ? `Recording saved to "${folder.name}" and your local capture library.`
          : 'Recording saved to your local capture library. Re-grant folder access to write files there.'
      );
    } else {
      showToast('Recording saved to your local capture library.');
    }

    // Initialize Video Editor state for the newly captured video
    setCurrentRecording(newRecord);
    setTrim({ start: 0, end: finalDuration });
    setCrop(null);
    setBgmTracks([]);
    setVoiceovers([]);

    // Smooth transition: restore window and navigate directly to Editor
    setIsMinimizedToOrb(false);
    setView('editor');
  };

  // Toggle Mic inside Orb
  const handleToggleMic = () => {
    if (micStreamRef.current) {
      const audioTracks = micStreamRef.current.getAudioTracks();
      audioTracks.forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsMicMuted(!isMicMuted);
    } else {
      setIsMicMuted(!isMicMuted);
    }
  };

  // Toggle System audio inside Orb
  const handleToggleSysAudio = () => {
    const nextMuted = !isSysAudioMuted;
    sysAudioTracksRef.current.forEach((t) => {
      t.enabled = !nextMuted;
    });
    setIsSysAudioMuted(nextMuted);
  };

  // Delete Recording
  const handleDeleteCurrentRecording = async () => {
    if (!currentRecording) return;
    if (confirm(`Are you sure you want to delete "${currentRecording.title}"?`)) {
      await deleteRecordingFromStorage(currentRecording.id);
      setRecordings((prev) => prev.filter((r) => r.id !== currentRecording.id));
      showToast('Recording deleted.');
      setView('setup');
      setCurrentRecording(null);
    }
  };

  // Delete from Library
  const handleDeleteFromLibrary = async (id: string) => {
    await deleteRecordingFromStorage(id);
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    if (currentRecording?.id === id) {
      setCurrentRecording(null);
      setView('setup');
    }
    showToast('Recording removed from library.');
  };

  // Update Settings
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    setRecordMic(newSettings.recordMicByDefault);
    setRecordSysAudio(newSettings.recordSystemAudio);
    showToast('Settings updated.');
  };

  // Keyboard Shortcuts (F9: Start/Stop, F10: Pause, Alt+M: Mic)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          handleInitiateRecording();
        }
      } else if (e.key === 'F10' && isRecording) {
        e.preventDefault();
        togglePauseRecording();
      } else if (e.altKey && (e.key === 'm' || e.key === 'M') && isRecording) {
        e.preventDefault();
        handleToggleMic();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, isMicMuted]);

  return (
    <div className="relative w-full h-screen h-[100dvh] max-h-screen overflow-hidden select-none bg-slate-950 flex flex-col font-sans">
      <main className="relative flex-1 w-full min-h-0 flex items-center justify-center overflow-hidden z-10">
        {/* 1. Main Studio Application Frame */}
        <AnimatePresence>
          {!isMinimizedToOrb && (
            <motion.div
              key="main-app-window"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, y: 150 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={`w-full h-full flex flex-col bg-slate-900/98 shadow-2xl overflow-hidden backdrop-blur-2xl relative z-20 min-h-0 transition-all duration-300 ${
                isMaximized
                  ? 'max-w-full max-h-full rounded-none sm:rounded-2xl border-0 sm:border sm:border-slate-700/80'
                  : 'max-w-6xl max-h-[92vh] my-auto mx-auto rounded-2xl border border-slate-700/80'
              }`}
            >
              {/* Title Bar */}
              <TitleBar
                isRecording={isRecording}
                recordingDuration={recordingDuration}
                onOpenSettings={() => setShowSettings(true)}
                onOpenLibrary={() => setShowLibrary(true)}
                onOpenReelsMerger={() => setView('merger')}
                onMinimizeToOrb={() => setIsMinimizedToOrb(true)}
                recordingsCount={recordings.length}
                isMaximized={isMaximized}
                onToggleMaximize={() => setIsMaximized(!isMaximized)}
                destinationFolder={destinationFolder ?? undefined}
              />

              {/* View Switcher: Recording Dashboard vs Video Editor vs Reels Merger */}
              <Suspense fallback={<div className="flex-1 grid place-items-center text-slate-400 text-sm">Loading…</div>}>
                {view === 'setup' ? (
                  <RecordingSetup
                    mode={mode}
                    onSelectMode={setMode}
                    region={region}
                    onOpenRegionSelector={() => setShowRegionSelector(true)}
                    recordMic={recordMic}
                    onToggleMic={() => setRecordMic(!recordMic)}
                    recordSysAudio={recordSysAudio}
                    onToggleSysAudio={() => setRecordSysAudio(!recordSysAudio)}
                    includeCamera={includeCamera}
                    onToggleCamera={() => setIncludeCamera(!includeCamera)}
                    destinationFolder={destinationFolder}
                    onChangeFolder={handlePickFolder}
                    onOpenSettings={() => setShowSettings(true)}
                    onStartRecording={handleInitiateRecording}
                    isStarting={isStarting}
                    recentRecordings={recordings}
                    onOpenRecording={(rec) => {
                      setCurrentRecording(rec);
                      setTrim({ start: 0, end: rec.duration });
                      setCrop(null);
                      setBgmTracks([]);
                      setVoiceovers([]);
                      setView('editor');
                    }}
                    onOpenLibrary={() => setShowLibrary(true)}
                    onOpenReelsMerger={() => setView('merger')}
                  />
                ) : view === 'merger' ? (
                    <ReelsMergerStudio
                      savedRecordings={recordings}
                      destinationFolder={destinationFolder ?? undefined}
                      onClose={() => setView('setup')}
                    onSaveToLibrary={async (newRec) => {
                      await saveRecordingToStorage(newRec);
                      const updated = await getAllRecordingsFromStorage();
                      setRecordings(updated);
                    }}
                    onShowToast={showToast}
                  />
                ) : (
                  currentRecording && (
                    <VideoEditor
                      recording={currentRecording}
                      destinationFolder={destinationFolder ?? undefined}
                      onExport={() => setShowExport(true)}
                      onDelete={handleDeleteCurrentRecording}
                      onSaveCopy={async () => {
                        await saveRecordingToStorage(currentRecording);
                        showToast('Project copy saved to library.');
                      }}
                      onBackToSetup={() => setView('setup')}
                      onOpenReelsMerger={() => setView('merger')}
                      onUpdateRecordingMeta={(title) => {
                        setCurrentRecording((prev) => (prev ? { ...prev, title } : null));
                      }}
                      trim={trim}
                      setTrim={setTrim}
                      crop={crop}
                      setCrop={setCrop}
                      bgmTracks={bgmTracks}
                      setBgmTracks={setBgmTracks}
                      voiceovers={voiceovers}
                      setVoiceovers={setVoiceovers}
                    />
                  )
                )}
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. Minimized Floating Orb Overlay */}
        <AnimatePresence>
          {isMinimizedToOrb && (
            <FloatingOrb
              isRecording={isRecording}
              isPaused={isPaused}
              duration={recordingDuration}
              isMicMuted={isMicMuted}
              isSysAudioMuted={isSysAudioMuted}
              onTogglePause={togglePauseRecording}
              onStopRecording={stopRecording}
              onToggleMic={handleToggleMic}
              onToggleSysAudio={handleToggleSysAudio}
              onRestoreWindow={() => setIsMinimizedToOrb(false)}
            />
          )}
        </AnimatePresence>

        {/* 3. Countdown Overlay */}
        {showCountdown && (
          <CountdownOverlay
            duration={settings.countdownDuration}
            onComplete={startActualRecording}
            onCancel={() => setShowCountdown(false)}
          />
        )}

        {/* Region Selector Modal */}
        {showRegionSelector && (
          <RegionSelectorModal
            initialRegion={region || undefined}
            onConfirm={(selected) => {
              setRegion(selected);
              setMode('region');
              setShowRegionSelector(false);
            }}
            onCancel={() => setShowRegionSelector(false)}
          />
        )}

        {/* Export Modal (MP4, MOV, GIF) */}
        {showExport && currentRecording && (
          <ExportModal
            sourceVideoUrl={currentRecording.url}
            destinationFolder={destinationFolder ?? undefined}
            trim={trim}
            crop={crop}
            bgmTracks={bgmTracks}
            voiceovers={voiceovers}
            onClose={() => setShowExport(false)}
            onExportSuccess={(blob, filename) => {
              showToast(`Exported "${filename}".`);
            }}
          />
        )}

        {/* Settings Modal */}
        {showSettings && (
          <SettingsModal
            settings={settings}
            onSave={handleSaveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Library Browser Modal */}
        {showLibrary && (
          <LibraryModal
            recordings={recordings}
            destinationFolder={destinationFolder ?? undefined}
            onSelectRecording={(rec) => {
              setCurrentRecording(rec);
              setTrim({ start: 0, end: rec.duration });
              setCrop(null);
              setBgmTracks([]);
              setVoiceovers([]);
              setView('editor');
            }}
            onDeleteRecording={handleDeleteFromLibrary}
            onClose={() => setShowLibrary(false)}
            onOpenReelsMerger={() => setView('merger')}
            onOpenSettings={() => {
              setShowLibrary(false);
              setShowSettings(true);
            }}
          />
        )}

        {/* Toast Notification */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-sky-500/50 shadow-2xl px-4 py-2.5 rounded-xl text-xs font-medium text-slate-100 flex items-center gap-2 z-50 backdrop-blur-md"
            >
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
