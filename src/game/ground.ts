import { CONFIG } from './config';

export function playerFeet(p: { x: number; y: number }) {
  return { x: p.x, y: p.y + CONFIG.player.footOffset };
}
