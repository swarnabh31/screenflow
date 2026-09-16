import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ClockState,
  clockStart,
  clockPause,
  clockResume,
  clockStop,
  computeElapsedMs,
  computeElapsedSeconds,
  totalPausedMs,
  computeStoredDurationMs,
} from '../src/utils/recordingClock';

const T0 = 1_000_000; // arbitrary epoch-like base
const SEC = 1000;

test('clockStart returns a fresh, not-paused clock', () => {
  const s = clockStart(T0);
  assert.deepEqual(s, { startMs: T0, pausedSinceMs: null, pausedAccumMs: 0 });
});

test('elapsed grows with wall-clock time when unpaused', () => {
  const s = clockStart(T0);
  assert.equal(computeElapsedMs(s, T0 + 5 * SEC), 5000);
  assert.equal(computeElapsedMs(s, T0 + SEC * 120), 120_000);
});

test('elapsed is 0 before the clock has started (startMs null)', () => {
  const s: ClockState = { startMs: null, pausedSinceMs: null, pausedAccumMs: 0 };
  assert.equal(computeElapsedMs(s, T0 + 999), 0);
});

test('elapsed is never negative', () => {
  const s = clockStart(T0);
  // now < start
  assert.equal(computeElapsedMs(s, T0 - 500), 0);
});

test('pause excludes in-progress paused interval from elapsed', () => {
  const s = clockStart(T0);
  const pausedAt = T0 + 4 * SEC;
  const ps = clockPause(s, pausedAt);
  assert.equal(ps.pausedSinceMs, pausedAt);
  // At pausedAt: elapsed should be 4s (pause just began).
  assert.equal(computeElapsedMs(ps, pausedAt), 4000);
  // Wait 10s into the pause -> elapsed still 4s.
  assert.equal(computeElapsedMs(ps, pausedAt + 10 * SEC), 4000);
});

test('clockPause is a no-op if already paused', () => {
  const s = clockStart(T0);
  const p1 = clockPause(s, T0 + 2 * SEC);
  const p2 = clockPause(p1, T0 + 3 * SEC);
  assert.equal(p2.pausedSinceMs, p1.pausedSinceMs);
});

test('clockPause is a no-op before start', () => {
  const s: ClockState = { startMs: null, pausedSinceMs: null, pausedAccumMs: 0 };
  const p = clockPause(s, T0);
  assert.equal(p.pausedSinceMs, null);
  assert.equal(p.startMs, null);
});

test('resume folds in-progress pause into accumulated', () => {
  const s = clockStart(T0);
  const pausedAt = T0 + 3 * SEC;
  const p = clockPause(s, pausedAt);
  const resumedAt = pausedAt + 7 * SEC; // resumed after being paused 7s
  const r = clockResume(p, resumedAt);

  assert.equal(r.pausedSinceMs, null);
  assert.equal(r.pausedAccumMs, 7000); // 7s of pause folded in

  // Elapsed between resumedAt and resumedAt+1s should be (resumedAt - start) - 7s = 3s.
  assert.equal(computeElapsedMs(r, resumedAt), 3000);
  assert.equal(computeElapsedSeconds(r, resumedAt), 3);
  assert.equal(computeElapsedMs(r, resumedAt + SEC), 4000);
});

test('clockResume no-ops when not paused', () => {
  const s = clockStart(T0);
  const r = clockResume(s, T0 + SEC);
  assert.equal(r.pausedAccumMs, 0);
  assert.equal(r.pausedSinceMs, null);
});

test('multiple pause/resume cycles accumulate correctly (no double-count)', () => {
  let s = clockStart(T0);
  // pause for 2s
  s = clockPause(s, T0 + 10 * SEC);
  s = clockResume(s, T0 + 12 * SEC); // accumulated 2s
  // pause for 5s
  s = clockPause(s, T0 + 20 * SEC);
  s = clockResume(s, T0 + 25 * SEC); // accumulated 7s total

  assert.equal(s.pausedAccumMs, 7000);
  // At T0+30s, elapsed = 30 - 7 = 23s
  assert.equal(computeElapsedSeconds(s, T0 + 30 * SEC), 23);
});

test('totalPausedMs includes both accumulated and in-progress pause', () => {
  let s = clockStart(T0);
  s = clockPause(s, T0 + 5 * SEC);
  s = clockResume(s, T0 + 8 * SEC); // accumulated 3s
  s = clockPause(s, T0 + 20 * SEC); // new in-progress pause at +20s
  // At T0+25s: 3s accumulated + 5s in-progress = 8s
  assert.equal(totalPausedMs(s, T0 + 25 * SEC), 8000);
});

test('stop while paused folds the in-progress pause in (never counted as air)', () => {
  let s = clockStart(T0);
  s = clockPause(s, T0 + 3 * SEC);
  const stoppedAt = T0 + 30 * SEC; // let the pause run for a while
  const st = clockStop(s, stoppedAt);
  assert.equal(st.pausedSinceMs, null);
  // 27s paused (3s to 30s), 3s on air prior (0 -> 3). Elapsed should be 3s.
  assert.equal(computeElapsedSeconds(st, stoppedAt), 3);
});

test('stop with no active pause leaves accumulated unchanged', () => {
  let s = clockStart(T0);
  s = clockPause(s, T0 + 2 * SEC);
  s = clockResume(s, T0 + 4 * SEC); // accumulated 2s
  const st = clockStop(s, T0 + 60 * SEC);
  assert.equal(st.pausedAccumMs, 2000);
  assert.equal(computeElapsedSeconds(st, T0 + 60 * SEC), 58);
});

test('computeStoredDurationMs enforces a minimum of 1 second by default', () => {
  assert.equal(computeStoredDurationMs(0), 1000);
  assert.equal(computeStoredDurationMs(500), 1000);
  assert.equal(computeStoredDurationMs(1500), 1500);
});

test('computeStoredDurationMs honours a caller-supplied minimum', () => {
  assert.equal(computeStoredDurationMs(0, 10_000), 10_000);
  assert.equal(computeStoredDurationMs(12_000, 10_000), 12_000);
});

test('a real-world 5-minute recording reports 300s regardless of pause/resume timing', () => {
  // 5 minutes total. 1 minute paused in the middle.
  let s = clockStart(T0);
  const pauseStart = T0 + 120_000; // pause at the 2-min mark
  s = clockPause(s, pauseStart);
  const resumeAt = pauseStart + 60_000; // resume 1 min later
  s = clockResume(s, resumeAt);
  const stopAt = T0 + 300_000; // 5 min after start
  const st = clockStop(s, stopAt);

  // On-air time = 5 min - 1 min pause = 4 min = 240s.
  assert.equal(computeElapsedSeconds(st, stopAt), 240);
});
