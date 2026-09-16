import React, { useState, useRef, useEffect } from 'react';
import { 
  Check, 
  X, 
  Move, 
  Maximize, 
  Smartphone, 
  Monitor, 
  Square,
  Crosshair,
  RotateCcw
} from 'lucide-react';
import { RegionBounds } from '../types';

interface RegionSelectorModalProps {
  initialRegion?: RegionBounds;
  screenWidth?: number;
  screenHeight?: number;
  onConfirm: (region: RegionBounds) => void;
  onCancel: () => void;
}

export const RegionSelectorModal: React.FC<RegionSelectorModalProps> = ({
  initialRegion,
  screenWidth = 1920,
  screenHeight = 1080,
  onConfirm,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<RegionBounds>(() => {
    if (initialRegion && initialRegion.width > 50) return initialRegion;
    // Default 1280x720 centered
    const w = 1280;
    const h = 720;
    return {
      x: Math.round((screenWidth - w) / 2),
      y: Math.round((screenHeight - h) / 2),
      width: w,
      height: h,
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; rx: number; ry: number; rw: number; rh: number }>({
    x: 0,
    y: 0,
    rx: 0,
    ry: 0,
    rw: 0,
    rh: 0,
  });

  // Calculate container scale to fit within viewport
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const sX = (rect.width - 40) / screenWidth;
      const sY = (rect.height - 40) / screenHeight;
      setScale(Math.min(sX, sY, 1));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [screenWidth, screenHeight]);

  const handlePointerDown = (e: React.PointerEvent, handle: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setActiveHandle(handle);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      rx: region.x,
      ry: region.y,
      rw: region.width,
      rh: region.height,
    });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;

      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;

      if (activeHandle === 'move') {
        const nextX = Math.max(0, Math.min(screenWidth - dragStart.rw, dragStart.rx + dx));
        const nextY = Math.max(0, Math.min(screenHeight - dragStart.rh, dragStart.ry + dy));
        setRegion((prev) => ({ ...prev, x: Math.round(nextX), y: Math.round(nextY) }));
      } else if (activeHandle === 'se') {
        const nextW = Math.max(200, Math.min(screenWidth - dragStart.rx, dragStart.rw + dx));
        const nextH = Math.max(150, Math.min(screenHeight - dragStart.ry, dragStart.rh + dy));
        setRegion((prev) => ({ ...prev, width: Math.round(nextW), height: Math.round(nextH) }));
      } else if (activeHandle === 'nw') {
        const nextX = Math.max(0, Math.min(dragStart.rx + dragStart.rw - 200, dragStart.rx + dx));
        const nextY = Math.max(0, Math.min(dragStart.ry + dragStart.rh - 150, dragStart.ry + dy));
        const nextW = dragStart.rw - (nextX - dragStart.rx);
        const nextH = dragStart.rh - (nextY - dragStart.ry);
        setRegion({
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      } else if (activeHandle === 'ne') {
        const nextY = Math.max(0, Math.min(dragStart.ry + dragStart.rh - 150, dragStart.ry + dy));
        const nextW = Math.max(200, Math.min(screenWidth - dragStart.rx, dragStart.rw + dx));
        const nextH = dragStart.rh - (nextY - dragStart.ry);
        setRegion({
          x: dragStart.rx,
          y: Math.round(nextY),
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      } else if (activeHandle === 'sw') {
        const nextX = Math.max(0, Math.min(dragStart.rx + dragStart.rw - 200, dragStart.rx + dx));
        const nextW = dragStart.rw - (nextX - dragStart.rx);
        const nextH = Math.max(150, Math.min(screenHeight - dragStart.ry, dragStart.rh + dy));
        setRegion({
          x: Math.round(nextX),
          y: dragStart.ry,
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      setActiveHandle(null);
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, activeHandle, dragStart, scale, screenWidth, screenHeight]);

  const applyPreset = (w: number, h: number) => {
    const clampedW = Math.min(screenWidth, w);
    const clampedH = Math.min(screenHeight, h);
    setRegion({
      x: Math.round((screenWidth - clampedW) / 2),
      y: Math.round((screenHeight - clampedH) / 2),
      width: clampedW,
      height: clampedH,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header Toolbar */}
        <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                Custom Region Selector
                <span className="text-xs font-normal text-slate-400">
                  (Drag to reposition or resize the capture box)
                </span>
              </h3>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
            <button
              onClick={() => applyPreset(1920, 1080)}
              className="px-2.5 py-1 text-xs rounded hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <Monitor className="w-3.5 h-3.5 text-sky-400" />
              1080p (16:9)
            </button>
            <button
              onClick={() => applyPreset(1280, 720)}
              className="px-2.5 py-1 text-xs rounded hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              720p (16:9)
            </button>
            <button
              onClick={() => applyPreset(720, 1280)}
              className="px-2.5 py-1 text-xs rounded hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-rose-400" />
              9:16 Vertical
            </button>
            <button
              onClick={() => applyPreset(900, 900)}
              className="px-2.5 py-1 text-xs rounded hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <Square className="w-3.5 h-3.5 text-amber-400" />
              1:1 Square
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-confirm-region"
              onClick={() => onConfirm(region)}
              className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              Apply Region
            </button>
          </div>
        </div>

        {/* Interactive Desktop Stage */}
        <div 
          ref={containerRef} 
          className="flex-1 relative bg-slate-950 flex items-center justify-center p-6 select-none overflow-hidden"
        >
          {/* Virtual Desktop Canvas */}
          <div 
            style={{
              width: screenWidth * scale,
              height: screenHeight * scale,
            }}
            className="relative bg-slate-900 border border-slate-800 rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Simulated Desktop Elements in Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 opacity-40" />
            <div className="absolute top-4 left-4 p-3 bg-slate-800/40 rounded border border-slate-700/40 w-48 text-[11px] text-slate-400">
              Desktop Workspace
            </div>
            <div className="absolute bottom-4 left-4 p-2 bg-slate-800/50 rounded border border-slate-700/50 w-32 h-6" />

            {/* Dark Mask outside the selected region */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at ${((region.x + region.width / 2) / screenWidth) * 100}% ${((region.y + region.height / 2) / screenHeight) * 100}%, transparent 40%, rgba(0, 0, 0, 0.6) 80%)`,
              }}
            />

            {/* Selected Region Bounding Box */}
            <div
              style={{
                left: region.x * scale,
                top: region.y * scale,
                width: region.width * scale,
                height: region.height * scale,
              }}
              className="absolute border-2 border-sky-400 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.25)] flex flex-col justify-between"
            >
              {/* Top Bar with coordinates */}
              <div 
                onPointerDown={(e) => handlePointerDown(e, 'move')}
                className="h-6 bg-sky-500 text-slate-950 px-2 flex items-center justify-between text-[11px] font-bold cursor-move select-none"
              >
                <span className="flex items-center gap-1">
                  <Move className="w-3 h-3" />
                  {region.width} × {region.height} px
                </span>
                <span className="text-[10px] font-mono opacity-80">
                  X:{region.x} Y:{region.y}
                </span>
              </div>

              {/* Center Crosshair and Drag Indicator */}
              <div 
                onPointerDown={(e) => handlePointerDown(e, 'move')}
                className="flex-1 flex items-center justify-center cursor-move text-sky-300/60 hover:text-sky-300 transition-colors"
              >
                <div className="flex flex-col items-center gap-1 bg-slate-950/70 px-3 py-1.5 rounded-md border border-sky-400/30 backdrop-blur-sm">
                  <Move className="w-4 h-4 text-sky-400" />
                  <span className="text-[11px] font-medium text-slate-200">Drag to move</span>
                </div>
              </div>

              {/* Corner Handles */}
              <div 
                onPointerDown={(e) => handlePointerDown(e, 'nw')}
                className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white border-2 border-sky-500 rounded-sm cursor-nwse-resize shadow-md" 
              />
              <div 
                onPointerDown={(e) => handlePointerDown(e, 'ne')}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-sky-500 rounded-sm cursor-nesw-resize shadow-md" 
              />
              <div 
                onPointerDown={(e) => handlePointerDown(e, 'sw')}
                className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white border-2 border-sky-500 rounded-sm cursor-nesw-resize shadow-md" 
              />
              <div 
                onPointerDown={(e) => handlePointerDown(e, 'se')}
                className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-sky-500 rounded-sm cursor-nwse-resize shadow-md" 
              />
            </div>
          </div>
        </div>

        {/* Footer Coordinate Readout */}
        <div className="h-10 px-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div>
            Target Area: <span className="text-sky-300 font-semibold">{region.width} × {region.height} px</span>
          </div>
          <div>
            Offset: <span className="text-slate-300">X: {region.x}px, Y: {region.y}px</span>
          </div>
          <div>
            Aspect Ratio: <span className="text-slate-300">{(region.width / region.height).toFixed(2)}:1</span>
          </div>
        </div>
      </div>
    </div>
  );
};
