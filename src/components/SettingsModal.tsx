import React, { useState } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Check,
  Keyboard,
  ShieldCheck,
  Download
} from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [current, setCurrent] = useState<AppSettings>(settings);
  const [savedToast, setSavedToast] = useState(false);

  const handleSaveAll = () => {
    onSave(current);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Settings & Storage</h3>
              <p className="text-[11px] text-slate-400">Windows capture preferences & destination</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Storage Destination Section */}
          <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-sky-400" />
              Where Files Are Saved
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Recordings are stored in your browser profile (persistent) and, when exported, downloaded
              to your browser's default downloads folder. File naming follows the title you set.
            </p>
          </div>

          {/* Auto-Save Toggle */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Auto-Save on Stop
              </div>
              <p className="text-[11px] text-slate-400">
                Immediately persists the recording to your destination folder when you stop from the orb.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={current.autoSaveEnabled}
                onChange={(e) =>
                  setCurrent((prev) => ({ ...prev, autoSaveEnabled: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>

          {/* Performance & Capture Quality */}
          <div className="space-y-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Capture Performance & Quality
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* FPS */}
              <div>
                <span className="text-[11px] text-slate-400 block mb-1.5">Target Framerate</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[30, 60].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setCurrent((prev) => ({ ...prev, frameRate: f as 30 | 60 }))}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        current.frameRate === f
                          ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Countdown duration */}
              <div>
                <span className="text-[11px] text-slate-400 block mb-1.5">Start Countdown</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[0, 3, 5].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setCurrent((prev) => ({ ...prev, countdownDuration: sec }))}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        current.countdownDuration === sec
                          ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      {sec === 0 ? 'None' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Windows Shortcuts Info */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
              Desktop Shortcuts
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div className="flex justify-between bg-slate-900 px-2 py-1 rounded">
                <span>Start / Stop:</span>
                <kbd className="font-mono text-slate-200 bg-slate-800 px-1 rounded">F9</kbd>
              </div>
              <div className="flex justify-between bg-slate-900 px-2 py-1 rounded">
                <span>Pause / Resume:</span>
                <kbd className="font-mono text-slate-200 bg-slate-800 px-1 rounded">F10</kbd>
              </div>
              <div className="flex justify-between bg-slate-900 px-2 py-1 rounded">
                <span>Toggle Mic:</span>
                <kbd className="font-mono text-slate-200 bg-slate-800 px-1 rounded">Alt + M</kbd>
              </div>
              <div className="flex justify-between bg-slate-900 px-2 py-1 rounded">
                <span>Expand Orb:</span>
                <kbd className="font-mono text-slate-200 bg-slate-800 px-1 rounded">Alt + E</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-16 px-6 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            id="btn-save-settings"
            type="button"
            onClick={handleSaveAll}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center gap-1.5 transition-all"
          >
            {savedToast ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
