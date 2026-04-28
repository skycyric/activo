import { describe, expect, test } from "vitest";
import {
  evaluateSaveConflictProbe,
  evaluateRemoteRefreshDecision,
} from "./saveConflict";

describe("evaluateSaveConflictProbe", () => {
  test("no signal change -> no conflict probe", () => {
    const result = evaluateSaveConflictProbe({
      firstMeta: 100,
      secondMeta: 100,
      knownLastModified: 100,
      loadedVersion: 8,
      onDiskVersion: 8,
    });

    expect(result.diskWasModified).toBe(false);
    expect(result.changedSinceKnown).toBe(false);
    expect(result.versionDiffers).toBe(false);
    expect(result.shouldDetectConflict).toBe(false);
  });

  test("remote changed before save started -> detect conflict", () => {
    const result = evaluateSaveConflictProbe({
      firstMeta: 120,
      secondMeta: 120,
      knownLastModified: 100,
      loadedVersion: 8,
      onDiskVersion: 8,
    });

    expect(result.diskWasModified).toBe(false);
    expect(result.changedSinceKnown).toBe(true);
    expect(result.versionDiffers).toBe(false);
    expect(result.shouldDetectConflict).toBe(true);
  });

  test("remote changed during save window -> detect conflict", () => {
    const result = evaluateSaveConflictProbe({
      firstMeta: 100,
      secondMeta: 121,
      knownLastModified: 100,
      loadedVersion: 8,
      onDiskVersion: 8,
    });

    expect(result.diskWasModified).toBe(true);
    expect(result.changedSinceKnown).toBe(false);
    expect(result.versionDiffers).toBe(false);
    expect(result.shouldDetectConflict).toBe(true);
  });

  test("version mismatch -> detect conflict", () => {
    const result = evaluateSaveConflictProbe({
      firstMeta: 100,
      secondMeta: 100,
      knownLastModified: 100,
      loadedVersion: 8,
      onDiskVersion: 9,
    });

    expect(result.diskWasModified).toBe(false);
    expect(result.changedSinceKnown).toBe(false);
    expect(result.versionDiffers).toBe(true);
    expect(result.shouldDetectConflict).toBe(true);
  });

  test("knownLastModified is null -> do not trigger changedSinceKnown", () => {
    const result = evaluateSaveConflictProbe({
      firstMeta: 100,
      secondMeta: 100,
      knownLastModified: null,
      loadedVersion: 8,
      onDiskVersion: 8,
    });

    expect(result.changedSinceKnown).toBe(false);
    expect(result.shouldDetectConflict).toBe(false);
  });
});

// ─── evaluateRemoteRefreshDecision ───────────────────────────────────────────

describe("evaluateRemoteRefreshDecision", () => {
  test("clean state (isDirty=false) → proceed regardless of confirmIfDirty", () => {
    expect(evaluateRemoteRefreshDecision(false, false)).toBe("proceed");
    expect(evaluateRemoteRefreshDecision(false, true)).toBe("proceed");
  });

  test("dirty + auto-sync path (confirmIfDirty=false) → abort to protect unsaved edits", () => {
    // This is the race-condition guard: even if the poller checked !isDirty
    // from a stale snapshot, re-checking inside the handler with confirmIfDirty=false
    // must abort silently rather than overwrite local changes.
    expect(evaluateRemoteRefreshDecision(true, false)).toBe("abort");
  });

  test("dirty + manual refresh (confirmIfDirty=true) → confirm-needed", () => {
    expect(evaluateRemoteRefreshDecision(true, true)).toBe("confirm-needed");
  });
});
