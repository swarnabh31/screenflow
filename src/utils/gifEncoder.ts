/**
 * Pure TypeScript animated GIF encoder (LZW compression with color quantization).
 * Creates standard animated GIF images from video canvas frames without external dependencies.
 */

// Simple 256 color palette generator using median cut or sampling
export class GifEncoder {
  private width: number;
  private height: number;
  private delay: number; // 1/100ths of a second
  private frames: Uint8Array[] = [];
  private palette: number[][] = [];
  private repeat: number = 0; // 0 = loop forever

  constructor(width: number, height: number, delayMs: number = 100) {
    this.width = Math.round(width);
    this.height = Math.round(height);
    this.delay = Math.max(2, Math.round(delayMs / 10)); // GIF delay in hundredths of a second
  }

  public addFrame(ctx: CanvasRenderingContext2D) {
    const imgData = ctx.getImageData(0, 0, this.width, this.height);
    const pixels = imgData.data;

    // Generate/update palette or build 256 color table for this frame
    const { indexedPixels, palette } = this.quantize(pixels);
    this.palette = palette;
    this.frames.push(indexedPixels);
  }

  private quantize(pixels: Uint8ClampedArray): { indexedPixels: Uint8Array; palette: number[][] } {
    // Fast color sampling: build a 256 color palette from 3:3:2 bit reduction or popular colors
    const indexed = new Uint8Array(this.width * this.height);
    const paletteMap: Map<number, number> = new Map();
    const palette: number[][] = [];

    // Pre-populate standard 6x6x6 web safe or uniform color cube
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          if (palette.length < 216) {
            palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
          }
        }
      }
    }
    // Grayscale ramp up to 256
    for (let i = 0; i < 40; i++) {
      const v = Math.round((i / 39) * 255);
      palette.push([v, v, v]);
    }

    const n = pixels.length;
    for (let i = 0, p = 0; i < n; i += 4, p++) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      if (a < 128) {
        indexed[p] = 0; // transparent or first color
        continue;
      }

      // Fast RGB to palette index mapping
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let idx = paletteMap.get(key);
      if (idx === undefined) {
        // Find nearest color
        let minD = Infinity;
        let best = 0;
        for (let c = 0; c < palette.length; c++) {
          const pr = palette[c][0];
          const pg = palette[c][1];
          const pb = palette[c][2];
          const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
          if (d < minD) {
            minD = d;
            best = c;
            if (d === 0) break;
          }
        }
        idx = best;
        paletteMap.set(key, idx);
      }
      indexed[p] = idx;
    }

    return { indexedPixels: indexed, palette };
  }

  public render(): Blob {
    const stream: number[] = [];

    // 1. Header: GIF89a
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    stream.push(...header);

    // 2. Logical Screen Descriptor
    stream.push(this.width & 0xff, (this.width >> 8) & 0xff);
    stream.push(this.height & 0xff, (this.height >> 8) & 0xff);
    // Packed field: Global Color Table Flag (1), Color Resolution (7 = 8bits), Sort (0), Size (7 = 256 colors)
    stream.push(0xf7);
    stream.push(0x00); // Background Color Index
    stream.push(0x00); // Pixel Aspect Ratio

    // 3. Global Color Table (256 * 3 bytes)
    for (let i = 0; i < 256; i++) {
      const color = this.palette[i] || [0, 0, 0];
      stream.push(color[0], color[1], color[2]);
    }

    // 4. Netscape 2.0 Application Extension (for looping)
    stream.push(0x21, 0xff, 0x0b);
    const app = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30]; // NETSCAPE2.0
    stream.push(...app);
    stream.push(0x03, 0x01);
    stream.push(this.repeat & 0xff, (this.repeat >> 8) & 0xff);
    stream.push(0x00); // block terminator

    // 5. Frames
    for (let f = 0; f < this.frames.length; f++) {
      const frameData = this.frames[f];

      // Graphic Control Extension
      stream.push(0x21, 0xf9, 0x04);
      stream.push(0x00); // Packed: disposal method 0, user input 0, transparent 0
      stream.push(this.delay & 0xff, (this.delay >> 8) & 0xff);
      stream.push(0x00); // Transparent color index
      stream.push(0x00); // Block terminator

      // Image Descriptor
      stream.push(0x2c);
      stream.push(0x00, 0x00, 0x00, 0x00); // x, y = 0, 0
      stream.push(this.width & 0xff, (this.width >> 8) & 0xff);
      stream.push(this.height & 0xff, (this.height >> 8) & 0xff);
      stream.push(0x00); // Packed: Local color table flag = 0

      // Image Data (LZW compressed)
      const lzwData = this.lzwEncode(frameData, 8);
      stream.push(...lzwData);
    }

    // 6. Trailer
    stream.push(0x3b);

    return new Blob([new Uint8Array(stream)], { type: 'image/gif' });
  }

  private lzwEncode(pixels: Uint8Array, minCodeSize: number): number[] {
    const result: number[] = [];
    result.push(minCodeSize);

    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let maxCode = 1 << codeSize;
    let nextCode = eoiCode + 1;

    const dict: Map<string, number> = new Map();
    const resetDict = () => {
      dict.clear();
      codeSize = minCodeSize + 1;
      maxCode = 1 << codeSize;
      nextCode = eoiCode + 1;
    };

    const outBytes: number[] = [];
    let curAccum = 0;
    let curBits = 0;

    const emitCode = (code: number) => {
      curAccum |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        outBytes.push(curAccum & 0xff);
        curAccum >>= 8;
        curBits -= 8;
      }
    };

    emitCode(clearCode);

    let prefix = '';
    if (pixels.length > 0) {
      prefix = String(pixels[0]);
    }

    for (let i = 1; i < pixels.length; i++) {
      const c = pixels[i];
      const entry = prefix + ',' + c;
      if (dict.has(entry)) {
        prefix = entry;
      } else {
        const code = prefix.includes(',') ? dict.get(prefix)! : parseInt(prefix, 10);
        emitCode(code);

        if (nextCode < 4096) {
          dict.set(entry, nextCode++);
          if (nextCode >= maxCode && codeSize < 12) {
            codeSize++;
            maxCode = 1 << codeSize;
          }
        } else {
          emitCode(clearCode);
          resetDict();
        }
        prefix = String(c);
      }
    }

    if (prefix !== '') {
      const code = prefix.includes(',') ? dict.get(prefix)! : parseInt(prefix, 10);
      emitCode(code);
    }

    emitCode(eoiCode);

    if (curBits > 0) {
      outBytes.push(curAccum & 0xff);
    }

    // Packetize into blocks of <= 254 bytes
    let idx = 0;
    while (idx < outBytes.length) {
      const chunkSize = Math.min(254, outBytes.length - idx);
      result.push(chunkSize);
      for (let j = 0; j < chunkSize; j++) {
        result.push(outBytes[idx + j]);
      }
      idx += chunkSize;
    }
    result.push(0x00); // Block terminator

    return result;
  }
}
