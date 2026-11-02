import { CONFIG } from './config';

/**
 * Fonte única do alvo de horda do Solo. O motor e o cálculo cooperativo devem usar esta função. O servidor (fibula_finish_solo_match) espelha estas constantes em SQL (5 + 5*(noite-1)); se CONFIG.dayNight.firstNightSpawnCount ou addedPerNight mudarem, a migration de validação também precisa mudar.
 */
export function soloHordeTarget(nightNumber: number): number {
  if (!Number.isSafeInteger(nightNumber) || nightNumber < 1) {
    throw new RangeError('O número da noite deve ser um inteiro >= 1.');
  }

  return CONFIG.dayNight.firstNightSpawnCount + (nightNumber - 1) * CONFIG.dayNight.addedPerNight;
}
