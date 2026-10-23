#!/usr/bin/env node
/**
 * Reprodutibilidade:
 *   node tools/balance-sim.mjs          # 30 sementes por classe
 *   node tools/balance-sim.mjs 30
 *   node tools/balance-sim.mjs 30 --imortal
 *
 * O simulador carrega o GameEngine real, transpila os três módulos TypeScript
 * necessários para um diretório temporário e fornece um requestAnimationFrame
 * virtual a 30 FPS. Math.random é substituído por um PRNG com semente fixa.
 * O modo --imortal mantém a vida do jogador em um valor alto apenas no simulador;
 *
 * Bots determinísticos (sem decisões aleatórias):
 * - guerreiro: aproxima-se até 42 px, recua abaixo de 30 px e circula no meio
 *   para tentar manter o combate corpo a corpo.
 * - mago/druida: tentam manter 185 px do slime mais próximo e fazem strafe.
 * - arqueiro: tenta manter 300 px e faz strafe.
 * O strafe troca de lado a cada 4 s, com o lado inicial derivado da semente.
 *
 * Modo normal: registra abates totais, abates por minuto sobrevivido, onda e
 * tempo da morte; limite de segurança de 600 s.
 * Modo --imortal: mede tempo de limpeza de cada onda (1–10) e abates aos 180
 * e 300 s. A onda é considerada limpa quando terminou de gerar seus inimigos
 * e todos os inimigos gerados para ela foram derrotados.
 * Esse arquivo não altera CONFIG nem o motor de gameplay.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  for (const name of ['config', 'inventory', 'engine']) {
    const sourcePath = join(root, 'src', 'game', name + '.ts');
    let source = readFileSync(sourcePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      },
      fileName: sourcePath,
    }).outputText;
    const fixedImports = output.replace(/from\s+(['"])(\.\/(?:config|inventory))\1/g, 'from "$2.mjs"');
    writeFileSync(join(tempDir, name + '.mjs'), fixedImports);
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
  let killsAt180 = null;
  let killsAt300 = null;
  const waveByEnemyId = new Map();
  const waveSpawnAttempts = { 1: 1 };
  const waveSpawned = { 1: 0 };
  const waveKills = {};
  const waveTargets = { 1: CONFIG.waves.firstCount };
  const waveStartTimes = { 1: 0 };
  const waveClearSeconds = {};

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

    // A primeira horda nasce no construtor, antes da instrumentação.
    for (const enemy of engine.state.enemies) {
      waveByEnemyId.set(enemy.id, 1);
      waveSpawned[1] += 1;
    }

    // Instrumentação apenas no objeto de simulação: não modifica o arquivo do motor.
    const originalSpawn = engine.spawnHordeEnemy.bind(engine);
    engine.spawnHordeEnemy = function () {
      const wave = this.state.wave;
      const beforeAttempt = this.hordeSpawned;
      const beforeIds = new Set(this.state.enemies.map(enemy => enemy.id));
      originalSpawn();
      if (this.hordeSpawned > beforeAttempt) {
        waveSpawnAttempts[wave] = (waveSpawnAttempts[wave] ?? 0) + 1;
        waveTargets[wave] = this.hordeTarget;
        waveStartTimes[wave] ??= (wave - 1) * CONFIG.waves.cycle;
      }
      for (const enemy of this.state.enemies) {
        if (beforeIds.has(enemy.id)) continue;
        waveByEnemyId.set(enemy.id, wave);
        waveSpawned[wave] = (waveSpawned[wave] ?? 0) + 1;
      }
    };

    const originalKill = engine.killEnemy.bind(engine);
    engine.killEnemy = function (id) {
      const enemy = this.state.enemies.find(value => value.id === id);
      const wave = enemy ? (waveByEnemyId.get(id) ?? this.state.wave) : null;
      const previousKills = this.state.kills;
      originalKill(id);
      if (this.state.kills > previousKills && wave !== null) {
        waveKills[wave] = (waveKills[wave] ?? 0) + 1;
      }
    };

    engine.start();
    // Alinha o relógio virtual ao timestamp usado pelo start() no motor.
    frameNow = performance.now();

    const durationLimit = immortal ? 300 : MAX_SECONDS;
    while (queue.length && (immortal ? engine.state.elapsed < durationLimit : !engine.state.dead && engine.state.elapsed < durationLimit)) {
      botMove(engine, classId, seed, frame);
      if (immortal) engine.state.player.hp = Number.MAX_SAFE_INTEGER;
      const scheduled = queue.shift();
      frameNow += STEP * 1000;
      frame += 1;
      scheduled.callback(frameNow);
      if (immortal) {
        // Level-ups podem restaurar HP ao máximo; repõe a vida alta no simulador.
        engine.state.player.hp = Number.MAX_SAFE_INTEGER;
        if (killsAt180 === null && engine.state.elapsed >= 180) killsAt180 = engine.state.kills;
        if (killsAt300 === null && engine.state.elapsed >= 300) killsAt300 = engine.state.kills;

        for (let wave = 1; wave <= 10; wave++) {
          const spawnComplete = (waveSpawnAttempts[wave] ?? 0) >= (waveTargets[wave] ?? Infinity);
          const allSpawnedEnemiesDefeated = (waveSpawned[wave] ?? 0) > 0
            && (waveKills[wave] ?? 0) >= waveSpawned[wave];
          if (waveClearSeconds[wave] === undefined && spawnComplete && allSpawnedEnemiesDefeated) {
            waveClearSeconds[wave] = Math.max(0, engine.state.elapsed - (waveStartTimes[wave] ?? ((wave - 1) * CONFIG.waves.cycle)));
          }
        }
      }
    }

    if (immortal) {
      return {
        classId,
        seed,
        kills180: killsAt180 ?? engine.state.kills,
        kills300: killsAt300 ?? engine.state.kills,
        waveClearSeconds,
      };
    }

    const survivedSeconds = engine.state.elapsed;
    const died = engine.state.dead;
    const totalKills = engine.state.kills;
    const result = {
      classId,
      seed,
      totalKills,
      killsPerMinute: survivedSeconds > 0 ? totalKills * 60 / survivedSeconds : 0,
      deathWave: died ? engine.state.wave : null,
      deathSeconds: died ? survivedSeconds : null,
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
    console.log('Abates totais e abates por minuto sobrevivido; onda e tempo da morte (média / mediana)');
    console.log('Classe      Abates totais M/Md   Abates/min M/Md   Onda da morte M/Md   Tempo até morte (s) M/Md   Mortes');
    for (const classId of CLASSES) {
      const rows = results.filter(row => row.classId === classId);
      const totalKills = rows.map(row => row.totalKills);
      const killsPerMinute = rows.map(row => row.killsPerMinute);
      const deathRows = rows.filter(row => row.died);
      const deathWaves = deathRows.map(row => row.deathWave);
      const deathTimes = deathRows.map(row => row.deathSeconds);
      const deaths = deathRows.length;
      console.log(
        `${classId.padEnd(11)} ${fmt(mean(totalKills), 1).padStart(5)} / ${fmt(median(totalKills), 1).padEnd(5)}       ` +
        `${fmt(mean(killsPerMinute), 2).padStart(5)} / ${fmt(median(killsPerMinute), 2).padEnd(5)}      ` +
        `${fmt(mean(deathWaves), 1).padStart(5)} / ${fmt(median(deathWaves), 1).padEnd(5)}             ` +
        `${fmt(mean(deathTimes), 1).padStart(6)} / ${fmt(median(deathTimes), 1).padEnd(6)}          ${deaths}/${seedCount}`,
      );
    }
    const survivors = results.filter(row => !row.died);
    if (survivors.length) {
      console.log(`Aviso: ${survivors.length} simulação(ões) não morreram antes do limite de ${MAX_SECONDS}s; esses casos não entram nas estatísticas de morte.`);
    }
    console.log('Nota: média/mediana da onda e do tempo consideram apenas execuções em que houve morte.');
  } else {
    console.log(`Fíbula Online — simulação determinística | modo: IMORTAL | sementes por classe: ${seedCount} | FPS: ${FPS} | janela: 300s`);
    console.log('Tempo para limpar cada onda em segundos (média / mediana) e abates totais aos 180s e 300s');
    const waveHeaders = Array.from({ length: 10 }, (_, index) => `Onda ${index + 1} M/Md`.padEnd(15)).join(' ');
    console.log(`Classe      ${waveHeaders}  Abates 180s M/Md   Abates 300s M/Md`);
    for (const classId of CLASSES) {
      const rows = results.filter(row => row.classId === classId);
      const waveCells = Array.from({ length: 10 }, (_, index) => {
        const values = rows.map(row => row.waveClearSeconds[index + 1]).filter(value => value !== undefined);
        return `${fmt(mean(values), 1)}/${fmt(median(values), 1)}`.padEnd(15);
      }).join(' ');
      const kills180 = rows.map(row => row.kills180);
      const kills300 = rows.map(row => row.kills300);
      console.log(
        `${classId.padEnd(11)} ${waveCells}  ` +
        `${fmt(mean(kills180), 1)} / ${fmt(median(kills180), 1)}       ` +
        `${fmt(mean(kills300), 1)} / ${fmt(median(kills300), 1)}`,
      );
    }
    console.log('Nota: ondas não limpas até 300s são exibidas como —; tempos são relativos ao início da respectiva onda.');
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
