#!/usr/bin/env node
/**
 * Reprodutibilidade:
 *   node tools/balance-sim.mjs          # 30 sementes por classe
 *   node tools/balance-sim.mjs 30
 *   node tools/balance-sim.mjs 30 --imortal
 *
 * O simulador carrega todos os módulos TypeScript de src/game para um diretório
 * temporário e fornece um requestAnimationFrame virtual a 30 FPS. Math.random
 * é substituído por um PRNG com semente fixa. --imortal mantém HP alto apenas
 * no simulador.
 *
 * Bots determinísticos (sem decisões aleatórias):
 * - guerreiro: aproxima-se até 42 px, recua abaixo de 30 px e circula no meio
 *   para tentar manter o combate corpo a corpo.
 * - mago/druida: tentam manter 185 px do slime mais próximo e fazem strafe.
 * - arqueiro: tenta manter 300 px e faz strafe.
 * O strafe troca de lado a cada 4 s, com o lado inicial derivado da semente.
 *
 * Modo normal: noites completas sobrevividas, tempo até morte, abates totais,
 * nível na morte e abates por minuto sobrevivido; limite de segurança de 600 s.
 * Modo --imortal: abates durante cada noite, percentual da coorte de slimes
 * nascida em cada noite derrotada até o fim da simulação e nível aos 300 s.
 * Esse arquivo não altera CONFIG nem o motor de gameplay.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const immortal = args.includes('--imortal');
const countArg = args.find(arg => arg !== '--imortal');
const seedCount = Number.parseInt(countArg ?? '30', 10);
const FPS = 30;
const STEP = 1 / FPS;
const MAX_SECONDS = 600;
const CLASSES = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const BOT_STYLE = {
  guerreiro: { desired: 42, retreatBelow: 30 },
  mago: { desired: 185, retreatBelow: 165 },
  arqueiro: { desired: 300, retreatBelow: 280 },
  druida: { desired: 185, retreatBelow: 165 },
};

if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 10000) {
  console.error('Uso: node tools/balance-sim.mjs [N] [--imortal], com N entre 1 e 10000.');
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

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function fmt(value, digits = 1) {
  return value == null ? '—' : value.toFixed(digits);
}

function botMove(engine, classId, seed, frame) {
  const player = engine.state.player;
  const nearest = engine.state.enemies
    .map(enemy => ({ enemy, dx: enemy.x - player.x, dy: enemy.y - player.y }))
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0];

  if (!nearest) {
    const angle = frame * STEP * 0.7 + (seed % 17) * 0.19;
    engine.setMove(Math.cos(angle), Math.sin(angle));
    return;
  }

  const distance = Math.hypot(nearest.dx, nearest.dy) || 1;
  const towardX = nearest.dx / distance;
  const towardY = nearest.dy / distance;
  const side = ((Math.floor(frame * STEP / 4) + seed) % 2 === 0) ? 1 : -1;
  const style = BOT_STYLE[classId];
  let radial = 0;
  if (distance > style.desired + 20) radial = 1;
  else if (distance < style.retreatBelow) radial = -1;

  // Aproxima/recua radialmente e adiciona um componente lateral determinístico.
  let x = towardX * radial - towardY * side * 0.72;
  let y = towardY * radial + towardX * side * 0.72;
  const length = Math.hypot(x, y) || 1;
  engine.setMove(x / length, y / length);
}

async function simulate(GameEngine, CONFIG, classId, seed, { immortal = false } = {}) {
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
    const engine = new GameEngine(() => {});
    engine.setClass(classId);

    // Acompanhe o nascimento de cada slime e a noite em que ele surgiu.
    const originalSpawn = engine.spawnHordeEnemy.bind(engine);
    engine.spawnHordeEnemy = function () {
      const beforeIds = new Set(this.state.enemies.map(enemy => enemy.id));
      originalSpawn();
      for (const enemy of this.state.enemies) {
        if (beforeIds.has(enemy.id)) continue;
        const night = this.state.nightNumber;
        enemyNightById.set(enemy.id, night);
        spawnedByNight[night] = (spawnedByNight[night] ?? 0) + 1;
      }
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
    // Alinha o relógio virtual ao timestamp usado pelo start() no motor.
    frameNow = performance.now();

    const durationLimit = immortal
      ? CONFIG.dayNight.dayDuration * 2 + CONFIG.dayNight.cycle * 9
      : MAX_SECONDS;
    while (
      queue.length &&
      (immortal
        ? engine.state.elapsed < durationLimit
        : !engine.state.dead && engine.state.elapsed < durationLimit)
    ) {
      botMove(engine, classId, seed, frame);
      if (immortal) engine.state.player.hp = Number.MAX_SAFE_INTEGER;
      const scheduled = queue.shift();
      frameNow += STEP * 1000;
      frame += 1;
      scheduled.callback(frameNow);
      if (immortal) {
        // Repor a vida apenas no simulador, inclusive depois de level-ups.
        engine.state.player.hp = Number.MAX_SAFE_INTEGER;
        if (killsAt300 === null && engine.state.elapsed >= 300) {
          killsAt300 = engine.state.kills;
          levelAt300 = engine.state.player.level;
        }
      }
    }

    if (immortal) {
      return {
        classId,
        seed,
        killsAt300: killsAt300 ?? engine.state.kills,
        levelAt300: levelAt300 ?? engine.state.player.level,
        spawnedByNight,
        cohortKillsByNight,
        killsDuringNight,
      };
    }

    const survivedSeconds = engine.state.elapsed;
    const died = engine.state.dead;
    const completeNightsSurvived = Math.max(
      0,
      engine.state.nightNumber - (engine.state.dayNight === 'night' ? 1 : 0),
    );
    const result = {
      classId,
      seed,
      totalKills: engine.state.kills,
      killsPerMinute: survivedSeconds > 0 ? engine.state.kills * 60 / survivedSeconds : 0,
      nightsSurvived: completeNightsSurvived,
      deathSeconds: died ? survivedSeconds : null,
      levelAtDeath: died ? engine.state.player.level : null,
      survivedSeconds,
      died,
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
  compileRuntimeModules(tempDir);
  const [{ GameEngine }, { CONFIG }] = await Promise.all([
    import(pathToFileURL(join(tempDir, 'engine.mjs')).href),
    import(pathToFileURL(join(tempDir, 'config.mjs')).href),
  ]);
  const results = [];

  for (const classId of CLASSES) {
    for (let seed = 1; seed <= seedCount; seed++) {
      results.push(await simulate(GameEngine, CONFIG, classId, seed, { immortal }));
    }
  }

  if (!immortal) {
    console.log(`Fíbula Online — simulação determinística | modo: normal | sementes por classe: ${seedCount} | FPS: ${FPS} | limite: ${MAX_SECONDS}s`);
    console.log('Sobrevivência medida em noites completas; tempo até morte e nível na morte consideram apenas execuções que morreram.');
    console.log('Classe      Noites sobrevividas M/Md   Tempo até morte (s) M/Md   Abates totais M/Md   Nível na morte M/Md   Abates/min M/Md');
    for (const classId of CLASSES) {
      const rows = results.filter(row => row.classId === classId);
      const deathRows = rows.filter(row => row.died);
      const nights = rows.map(row => row.nightsSurvived);
      const deathTimes = deathRows.map(row => row.deathSeconds);
      const kills = rows.map(row => row.totalKills);
      const levels = deathRows.map(row => row.levelAtDeath);
      const killsPerMinute = rows.map(row => row.killsPerMinute);
      console.log(
        `${classId.padEnd(11)} ${fmt(mean(nights), 1).padStart(5)} / ${fmt(median(nights), 1).padEnd(5)}              ` +
        `${fmt(mean(deathTimes), 1).padStart(6)} / ${fmt(median(deathTimes), 1).padEnd(6)}          ` +
        `${fmt(mean(kills), 1).padStart(5)} / ${fmt(median(kills), 1).padEnd(5)}       ` +
        `${fmt(mean(levels), 1).padStart(5)} / ${fmt(median(levels), 1).padEnd(5)}       ` +
        `${fmt(mean(killsPerMinute), 2)} / ${fmt(median(killsPerMinute), 2)}`,
      );
    }
    const survivors = results.filter(row => !row.died);
    if (survivors.length) {
      console.log(`Aviso: ${survivors.length} simulação(ões) não morreram antes do limite de ${MAX_SECONDS}s; não têm tempo/nível de morte.`);
    }
  } else {
    console.log(`Fíbula Online — simulação determinística | modo: IMORTAL | sementes por classe: ${seedCount} | FPS: ${FPS} | simulação: 900s | nível/abates registrados aos 300s`);
    console.log('Abates durante cada noite e percentagem de slimes nascidos naquela noite derrotados até ao fim da simulação (média / mediana).');
    const nightHeaders = Array.from({ length: 10 }, (_, index) => `Noite ${index + 1} abates / % derrotados`.padEnd(25)).join(' ');
    console.log(`Classe      ${nightHeaders} Nível aos 300s M/Md`);
    for (const classId of CLASSES) {
      const rows = results.filter(row => row.classId === classId);
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
      console.log(`${classId.padEnd(11)} ${nightCells} ${fmt(mean(levels), 1)} / ${fmt(median(levels), 1)}`);
    }
    console.log('Nota: % derrotados = slimes nascidos na noite e derrotados até 900s ÷ slimes nascidos nessa noite; noites sem nascimento são —.');
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
