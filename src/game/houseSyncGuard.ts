export type HouseServerSnapshotGuard = {
  snapshot: string;
  expiresAt: number;
};

export type HouseSyncGuardDecision = {
  shouldSync: boolean;
  nextGuard: HouseServerSnapshotGuard | null;
};

/**
 * Evita calcular diferenças enquanto o React ainda exibe o inventário anterior
 * ao snapshot autoritativo aplicado diretamente ao motor.
 */
export function evaluateHouseSyncGuard(
  currentSnapshot: string,
  guard: HouseServerSnapshotGuard | null,
  now: number,
): HouseSyncGuardDecision {
  if (!guard) return { shouldSync: true, nextGuard: null };
  if (currentSnapshot === guard.snapshot || now >= guard.expiresAt) {
    return { shouldSync: true, nextGuard: null };
  }
  return { shouldSync: false, nextGuard: guard };
}
