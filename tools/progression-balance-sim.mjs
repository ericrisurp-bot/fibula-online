#!/usr/bin/env node
/**
 * Auditoria hipotética da progressão aprovada por classe.
 *
 * Uso:
 *   node tools/progression-balance-sim.mjs
 *
 * Lê CONFIG e as fórmulas reais de atributos/armadura, mas NÃO altera o jogo.
 * Os ganhos abaixo são a proposta aprovada para análise; não são aplicados ao
 * motor. Nível e noite são cruzados apenas como referências paralelas, não como
 * afirmação de que o jogador necessariamente alcançará aquele nível naquela noite.
 *
 * Limites do modelo: um único slime/alvo, sem equipamento, refeições, buffs,
 * habilidades especiais, cura, deslocamento até o alvo ou variação de IA.
 * DPS usa dano-base da arma × ataques/s; habilidades como explosão do Mago,
 * perfuração do Arqueiro, veneno/cura do Druida ficam fora desta conta.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = mkdtempSync(join(tmpdir(), 'fibula-progression-sim-'));

const CLASSES = [
  { id: 'guerreiro', label: 'Guerreiro', weapon: 'espada', damageAttribute: 'forca' },
  { id: 'mago', label: 'Mago', weapon: 'cajado', damageAttribute: 'inteligencia' },
  { id: 'arqueiro', label: 'Arqueiro', weapon: 'arco', damageAttribute: 'destreza' },
  { id: 'druida', label: 'Druida', weapon: 'bastao', damageAttribute: 'inteligencia' },
];

// Ganho por nível aprovado para a simulação (pontos do atributo, não HP/dano direto).
const PROGRESSION = {
  guerreiro: { vida: 1.4, dano: 1.8, movimento: 0.4, armadura: 0.8 },
  mago: { vida: 0.6, dano: 1.8, movimento: 0.4, armadura: 0.2 },
  arqueiro: { vida: 0.8, dano: 1.2, movimento: 0.4, armadura: 0.4 },
  druida: { vida: 1.0, dano: 1.0, movimento: 0.4, armadura: 0.5 },
};
const LEVELS = [0, 10, 20, 30, 40, 50];

function compileModule(sourcePath, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const source = readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: sourcePath,
  }).outputText;
  // attributes.ts importa somente ./config; ajusta a extensão do módulo temporário.
  writeFileSync(outputPath, output.replace("from './config'", "from './config.mjs'"));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

try {
  const sourceRoot = join(root, 'src', 'game');
  compileModule(join(sourceRoot, 'config.ts'), join(tempDir, 'config.mjs'));
  compileModule(join(sourceRoot, 'attributes.ts'), join(tempDir, 'attributes.mjs'));

  const [{ CONFIG }, { ATTRIBUTE_USAGE, applyArmorToDamage }] = await Promise.all([
    import(pathToFileURL(join(tempDir, 'config.mjs')).href),
    import(pathToFileURL(join(tempDir, 'attributes.mjs')).href),
  ]);

  const rows = [];
  for (const classInfo of CLASSES) {
    const { id, label, weapon: weaponId, damageAttribute } = classInfo;
    const weapon = CONFIG.weapons[weaponId];
    const gain = PROGRESSION[id];
    const usageWeight = ATTRIBUTE_USAGE[id][damageAttribute];

    for (const level of LEVELS) {
      const health = CONFIG.attributes.classStartHealth[id]
        + level * gain.vida * CONFIG.attributes.effectPerPointGained.vida;
      const armor = CONFIG.player.armor
        + level * gain.armadura * CONFIG.attributes.effectPerPointGained.armadura;
      const movement = CONFIG.player.classSpeed[id]
        + level * gain.movimento * CONFIG.attributes.effectPerPointGained.velocidadeMovimento;

      // A proposta aumenta somente o atributo principal de dano da classe.
      // O peso real de uso do Arqueiro (destreza = 0,65) é respeitado.
      const damageMultiplier = 1
        + (level * gain.dano * usageWeight) / CONFIG.attributes.baseValue;
      const damagePerHit = weapon.damage * damageMultiplier;
      const dps = damagePerHit * weapon.attackSpeed;

      // Compara cada marco de nível com a curva de inimigos da mesma noite,
      // apenas como referência de escala.
      const night = Math.max(1, level);
      const slimeHealth = CONFIG.enemy.health + (night - 1) * CONFIG.enemy.healthPerWave;
      const enemyContactDamage = CONFIG.enemy.contactDamage
        + Math.floor((night - 1) / CONFIG.enemy.contactDamageEveryWaves)
          * CONFIG.enemy.contactDamageIncrease;
      const enemySpeed = CONFIG.enemy.speed
        + Math.floor(night / CONFIG.enemy.speedEveryWaves) * CONFIG.enemy.speedIncrease;
      const damageAfterArmor = applyArmorToDamage(enemyContactDamage, armor);
      const dodgeChance = CONFIG.rulesV2.enabled
        ? CONFIG.player.classDodge[id]
        : CONFIG.player.dodge;
      const expectedContactAttemptsToDeath = health / (damageAfterArmor * (1 - dodgeChance));

      rows.push({
        classe: label,
        nivel: level,
        vida: round(health, 1),
        danoPorGolpe: round(damagePerHit, 2),
        ataquesPorSegundo: round(weapon.attackSpeed, 2),
        dpsUmAlvo: round(dps, 2),
        movimento: round(movement, 1),
        armadura: round(armor, 2),
        reducaoArmadura: round(Math.min(
          CONFIG.rulesV2.armorMaxReduction,
          Math.max(0, armor) * CONFIG.rulesV2.armorPercentPerPoint / 100,
        ) * 100, 2),
        alcance: weapon.range,
        vidaSlimeReferencia: round(slimeHealth, 1),
        tempoParaMatarSlime: round(slimeHealth / dps, 2),
        danoContatoSlime: enemyContactDamage,
        danoAposArmadura: damageAfterArmor,
        tentativasContatoAteMorte: round(expectedContactAttemptsToDeath, 1),
        velocidadeSlime: enemySpeed,
      });
    }
  }

  console.log('FÍBULA ONLINE — PROJEÇÃO HIPOTÉTICA DE PROGRESSÃO');
  console.log('Valores de nível 0/10/20/30/40/50; ganhos propostos ainda NÃO estão no motor.');
  console.log('Nível e noite são referências paralelas; não representam equivalência de progressão.');
  console.table(rows);
  console.log('DPS = dano-base da arma × ataques/s, contra um alvo e sem habilidades especiais.');
  console.log('Arqueiro: o dano por nível considera o peso real de destreza (0,65) em ATTRIBUTE_USAGE.');
  console.log('Armadura: conversão real de 0,4 por ponto de atributo e redução percentual/cap atuais.');
  console.log('Sobrevivência: tentativas médias estimadas até a morte, considerando armadura e esquiva-base; não é contagem determinística de golpes.');
  console.log('Slime: HP, dano de contato e velocidade usam a curva real de CONFIG.enemy para a noite de referência.');
  console.log('Não inclui equipamentos, refeições, buffs, cura, habilidades, IA, deslocamento ou alvos múltiplos.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
