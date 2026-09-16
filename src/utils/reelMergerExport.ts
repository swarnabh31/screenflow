import { 
  ImportedClip, 
  ReelAspectRatio, 
  ReelFitMode, 
  ReelTextOverlay, 
  ReelExportOptions, 
  AudioTrackConfig 
} from '../types';
import { GifEncoder } from './gifEncoder';
import { ExportProgress } from './mediaExport';
import { finalizeExport, OutputContainer } from './ffmpegTranscode';

/**
 * Dimensions based on chosen aspect ratio & export resolution
 */
export function getReelDimensions(
  aspectRatio: ReelAspectRatio, 
  resolution: '1080p' | '720p' | '480p'
): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      if (resolution === '1080p') return { width: 1080, height: 1920 };
      if (resolution === '720p') return { width: 720, height: 1280 };
      return { width: 480, height: 854 };

    case '16:9':
      if (resolution === '1080p') return { width: 1920, height: 1080 };
      if (resolution === '720p') return { width: 1280, height: 720 };
      return { width: 854, height: 480 };

    case '1:1':
      if (resolution === '1080p') return { width: 1080, height: 1080 };
      if (resolution === '720p') return { width: 720, height: 720 };
      return { width: 480, height: 480 };

    case '4:5':
      if (resolution === '1080p') return { width: 1080, height: 1350 };
      if (resolution === '720p') return { width: 720, height: 900 };
      return { width: 480, height: 600 };
  }
}

/**
 * Draws a video element onto the canvas conforming to fitMode
 */
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  cw: number,
  ch: number,
  fitMode: ReelFitMode,
  alpha: number = 1
) {
  const vw = video.videoWidth || 1920;
  const vh = video.videoHeight || 1080;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (fitMode === 'blur-fill') {
    // 1. Draw blurred, zoomed background
    const bgScale = Math.max(cw / vw, ch / vh);
    const bgW = vw * bgScale;
    const bgH = vh * bgScale;
    const bgX = (cw - bgW) / 2;
    const bgY = (ch - bgH) / 2;

    ctx.filter = 'blur(28px) brightness(0.5)';
    ctx.drawImage(video, bgX, bgY, bgW, bgH);
    ctx.filter = 'none';

    // 2. Draw centered foreground video with clean drop shadow
    const fgScale = Math.min(cw / vw, ch / vh);
    const fgW = Math.round(vw * fgScale);
    const fgH = Math.round(vh * fgScale);
    const fgX = Math.round((cw - fgW) / 2);
    const fgY = Math.round((ch - fgH) / 2);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 24;
    ctx.drawImage(video, fgX, fgY, fgW, fgH);
  } else if (fitMode === 'cover') {
    // Scaled to fill entire frame, center cropped
    const scale = Math.max(cw / vw, ch / vh);
    const w = vw * scale;
    const h = vh * scale;
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    ctx.drawImage(video, x, y, w, h);
  } else {
    // fit-black (letterbox / pillarbox)
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, cw, ch);

    const scale = Math.min(cw / vw, ch / vh);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    const x = Math.round((cw - w) / 2);
    const y = Math.round((ch - h) / 2);
    ctx.drawImage(video, x, y, w, h);
  }

  ctx.restore();
}

/**
 * Draws text overlay hooks (Reel title/stickers/captions)
 */
