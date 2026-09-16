import { CropArea, ExportOptions, TrimRange, AudioTrackConfig, VoiceoverTake } from '../types';
import { GifEncoder } from './gifEncoder';
import { finalizeExport, OutputContainer } from './ffmpegTranscode';

export interface CodecCandidate {
  mime: string;
  ext: string;
}

export interface ChosenCodec {
  mime: string;       // full mime (may include codecs=...)
  ext: string;        // file extension to use (always matches the chosen codec)
  fileMime: string;   // base mime (no codecs param) for the output Blob type
}

/**
 * Pick the first codec the runtime actually supports.
 *
 * Important: extension and mime are derived from the SAME chosen candidate, so a
 * WebM-encoded file is never labelled `.mp4`/`.mov` (and vice versa). Accepts an
 * `isSupported` predicate so it can be unit-tested without a real MediaRecorder.
 */
export function chooseExportCodec(
  format: 'mp4' | 'mov' | 'gif',
  isSupported: (mime: string) => boolean
): ChosenCodec {
  const candidates: CodecCandidate[] = format === 'mp4'
    ? [
        { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
        { mime: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
        { mime: 'video/mp4', ext: 'mp4' },
        { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
        { mime: 'video/webm', ext: 'webm' },
      ]
    : [
        { mime: 'video/quicktime;codecs=h264,aac', ext: 'mov' },
        { mime: 'video/quicktime', ext: 'mov' },
        { mime: 'video/mp4', ext: 'mp4' },
        { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
        { mime: 'video/webm', ext: 'webm' },
      ];

  const chosen = candidates.find((c) => isSupported(c.mime)) ?? candidates[candidates.length - 1];
  return {
    mime: chosen.mime,
    ext: chosen.ext,
    fileMime: chosen.mime.split(';')[0],
  };
}

export interface ExportProgress {
  stage: 'preparing' | 'rendering' | 'encoding' | 'finalizing';
  percentage: number;
  message: string;
}

/**
 * Renders and exports a video applying trim, crop, background audio, and voiceover audio.
 */
export async function exportProcessedMedia(
  sourceVideoUrl: string,
  trim: TrimRange,
  crop: CropArea | null,
  bgmTracks: AudioTrackConfig[],
  voiceovers: VoiceoverTake[],
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  // Load source video element
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.src = sourceVideoUrl;
  video.muted = true; // muted to prevent speaker feedback while rendering

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = (e) => reject(new Error('Failed to load source video for export'));
  });

  const duration = Math.max(0.1, trim.end - trim.start);
  const srcW = video.videoWidth || 1920;
  const srcH = video.videoHeight || 1080;

  // Determine crop box
  const cropBox = crop && crop.width > 0 && crop.height > 0
    ? {
        x: Math.max(0, Math.min(srcW - 10, crop.x)),
        y: Math.max(0, Math.min(srcH - 10, crop.y)),
        w: Math.min(srcW, crop.width),
        h: Math.min(srcH, crop.height),
      }
    : { x: 0, y: 0, w: srcW, h: srcH };

  // Calculate target resolution
  let outW = cropBox.w;
  let outH = cropBox.h;

  if (options.resolution === '1080p') {
    const scale = Math.min(1920 / outW, 1080 / outH, 1);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  } else if (options.resolution === '720p') {
    const scale = Math.min(1280 / outW, 720 / outH, 1);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  } else if (options.resolution === '480p') {
    const scale = Math.min(854 / outW, 480 / outH, 1);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }

  // Ensure even dimensions for video codecs
  outW = Math.max(2, outW - (outW % 2));
  outH = Math.max(2, outH - (outH % 2));

  // --- Handling GIF Export ---
  if (options.format === 'gif') {
    onProgress?.({ stage: 'preparing', percentage: 5, message: 'Configuring GIF palette and frames...' });
    
    // Scale GIF dimensions down to keep file size reasonable (max 640px wide)
    let gifW = outW;
    let gifH = outH;
    if (gifW > 640) {
      const scale = 640 / gifW;
      gifW = Math.round(gifW * scale);
      gifH = Math.round(gifH * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = gifW;
    canvas.height = gifH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const gifFps = Math.min(options.fps, 15); // standard GIF fps
    const totalFrames = Math.max(1, Math.floor(duration * gifFps));
    const frameInterval = duration / totalFrames;
    const delayMs = Math.round(1000 / gifFps);

    const encoder = new GifEncoder(gifW, gifH, delayMs);

    for (let f = 0; f < totalFrames; f++) {
      const targetTime = trim.start + f * frameInterval;
      video.currentTime = targetTime;
      await new Promise<void>((res) => {
        video.onseeked = () => res();
      });

      ctx.drawImage(
        video,
        cropBox.x,
        cropBox.y,
        cropBox.w,
        cropBox.h,
        0,
        0,
        gifW,
        gifH
      );

      encoder.addFrame(ctx);

      const pct = Math.round(10 + (f / totalFrames) * 80);
      onProgress?.({
        stage: 'rendering',
        percentage: pct,
        message: `Rendering GIF frame ${f + 1}/${totalFrames}...`,
      });
    }

    onProgress?.({ stage: 'encoding', percentage: 95, message: 'Packaging animated GIF...' });
    const gifBlob = encoder.render();
    onProgress?.({ stage: 'finalizing', percentage: 100, message: 'Export completed!' });

    return {
      blob: gifBlob,
      filename: `recording_${Date.now()}.gif`,
      mimeType: 'image/gif',
    };
  }

  // --- Handling MP4 or MOV Export ---
  onProgress?.({ stage: 'preparing', percentage: 10, message: 'Initializing video pipeline & audio mixer...' });

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  // Setup AudioContext for mixing
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const audioDestination = audioCtx.createMediaStreamDestination();

  // 1. Original Video Audio
  try {
    const videoAudioSource = audioCtx.createMediaElementSource(video);
    videoAudioSource.connect(audioDestination);
  } catch (err) {
    // If video element was already connected or has no audio, continue
  }

  // 2. Background Music
  const bgmElements: HTMLAudioElement[] = [];
  if (options.includeBgm) {
    for (const bgm of bgmTracks) {
      if (bgm.url) {
        const bgmAudio = new Audio(bgm.url);
        bgmAudio.crossOrigin = 'anonymous';
        bgmAudio.volume = bgm.volume;
        bgmAudio.loop = true;
        try {
          const bgmSource = audioCtx.createMediaElementSource(bgmAudio);
          const bgmGain = audioCtx.createGain();
          bgmGain.gain.value = bgm.volume;
          bgmSource.connect(bgmGain);
          bgmGain.connect(audioDestination);
          bgmElements.push(bgmAudio);
        } catch {
          // ignore already connected
        }
      }
    }
  }

  // 3. Voiceovers. `start` is the source-video timecode where the user recorded
  // the dub; we schedule playback so it lands at the matching point of the
  // trimmed output (video.currentTime >= start). `started` prevents re-playing
  // an already-triggered take.
  const voElements: { audio: HTMLAudioElement; start: number; started: boolean }[] = [];
  if (options.includeVoiceover) {
    for (const vo of voiceovers) {
      if (vo.url) {
        const voAudio = new Audio(vo.url);
        voAudio.crossOrigin = 'anonymous';
        try {
          const voSource = audioCtx.createMediaElementSource(voAudio);
          const voGain = audioCtx.createGain();
          voGain.gain.value = vo.volume;
          voSource.connect(voGain);
          voGain.connect(audioDestination);
          voElements.push({ audio: voAudio, start: vo.startTime, started: false });
        } catch {
          // ignore
        }
      }
    }
  }

  // Create combined stream: Canvas video stream + Mixed audio track
  const canvasStream = canvas.captureStream(options.fps || 30);
  const audioTracks = audioDestination.stream.getAudioTracks();
  if (audioTracks.length > 0 && options.includeAudio) {
    canvasStream.addTrack(audioTracks[0]);
  }

  // Determine a MIME/codec we can actually encode to. Prefer real H.264 MP4 for
  // broad compatibility, but ALWAYS match the extension + MIME to the codec that
  // was actually chosen — never mislabel WebM as MP4/MOV.
  const chosen = chooseExportCodec(
    options.format,
    (mime) => MediaRecorder.isTypeSupported(mime)
  );
  const chosenMime = chosen.mime;
  const targetExtension = chosen.ext;
  const fileMime = chosen.fileMime;

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: chosenMime,
    videoBitsPerSecond: options.quality > 0.8 ? 8_000_000 : 4_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordingPromise = new Promise<{ blob: Blob; filename: string; mimeType: string }>((resolve, reject) => {
    recorder.onstop = () => {
      audioCtx.close();
      const outputBlob = new Blob(chunks, { type: fileMime });
      onProgress?.({ stage: 'finalizing', percentage: 100, message: 'Export completed!' });
      resolve({
        blob: outputBlob,
        filename: `recording_${Date.now()}.${targetExtension}`,
        mimeType: fileMime,
      });
    };
    recorder.onerror = (e) => reject(e);
  });

  // Start recording
  recorder.start(100);
  video.currentTime = trim.start;
  video.muted = false; // allow audio route to audioCtx destination

  await new Promise<void>((r) => { video.onseeked = () => r(); });
  await video.play();

  // Start BGM immediately (it loops); voiceovers are triggered from the render
  // loop at their scheduled source-video timecode so they line up in the output.
  bgmElements.forEach((el) => {
    el.currentTime = 0;
    el.play().catch(() => {});
  });

  // Render loop
  let isCancelled = false;
  const renderFrame = () => {
    if (isCancelled) return;

    if (video.currentTime >= trim.end || video.ended) {
      isCancelled = true;
      video.pause();
      bgmElements.forEach((el) => el.pause());
      voElements.forEach(({ audio }) => audio.pause());
      onProgress?.({ stage: 'encoding', percentage: 95, message: 'Encoding audio and video tracks...' });
      recorder.stop();
      return;
    }

    ctx.drawImage(
      video,
      cropBox.x,
      cropBox.y,
      cropBox.w,
      cropBox.h,
      0,
      0,
      outW,
      outH
    );

    const currentElapsed = video.currentTime - trim.start;
    const pct = Math.min(90, Math.round(15 + (currentElapsed / duration) * 75));
      // Trigger any voiceovers whose start timecode we've reached on the
      // source timeline (a dub recorded before the trim point plays at t=0).
      voElements.forEach((voEl) => {
        if (!voEl.started && video.currentTime >= voEl.start) {
          voEl.started = true;
          voEl.audio.currentTime = 0;
          voEl.audio.play().catch(() => {});
        }
      });

      onProgress?.({
        stage: 'rendering',
        percentage: pct,
        message: `Exporting video: ${currentElapsed.toFixed(1)}s / ${duration.toFixed(1)}s`,
      });

      requestAnimationFrame(renderFrame);
  };

  requestAnimationFrame(renderFrame);

  // `recordingPromise` resolves with the canvas render result, which Chromium
  // will give us as real MP4 H.264 when `options.format === 'mp4'`. On Firefox
  // / Safari it will fall back to WebM. For 'mov' / for a WebM-rendered
  // 'mp4', `finalizeExport` runs ffmpeg.wasm in the browser to re-encode.
  const renderResult = await recordingPromise;

  const targetContainer: OutputContainer =
    options.format === 'mov' ? 'mov' : 'mp4';

  // The canvas already rendered at the chosen resolution, so we don't re-scale
  // in ffmpeg (that would degrade quality).
  const final = await finalizeExport(
    renderResult,
    targetContainer,
    renderResult.filename.replace(/\.[a-z0-9]+$/i, ''),
    {
      videoBitRate: options.quality > 0.8 ? 8_000_000 : 4_000_000,
      audioBitRate: 192_000,
      fps: options.fps || 30,
    },
    (msg) => onProgress?.({ stage: 'encoding', percentage: 96, message: msg })
  );

  return final;
}
