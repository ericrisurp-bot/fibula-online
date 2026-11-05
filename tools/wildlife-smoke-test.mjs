import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const engine = new GameEngine(() => {}, { seed: 0x51f1b1a, headless: true, houseInventory: [] });
  const wildlife = () => engine.state.enemies.filter(enemy => enemy.animalKind);
  const count = kind => wildlife().filter(enemy => enemy.animalKind === kind).length;
  assert.equal(count('chicken'), 2, 'A partida inicia com duas galinhas.');
  assert.equal(count('wolf'), 1, 'A partida inicia com um lobo.');

  const chicken = wildlife().find(enemy => enemy.animalKind === 'chicken');
  engine.state.enemies = engine.state.enemies.filter(enemy => enemy.id !== chicken.id);
  engine.chickenSpawnCountdown = 0.04;
  engine.wolfSpawnCountdown = 40;
  engine.step(0.04);
  assert.equal(count('chicken'), 5, 'O ciclo das galinhas completa os espaços livres até cinco.');
  assert.equal(count('wolf'), 1, 'O temporizador das galinhas não altera a população de lobos.');

  const wolf = wildlife().find(enemy => enemy.animalKind === 'wolf');
  engine.state.enemies = engine.state.enemies.filter(enemy => enemy.id !== wolf.id);
  engine.wolfSpawnCountdown = 0.04;
  engine.step(0.04);
  assert.equal(count('wolf'), 3, 'O ciclo dos lobos completa a população até três.');

  // A IA caça mesmo quando ambos estão longe do jogador.
  engine.state.enemies = [];
  const distantChicken = { id: 90001, x: 500, y: 500, hp: 12, hitWait: 0, wobble: 0, animalKind: 'chicken', wanderAngle: 0, wanderTimer: 5, rarity: 'rare' };
  const distantWolf = { id: 90002, x: 540, y: 500, hp: 34, hitWait: 0, wobble: 0, animalKind: 'wolf', wanderAngle: 0, wanderTimer: 5 };
  engine.state.enemies.push(distantChicken, distantWolf);
  for (let i = 0; i < 30 && engine.state.enemies.includes(distantChicken); i++) engine.moveWildlife(distantWolf, 0.04, []);
  assert.equal(engine.state.enemies.includes(distantChicken), false, 'O lobo caça uma galinha distante do jogador.');
  assert.equal(engine.state.wildlifeDrops.some(drop => drop.kind === 'chicken_meat'), false, 'A caça pelo lobo não gera frango.');
  const huntedFeathers = engine.state.wildlifeDrops.filter(drop => drop.kind === 'feather');
  assert.ok(huntedFeathers.length > 0 && huntedFeathers.every(drop => drop.rarity === 'rare'), 'A galinha caçada deixa penas com sua raridade.');

  // Abate pelo jogador: um frango e de uma a três penas.
  const playerChicken = { id: 90003, x: 700, y: 700, hp: 12, hitWait: 0, wobble: 0, animalKind: 'chicken', rarity: 'uncommon' };
  engine.state.enemies.push(playerChicken);
  const beforeChickenLoot = engine.state.wildlifeDrops.length;
  engine.killEnemy(playerChicken.id, false, 'player');
  const chickenLoot = engine.state.wildlifeDrops.slice(beforeChickenLoot);
  assert.equal(chickenLoot.find(drop => drop.kind === 'chicken_meat')?.amount, 1);
  const playerFeathers = chickenLoot.filter(drop => drop.kind === 'feather').reduce((sum, drop) => sum + drop.amount, 0);
  assert.ok(playerFeathers >= 1 && playerFeathers <= 3, 'O jogador recebe de uma a três penas.');
  assert.ok(chickenLoot.every(drop => drop.rarity === 'uncommon'));

  // Abate do lobo: uma a duas carnes e exatamente um couro.
  const playerWolf = { id: 90004, x: 800, y: 800, hp: 34, hitWait: 0, wobble: 0, animalKind: 'wolf', rarity: 'legendary' };
  engine.state.enemies.push(playerWolf);
  const beforeWolfLoot = engine.state.wildlifeDrops.length;
  engine.killEnemy(playerWolf.id, false, 'player');
  const wolfLoot = engine.state.wildlifeDrops.slice(beforeWolfLoot);
  assert.ok(wolfLoot.find(drop => drop.kind === 'wolf_meat' && drop.amount >= 1 && drop.amount <= 2));
  assert.equal(wolfLoot.find(drop => drop.kind === 'wolf_hide')?.amount, 1);
  assert.ok(wolfLoot.every(drop => drop.rarity === 'legendary'));
  engine.stop();
  console.log('OK: população, timers independentes, caça distante e loot com raridade herdada.');
} finally { await server.close(); }
