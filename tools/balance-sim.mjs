#!/usr/bin/env node
/**
 * Reprodutibilidade:
 *   node tools/balance-sim.mjs          # 30 sementes por classe
 *   node tools/balance-sim.mjs 100      # 100 sementes por classe
 *
 * O simulador carrega o GameEngine real, transpila os três módulos TypeScript
 * necessários para um diretório temporário e fornece um requestAnimationFrame
 * virtual a 30 FPS. Math.random é substituído por um PRNG com semente fixa.
 *
 * Bots determinísticos (sem decisões aleatórias):
 * - guerreiro: aproxima-se até 42 px, recua abaixo de 30 px e circula no meio
 *   para tentar manter o combate corpo a corpo.
 * - mago/druida: tentam manter 185 px do slime mais próximo e fazem strafe.
 * - arqueiro: tenta manter 300 px e faz strafe.
 * O strafe troca de lado a cada 4 s, com o lado inicial derivado da semente.
 *
 * A métrica de abates é capturada quando o relógio simulado alcança 60 s.
 * A simulação segue até a morte ou até 600 s como limite de segurança.
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
const seedCount = Number.parseInt(process.argv[2] ?? '30', 10);
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
  console.error('Uso: node tools/balance-sim.mjs [N], com N entre 1 e 10000.');
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

async function simulate(GameEngine, classId, seed) {
  const oldRandom = Math.random;
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const random = mulberry32(seed);
  let frameNow = performance.now();
  let nextId = 1;
  let queue = [];
  let frame = 0;
  let killsAt60 = null;

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
    engine.start();
    // Alinha o relógio virtual ao timestamp usado pelo start() no motor.
    frameNow = performance.now();

    while (queue.length && !engine.state.dead && engine.state.elapsed < MAX_SECONDS) {
      botMove(engine, classId, seed, frame);
      const scheduled = queue.shift();
      frameNow += STEP * 1000;
      frame += 1;
      scheduled.callback(frameNow);
      if (killsAt60 === null && engine.state.elapsed >= 60) killsAt60 = engine.state.kills;
    }

    if (killsAt60 === null) killsAt60 = engine.state.kills;
    const died = engine.state.dead;
    const result = {
      classId,
      seed,
      kills60: killsAt60,
      deathWave: died ? engine.state.wave : null,
      deathSeconds: died ? engine.state.elapsed : null,
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
  const { GameEngine } = await import(pathToFileURL(join(tempDir, 'engine.mjs')).href);
  const results = [];

  for (const classId of CLASSES) {
    for (let seed = 1; seed <= seedCount; seed++) {
      results.push(await simulate(GameEngine, classId, seed));
    }
  }

  console.log(`Fíbula Online — simulação determinística | sementes por classe: ${seedCount} | FPS: ${FPS} | limite: ${MAX_SECONDS}s`);
  console.log('Abates aos 60s e estatísticas de morte (média / mediana)');
  console.log('Classe      Abates 60s M/Md   Onda da morte M/Md   Tempo até morte (s) M/Md   Mortes');
  for (const classId of CLASSES) {
    const rows = results.filter(row => row.classId === classId);
    const kills = rows.map(row => row.kills60);
    const deathWaves = rows.filter(row => row.died).map(row => row.deathWave);
    const deathTimes = rows.filter(row => row.died).map(row => row.deathSeconds);
    const deaths = rows.filter(row => row.died).length;
    console.log(
      `${classId.padEnd(11)} ${fmt(mean(kills), 1).padStart(5)} / ${fmt(median(kills), 1).padEnd(5)}   ` +
      `${fmt(mean(deathWaves), 1).padStart(5)} / ${fmt(median(deathWaves), 1).padEnd(5)}             ` +
      `${fmt(mean(deathTimes), 1).padStart(6)} / ${fmt(median(deathTimes), 1).padEnd(6)}          ${deaths}/${seedCount}`,
    );
  }
  const survivors = results.filter(row => !row.died);
  if (survivors.length) {
    console.log(`Aviso: ${survivors.length} simulação(ões) não morreram antes do limite de ${MAX_SECONDS}s; esses casos não entram nas estatísticas de morte.`);
  }
  console.log('Nota: a mediana/média de onda e tempo considera apenas execuções em que houve morte.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
