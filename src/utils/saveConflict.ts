/**
 * Decide whether a remote-refresh operation should proceed given the current
 * dirty state and the call-site's confirmation policy.
 *
 * - "proceed"        → no local unsaved changes; safe to overwrite.
 * - "abort"          → dirty AND confirmIfDirty is false (programmatic /
 *                      auto-sync path); silently cancel so we never lose edits.
 * - "confirm-needed" → dirty AND confirmIfDirty is true; caller must show a
 *                      confirm dialog before overwriting.
 */
export type RemoteRefreshDecision = "proceed" | "abort" | "confirm-needed";

export function evaluateRemoteRefreshDecision(
  isDirty: boolean,
  confirmIfDirty: boolean,
): RemoteRefreshDecision {
  if (!isDirty) return "proceed";
  if (!confirmIfDirty) return "abort";
  return "confirm-needed";
}

export interface SaveConflictSignals {
  firstMeta: number;
  secondMeta: number;
  knownLastModified: number | null;
  loadedVersion: number;
  onDiskVersion?: number;
}

export interface SaveConflictProbeResult {
  diskWasModified: boolean;
  changedSinceKnown: boolean;
  versionDiffers: boolean;
  shouldDetectConflict: boolean;
}

export function evaluateSaveConflictProbe(
  signals: SaveConflictSignals,
): SaveConflictProbeResult {
  const diskWasModified = signals.secondMeta !== signals.firstMeta;
  const changedSinceKnown =
    signals.knownLastModified !== null &&
    signals.firstMeta !== signals.knownLastModified;
  const versionDiffers =
    signals.onDiskVersion !== undefined &&
    signals.onDiskVersion !== signals.loadedVersion;

  return {
    diskWasModified,
    changedSinceKnown,
    versionDiffers,
    shouldDetectConflict:
      diskWasModified || changedSinceKnown || versionDiffers,
  };
}
