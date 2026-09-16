import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Film, 
  Folder, 
  Sparkles, 
  CheckCircle2, 
  Loader2,
  FileVideo,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import { 
  ExportFormat, 
  ExportOptions, 
  TrimRange, 
  CropArea, 
  AudioTrackConfig, 
  VoiceoverTake 
} from '../types';
import { exportProcessedMedia, ExportProgress } from '../utils/mediaExport';
import { getSessionFolder, writeBlobToFolder } from '../utils/folderStorage';

interface ExportModalProps {
  sourceVideoUrl: string;
  trim: TrimRange;
  crop: CropArea | null;
  bgmTracks: AudioTrackConfig[];
  voiceovers: VoiceoverTake[];
  destinationFolder?: string;
  onClose: () => void;
  onExportSuccess: (blob: Blob, filename: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  sourceVideoUrl,
  trim,
  crop,
  bgmTracks,
  voiceovers,
  destinationFolder,
  onClose,
  onExportSuccess,
}) => {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState<'original' | '1080p' | '720p' | '480p'>('original');
  const [fps, setFps] = useState<number>(30);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [includeBgm, setIncludeBgm] = useState(true);

  // Processing state
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportedResult, setExportedResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setProgress({ stage: 'preparing', percentage: 2, message: 'Starting export...' });

    const options: ExportOptions = {
      format,
      resolution,
      fps: format === 'gif' ? Math.min(fps, 15) : fps,
      includeAudio: format !== 'gif' && includeAudio,
      includeVoiceover: format !== 'gif' && includeVoiceover,
      includeBgm: format !== 'gif' && includeBgm,
      quality: 0.9,
    };

    try {
      const result = await exportProcessedMedia(
        sourceVideoUrl,
        trim,
        crop,
        bgmTracks,
        voiceovers,
        options,
        (p) => setProgress(p)
      );

      setExportedResult(result);
      setIsExporting(false);
      const folder = getSessionFolder();
      const written = folder ? await writeBlobToFolder(folder, result.filename, result.blob) : false;
      onExportSuccess(result.blob, written ? `${result.filename} (saved to ${folder!.name})` : result.filename);
    } catch (err) {
      console.error('Export failed:', err);
      setExportError('Export failed during media processing. Please retry with standard settings.');
      setIsExporting(false);
    }
  };

  const handleDownloadFile = async () => {
    if (!exportedResult) return;
    const folder = getSessionFolder();
    if (folder && (await writeBlobToFolder(folder, exportedResult.filename, exportedResult.blob))) {
      onExportSuccess(exportedResult.blob, `${exportedResult.filename} → saved to ${folder.name}`);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(exportedResult.blob);
    a.download = exportedResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Export Media</h3>
              <p className="text-[11px] text-slate-400">Render and encode with clips, audio & crop</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {exportError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{exportError}</span>
            </div>
          )}
          {/* Format Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* MP4 */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setFormat('mp4')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  format === 'mp4'
                    ? 'bg-sky-500/20 border-sky-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <FileVideo className="w-5 h-5 mx-auto mb-1 text-sky-400" />
                <div className="text-xs font-bold">MP4</div>
                <div className="text-[10px] text-slate-500">H.264 / universal</div>
              </button>

              {/* MOV */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setFormat('mov')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  format === 'mov'
                    ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <Film className="w-5 h-5 mx-auto mb-1 text-indigo-400" />
                <div className="text-xs font-bold">MOV</div>
                <div className="text-[10px] text-slate-500">QuickTime (H.264)</div>
              </button>

              {/* GIF */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setFormat('gif')}
                className={`p-3 rounded-xl border text-center transition-all ${
                  format === 'gif'
                    ? 'bg-purple-500/20 border-purple-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <ImageIcon className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                <div className="text-xs font-bold">Animated GIF</div>
                <div className="text-[10px] text-slate-500">Looping web graphic</div>
              </button>
            </div>
            {format !== 'gif' && (
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500 flex items-start gap-1">
                <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-400" />
                <span>
                  MP4/MOV are encoded with H.264 via ffmpeg.wasm (runs locally in your browser,
                  nothing is uploaded). The first export downloads the ~30&nbsp;MB encoder once.
                </span>
              </p>
            )}
          </div>

          {/* Resolution Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Resolution
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['original', '1080p', '720p', '480p'] as const).map((res) => (
                <button
                  key={res}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setResolution(res)}
                  className={`py-2 px-1 rounded-lg border text-center transition-colors ${
                    resolution === res
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  <div className="text-xs capitalize">{res}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Frame Rate */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Framerate (FPS)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 15].map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={isExporting || (format === 'gif' && f > 30)}
                  onClick={() => setFps(f)}
                  className={`py-2 px-2 rounded-lg border text-center transition-colors ${
                    fps === f
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                  } disabled:opacity-30`}
                >
                  <div className="text-xs">{f} FPS</div>
                </button>
              ))}
            </div>
          </div>

          {/* Audio Tracks Inclusion (only for video formats) */}
          {format !== 'gif' && (
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Audio Tracks to Include
              </span>
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={(e) => setIncludeAudio(e.target.checked)}
                  className="rounded accent-sky-500"
                />
                <span>Original Recorded Audio / Mic</span>
              </label>

              {bgmTracks.length > 0 && (
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeBgm}
                    onChange={(e) => setIncludeBgm(e.target.checked)}
                    className="rounded accent-sky-500"
                  />
                  <span>Background Music Tracks ({bgmTracks.length})</span>
                </label>
              )}

              {voiceovers.length > 0 && (
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeVoiceover}
                    onChange={(e) => setIncludeVoiceover(e.target.checked)}
                    className="rounded accent-sky-500"
                  />
                  <span>Voiceover Commentary Takes ({voiceovers.length})</span>
                </label>
              )}
            </div>
          )}

          {/* Target Location Notice */}
          {destinationFolder && (
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5 text-xs text-slate-400">
              <Folder className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <div className="truncate">
                <span className="text-slate-500 mr-1">Target Destination:</span>
                <span className="font-mono text-slate-300">{destinationFolder}</span>
              </div>
            </div>
          )}

          {/* Rendering Progress Bar */}
          {isExporting && progress && (
            <div className="bg-slate-950 p-4 rounded-xl border border-sky-500/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-sky-400 font-medium flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {progress.message}
                </span>
                <span className="font-mono text-slate-300">{progress.percentage}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-200"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Export Success Banner */}
          {exportedResult && (
            <div className="bg-emerald-950/40 border border-emerald-500/50 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">Export Complete!</div>
                  <div className="text-[11px] font-mono text-emerald-300">{exportedResult.filename}</div>
                </div>
              </div>
              <button
                onClick={handleDownloadFile}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-16 px-6 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            {exportedResult ? 'Close' : 'Cancel'}
          </button>

          {!exportedResult ? (
            <button
              id="btn-confirm-export"
              type="button"
              disabled={isExporting}
              onClick={handleStartExport}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Media...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Export {format.toUpperCase()}</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleDownloadFile}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download File Again</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
