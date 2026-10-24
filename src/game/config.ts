// Ajustes de balanceamento centralizados para facilitar as próximas etapas.
export const CONFIG = {
  map: { size: 4320, wall: 34, grid: 80 },
  player: { radius: 18, speed: 145, maxHealth: 100, armor: 0, dodge: 0.04, pickupRadius: 2 },
  enemy: {
    radius: 16,
    speed: 138,
    speedIncrease: 4.6,
    speedEveryWaves: 1,
    health: 30,
    healthPerWave: 1.2,
    contactDamage: 9,
    contactDamageIncrease: 1,
    contactDamageEveryWaves: 4,
    contactCooldown: 0.8,
    playerContactSlack: 2,
    separation: { minDistance: 28, iterations: 2 },
    obstacleAvoidanceDistance: 75,
    obstacleAvoidanceBuffer: 12,
  },
  waves: { firstCount: 5, addedPerWave: 3, addedIncrease: 2, increaseEveryWaves: 5, cycle: 60, hordaDuration: 12, maxAlive: 150 },
  dayNight: { cycle: 90, dayDuration: 45, transitionDuration: 5, dayDamageVulnerability: 1, spawnStopBeforeDawn: 5, spawnMinDistance: 800, spawnMaxDistance: 1000, visibilityRange: 420, nightOverlayStrength: 0.9, maxAlive: 250, firstNightSpawnCount: 5, addedPerNight: 5, spawnWaveDistribution: [0.3, 0.2, 0.25, 0.15, 0.1] },
  trees: { max: 70, startCount: 15, spawnBase: 25, spawnReductionPerTree: 1.2, spawnMin: 15, noSpawnRadius: 600, attractionRadius: 300, attractionMaxNearby: 20, attractionMaxChance: 0.8, rareHouseSpawnChance: 0.009, rareHouseRadius: 220, cutRange: 50, hitsToCut: 5, sizeWeights: { small: 0.6, medium: 0.3, large: 0.1 } },
  rocks: { max: 30, startCount: 12, spawnBase: 35, spawnReductionPerRock: 0.4, spawnMin: 22, noSpawnRadius: 600, mineRange: 50, dropChance: 0.07, attractionRadius: 300, attractionMaxNearby: 15, attractionMaxChance: 0.8, northEastSpawnChance: 0.7, northEastMinX: 0.55, northEastMaxY: 0.45, hitsToBreak: { small: 7, medium: 12, large: 22 }, sizeWeights: { small: 0.5, medium: 0.32, large: 0.18 } },
  cotton: { max: 20, startCount: 20, minSpacing: 600, dropChance: 0.07, plantPlayerClearRadius: 220, plantSizeWeights: { small: 0.5, medium: 0.32, large: 0.18 } },
  tecelaria: { buildCostBronze: 2, buildCostWood: 50, buildCostCotton: 10, buildCostStone: 10, interactRadius: 85, clearRadius: 180, cottonCapacity: 20, processInterval: 2, linenChance: 0.03 },
  inventory: { maxSlots: 3, maxPerSlot: 5 },
  house: { buildCost: 60, interactRadius: 80, treeClearRadius: 220, playerClearRadius: 420, wallMargin: 120 },
  refinery: { buildCostWood: 40, buildCostStone: 30, interactRadius: 80, treeClearRadius: 220, rockClearRadius: 220, playerClearRadius: 420, wallMargin: 120, rareRockSpawnChance: 0.009, rareRockSpawnRadius: 220, bronzeChance: 0.02, processInterval: 2, stoneCapacity: 10, stoneSlotCapacity: 5 },
  cart: { repairCost: 10, interactRadius: 50, capacitySlots: 10, maxPerSlot: 8, followDistance: 38, followSpeed: 260, wallMargin: 40, minimumHouseDistance: 700, loadSlowdownMin: 0.05, loadSlowdownMax: 0.45 },
  flags: {
    colors: [
      { id: 'yellow', label: 'Amarela', color: '#f4d03f' },
      { id: 'green', label: 'Verde', color: '#43c66e' },
      { id: 'red', label: 'Vermelha', color: '#ef5350' },
      { id: 'blue', label: 'Azul', color: '#42a5f5' },
    ],
  },
  classSwitch: { healthTransitionSeconds: 5 },
  xp: { perSlime: 1, radius: 7, attractionRadius: 40, attractionSpeed: 300, levelBase: 4, levelGrowth: 2 },
  attributes: {
    classStartHealth: { guerreiro: 200, mago: 90, arqueiro: 100, druida: 110 },
    baseValue: 100,
    gainPerLevel: 1,
    // Multiplicadores aplicados somente ao ganho de cada nível.
    classMultipliers: {
      guerreiro: { vida: 1.6, forca: 1.4, armadura: 1.4, resistenciaMagica: 1, inteligencia: 0.4, destreza: 0.6, velocidadeMovimento: 0.8, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 0.8, areaAtaque: 1 },
      mago: { vida: 0.8, forca: 0.6, armadura: 0.4, resistenciaMagica: 1, inteligencia: 1.8, destreza: 0.6, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 1, areaAtaque: 1 },
      arqueiro: { vida: 0.8, forca: 0.8, armadura: 0.6, resistenciaMagica: 1, inteligencia: 0.4, destreza: 2.6, velocidadeMovimento: 1.4, velocidadeAtaque: 1.1, alcanceAtaque: 1, esquiva: 1.2, areaAtaque: 1 },
      druida: { vida: 1, forca: 0.6, armadura: 0.4, resistenciaMagica: 1, inteligencia: 1.25, destreza: 0.6, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 1, esquiva: 1, areaAtaque: 1 },
    },
    archerDamageWeights: { destreza: 0.65, forca: 0.35 },
    // Coeficientes reproduzem os ganhos atuais por nível quando o multiplicador é 1.
    effectPerPointGained: { vida: 8, armadura: 0.4, velocidadeMovimento: 1.5, velocidadeAtaque: 0.045, esquiva: 0.008 },
  },
  mageExplosion: { everyAttack: 4, radius: 120, damageMultiplier: 1.5, maxTargets: 999 },
  archerPierce: { damageFactors: [1, 0.8, 0.8, 0.7, 0.6, 0.5], speedFactors: [0.9, 0.75, 0.6, 0.45, 0.3] },
  archerHeal: { arrowsPerHeal: 15, amount: 1 },
  druidHeal: { basicHitsPerHeal: 4, basicHitAmount: 2, killsPerOrb: 4, maxOrbs: 5 },
  weapons: {
    espada: { label: 'Espada', range: 70, damage: 16, attackSpeed: 1.25, maxTargets: 4, knockback: 12, kind: 'melee' as const, projectileSpeed: 0 },
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