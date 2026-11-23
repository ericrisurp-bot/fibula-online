#!/usr/bin/env node
/**
 * Reprodutibilidade:
 *   node tools/balance-sim.mjs          # 30 sementes por classe
 *   node tools/balance-sim.mjs 30
 *   node tools/balance-sim.mjs 30 --imortal
 *   node tools/balance-sim.mjs 1 --diagnostico-noites
 *
 * O simulador carrega todos os módulos TypeScript de src/game para um diretório
 * temporário e fornece um requestAnimationFrame virtual a 30 FPS. Math.random
 * é substituído por um PRNG com semente fixa. --imortal mantém HP alto apenas
 * no simulador.
 *
 * Todas as classes usam os mesmos perfis de IA: próximo, bater-e-recuar e
 * distância. O strafe troca de lado a cada 4 s, com lado inicial derivado da semente.
 *
 * O modo normal mede sobrevivência, HP, dano causado/recebido, pressão de horda,
 * tempo em combate e exposição. --json salva também os dados individuais e por noite.
 * --imortal mantém HP alto apenas no simulador para comparar capacidade ofensiva.
 * Esse arquivo não altera CONFIG nem o motor de gameplay.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nightDiagnostic = args.includes('--diagnostico-noites');
const determinismDiagnostic = args.includes('--diagnostico-determinismo');
const immortal = args.includes('--imortal') || nightDiagnostic;
const jsonOutput = args.includes('--json');
const countArg = args.find(arg => !['--imortal', '--json', '--diagnostico-noites', '--diagnostico-determinismo'].includes(arg));
const seedCount = Number.parseInt(countArg ?? '30', 10);
const FPS = 30;
const STEP = 1 / FPS;
const MAX_SECONDS = 600;
const CLASSES = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const BOT_PROFILES = {
  proximo: { label: 'próximo', desired: 42, retreatBelow: 30 },
  recuo: { label: 'bater-e-recuar', desired: 170, retreatBelow: 115 },
  distancia: { label: 'distância', desired: 300, retreatBelow: 255 },
};
const PROFILE_IDS = Object.keys(BOT_PROFILES);
const RUN_CLASSES = nightDiagnostic ? ['mago'] : CLASSES;
const RUN_PROFILES = nightDiagnostic ? ['proximo'] : PROFILE_IDS;

if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 10000) {
  console.error('Uso: node tools/balance-sim.mjs [N] [--imortal] [--json] [--diagnostico-noites], com N entre 1 e 10000.');
  process.exit(2);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function compileRuntimeModules(tempDir) {
  const sourceRoot = join(root, 'src', 'game');
  const sourceFiles = [];
  const collectTypeScript = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) collectTypeScript(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.ts')) sourceFiles.push(fullPath);
    }
  };
  collectTypeScript(sourceRoot);

  for (const sourcePath of sourceFiles) {
    const relativePath = sourcePath.slice(sourceRoot.length + 1);
    const outputPath = join(tempDir, relativePath.replace(/\.ts$/, '.mjs'));
    const outputDirectory = dirname(outputPath);
    mkdirSync(outputDirectory, { recursive: true });
    const source = readFileSync(sourcePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      },
      fileName: sourcePath,
    }).outputText;
    const fixedImports = output.replace(
      /(from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\2/g,
      (match, prefix, quote, importPath) => {
        const pathWithoutTs = importPath.endsWith('.ts') ? importPath.slice(0, -3) : importPath;
        const pathWithExtension = /\.[a-z0-9]+$/i.test(pathWithoutTs) ? pathWithoutTs : pathWithoutTs + '.mjs';
        return prefix + quote + pathWithExtension + quote;
      },
    );
    writeFileSync(outputPath, fixedImports);
  }
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function fmt(value, digits = 1) {
  return value == null ? '—' : value.toFixed(digits);
}

function summary(values, digits = 1) {
  return `${fmt(mean(values), digits)}/${fmt(median(values), digits)} [${fmt(percentile(values, .25), digits)}–${fmt(percentile(values, .75), digits)}]`;
}

function botMove(engine, CONFIG, profileId, seed, frame, currentTargetId) {
  const player = engine.state.player;
  const playerFeetY = player.y + CONFIG.player.footOffset;
  // A IA de combate só persegue slimes: animais não são alvos do autoAttack.
  const slimes = engine.state.enemies.filter(enemy => !enemy.animalKind);
  // Mantém o alvo atual enquanto ele continuar vivo; só procura outro quando
  // o alvo anterior sair da lista de inimigos.
  const currentTarget = currentTargetId === null
    ? null
    : slimes.find(enemy => enemy.id === currentTargetId);
  const target = currentTarget ?? slimes
    .map(enemy => ({
      enemy,
      dx: enemy.x - player.x,
      dy: enemy.y - playerFeetY,
      centerDistance: Math.hypot(enemy.x - player.x, enemy.y - player.y),
    }))
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0]?.enemy;

  if (!target) {
    const angle = frame * STEP * 0.7 + (seed % 17) * 0.19;
    engine.setMove(Math.cos(angle), Math.sin(angle));
    return null;
  }

  const nearest = {
    enemy: target,
    dx: target.x - player.x,
    dy: target.y - playerFeetY,
    centerDistance: Math.hypot(target.x - player.x, target.y - player.y),
  };
  const distance = Math.hypot(nearest.dx, nearest.dy) || 1;
  const towardX = nearest.dx / distance;
  const towardY = nearest.dy / distance;
  const side = ((Math.floor(frame * STEP / 4) + seed) % 2 === 0) ? 1 : -1;
  const style = BOT_PROFILES[profileId];
  let radial = 0;
  if (distance > style.desired + 20) radial = 1;
  else if (distance < style.retreatBelow) radial = -1;

  // Aproxima/recua radialmente e adiciona um componente lateral determinístico.
  let x = towardX * radial - towardY * side * 0.72;
  let y = towardY * radial + towardX * side * 0.72;
  const length = Math.hypot(x, y) || 1;
  engine.setMove(x / length, y / length);
  return { enemyId: nearest.enemy.id, dx: nearest.dx, dy: nearest.dy, distance, centerDistance: nearest.centerDistance, radial };
}

async function simulate(GameEngine, CONFIG, classId, profileId, seed, { immortal = false, onProgress, traceDeterminism = false } = {}) {
  const oldRandom = Math.random;
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const random = mulberry32(seed);
  let frameNow = performance.now();
  let nextId = 1;
  let queue = [];
  let frame = 0;
  let killsAt300 = null;
  let levelAt300 = null;
  const enemyNightById = new Map();
  const spawnedByNight = {};
  const cohortKillsByNight = {};
  const killsDuringNight = {};
  const nightMetrics = [];
  let currentNight = null;
  let maxConcurrentSlimes = 0;
  let minHpPercent = 100;
  let damageDealt = 0;
  let damageReceivedEffective = 0;
  const damageBySource = {
    slime: { hits: 0, damage: 0 },
    wolf: { hits: 0, damage: 0 },
    mixed: { hits: 0, damage: 0 },
    unknown: { hits: 0, damage: 0 },
  };
  const aiDistanceSamples = [];
  const aiTelemetry = {
    samples: 0,
    distanceTotal: 0,
    minDistance: null,
    maxDistance: 0,
    withinWeaponRange: 0,
    approaching: 0,
    retreating: 0,
    strafing: 0,
    blockedMovement: 0,
    attacks: 0,
    targetSwitches: 0,
    targetLosses: 0,
    currentTargetId: null,
    targetFrames: 0,
    noTargetFrames: 0,
    slimesAvailableFrames: 0,
    noSlimeFrames: 0,
    noTargetWithSlimesFrames: 0,
    playerTowardTarget: 0,
    playerAwayFromTarget: 0,
    playerLateralOrStill: 0,
  };
  let timeInCombat = 0;
  let timeExposed = 0;
  let nextProgressAt = 60;
  const determinismTrace = traceDeterminism ? [] : null;

  Math.random = random;
  globalThis.requestAnimationFrame = callback => {
    const id = nextId++;
    queue.push({ id, callback });
    return id;
  };
  globalThis.cancelAnimationFrame = id => {
    queue = queue.filter(item => item.id !== id);
  };

  try {
    // A seed deve chegar diretamente ao PRNG interno do motor; não dependa de
    // Math.random para gerar a seed implícita do GameEngine. Não habilite
    // headless: start() precisa agendar os quadros virtuais do simulador.
    const engine = new GameEngine(() => {}, { seed });
    engine.setClass(classId);

    // Instrumentação somente do simulador: os wrappers preservam os métodos reais.
    const originalRecordClassDamage = engine.recordClassDamage.bind(engine);
    engine.recordClassDamage = function (enemy, amount) {
      if (!enemy.animalKind && Number.isFinite(enemy.hp) && Number.isFinite(amount) && amount > 0) {
        damageDealt += Math.min(amount, Math.max(0, enemy.hp));
      }
      return originalRecordClassDamage(enemy, amount);
    };
    const originalAddFloatingDamage = engine.addFloatingDamage.bind(engine);
    engine.addFloatingDamage = function (x, y, amount, color, scale) {
      if (color === '#ff4545' && Number.isFinite(amount) && amount > 0) {
        damageReceivedEffective += amount;
        const feetY = this.state.player.y + CONFIG.player.footOffset;
        const touching = this.state.enemies.filter(enemy => {
          const contactRadius = enemy.animalKind === 'wolf'
            ? CONFIG.wildlife.wolves.radius + CONFIG.player.footRadius + 3
            : !enemy.animalKind
              ? CONFIG.player.footRadius + CONFIG.enemy.radius + CONFIG.enemy.playerContactSlack
              : 0;
          return contactRadius > 0
            && Math.hypot(enemy.x - this.state.player.x, enemy.y - feetY) <= contactRadius + 2;
        });
        const hasSlime = touching.some(enemy => !enemy.animalKind);
        const hasWolf = touching.some(enemy => enemy.animalKind === 'wolf');
        const source = hasSlime && hasWolf ? 'mixed' : hasSlime ? 'slime' : hasWolf ? 'wolf' : 'unknown';
        damageBySource[source].hits += 1;
        damageBySource[source].damage += amount;
      }
      return originalAddFloatingDamage(x, y, amount, color, scale);
    };

    const originalAutoAttack = engine.autoAttack.bind(engine);
    engine.autoAttack = function () {
      const ready = this.local.attackTimer >= 1 / CONFIG.weapons[this.state.weapon].attackSpeed;
      originalAutoAttack();
      if (ready && this.local.attackTimer === 0) aiTelemetry.attacks += 1;
    };

    // Acompanhe o nascimento de cada slime e a noite em que ele surgiu.
    const originalSpawn = engine.spawnHordeEnemy.bind(engine);
    engine.spawnHordeEnemy = function () {
      const beforeIds = new Set(this.state.enemies.map(enemy => enemy.id));
      const spawned = originalSpawn();
      for (const enemy of this.state.enemies) {
        if (beforeIds.has(enemy.id)) continue;
        const night = this.state.nightNumber;
        enemyNightById.set(enemy.id, night);
        spawnedByNight[night] = (spawnedByNight[night] ?? 0) + 1;
      }
      return spawned;
    };

    const originalKill = engine.killEnemy.bind(engine);
    engine.killEnemy = function (id) {
      const enemy = this.state.enemies.find(value => value.id === id);
      const birthNight = enemy ? (enemyNightById.get(id) ?? null) : null;
      const killNight = this.state.dayNight === 'night' ? this.state.nightNumber : null;
      const previousKills = this.state.kills;
      originalKill(id);
      if (this.state.kills > previousKills && birthNight !== null) {
        cohortKillsByNight[birthNight] = (cohortKillsByNight[birthNight] ?? 0) + 1;
        if (killNight !== null) killsDuringNight[killNight] = (killsDuringNight[killNight] ?? 0) + 1;
      }
    };

    engine.start();
    // Usa uma origem virtual fixa; não deixa a precisão de performance.now() contaminar o delta.
    frameNow = 0;
    engine.lastTime = 0;

    const durationLimit = nightDiagnostic ? 360 : immortal
      ? CONFIG.dayNight.cycle * 10
      : MAX_SECONDS;
    while (
      queue.length &&
      (immortal
        ? engine.state.elapsed < durationLimit
        : !engine.state.dead && engine.state.elapsed < durationLimit)
    ) {
      const availableSlimes = engine.state.enemies.filter(enemy => !enemy.animalKind).length;
      if (availableSlimes > 0) aiTelemetry.slimesAvailableFrames += 1;
      else aiTelemetry.noSlimeFrames += 1;
      const aiDecision = botMove(engine, CONFIG, profileId, seed, frame, aiTelemetry.currentTargetId);
      if (aiDecision) {
        if (aiTelemetry.currentTargetId !== aiDecision.enemyId) {
          if (aiTelemetry.currentTargetId !== null) aiTelemetry.targetSwitches += 1;
          aiTelemetry.currentTargetId = aiDecision.enemyId;
        }
        aiTelemetry.targetFrames += 1;
        aiTelemetry.samples += 1;
        aiTelemetry.distanceTotal += aiDecision.distance;
        aiDistanceSamples.push(aiDecision.distance);
        aiTelemetry.minDistance = aiTelemetry.minDistance === null
          ? aiDecision.distance
          : Math.min(aiTelemetry.minDistance, aiDecision.distance);
        aiTelemetry.maxDistance = Math.max(aiTelemetry.maxDistance, aiDecision.distance);
        if (aiDecision.centerDistance <= CONFIG.weapons[engine.state.weapon].range) aiTelemetry.withinWeaponRange += 1;
        if (aiDecision.radial > 0) aiTelemetry.approaching += 1;
        else if (aiDecision.radial < 0) aiTelemetry.retreating += 1;
        else aiTelemetry.strafing += 1;
      } else {
        aiTelemetry.noTargetFrames += 1;
        if (availableSlimes > 0) aiTelemetry.noTargetWithSlimesFrames += 1;
        if (aiTelemetry.currentTargetId !== null) aiTelemetry.targetLosses += 1;
        aiTelemetry.currentTargetId = null;
      }
      if (immortal) engine.state.player.hp = Number.MAX_SAFE_INTEGER;
      const previousPlayerPosition = { x: engine.state.player.x, y: engine.state.player.y };
      const scheduled = queue.shift();
      frame += 1;
      frameNow = frame * STEP * 1000;
      scheduled.callback(frameNow);
      if (aiDecision) {
        const moved = Math.hypot(
          engine.state.player.x - previousPlayerPosition.x,
          engine.state.player.y - previousPlayerPosition.y,
        );
        const expected = engine.getPlayerMoveSpeed() * STEP;
        if (expected > 0 && moved < expected * 0.15) aiTelemetry.blockedMovement += 1;
        const projectedMovement = (
          (engine.state.player.x - previousPlayerPosition.x) * aiDecision.dx
          + (engine.state.player.y - previousPlayerPosition.y) * aiDecision.dy
        ) / (aiDecision.distance || 1);
        if (projectedMovement > 0.05) aiTelemetry.playerTowardTarget += 1;
        else if (projectedMovement < -0.05) aiTelemetry.playerAwayFromTarget += 1;
        else aiTelemetry.playerLateralOrStill += 1;
      }

      if (determinismTrace) {
        const snapshot = {
          frame,
          elapsed: engine.state.elapsed,
          randomState: engine.randomState,
          nextId: engine.nextId,
          kills: engine.state.kills,
          phase: engine.state.dayNight,
          nightNumber: engine.state.nightNumber,
          horde: [engine.hordeScheduled, engine.hordeSpawned, engine.hordeTarget],
          player: [engine.state.player.x, engine.state.player.y, engine.state.player.hp, engine.state.player.level],
          enemies: engine.state.enemies.map(enemy => [
            enemy.id, enemy.x, enemy.y, enemy.hp, enemy.hitWait, enemy.wobble, enemy.animalKind ?? null,
          ]),
        };
        determinismTrace.push({
          frame,
          elapsed: engine.state.elapsed,
          kills: engine.state.kills,
          enemies: engine.state.enemies.length,
          randomState: engine.randomState,
          snapshot,
          hash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        });
      }

      const player = engine.state.player;
      const slimes = engine.state.enemies.filter(enemy => !enemy.animalKind);
      maxConcurrentSlimes = Math.max(maxConcurrentSlimes, slimes.length);
      if (player.maxHp > 0) minHpPercent = Math.min(minHpPercent, 100 * player.hp / player.maxHp);
      if (slimes.length > 0) timeInCombat += STEP;
      const feetY = player.y + CONFIG.player.footOffset;
      if (slimes.some(enemy => Math.hypot(enemy.x - player.x, enemy.y - feetY)
        <= CONFIG.player.footRadius + CONFIG.enemy.radius + CONFIG.enemy.playerContactSlack)) {
        timeExposed += STEP;
      }

      if (engine.state.dayNight === 'night') {
        if (!currentNight || currentNight.night !== engine.state.nightNumber) {
          currentNight = {
            night: engine.state.nightNumber,
            hpStart: player.hp,
            hpMax: player.maxHp,
            minHpPercent: player.maxHp > 0 ? 100 * player.hp / player.maxHp : 0,
            maxConcurrentSlimes: slimes.length,
            timeInCombat: 0,
            timeExposed: 0,
          };
        }
        currentNight.minHpPercent = Math.min(currentNight.minHpPercent, player.maxHp > 0 ? 100 * player.hp / player.maxHp : 0);
        currentNight.maxConcurrentSlimes = Math.max(currentNight.maxConcurrentSlimes, slimes.length);
        if (slimes.length > 0) currentNight.timeInCombat += STEP;
        if (slimes.some(enemy => Math.hypot(enemy.x - player.x, enemy.y - feetY)
          <= CONFIG.player.footRadius + CONFIG.enemy.radius + CONFIG.enemy.playerContactSlack)) {
          currentNight.timeExposed += STEP;
        }
      } else if (engine.state.dayNight === 'dawn' && currentNight) {
        currentNight.hpEnd = player.hp;
        currentNight.hpEndPercent = player.maxHp > 0 ? 100 * player.hp / player.maxHp : 0;
        currentNight.complete = true;
        nightMetrics.push(currentNight);
        currentNight = null;
      }

      if (immortal) {
        // Repor a vida apenas no simulador, inclusive depois de level-ups.
        engine.state.player.hp = Number.MAX_SAFE_INTEGER;
        if (killsAt300 === null && engine.state.elapsed >= 300) {
          killsAt300 = engine.state.kills;
          levelAt300 = engine.state.player.level;
        }
      }

      if (engine.state.elapsed >= nextProgressAt) {
        onProgress?.({ elapsed: engine.state.elapsed, limit: durationLimit, kills: engine.state.kills, phase: engine.state.dayNight, nightNumber: engine.state.nightNumber, spawned: engine.hordeSpawned, target: engine.hordeTarget, alive: engine.state.enemies.filter(enemy => !enemy.animalKind).length });
        nextProgressAt += 60;
      }
    }

    onProgress?.({ elapsed: engine.state.elapsed, limit: durationLimit, kills: engine.state.kills, phase: engine.state.dayNight, nightNumber: engine.state.nightNumber, spawned: engine.hordeSpawned, target: engine.hordeTarget, alive: engine.state.enemies.filter(enemy => !enemy.animalKind).length, final: true });

    if (immortal) {
      if (currentNight) {
        currentNight.hpEnd = engine.state.player.hp;
        currentNight.hpEndPercent = engine.state.player.maxHp > 0 ? 100 * engine.state.player.hp / engine.state.player.maxHp : 0;
        currentNight.complete = false;
        nightMetrics.push(currentNight);
      }
      return {
        classId,
        profileId,
        seed,
        maxConcurrentSlimes,
        minHpPercent,
        damageDealt,
        damageReceivedEffective,
        damageBySource,
        aiTelemetry: {
          ...aiTelemetry,
          meanDistance: aiTelemetry.samples ? aiTelemetry.distanceTotal / aiTelemetry.samples : null,
          medianDistance: median(aiDistanceSamples),
          p90Distance: percentile(aiDistanceSamples, 0.9),
          weaponRangePercent: aiTelemetry.samples ? 100 * aiTelemetry.withinWeaponRange / aiTelemetry.samples : 0,
          approachPercent: aiTelemetry.samples ? 100 * aiTelemetry.approaching / aiTelemetry.samples : 0,
          retreatPercent: aiTelemetry.samples ? 100 * aiTelemetry.retreating / aiTelemetry.samples : 0,
          strafePercent: aiTelemetry.samples ? 100 * aiTelemetry.strafing / aiTelemetry.samples : 0,
          blockedPercent: aiTelemetry.samples ? 100 * aiTelemetry.blockedMovement / aiTelemetry.samples : 0,
          targetSwitches: aiTelemetry.targetSwitches,
          targetLosses: aiTelemetry.targetLosses,
          noTargetPercent: frame ? 100 * aiTelemetry.noTargetFrames / frame : 0,
          slimesAvailablePercent: frame ? 100 * aiTelemetry.slimesAvailableFrames / frame : 0,
          noSlimePercent: frame ? 100 * aiTelemetry.noSlimeFrames / frame : 0,
          noTargetWithSlimesPercent: frame ? 100 * aiTelemetry.noTargetWithSlimesFrames / frame : 0,
          playerTowardPercent: aiTelemetry.samples ? 100 * aiTelemetry.playerTowardTarget / aiTelemetry.samples : 0,
          playerAwayPercent: aiTelemetry.samples ? 100 * aiTelemetry.playerAwayFromTarget / aiTelemetry.samples : 0,
          playerLateralPercent: aiTelemetry.samples ? 100 * aiTelemetry.playerLateralOrStill / aiTelemetry.samples : 0,
        },
        timeInCombat,
        timeExposed,
        nightMetrics,
        killsAt300: killsAt300 ?? engine.state.kills,
        levelAt300: levelAt300 ?? engine.state.player.level,
        spawnedByNight,
        cohortKillsByNight,
        killsDuringNight,
        finalElapsed: engine.state.elapsed,
        finalNightNumber: engine.state.nightNumber,
        finalPhase: engine.state.dayNight,
        totalKills: engine.state.kills,
        ...(determinismTrace ? { determinismTrace } : {}),
      };
    }

    const survivedSeconds = engine.state.elapsed;
    const died = engine.state.dead;
    const completeNightsSurvived = Math.max(
      0,
      engine.state.nightNumber - (engine.state.dayNight === 'night' ? 1 : 0),
    );
    if (currentNight) {
      currentNight.hpEnd = engine.state.player.hp;
      currentNight.hpEndPercent = engine.state.player.maxHp > 0 ? 100 * engine.state.player.hp / engine.state.player.maxHp : 0;
      currentNight.complete = false;
      nightMetrics.push(currentNight);
    }
    const result = {
      classId,
      profileId,
      seed,
      maxConcurrentSlimes,
      minHpPercent,
      damageDealt,
      damageReceivedEffective,
      damageBySource,
      aiTelemetry: {
        ...aiTelemetry,
        meanDistance: aiTelemetry.samples ? aiTelemetry.distanceTotal / aiTelemetry.samples : null,
        medianDistance: median(aiDistanceSamples),
        p90Distance: percentile(aiDistanceSamples, 0.9),
        weaponRangePercent: aiTelemetry.samples ? 100 * aiTelemetry.withinWeaponRange / aiTelemetry.samples : 0,
        approachPercent: aiTelemetry.samples ? 100 * aiTelemetry.approaching / aiTelemetry.samples : 0,
        retreatPercent: aiTelemetry.samples ? 100 * aiTelemetry.retreating / aiTelemetry.samples : 0,
        strafePercent: aiTelemetry.samples ? 100 * aiTelemetry.strafing / aiTelemetry.samples : 0,
        blockedPercent: aiTelemetry.samples ? 100 * aiTelemetry.blockedMovement / aiTelemetry.samples : 0,
        targetSwitches: aiTelemetry.targetSwitches,
        targetLosses: aiTelemetry.targetLosses,
        noTargetPercent: frame ? 100 * aiTelemetry.noTargetFrames / frame : 0,
        slimesAvailablePercent: frame ? 100 * aiTelemetry.slimesAvailableFrames / frame : 0,
        noSlimePercent: frame ? 100 * aiTelemetry.noSlimeFrames / frame : 0,
        noTargetWithSlimesPercent: frame ? 100 * aiTelemetry.noTargetWithSlimesFrames / frame : 0,
        playerTowardPercent: aiTelemetry.samples ? 100 * aiTelemetry.playerTowardTarget / aiTelemetry.samples : 0,
        playerAwayPercent: aiTelemetry.samples ? 100 * aiTelemetry.playerAwayFromTarget / aiTelemetry.samples : 0,
        playerLateralPercent: aiTelemetry.samples ? 100 * aiTelemetry.playerLateralOrStill / aiTelemetry.samples : 0,
      },
      timeInCombat,
      timeExposed,
      nightMetrics,
      totalKills: engine.state.kills,
      killsPerMinute: survivedSeconds > 0 ? engine.state.kills * 60 / survivedSeconds : 0,
      nightsSurvived: completeNightsSurvived,
      deathSeconds: died ? survivedSeconds : null,
      levelAtDeath: died ? engine.state.player.level : null,
      survivedSeconds,
      died,
      ...(determinismTrace ? { determinismTrace } : {}),
    };
    engine.stop();
    return result;
  } finally {
    Math.random = oldRandom;
    if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRaf;
    if (oldCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = oldCancel;
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'fibula-balance-sim-'));
try {
  const totalRuns = RUN_CLASSES.length * RUN_PROFILES.length * seedCount;
  console.log(`Preparando simulador: ${totalRuns} execução(ões) | modo: ${immortal ? 'IMORTAL' : 'normal'}.`);
  console.log('Compilando módulos do jogo...');
  compileRuntimeModules(tempDir);
  console.log('Módulos compilados. Iniciando simulações; haverá atualizações a cada 60 segundos simulados.');
  const [{ GameEngine }, { CONFIG }] = await Promise.all([
    import(pathToFileURL(join(tempDir, 'engine.mjs')).href),
    import(pathToFileURL(join(tempDir, 'config.mjs')).href),
  ]);
  const results = [];
  let runIndex = 0;

  if (determinismDiagnostic) {
    const classId = 'guerreiro';
    const profileId = 'proximo';
    const seed = 1;
    console.log('Diagnóstico de determinismo: Guerreiro / próximo / seed 1, duas execuções no mesmo processo.');
    const first = await simulate(GameEngine, CONFIG, classId, profileId, seed, { immortal: true, traceDeterminism: true });
    const second = await simulate(GameEngine, CONFIG, classId, profileId, seed, { immortal: true, traceDeterminism: true });
    const firstTrace = first.determinismTrace;
    const secondTrace = second.determinismTrace;
    const limit = Math.min(firstTrace.length, secondTrace.length);
    let divergence = -1;
    for (let index = 0; index < limit; index += 1) {
      if (firstTrace[index].hash !== secondTrace[index].hash) {
        divergence = index;
        break;
      }
    }
    if (divergence >= 0) {
      const a = firstTrace[divergence];
      const b = secondTrace[divergence];
      console.log(`DIVERGÊNCIA no quadro ${a.frame} (~${a.elapsed.toFixed(3)}s).`);
      console.log(`Execução 1: kills=${a.kills}, inimigos=${a.enemies}, randomState=${a.randomState}`);
      console.log(`Execução 2: kills=${b.kills}, inimigos=${b.enemies}, randomState=${b.randomState}`);
      const fields = [...new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)])];
      const differences = fields.filter(field => JSON.stringify(a.snapshot[field]) !== JSON.stringify(b.snapshot[field]));
      console.log('Campos divergentes:');
      for (const field of differences) {
        console.log(`- ${field}: execução 1=${JSON.stringify(a.snapshot[field])} | execução 2=${JSON.stringify(b.snapshot[field])}`);
      }
    } else if (firstTrace.length !== secondTrace.length) {
      console.log(`DURAÇÕES DIFERENTES: execução 1=${firstTrace.length} quadros; execução 2=${secondTrace.length} quadros.`);
    } else {
      console.log(`IGUAIS: ${firstTrace.length} quadros comparados sem divergência de estado.`);
      console.log(`Abates finais: ${first.totalKills} / ${second.totalKills}`);
    }
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(0);
  }

  for (const classId of RUN_CLASSES) {
    for (const profileId of RUN_PROFILES) {
      for (let seed = 1; seed <= seedCount; seed++) {
        runIndex += 1;
        const profileLabel = BOT_PROFILES[profileId].label;
        const startedAt = performance.now();
        console.log(`[${runIndex}/${totalRuns}] INICIANDO ${classId} | ${profileLabel} | semente ${seed}/${seedCount}.`);
        const result = await simulate(GameEngine, CONFIG, classId, profileId, seed, {
          immortal,
          onProgress: ({ elapsed, limit, kills, phase, nightNumber, spawned, target, alive, final }) => {
            const status = final ? 'FINALIZANDO' : 'PROGRESSO';
            const phaseInfo = nightDiagnostic ? ` | noite ${nightNumber} | fase ${phase} | horda ${spawned}/${target} | vivos ${alive}` : '';
            console.log(`[${runIndex}/${totalRuns}] ${status} ${classId} | ${profileLabel} | ${Math.floor(elapsed)}s/${Math.floor(limit)}s simulados | ${kills} abates${phaseInfo}.`);
          },
        });
        results.push(result);
        const durationSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        console.log(`[${runIndex}/${totalRuns}] CONCLUÍDO ${classId} | ${profileLabel} | ${durationSeconds}s de execução real.`);
      }
    }
  }
  console.log(`Todas as ${totalRuns} simulações foram concluídas. Gerando relatório...`);

  if (!immortal) {
    console.log(`Fíbula Online — auditoria individual | modo: normal | sementes/cenário: ${seedCount} | FPS: ${FPS} | limite: ${MAX_SECONDS}s`);
    console.log('Cada classe é executada nos mesmos três perfis. HP mínimo e dano recebido são métricas observadas no motor; exposição é proximidade de contato, não número de golpes.');
    console.log('M/Md [P25–P75]; morte s considera apenas partidas encerradas por morte.');
    console.log('Classe      Perfil             Mortes %   Noites M/Md [P25–P75]   Morte s   Abates   Dano causado   Dano recebido*   HP mín. %   Slimes máx   Combate min   Exposto s');
    for (const classId of CLASSES) {
      for (const profileId of PROFILE_IDS) {
        const rows = results.filter(row => row.classId === classId && row.profileId === profileId);
        const deaths = rows.filter(row => row.died);
        const nights = rows.map(row => row.nightsSurvived);
        const deathTimes = deaths.map(row => row.deathSeconds);
        const kills = rows.map(row => row.totalKills);
        const damage = rows.map(row => row.damageDealt);
        const received = rows.map(row => row.damageReceivedEffective);
        const hpMin = rows.map(row => row.minHpPercent);
        const maxSlimes = rows.map(row => row.maxConcurrentSlimes);
        const combat = rows.map(row => row.timeInCombat / 60);
        const exposed = rows.map(row => row.timeExposed);
        const deathRate = 100 * deaths.length / rows.length;
        console.log(
          `${classId.padEnd(11)} ${BOT_PROFILES[profileId].label.padEnd(17)} ` +
          `${fmt(deathRate,1)}% ${summary(nights)} ${summary(deathTimes,0)} ${summary(kills)} ` +
          `${summary(damage,0)} ${summary(received)} ${summary(hpMin)}% ` +
          `${summary(maxSlimes)} ${summary(combat)} ${summary(exposed)}`,
        );
        const aiRows = rows.map(row => row.aiTelemetry).filter(Boolean);
        const sourceRows = rows.map(row => row.damageBySource).filter(Boolean);
        if (aiRows.length && sourceRows.length) {
          const ai = {
            meanDistance: mean(aiRows.map(value => value.meanDistance)),
            medianDistance: mean(aiRows.map(value => value.medianDistance)),
            p90Distance: mean(aiRows.map(value => value.p90Distance)),
            minDistance: mean(aiRows.map(value => value.minDistance)),
            maxDistance: mean(aiRows.map(value => value.maxDistance)),
            weaponRangePercent: mean(aiRows.map(value => value.weaponRangePercent)),
            approachPercent: mean(aiRows.map(value => value.approachPercent)),
            retreatPercent: mean(aiRows.map(value => value.retreatPercent)),
            strafePercent: mean(aiRows.map(value => value.strafePercent)),
            blockedPercent: mean(aiRows.map(value => value.blockedPercent)),
            targetSwitches: mean(aiRows.map(value => value.targetSwitches)),
            targetLosses: mean(aiRows.map(value => value.targetLosses)),
            noTargetPercent: mean(aiRows.map(value => value.noTargetPercent)),
            slimesAvailablePercent: mean(aiRows.map(value => value.slimesAvailablePercent)),
            noSlimePercent: mean(aiRows.map(value => value.noSlimePercent)),
            noTargetWithSlimesPercent: mean(aiRows.map(value => value.noTargetWithSlimesPercent)),
            playerTowardPercent: mean(aiRows.map(value => value.playerTowardPercent)),
            playerAwayPercent: mean(aiRows.map(value => value.playerAwayPercent)),
            playerLateralPercent: mean(aiRows.map(value => value.playerLateralPercent)),
            attacks: mean(aiRows.map(value => value.attacks)),
          };
          const sources = Object.fromEntries(['slime', 'wolf', 'mixed', 'unknown'].map(source => [
            source,
            {
              hits: sourceRows.reduce((sum, value) => sum + value[source].hits, 0),
              damage: sourceRows.reduce((sum, value) => sum + value[source].damage, 0),
            },
          ]));
          console.log(
            `  IA (média por execução): distância pés média/p50/p90/mín/máx ${fmt(ai.meanDistance)}/${fmt(ai.medianDistance)}/${fmt(ai.p90Distance)}/${fmt(ai.minDistance)}/${fmt(ai.maxDistance)}; ` +
            `dentro do alcance ${fmt(ai.weaponRangePercent)}%; aproxima/strafe/recua ${fmt(ai.approachPercent)}/${fmt(ai.strafePercent)}/${fmt(ai.retreatPercent)}%; ` +
            `movimento bloqueado ${fmt(ai.blockedPercent)}%; alvo trocado/perdido ${fmt(ai.targetSwitches,0)}/${fmt(ai.targetLosses,0)}; sem alvo ${fmt(ai.noTargetPercent)}% (sem slime ${fmt(ai.noSlimePercent)}%; slimes disponíveis ${fmt(ai.slimesAvailablePercent)}%; sem alvo apesar de slime ${fmt(ai.noTargetWithSlimesPercent)}%).`,
          );
          console.log(
            `  Movimento real do jogador: em direção ao alvo ${fmt(ai.playerTowardPercent)}%; afastando ${fmt(ai.playerAwayPercent)}%; lateral/parado ${fmt(ai.playerLateralPercent)}%. Ataques disparados ${fmt(ai.attacks)}.`,
          );
          console.log(
            `  Dano recebido por origem (soma): slimes ${sources.slime.hits}x/${fmt(sources.slime.damage)}; ` +
            `lobos ${sources.wolf.hits}x/${fmt(sources.wolf.damage)}; misto ${sources.mixed.hits}x/${fmt(sources.mixed.damage)}; ` +
            `não identificado ${sources.unknown.hits}x/${fmt(sources.unknown.damage)}.`,
          );
        }
      }
    }
    const survivors = results.filter(row => !row.died);
    if (survivors.length) console.log(`Aviso: ${survivors.length} simulação(ões) atingiram o limite de ${MAX_SECONDS}s sem morrer.`);
    console.log('*Dano recebido efetivo = valores de dano aplicados pelo motor após esquiva/armadura/reduções; não é dano bruto nem dano evitado.');
    console.log('Exposição em segundos = tempo em que pelo menos um slime está na distância geométrica de contato usada pelo motor; não equivale a golpes recebidos.');
    if (jsonOutput) {
      writeFileSync(resolve(process.cwd(), 'balance-sim-results.json'), JSON.stringify({
        mode: 'normal',
        seedCount,
        fps: FPS,
        maxSeconds: MAX_SECONDS,
        profiles: BOT_PROFILES,
        results,
      }, null, 2));
      console.log('Relatório detalhado salvo em balance-sim-results.json');
    }
  } else {
    console.log(`Fíbula Online — auditoria individual | modo: IMORTAL | sementes/cenário: ${seedCount} | FPS: ${FPS} | limite: ${nightDiagnostic ? 360 : CONFIG.dayNight.cycle * 10}s | nível/abates aos 300s`);
    console.log('Abates durante cada noite e percentagem de slimes nascidos naquela noite derrotados até ao fim da simulação (média / mediana).');
    if (nightDiagnostic) console.log('MODO DIAGNÓSTICO: apenas Mago/próximo por 360s simulados; exibe fase, número da noite, progresso da horda e contagens por noite.');
    const nightHeaders = Array.from({ length: 10 }, (_, index) => `Noite ${index + 1} abates / % derrotados`.padEnd(25)).join(' ');
    console.log(`Classe      ${nightHeaders} Nível aos 300s M/Md`);
    for (const classId of RUN_CLASSES) {
      for (const profileId of RUN_PROFILES) {
      const rows = results.filter(row => row.classId === classId && row.profileId === profileId);
      const nightCells = Array.from({ length: 10 }, (_, index) => {
        const night = index + 1;
        const killValues = rows.map(row => row.killsDuringNight[night] ?? 0);
        const percentValues = rows.map(row => {
          const spawned = row.spawnedByNight[night] ?? 0;
          return spawned > 0 ? 100 * (row.cohortKillsByNight[night] ?? 0) / spawned : null;
        }).filter(value => value !== null);
        return `${fmt(mean(killValues), 1)}/${fmt(median(killValues), 1)}; ${fmt(mean(percentValues), 1)}%/${fmt(median(percentValues), 1)}%`.padEnd(25);
      }).join(' ');
      const levels = rows.map(row => row.levelAt300);
      console.log(`${classId.padEnd(11)} ${BOT_PROFILES[profileId].label.padEnd(17)} ${nightCells} ${fmt(mean(levels), 1)} / ${fmt(median(levels), 1)}`);
      }
    }
    console.log(`Nota: % derrotados = slimes nascidos na noite e derrotados até ${nightDiagnostic ? 360 : CONFIG.dayNight.cycle * 10}s ÷ slimes nascidos nessa noite; noites sem nascimento são —.`);
    if (nightDiagnostic) {
      for (const row of results) {
        console.log(`DIAGNÓSTICO FINAL | kills=${row.totalKills} | elapsed=${row.finalElapsed}s | night=${row.finalNightNumber} | phase=${row.finalPhase} | level@300=${row.levelAt300} | kills@300=${row.killsAt300}`);
        console.log(`SPAWN POR NOITE: ${JSON.stringify(row.spawnedByNight)}`);
        console.log(`ABATES POR COORTE: ${JSON.stringify(row.cohortKillsByNight)}`);
        console.log(`ABATES NA FASE NOTURNA: ${JSON.stringify(row.killsDuringNight)}`);
      }
    }
    if (jsonOutput) {
      writeFileSync(resolve(process.cwd(), 'balance-sim-results.json'), JSON.stringify({
        mode: 'immortal',
        seedCount,
        fps: FPS,
        profiles: BOT_PROFILES,
        results,
      }, null, 2));
      console.log('Relatório detalhado salvo em balance-sim-results.json');
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
