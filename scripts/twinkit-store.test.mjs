import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure helpers mirrored from store.ts so we don't need a DOM/localStorage.
function sessionElapsedMs(sessionStartedAt, paused, pausedAt, now) {
  if (!sessionStartedAt) return 0;
  const end = paused && pausedAt ? pausedAt : now;
  return Math.max(0, end - sessionStartedAt);
}
function shiftedSessionStart(sessionStartedAt, pausedAt, now) {
  if (!sessionStartedAt) return now;
  if (!pausedAt) return sessionStartedAt;
  return sessionStartedAt + Math.max(0, now - pausedAt);
}

describe("B2 pause does not burn the clock", () => {
  it("elapsed freezes while paused; resume shifts start by paused duration", () => {
    const t0 = 1_000_000;
    const budget = 15 * 60 * 1000;
    // run 0ms, then pause at t0, wait 3 minutes, resume
    const pausedAt = t0;
    const now = t0 + 3 * 60 * 1000;
    const elapsedWhilePaused = sessionElapsedMs(t0, true, pausedAt, now);
    assert.equal(elapsedWhilePaused, 0);
    const nextStart = shiftedSessionStart(t0, pausedAt, now);
    const elapsedAfterResume = sessionElapsedMs(nextStart, false, null, now);
    assert.equal(elapsedAfterResume, 0);
    const remaining = budget - elapsedAfterResume;
    assert.equal(remaining, budget);
  });
});
