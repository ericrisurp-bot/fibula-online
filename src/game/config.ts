// Ajustes de balanceamento centralizados para facilitar as próximas etapas.
export const CONFIG = {
  map: { size: 2400, wall: 34, grid: 80 },
  player: { radius: 18, speed: 145, maxHealth: 100, armor: 0, dodge: 0.04, pickupRadius: 2 },
  enemy: {
    radius: 16,
    speed: 155,
    speedIncrease: 5,
    speedEveryWaves: 3,
    health: 30,
    healthPerWave: 1.2,
    contactDamage: 9,
    contactDamageIncrease: 1,
    contactDamageEveryWaves: 4,
    contactCooldown: 0.8,
    separation: { minDistance: 28, iterations: 2 },
  },
  waves: { firstCount: 5, addedPerWave: 3, addedIncrease: 2, increaseEveryWaves: 5, cycle: 60, hordaDuration: 12, maxAlive: 150 },
  trees: { max: 15, startCount: 6, spawnBase: 25, spawnReductionPerTree: 1.2, spawnMin: 15, noSpawnRadius: 365, cutRange: 50, hitsToCut: 5, sizeWeights: { small: 0.6, medium: 0.3, large: 0.1 } },
  inventory: { maxSlots: 3, maxPerSlot: 5 },
  house: { buildCost: 60, interactRadius: 50, treeClearRadius: 220, playerClearRadius: 420, wallMargin: 120 },
  cart: { repairCost: 10, interactRadius: 50, capacitySlots: 10, maxPerSlot: 8, followDistance: 38, followSpeed: 260, wallMargin: 40, loadSlowdownMin: 0.6, loadSlowdownMax: 0.8 },
  flags: {
    colors: [
      { id: 'yellow', label: 'Amarela', color: '#f4d03f' },
      { id: 'green', label: 'Verde', color: '#43c66e' },
      { id: 'red', label: 'Vermelha', color: '#ef5350' },
      { id: 'blue', label: 'Azul', color: '#42a5f5' },
    ],
  },
  xp: { perSlime: 1, radius: 7, attractionRadius: 40, attractionSpeed: 300, levelBase: 4, levelGrowth: 2 },
  attributes: {
    baseValue: 100,
    gainPerLevel: 1,
    // Multiplicadores editáveis por classe; neste PR todos permanecem em 1.
    classMultipliers: {
      guerreiro: { vida: 1, forca: 1, armadura: 1, resistenciaMagica: 1, inteligencia: 1, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 1, areaAtaque: 1 },
      mago: { vida: 1, forca: 1, armadura: 1, resistenciaMagica: 1, inteligencia: 1, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 1, areaAtaque: 1 },
      arqueiro: { vida: 1, forca: 1, armadura: 1, resistenciaMagica: 1, inteligencia: 1, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 1, areaAtaque: 1 },
      druida: { vida: 1, forca: 1, armadura: 1, resistenciaMagica: 1, inteligencia: 1, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 1, areaAtaque: 1 },
    },
    // Coeficientes reproduzem os ganhos atuais por nível quando o multiplicador é 1.
    effectPerPointGained: { vida: 8, armadura: 0.4, velocidadeMovimento: 5, velocidadeAtaque: 0.045, esquiva: 0.008 },
  },
  weapons: {
    espada: { label: 'Espada', range: 70, damage: 22, attackSpeed: 1.25, maxTargets: 4, kind: 'melee' as const, projectileSpeed: 0 },
    cajado: { label: 'Cajado', range: 290, damage: 17, attackSpeed: 0.85, kind: 'orb' as const, projectileSpeed: 390 },
    arco: { label: 'Arco', range: 420, damage: 13, attackSpeed: 1.15, kind: 'arrow' as const, projectileSpeed: 560 },
    bastao: { label: 'Cajado da Natureza', range: 290, damage: 17, attackSpeed: 0.85, kind: 'orb' as const, projectileSpeed: 390 },
  },
} as const;

export type WeaponId = keyof typeof CONFIG.weapons;

export const CLASSES = {
  guerreiro: { label: 'Guerreiro', description: 'Resistência e combate corpo a corpo' },
  mago: { label: 'Mago', description: 'Dano mágico à distância' },
  arqueiro: { label: 'Arqueiro', description: 'Precisão e alcance' },
  druida: { label: 'Druida', description: 'Magia natural à distância, regeneração e orbes de cura' },
} as const;

export type ClassId = keyof typeof CLASSES;