import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimecode, formatFileSize } from '../src/utils/storage';
import { chooseExportCodec } from '../src/utils/mediaExport';
import { getReelDimensions } from '../src/utils/reelMergerExport';

// ----- formatTimecode --------------------------------------------------------
test('formatTimecode: zero', () => {
  assert.equal(formatTimecode(0), '00:00.00');
});

test('formatTimecode: 12s exact is 00:12.00 (mm:ss.cc under 60m)', () => {
  assert.equal(formatTimecode(12), '00:12.00');
});

test('formatTimecode: 1m05.5s', () => {
  assert.equal(formatTimecode(65.5), '01:05.50');
});

test('formatTimecode: 1h 2m 3s switches to H:MM:SS', () => {
  // mins >= 60 -> hours format: 62m3s => 01:02:03
  assert.equal(formatTimecode(62 * 60 + 3), '01:02:03');
});

test('formatTimecode: NaN/Infinity/negative guard', () => {
  assert.equal(formatTimecode(Number.NaN), '00:00');
  assert.equal(formatTimecode(Number.POSITIVE_INFINITY), '00:00');
  assert.equal(formatTimecode(-1), '00:00');
});

// ----- formatFileSize --------------------------------------------------------
test('formatFileSize: 0 => "0 B"', () => {
  assert.equal(formatFileSize(0), '0 B');
});

test('formatFileSize: bytes, KB, MB, GB boundaries', () => {
  assert.equal(formatFileSize(500), '500.0 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(3 * 1024 * 1024), '3.0 MB');
  assert.equal(formatFileSize(5 * 1024 * 1024 * 1024), '5.0 GB');
});

// ----- chooseExportCodec -----------------------------------------------------
test('mp4 -> mp4 when h264/mp4 supported', () => {
  // Simulate a browser that supports H.264 MP4.
  const chosen = chooseExportCodec('mp4', (mime) => mime.startsWith('video/mp4'));
  assert.equal(chosen.ext, 'mp4');
  assert.equal(chosen.fileMime, 'video/mp4');
  assert.match(chosen.mime, /video\/mp4/);
});

test('mp4 preferred -> never mislabelled as .webm when mp4 is supported', () => {
  const chosen = chooseExportCodec('mp4', () => true); // all supported
  // First candidate (H.264 MP4) should win and the ext must stay mp4.
  assert.equal(chosen.ext, 'mp4');
});

/**
 * CRITICAL regression test for the user-reported bug: when only webm is
 * supported, the file MUST be named .webm with type video/webm — never
 * .mp4/.mov with video/webm content.
 */
test('REGRESSION: webm-only runtime must NOT be labelled .mp4', () => {
  const chosen = chooseExportCodec('mp4', (mime) => mime.startsWith('video/webm'));
  assert.equal(chosen.ext, 'webm');
  assert.equal(chosen.fileMime, 'video/webm');
  // Sanity: the extension must match the base mime's subtype.
  assert.ok(chosen.fileMime.endsWith(`/${chosen.ext}`));
});

test('mov -> .mov when quicktime supported', () => {
  const chosen = chooseExportCodec('mov', (mime) => mime.startsWith('video/quicktime'));
  assert.equal(chosen.ext, 'mov');
  assert.equal(chosen.fileMime, 'video/quicktime');
});

test('mov preference falls through to webm, ext stays .webm', () => {
  const chosen = chooseExportCodec('mov', (mime) => mime.startsWith('video/webm'));
  assert.equal(chosen.ext, 'webm');
  assert.equal(chosen.fileMime, 'video/webm');
});

test('nothing supported -> falls back to last candidate (webm) with matching ext', () => {
  const chosen = chooseExportCodec('mp4', () => false);
  assert.equal(chosen.ext, 'webm');
  assert.equal(chosen.fileMime, 'video/webm');
  const chosenMov = chooseExportCodec('mov', () => false);
  assert.equal(chosenMov.ext, 'webm');
});

test('fileMime never contains codec parameters', () => {
  const chosen = chooseExportCodec('mp4', () => true);
  assert.ok(!chosen.fileMime.includes(';'));
});

// ----- getReelDimensions -----------------------------------------------------
test('reel dimensions: 9:16 1080p is 1080x1920', () => {
  assert.deepEqual(getReelDimensions('9:16', '1080p'), { width: 1080, height: 1920 });
});

test('reel dimensions: 9:16 720p is 720x1280', () => {
  assert.deepEqual(getReelDimensions('9:16', '720p'), { width: 720, height: 1280 });
});

test('reel dimensions: 16:9 1080p is 1920x1080', () => {
  assert.deepEqual(getReelDimensions('16:9', '1080p'), { width: 1920, height: 1080 });
});

test('reel dimensions: 1:1 480p is 480x480 (square at every res)', () => {
  assert.deepEqual(getReelDimensions('1:1', '1080p'), { width: 1080, height: 1080 });
  assert.deepEqual(getReelDimensions('1:1', '720p'), { width: 720, height: 720 });
  assert.deepEqual(getReelDimensions('1:1', '480p'), { width: 480, height: 480 });
});

test('reel dimensions: 4:5 ratios are consistent', () => {
  assert.deepEqual(getReelDimensions('4:5', '1080p'), { width: 1080, height: 1350 });
  assert.deepEqual(getReelDimensions('4:5', '720p'), { width: 720, height: 900 });
  assert.deepEqual(getReelDimensions('4:5', '480p'), { width: 480, height: 600 });
});
