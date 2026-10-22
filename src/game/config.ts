// Ajustes de balanceamento centralizados para facilitar as próximas etapas.
export const CONFIG = {
  map: { size: 2400, wall: 34, grid: 80 },
  player: { radius: 18, speed: 220, maxHealth: 100, armor: 0, dodge: 0.04, pickupRadius: 10 },
  enemy: { radius: 16, speed: 68, health: 30, contactDamage: 9, contactCooldown: 0.8 },
  waves: { firstCount: 5, addedPerWave: 3, interval: 18 },
  xp: { perSlime: 1, radius: 7, attractionRadius: 65, attractionSpeed: 220, levelBase: 4, levelGrowth: 2 },
  weapons: {
    espada: { label: 'Espada', range: 70, damage: 22, attackSpeed: 1.25, kind: 'melee' as const, projectileSpeed: 0 },
    cajado: { label: 'Cajado', range: 260, damage: 17, attackSpeed: 0.85, kind: 'orb' as const, projectileSpeed: 390 },
    arco: { label: 'Arco', range: 390, damage: 13, attackSpeed: 1.15, kind: 'arrow' as const, projectileSpeed: 560 },
    bastao: { label: 'Bastão de Raízes', range: 76, damage: 20, attackSpeed: 1.15, kind: 'melee' as const, projectileSpeed: 0 },
  },
} as const;

export type WeaponId = keyof typeof CONFIG.weapons;

export const CLASSES = {
  guerreiro: { label: 'Guerreiro', description: 'Resistência e combate corpo a corpo' },
  mago: { label: 'Mago', description: 'Dano mágico à distância' },
  arqueiro: { label: 'Arqueiro', description: 'Precisão e alcance' },
  druida: { label: 'Druida', description: 'Bastão de raízes, regeneração e orbes de cura' },
} as const;

export type ClassId = keyof typeof CLASSES;
export const LEVEL_GROWTH = { health: 8, armor: 0.4, speed: 5, attackSpeed: 0.045, dodge: 0.008 };