import { CONFIG } from './config';

export type RangedWeaponId = 'cajado' | 'bastao' | 'arco';
const STAFF_TIP_LENGTH = { cajado: 3.7 * 50 / 3.07, bastao: 4.38 * 50 / 2.57 };
const BOW_STRING_CENTER = 1.092 * 50 / 3.4;
// Ponto de empunhadura em relação ao centro do personagem. side = +1 (arma à direita) ou -1 (à esquerda).
export function rangedGrip(weapon: RangedWeaponId, side: 1 | -1, r: number) {
  return { x: side * CONFIG.player.auraRadius, y: weapon === 'arco' ? -r * 0.1 : r * 0.35 };
}

// Boca (ponta do cajado / centro da corda) em relação ao centro do personagem.
export function rangedMuzzle(weapon: RangedWeaponId, side: 1 | -1, aimAngle: number, r: number) {
  const g = rangedGrip(weapon, side, r);
  if (weapon === 'arco') return { x: g.x + BOW_STRING_CENTER * Math.cos(aimAngle), y: g.y + BOW_STRING_CENTER * Math.sin(aimAngle) };
  // Cajado/bastão permanecem na vertical; a esfera parte da ponta e segue até o alvo.
  return { x: g.x, y: g.y - STAFF_TIP_LENGTH[weapon] };
}
