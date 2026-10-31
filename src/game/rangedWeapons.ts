import { CONFIG } from './config';

export type RangedWeaponId = 'cajado' | 'bastao' | 'arco';
/**
 * Centro do cristal/gema de cada cajado, em px, no referencial da própria arma (eixo +x ao longo da haste,
 * antes de girar), relativo à empunhadura. Vem do desenho: coordenada em unidades de r × 50 / comprimento visual.
 * Cajado: gema em (3.15, -0.62) × 50/3.07. Bastão: gema em (2.82, -0.53) × 50/2.57.
 */
export const STAFF_TIP_LOCAL = {
  cajado: { x: 3.15 * 50 / 3.07, y: -0.62 * 50 / 3.07 },
  bastao: { x: 2.82 * 50 / 2.57, y: -0.53 * 50 / 2.57 },
};

// Última boca (ponta) realmente desenhada. O desenho publica aqui a posição final (com balanço, inclinação e escala),
// e a engine usa esse valor para o projétil sair exatamente do ponto visível.
let drawnMuzzle: { weapon: RangedWeaponId; time: number; x: number; y: number } | null = null;
export function setDrawnMuzzle(weapon: RangedWeaponId, time: number, x: number, y: number) { drawnMuzzle = { weapon, time, x, y }; }
export function getDrawnMuzzle(weapon: RangedWeaponId, time: number) {
  if (!drawnMuzzle || drawnMuzzle.weapon !== weapon || Math.abs(time - drawnMuzzle.time) > 0.2) return null;
  return { x: drawnMuzzle.x, y: drawnMuzzle.y };
}
// Centro da flecha encaixada, em px à frente da empunhadura (ao longo da mira): penas no vértice da corda, ponta ~28 px à frente.
// Vem do desenho: ((0.15 + 0.5 * (2.785 - 1.18)) * 1.4 - 0.56) * 50 / 3.4.
export const BOW_ARROW_CENTER = ((0.15 + 0.5 * (2.785 - 1.18)) * 1.4 - 0.56) * 50 / 3.4;

// Instante do último disparo do arco: a flecha encaixada some ao soltar e reencaixa depois.
let arrowReleasedAt = -999;
export function markArrowReleased(time: number) { arrowReleasedAt = time; }
export function arrowNockAlpha(time: number) {
  const dt = time - arrowReleasedAt;
  if (dt < 0 || dt > 2) return 1;
  return dt < 0.12 ? 0 : Math.min(1, (dt - 0.12) / 0.25);
}
// Ponto de empunhadura em relação ao centro do personagem. side = +1 (arma à direita) ou -1 (à esquerda).
export function rangedGrip(weapon: RangedWeaponId, side: 1 | -1, r: number) {
  return { x: side * CONFIG.player.auraRadius, y: weapon === 'arco' ? -r * 0.1 : r * 0.35 };
}

// Boca (ponta do cajado / centro da corda) em relação ao centro do personagem.
export function rangedMuzzle(weapon: RangedWeaponId, side: 1 | -1, aimAngle: number, r: number) {
  const g = rangedGrip(weapon, side, r);
  if (weapon === 'arco') return { x: g.x + BOW_ARROW_CENTER * Math.cos(aimAngle), y: g.y + BOW_ARROW_CENTER * Math.sin(aimAngle) };
  // Reserva (arma ainda não desenhada): pose de repouso, haste girada -90°; a esfera nasce no centro da gema.
  const tip = STAFF_TIP_LOCAL[weapon];
  return { x: g.x + tip.y, y: g.y - tip.x };
}
