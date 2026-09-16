import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * ffmpegTranscode
 *
 * Browser-based MP4/MOV/MKV export via ffmpeg.wasm.
 *
 * The browser's native MediaRecorder can only emit WebM (VP9/VP8 + Opus) or
 * H.264 where Chromium exposes it; it cannot reliably produce real MP4/MOV
 * files. We therefore:
 *   1. Keep the existing canvas->MediaRecorder render as the "source" (WebM).
 *   2. Re-encode that WebM via ffmpeg.wasm (running entirely in WebAssembly,
 *      no server, no upload) to the requested container with H.264 video and
 *      AAC audio.
 *
 * The WASM core is loaded lazily from a pinned CDN the first time the user
 * asks for a non-WebM export. It is ~31 MB and is cached by the browser.
 *
 * All code is MIT-licensed (ffmpeg.wasm).
 */

// Pinned to the 0.12.x core; do NOT point this at a moving "master" URL.
const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

function createAndLoad(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  return new Promise<FFmpeg>(async (resolve, reject) => {
    try {
      const coreJs = toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
      const coreWasm = toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
      const classWorkerJs = toBlobURL(
        'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js',
        'text/javascript'
      );

      ffmpeg.on('log', ({ message }) => {
        if (!message) return;
        if (/time=\d+/.test(message)) {
          onProgress?.('Encoding video (libx264 / AAC)...');
        }
      });

      await ffmpeg.load({
        coreURL: await coreJs,
        wasmURL: await coreWasm,
        classWorkerURL: await classWorkerJs,
      });
      onProgress?.('ffmpeg.wasm ready — starting encode...');
      resolve(ffmpeg);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (loadPromise) return loadPromise;
  loadPromise = createAndLoad(onProgress).then((ff) => {
    ffmpegSingleton = ff;
    return ff;
  }).catch((err) => {
    // Reset so a later retry can re-attempt the load.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

export type OutputContainer = 'mp4' | 'mov' | 'mkv';

const CONTAINER_MIME: Record<OutputContainer, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
};

export interface TranscodeOptions {
  container: OutputContainer;
  /** Target video bitrate in bits/sec (default 6_000_000). */
  videoBitRate?: number;
  /** Target audio bitrate in bits/sec (default 192_000). */
  audioBitRate?: number;
  /** Target frame rate (default 30). */
  fps?: number;
  /** Optional output width — only applied when the caller passes it. */
  width?: number;
  /** Optional output height — only applied when the caller passes it. */
  height?: number;
  crf?: number; // 18-30, lower = higher quality (used when bitRate not set)
}

/**
 * Transcodes a WebM (or any ffmpeg-readable) Blob into the requested
 * container. Returns { blob, filename, mimeType } — the filename uses the
 * real extension so the file is valid on the user's machine.
 *
 * @param inputBlob  The WebM produced by the canvas->MediaRecorder pipeline.
 * @param baseName   Filename body, e.g. "recording_1716..."
 * @param onProgress Human-readable progress messages.
 */
export async function transcodeToContainer(
  inputBlob: Blob,
  baseName: string,
  options: TranscodeOptions,
  onProgress?: (msg: string) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const ffmpeg = await getFFmpeg(onProgress);

  // ffmpeg reads by extension; the canvas render always emits a WebM/MP4 video.
  const inputExt = /mp4/i.test(inputBlob.type) ? '.mp4' : '.webm';
  const safeInput = 'src' + inputExt;
  await ffmpeg.writeFile(safeInput, await fetchFile(inputBlob));

  const outName = safeOutputName(options.container);
  const vbr = options.videoBitRate ?? 6_000_000;
  const abr = options.audioBitRate ?? 192_000;
  const fps = options.fps ?? 30;

  const args: string[] = ['-hide_banner', '-loglevel', 'error'];

  // For 480p or lower, we let the caller pass an explicit target; else we
  // transcode at native resolution with the chosen CRF / bitrate.
  if (options.width && options.height) {
    const w = options.width - (options.width % 2);
    const h = options.height - (options.height % 2);
    args.push('-vf', `scale=${w}:${h}`);
  }

  args.push(
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-b:v', String(vbr),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', String(abr),
    '-ar', '48000',
    '-movflags', '+faststart',
    outName
  );

  onProgress?.('Encoding video (libx264)... this can take a while.');

  await ffmpeg.exec([...args, safeInput]);

  const out = (await ffmpeg.readFile(outName)) as Uint8Array;
  const blob = new Blob([out], { type: CONTAINER_MIME[options.container] });
  return {
    blob,
    filename: `${baseName}.${options.container}`,
    mimeType: CONTAINER_MIME[options.container],
  };
}

function safeOutputName(c: OutputContainer): string {
  const map: Record<OutputContainer, string> = {
    mp4: 'out.mp4',
    mov: 'out.mov',
    mkv: 'out.mkv',
  };
  return map[c];
}

/**
 * Convenience: takes the canvas->recorder blob + options and, if the chosen
 * container isn't WebM, transcodes it. Returns exactly one valid output.
 */
export async function finalizeExport(
  renderResult: { blob: Blob; filename: string; mimeType: string },
  container: OutputContainer | 'webm',
  baseName: string,
  opts: Omit<TranscodeOptions, 'container'> & { width?: number; height?: number },
  onProgress?: (msg: string) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  // If the render is already in the requested container (e.g. WebM requested),
  // or the renderer already emitted a real .mp4 with H.264, return as-is.
  const nativeExt = renderResult.filename.split('.').pop()?.toLowerCase();
  if (container === 'webm' || nativeExt === container) {
    return renderResult;
  }
  return transcodeToContainer(renderResult.blob, baseName, {
    container,
    videoBitRate: opts.videoBitRate,
    audioBitRate: opts.audioBitRate,
    fps: opts.fps,
    width: opts.width,
    height: opts.height,
    crf: opts.crf,
  }, onProgress);
}
