# Screenflow

A browser-based screen recorder, editor, and multi-clip reel merger.

Built with **React 19, TypeScript, Vite, Tailwind CSS v4, and ffmpeg.wasm**. Everything runs client-side — capture happens via the WebRTC/MediaCapture APIs, post-processing via canvas + Web Audio, and final MP4/MOV export by an in-browser WebAssembly build of FFmpeg.

There is no backend, no account, and no upload: your recordings and any files you process never leave your machine.

---

## What it does

**Recording**

- Full-screen, specific window, or a custom draggable region (via `getDisplayMedia` + a canvas-crop pipeline)
- Microphone and system audio (opt-in per recording in the browser's picker)
- Optional webcam picture-in-picture, composited into the video during capture
- Configurable start countdown (0 / 3 / 5 / 10s, cancelable)
- Draggable "floating orb" minimization widget with live timecode, pause/resume, and quick mic/audio toggles

**Editing**

- Timeline scrubber, dual-handle trim, frame-accurate trim inputs
- Aspect-ratio crop: 16:9, 9:16, 1:1, 4:3, original
- Multiple background-music tracks with per-track volume
- Multiple voiceover takes with per-take volume
- Live preview with a canvas-rendered composite

**Reels & Shorts merger**

- Import clips from disk or from an in-app library (IndexedDB)
- Order clips, trim each clip, per-clip volume/mute
- Transition presets between clips: cut, crossfade, fade-to-black, slide-left, zoom-in
- Ambient-Gaussian-blur background for 9:16 exports that include 16:9 sources
- Text overlays (top / center / bottom, banner / pill / outline / neon)
- BGM auto-loops to length of the merged reel
- One-click export to a single video

**Storage**

- All recordings are saved to IndexedDB (survives browser restarts on the same machine)
- Optional File System Access integration lets you pick a folder and files are written there when the browser grants permission
- Library with search, storage usage, play/edit/delete actions

---

## Getting started

```bash
npm install
npm run dev
```

Open the printed `http://localhost:3000/...` URL in **Chrome or Edge** (Firefox and Safari work for many features, but the File System Access picker is Chromium-only).

For production:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the built bundle locally
```

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production bundle to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Node's built-in test runner over `tests/*.test.ts` (35 tests) |
| `npm run clean` | Remove `dist/` cross-platform (Mac/Linux/Windows) |

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `F9` | Start / stop recording |
| `F10` | Pause / resume recording |
| `Alt + M` | Mute / unmute microphone |

---

## Export — what you actually get

Rendering always goes through canvas → `MediaRecorder`. The codec is chosen per browser (`chooseExportCodec` in `src/utils/mediaExport.ts`): Chrome/Edge can record **native H.264/AAC MP4**, so on Chromium selecting **MP4** uses the native path and ffmpeg is not involved. Otherwise the recorder falls back to **WebM (VP9/Opus)** and the app finalizes the file with **ffmpeg.wasm** (a WebAssembly build of FFmpeg, MIT-licensed) into a real **H.264/AAC MP4/MOV**.

| Format | What's produced | Notes |
|---|---|---|
| **MP4** | Valid `.mp4`, H.264 video + AAC audio, universal compatibility | Native MP4 on Chrome/Edge; on other browsers the WebM is transcoded — which requires the one-time ~30 MB ffmpeg.wasm core fetch from a CDN (browser-cached afterwards) |
| **MOV** | Valid `.mov` container, H.264 + AAC | For Final Cut workflows; always finalized via ffmpeg.wasm |
| **GIF** | Real animated GIF, LZW + NeuQuant palette in `src/utils/gifEncoder.ts` | Capped at 15 FPS and 640 px wide max to keep sizes reasonable |

If the ffmpeg core fails to load (offline, CSP, etc.) the app falls back to delivering the WebM with an honest `.webm` filename — a WebM is never mis-labelled as MP4/MOV. See `src/utils/ffmpegTranscode.ts` and the codec-selection regression tests in `tests/utils.test.ts`.

---

## Project structure

```
.
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx                            # React DOM entry
│   ├── index.css                           # Tailwind v4 + scrollbar styles
│   ├── App.tsx                             # State machine, capture pipeline, shortcuts
│   ├── types.ts                            # Shared TypeScript contracts
│   ├── components/
│   │   ├── CountdownOverlay.tsx            # Pre-recording countdown
│   │   ├── ExportModal.tsx                 # MP4/MOV/GIF export UI
│   │   ├── FloatingOrb.tsx                 # Draggable minimized recording widget
│   │   ├── LibraryModal.tsx                # Saved recordings catalog
│   │   ├── RecordingSetup.tsx              # Capture-mode dashboard
│   │   ├── ReelsMergerStudio.tsx           # Multi-clip reel merger UI
│   │   ├── RegionSelectorModal.tsx         # Custom region boundary picker
│   │   ├── SettingsModal.tsx               # Preferences + destination folder
│   │   ├── TitleBar.tsx                    # Windows-style window chrome
│   │   └── VideoEditor.tsx                 # Trim / crop / BGM / voiceover editor
│   └── utils/
│       ├── ffmpegTranscode.ts              # Lazy-loaded ffmpeg.wasm → real MP4/MOV
│       ├── gifEncoder.ts                   # Client-side GIF encoder (NeuQuant + LZW)
│       ├── mediaExport.ts                  # Canvas render → record → transcode pipeline
│       ├── reelMergerExport.ts             # Multi-clip render pipeline
│       ├── recordingClock.ts               # Pure pause/resume elapsed-time math
│       ├── folderStorage.ts                # File System Access helper (Chromium)
│       └── storage.ts                      # IndexedDB persistence
└── tests/
    ├── recordingClock.test.ts              # 16 tests for the clock module
    └── utils.test.ts                       # 19 tests for formatters, codecs, dimensions
```

---

## Technology stack

- **React 19** + **TypeScript** (strict)
- **Vite 6** + **@tailwindcss/vite** + **Tailwind CSS 4**
- **motion** (Framer Motion 12) for the minimize/restore animations
- **lucide-react** for icons
- **Web APIs**: `getDisplayMedia`, `getUserMedia`, `MediaRecorder`, `AudioContext`, `canvas.captureStream`, `File System Access API`, `IndexedDB`
- **ffmpeg.wasm** (`@ffmpeg/ffmpeg` + `@ffmpeg/util`) for real H.264 MP4/MOV export

---

## License

MIT — see [LICENSE](./LICENSE).

ffmpeg.wasm is MIT-licensed and credited below (it's also referenced inline wherever used in `src/utils/ffmpegTranscode.ts`).

---

## Acknowledgements

- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) — the WebAssembly build of FFmpeg used for MP4/MOV encoding.
- [Framer Motion](https://motion.dev/) — animation primitives.
- [lucide](https://lucide.dev/) — icon set.
