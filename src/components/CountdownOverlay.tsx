import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface CountdownOverlayProps {
  duration: number; // in seconds
  onComplete: () => void;
  onCancel: () => void;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({
  duration,
  onComplete,
  onCancel,
}) => {
  const [count, setCount] = useState(duration);
  const onCompleteRef = useRef(onComplete);
  const firedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (duration <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onCompleteRef.current();
      }
      return;
    }
    // Timestamp-based countdown so parent re-renders can never stall or
    // restart the timers, and onComplete fires exactly once.
    const endAt = Date.now() + duration * 1000;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setCount(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        if (!firedRef.current) {
          firedRef.current = true;
          onCompleteRef.current();
        }
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [duration]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md select-none">
      <div className="flex flex-col items-center gap-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-32 h-32 rounded-full border-4 border-sky-400 bg-sky-500/20 shadow-[0_0_50px_rgba(56,189,248,0.4)] flex items-center justify-center text-6xl font-black text-white"
          >
            {count > 0 ? count : 'REC!'}
          </motion.div>
        </AnimatePresence>

        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-white tracking-wide">
            {count > 0 ? `Recording will begin in ${count}s...` : 'Starting...'}
          </h3>
          <p className="text-xs text-slate-400">
            Window will minimize to the Floating Orb overlay automatically
          </p>
        </div>

        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
