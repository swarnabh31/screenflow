// Pure elapsed-time math for the recording clock.
// Kept out of React so it can be unit-tested without a DOM or browser APIs.
//
// Model (app mutates state, calls these pure functions):
//   startMs:      wall-clock ms when recording began (null before start)
//   pausedSinceMs: wall-clock ms of the most recent pause start (null if unpaused)
//   pausedAccumMs: total ms released by completed pauses
//
// Elapsed = (now - start) - (pausedAccumMs + [in-progress pause if any])
//
// Invariant: pausedAccumMs must never double-count. When we resume, the
// in-progress pause interval is folded into pausedAccumMs and cleared.

export interface ClockState {
  startMs: number | null;
  pausedSinceMs: number | null;
  pausedAccumMs: number;
}

/** Total paused time from start up to now (accumulated + in-progress). */
export function totalPausedMs(state: ClockState, nowMs: number): number {
  const inProgress = state.pausedSinceMs != null ? Math.max(0, nowMs - state.pausedSinceMs) : 0;
  return state.pausedAccumMs + inProgress;
}

/** On-air elapsed time in ms, never negative. 0 if clock not started. */
export function computeElapsedMs(state: ClockState, nowMs: number): number {
  if (state.startMs == null) return 0;
  const wallMs = Math.max(0, nowMs - state.startMs);
  return Math.max(0, wallMs - totalPausedMs(state, nowMs));
}

/** On-air elapsed time in whole seconds, never negative. */
export function computeElapsedSeconds(state: ClockState, nowMs: number): number {
  return Math.floor(computeElapsedMs(state, nowMs) / 1000);
}

// --- Intents ----------------------------------------------------------------

/** Initialize a fresh clock at the given instant. */
export function clockStart(nowMs: number): ClockState {
  return { startMs: nowMs, pausedSinceMs: null, pausedAccumMs: 0 };
}

/** Begin a pause (no-op if already paused). */
export function clockPause(state: ClockState, nowMs: number): ClockState {
  if (state.pausedSinceMs != null) return state;
  if (state.startMs == null) return state;
  return { ...state, pausedSinceMs: nowMs };
}

/** Resume from a pause, folding the in-progress interval into accumulated pauses. */
export function clockResume(state: ClockState, nowMs: number): ClockState {
  if (state.pausedSinceMs == null) return state;
  if (state.startMs == null) return state;
  const inProgress = Math.max(0, nowMs - state.pausedSinceMs);
  return { ...state, pausedAccumMs: state.pausedAccumMs + inProgress, pausedSinceMs: null };
}

/** Stop: fold any in-progress pause into accumulated (it never counted as air time). */
export function clockStop(state: ClockState, nowMs: number): ClockState {
  if (state.pausedSinceMs != null) {
    return clockResume(state, nowMs);
  }
  return state;
}

/** Minimum-stored-duration: never < `minMs` (default 1 second). */
export function computeStoredDurationMs(elapsedMs: number, minMs = 1000): number {
  return Math.max(minMs, elapsedMs);
}
