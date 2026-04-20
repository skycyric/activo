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
