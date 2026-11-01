#!/usr/bin/env node
/**
 * Relatório de PD (poder) por classe.
 *   node tools/power-report.mjs            # níveis 0, 10, 20 e 40
 *   node tools/power-report.mjs 5 15 30    # níveis escolhidos
 *
 * O balanceamento usa o PD do nível 0 (só a base de cada classe): a diferença entre a maior e a menor
 * classe deve ficar dentro de BASE_TOLERANCE. Nos demais níveis a diferença é informativa: cada classe
 * escala do seu jeito, e o nível 10 é o que será mostrado aos jogadores.
 * Sai com código 1 se algum atributo usado por uma classe ainda não tiver capacidade no PD.
 * Não altera CONFIG nem o motor de gameplay.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSES = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const BASE_LEVEL = 0;
const BASE_TOLERANCE = 50;
const SHOWN_LEVEL = 10;
const levels = process.argv.slice(2).map(Number).filter(Number.isInteger);
if (!levels.length) levels.push(BASE_LEVEL, SHOWN_LEVEL, 20, 40);

function compileRuntimeModules(tempDir) {
  const sourceRoot = join(root, 'src', 'game');
  const files = [];
  const collect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) collect(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(fullPath);
    }
  };
  collect(sourceRoot);
  for (const sourcePath of files) {
    const outputPath = join(tempDir, sourcePath.slice(sourceRoot.length + 1).replace(/\.ts$/, '.mjs'));
    mkdirSync(dirname(outputPath), { recursive: true });
    const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove },
      fileName: sourcePath,
    }).outputText;
    writeFileSync(outputPath, output.replace(/(from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\2/g, (m, prefix, quote, importPath) => {
      const base = importPath.endsWith('.ts') ? importPath.slice(0, -3) : importPath;
      return prefix + quote + (/\.[a-z0-9]+$/i.test(base) ? base : base + '.mjs') + quote;
    }));
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'fibula-power-'));
let exitCode = 0;
try {
  compileRuntimeModules(tempDir);
  const { getClassPower, findUncoveredAttributes } = await import(pathToFileURL(join(tempDir, 'power.mjs')).href);
  const labels = { vida: 'vida', armadura: 'armad.', esquiva: 'esquiv.', velocidadeAtaque: 'v.atq', velocidadeMovimento: 'v.mov', dano: 'dano' };
  console.log(`Fíbula Online — PD por classe | balanceamento: nível ${BASE_LEVEL} (tolerância ${BASE_TOLERANCE}) | exibido aos jogadores: nível ${SHOWN_LEVEL}\n`);
  for (const level of levels) {
    const results = CLASSES.map(classId => ({ classId, power: getClassPower(classId, level) }));
    const totals = results.map(r => r.power.total);
    const spread = Math.max(...totals) - Math.min(...totals);
    console.log(`Nível ${level}${level === BASE_LEVEL ? ' (base: balanceamento)' : ''}${level === SHOWN_LEVEL ? ' (exibido aos jogadores)' : ''}`);
    for (const { classId, power } of results) {
      const parts = Object.entries(power.parts).map(([key, value]) => `${labels[key]} ${value.toFixed(0).padStart(3)}`).join(' | ');
      console.log(`  ${classId.padEnd(9)} PD ${power.total.toFixed(0).padStart(5)}  ${parts}`);
    }
    const verdict = level === BASE_LEVEL ? (spread <= BASE_TOLERANCE ? ' (dentro da tolerância)' : ' (ACIMA da tolerância)') : ' (informativo: cada classe escala do seu jeito)';
    console.log(`  diferença entre maior e menor: ${spread.toFixed(0)}${verdict}\n`);
  }
  const uncovered = findUncoveredAttributes();
  if (uncovered.length) {
    exitCode = 1;
    console.log('ATENÇÃO: atributos usados por uma classe que ainda não somam no PD:');
    for (const { classId, attribute } of uncovered) console.log(`  ${classId}: ${attribute}`);
  } else {
    console.log('Todos os atributos usados pelas classes somam no PD.');
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
process.exit(exitCode);