export function drawReelTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: ReelTextOverlay,
  cw: number,
  ch: number
) {
  if (!overlay.enabled || !overlay.text.trim()) return;

  ctx.save();
  const text = overlay.text.trim();
  const fontSize = Math.round(overlay.fontSize * (cw / 1080));
  ctx.font = `bold ${fontSize}px "Segoe UI", -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const paddingX = fontSize * 0.9;
  const paddingY = fontSize * 0.55;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;

  let y = ch * 0.15; // top
  if (overlay.position === 'center') y = ch * 0.5;
  if (overlay.position === 'bottom') y = ch * 0.82;
  const x = cw / 2;

  if (overlay.style === 'banner') {
    ctx.fillStyle = overlay.bgColor || 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 12);
    ctx.fill();

    ctx.fillStyle = overlay.color || '#ffffff';
    ctx.fillText(text, x, y);
  } else if (overlay.style === 'pill') {
    ctx.fillStyle = overlay.bgColor || 'rgba(239, 68, 68, 0.9)';
    ctx.beginPath();
    ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 999);
    ctx.fill();

    ctx.fillStyle = overlay.color || '#ffffff';
    ctx.fillText(text, x, y);
  } else if (overlay.style === 'neon') {
    ctx.shadowColor = overlay.bgColor || '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.fillStyle = overlay.color || '#ffffff';
    ctx.fillText(text, x, y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = overlay.bgColor || '#38bdf8';
    ctx.strokeText(text, x, y);
  } else {
    // outline / clean
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.lineWidth = fontSize * 0.15;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = overlay.color || '#ffffff';
    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

/**
 * Preloads all clip video elements and verifies they are playable
 */
export async function preloadClipVideos(clips: ImportedClip[]): Promise<HTMLVideoElement[]> {
  const elements = clips.map((c) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.src = c.url;
    v.muted = true; // muted to prevent browser autoplay blocking
    v.preload = 'auto';
    return v;
  });

  await Promise.all(
    elements.map(
      (v) =>
        new Promise<void>((resolve) => {
          if (v.readyState >= 2) {
            resolve();
          } else {
            v.onloadedmetadata = () => resolve();
            v.onerror = () => resolve(); // continue on error to not block
          }
        })
    )
  );

  return elements;
}

/**
 * Export the merged multi-clip reel video / GIF
 */
export async function exportMergedReel(
  clips: ImportedClip[],
  aspectRatio: ReelAspectRatio,
  fitMode: ReelFitMode,
  textOverlay: ReelTextOverlay | undefined,
  bgmTrack: AudioTrackConfig | null | undefined,
  options: ReelExportOptions,
  onProgress?: (progress: ExportProgress) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (clips.length === 0) {
    throw new Error('No video clips provided to merge.');
  }

  onProgress?.({ stage: 'preparing', percentage: 5, message: 'Loading clip videos & preparing sequence...' });

  const videoElements = await preloadClipVideos(clips);
  const dims = getReelDimensions(aspectRatio, options.resolution);
  const cw = dims.width;
  const ch = dims.height;

  // Calculate total duration from effective clip times
  const clipDurations = clips.map((c, i) => {
    const el = videoElements[i];
    const rawDur = el.duration || c.duration || 1;
    const start = Math.max(0, Math.min(rawDur - 0.1, c.trimStart));
    const end = Math.min(rawDur, Math.max(start + 0.1, c.trimEnd || rawDur));
    return { start, end, effDuration: end - start };
  });

  const totalDuration = clipDurations.reduce((acc, c) => acc + c.effDuration, 0);

  // --- GIF Export Handling ---
  if (options.format === 'gif') {
    onProgress?.({ stage: 'preparing', percentage: 10, message: 'Configuring animated GIF frames...' });
    let gw = cw;
    let gh = ch;
    // Scale GIF down to prevent massive files
    if (gw > 480 || gh > 640) {
      const scale = Math.min(480 / gw, 640 / gh);
      gw = Math.round(gw * scale);
      gh = Math.round(gh * scale);
    }
    gw = Math.max(2, gw - (gw % 2));
    gh = Math.max(2, gh - (gh % 2));

    const canvas = document.createElement('canvas');
    canvas.width = gw;
    canvas.height = gh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const gifFps = Math.min(options.fps || 15, 15);
    const totalFrames = Math.max(1, Math.floor(totalDuration * gifFps));
    const delayMs = Math.round(1000 / gifFps);
    const encoder = new GifEncoder(gw, gh, delayMs);

    let currentClipIdx = 0;
    let clipElapsed = 0;

    for (let f = 0; f < totalFrames; f++) {
      const globalTime = (f / totalFrames) * totalDuration;

      // Find current active clip
      let accumulated = 0;
      for (let i = 0; i < clipDurations.length; i++) {
        if (globalTime < accumulated + clipDurations[i].effDuration || i === clipDurations.length - 1) {
          currentClipIdx = i;
          clipElapsed = globalTime - accumulated;
          break;
        }
        accumulated += clipDurations[i].effDuration;
      }

      const activeClip = clips[currentClipIdx];
      const activeVideo = videoElements[currentClipIdx];
      const clipTiming = clipDurations[currentClipIdx];

      activeVideo.currentTime = clipTiming.start + Math.min(clipTiming.effDuration, clipElapsed);
      await new Promise<void>((r) => { activeVideo.onseeked = () => r(); });

      drawVideoFrame(ctx, activeVideo, gw, gh, fitMode, 1);
      if (textOverlay?.enabled) {
        drawReelTextOverlay(ctx, textOverlay, gw, gh);
      }

      encoder.addFrame(ctx);

      const pct = Math.round(10 + (f / totalFrames) * 80);
      onProgress?.({
        stage: 'rendering',
        percentage: pct,
        message: `Rendering GIF frame ${f + 1}/${totalFrames} (Clip ${currentClipIdx + 1}/${clips.length})...`,
      });
    }

    onProgress?.({ stage: 'encoding', percentage: 95, message: 'Compressing GIF palette...' });
    const blob = encoder.render();
    onProgress?.({ stage: 'finalizing', percentage: 100, message: 'Reel GIF ready!' });
    return {
      blob,
      filename: `Reel_${Date.now()}.gif`,
      mimeType: 'image/gif',
    };
  }

  // --- MP4 / MOV Video Export with Real-time Web Audio & Canvas Capture ---
  onProgress?.({ stage: 'preparing', percentage: 15, message: 'Setting up audio mixer and canvas stream...' });

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  // Audio mixer
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const audioDestination = audioCtx.createMediaStreamDestination();

  // Connect clips audio
  const clipGainNodes: GainNode[] = [];
  videoElements.forEach((video, i) => {
    try {
      const src = audioCtx.createMediaElementSource(video);
      const gain = audioCtx.createGain();
      const clipVol = clips[i].isMuted ? 0 : clips[i].volume;
      gain.gain.value = options.includeClipAudio ? clipVol : 0;
      src.connect(gain);
      gain.connect(audioDestination);
      clipGainNodes.push(gain);
    } catch {
      // ignore if already connected
    }
  });

  // Connect BGM audio
  let bgmAudioEl: HTMLAudioElement | null = null;
  if (options.includeBgm && bgmTrack?.url) {
    try {
      bgmAudioEl = new Audio(bgmTrack.url);
      bgmAudioEl.crossOrigin = 'anonymous';
      bgmAudioEl.loop = true;
      const bgmSrc = audioCtx.createMediaElementSource(bgmAudioEl);
      const bgmGain = audioCtx.createGain();
      bgmGain.gain.value = options.bgmVolume ?? 0.8;
      bgmSrc.connect(bgmGain);
      bgmGain.connect(audioDestination);
    } catch {
      // ignore
    }
  }

  // Setup Canvas Stream
  const canvasStream = canvas.captureStream(options.fps || 30);
  const audioTracks = audioDestination.stream.getAudioTracks();
  if (audioTracks.length > 0 && (options.includeClipAudio || options.includeBgm)) {
    canvasStream.addTrack(audioTracks[0]);
  }

  // Determine Supported MIME Type
  let targetExtension = options.format === 'mov' ? 'mov' : 'mp4';
  let fileMime = options.format === 'mov' ? 'video/quicktime' : 'video/mp4';
  let chosenMime = 'video/webm;codecs=vp9,opus';

  const candidateMimes = options.format === 'mp4'
    ? [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9,opus',
        'video/webm',
      ]
    : [
        'video/quicktime',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm',
      ];

  for (const m of candidateMimes) {
    if (MediaRecorder.isTypeSupported(m)) {
      chosenMime = m;
      break;
    }
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: chosenMime,
    videoBitsPerSecond: options.quality > 0.8 ? 8_000_000 : 4_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingPromise = new Promise<{ blob: Blob; filename: string; mimeType: string }>(
    (resolve, reject) => {
      recorder.onstop = () => {
        audioCtx.close();
        const blob = new Blob(chunks, { type: fileMime });
        onProgress?.({ stage: 'finalizing', percentage: 100, message: 'Reel ready!' });
        resolve({
          blob,
          filename: `Reel_Merged_${Date.now()}.${targetExtension}`,
          mimeType: fileMime,
        });
      };
      recorder.onerror = (e) => reject(e);
    }
  );

  recorder.start(100);

  if (bgmAudioEl) {
    bgmAudioEl.currentTime = 0;
    bgmAudioEl.play().catch(() => {});
  }

  // Sequentially play and render each clip
  let totalTimeElapsed = 0;

  for (let i = 0; i < clips.length; i++) {
    const video = videoElements[i];
    const clip = clips[i];
    const timing = clipDurations[i];

    video.currentTime = timing.start;
    video.muted = false; // enable audio into Web Audio node
    await new Promise<void>((r) => { video.onseeked = () => r(); });
    await video.play().catch(() => {});

    // Render clip until it reaches timing.end
    await new Promise<void>((resolveClip) => {
      const checkFrame = () => {
        if (video.currentTime >= timing.end || video.ended) {
          video.pause();
          resolveClip();
          return;
        }

        // Draw active video
        drawVideoFrame(ctx, video, cw, ch, fitMode, 1);

        // Optional transition effect into next clip if approaching end
        const timeLeftInClip = timing.end - video.currentTime;
        const transitionDur = clip.transitionDuration || 0.5;
        if (
          i < clips.length - 1 &&
          clip.transitionToNext !== 'cut' &&
          timeLeftInClip < transitionDur
        ) {
          const progress = 1 - timeLeftInClip / transitionDur;
          const nextVideo = videoElements[i + 1];
          const nextTiming = clipDurations[i + 1];

          if (clip.transitionToNext === 'crossfade') {
            // Overlay next clip's start frame with rising alpha
            nextVideo.currentTime = nextTiming.start;
            drawVideoFrame(ctx, nextVideo, cw, ch, fitMode, progress);
          } else if (clip.transitionToNext === 'fade-black') {
            ctx.fillStyle = `rgba(0, 0, 0, ${progress})`;
            ctx.fillRect(0, 0, cw, ch);
          } else if (clip.transitionToNext === 'slide-left') {
            ctx.save();
            const slideOffset = (1 - progress) * cw;
            ctx.translate(slideOffset, 0);
            nextVideo.currentTime = nextTiming.start;
            drawVideoFrame(ctx, nextVideo, cw, ch, fitMode, 1);
            ctx.restore();
          } else if (clip.transitionToNext === 'zoom') {
            // Zoom the current clip toward center while the next clip's start
            // frame fades in on top (the transform is applied to both draws).
            const zoomScale = 1 + progress * 0.2;
            ctx.save();
            ctx.translate(cw / 2, ch / 2);
            ctx.scale(zoomScale, zoomScale);
            ctx.translate(-cw / 2, -ch / 2);
            nextVideo.currentTime = nextTiming.start;
            drawVideoFrame(ctx, nextVideo, cw, ch, fitMode, Math.min(1, progress * 2));
            ctx.restore();
          }
        }

        // Overlay Text hook
        if (textOverlay?.enabled) {
          drawReelTextOverlay(ctx, textOverlay, cw, ch);
        }

        const clipPassed = video.currentTime - timing.start;
        const overallPassed = totalTimeElapsed + clipPassed;
        const pct = Math.min(95, Math.round(20 + (overallPassed / totalDuration) * 75));
        onProgress?.({
          stage: 'rendering',
          percentage: pct,
          message: `Merging Clip ${i + 1}/${clips.length}: ${clip.name} (${overallPassed.toFixed(1)}s / ${totalDuration.toFixed(1)}s)`,
        });

        requestAnimationFrame(checkFrame);
      };

      requestAnimationFrame(checkFrame);
    });

    totalTimeElapsed += timing.effDuration;
  }

  if (bgmAudioEl) {
    bgmAudioEl.pause();
  }

  onProgress?.({ stage: 'encoding', percentage: 96, message: 'Finalizing merged video file...' });
  recorder.stop();

  const renderResult = await recordingPromise;

  // Real-container transcode: MP4/MOV go through ffmpeg.wasm (H.264/AAC) when
  // the native render fell back to WebM. Native MP4 (Chromium) passes through.
  const targetContainer: OutputContainer = options.format === 'mov' ? 'mov' : 'mp4';

  const final = await finalizeExport(
    renderResult,
    targetContainer,
    renderResult.filename.replace(/\.[a-z0-9]+$/i, ''),
    {
      videoBitRate: options.quality > 0.8 ? 8_000_000 : 4_000_000,
      audioBitRate: 192_000,
      fps: options.fps || 30,
    },
    (msg) => onProgress?.({ stage: 'encoding', percentage: 97, message: msg })
  );

  return final;
}
