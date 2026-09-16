import React, { useState } from 'react';
import { 
  X, 
  Film, 
  Play, 
  Trash2, 
  Download, 
  Folder, 
  Calendar, 
  Search, 
  HardDrive,
  ExternalLink,
  Edit3,
  Layers
} from 'lucide-react';
import { SavedRecording } from '../types';
import { formatFileSize, formatTimecode } from '../utils/storage';

interface LibraryModalProps {
  recordings: SavedRecording[];
  destinationFolder?: string;
  onSelectRecording: (recording: SavedRecording) => void;
  onDeleteRecording: (id: string) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenReelsMerger?: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  recordings,
  destinationFolder,
  onSelectRecording,
  onDeleteRecording,
  onClose,
  onOpenSettings,
  onOpenReelsMerger,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = recordings.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalBytes = recordings.reduce((acc, r) => acc + (r.fileSize || 0), 0);

  const handleDownload = (r: SavedRecording) => {
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.fileName || `${r.title}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-4xl h-[80vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                Recordings Library
                <span className="text-xs font-normal text-slate-400">
                  ({recordings.length} captures)
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenReelsMerger && (
              <button
                onClick={() => {
                  onClose();
                  onOpenReelsMerger();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open Reels & Video Merger"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Merge Videos into Reel</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar & Storage Location banner */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Destination Folder Path info */}
          {destinationFolder && (
            <div
              onClick={onOpenSettings}
              className="flex items-center gap-2 text-xs text-slate-300 hover:text-sky-300 cursor-pointer w-full sm:w-auto truncate"
            >
              <Folder className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <span className="truncate">Folder: <span className="font-mono text-slate-400">{destinationFolder}</span></span>
              <span className="text-[10px] text-sky-400 font-medium hover:underline">(Change)</span>
            </div>
          )}

          {/* Search and Storage Metric */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search captures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 whitespace-nowrap">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>{formatFileSize(totalBytes)}</span>
            </div>
          </div>
        </div>

        {/* Recordings Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center text-slate-500 mb-3">
                <Film className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-semibold text-slate-300 mb-1">No recordings found</h4>
              <p className="text-xs text-slate-500 max-w-sm">
                {searchQuery
                  ? 'No captures match your search filter.'
                  : 'Start a screen recording session to capture your desktop or selected region.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filtered.map((rec) => (
                <div
                  key={rec.id}
                  className="group bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all shadow-md flex flex-col justify-between"
                >
                  {/* Thumbnail & Overlay */}
                  <div 
                    onClick={() => {
                      onSelectRecording(rec);
                      onClose();
                    }}
                    className="aspect-video bg-black relative flex items-center justify-center cursor-pointer overflow-hidden"
                  >
                    {rec.thumbnailUrl ? (
                      <img 
                        src={rec.thumbnailUrl} 
                        alt={rec.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <Film className="w-8 h-8 text-slate-700" />
                    )}

                    <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/20 flex items-center justify-center transition-colors">
                      <div className="w-10 h-10 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>

                    <span className="absolute bottom-2 right-2 bg-slate-950/80 text-[10px] font-mono text-slate-200 px-1.5 py-0.5 rounded backdrop-blur-sm">
                      {formatTimecode(rec.duration)}
                    </span>
                  </div>

                  {/* Details & Actions */}
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate">
                        <h5 className="text-xs font-semibold text-slate-200 truncate">{rec.title}</h5>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(rec.createdAt).toLocaleDateString()} {new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[11px] text-slate-400">
                      <span>{formatFileSize(rec.fileSize)}</span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            onSelectRecording(rec);
                            onClose();
                          }}
                          className="p-1.5 hover:bg-slate-800 text-sky-400 hover:text-sky-300 rounded transition-colors"
                          title="Open in Video Editor"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(rec)}
                          className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors"
                          title="Download File"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteRecording(rec.id)}
                          className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          title="Delete Recording"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
