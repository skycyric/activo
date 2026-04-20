import { describe, expect, test } from "vitest";
import { evaluateSaveConflictProbe } from "./saveConflict";

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
