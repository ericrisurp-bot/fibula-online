import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const {
    createDonkeyCartState,
    constructDonkeyCart,
    damageDonkeyCart,
    getDonkeyCartConstructionCost,
  } = await server.ssrLoadModule('/src/game/donkeyCart.ts');

  const [{ GameEngine }, { CONFIG }] = await Promise.all([
    server.ssrLoadModule('/src/game/engine.ts'),
    server.ssrLoadModule('/src/game/config.ts'),
  ]);
  const engine = new GameEngine(() => {}, { headless: true, seed: 20261103 });
  const cart = engine.state.cart;
  const brokenStart = { x: cart.x, y: cart.y, wheelPhase: cart.wheelPhase };
  for (let i = 0; i < 10; i++) engine.step(0.04);
  assert.deepEqual({ x: cart.x, y: cart.y, wheelPhase: cart.wheelPhase }, brokenStart, 'conjunto quebrado deve permanecer parado');
  engine.state.trees = []; engine.state.rocks = []; engine.state.cottonPlants = [];
  engine.state.house.x = 300; engine.state.house.y = 300;
  engine.state.refinery.x = 300; engine.state.refinery.y = engine.world - 300;
  engine.state.tecelaria.x = engine.world - 300; engine.state.tecelaria.y = 300;
  engine.state.player.x = engine.world / 2; engine.state.player.y = engine.world / 2;
  const feetY = engine.state.player.y + CONFIG.player.footOffset;
  cart.stage = 'built'; cart.carried = false; cart.angle = Math.PI; cart.following = true;
  // A ordem só funciona quando o jogador está perto do burrinho.
  cart.x = engine.state.player.x + CONFIG.donkey.cartDistance + CONFIG.cart.interactRadius + 1; cart.y = feetY;
  engine.toggleCart();
  assert.equal(cart.following, true, 'fora do alcance o jogador não deve conseguir dar uma ordem');
  cart.x = engine.state.player.x + CONFIG.donkey.cartDistance;
  engine.toggleCart();
  assert.equal(cart.following, false, 'ordem próxima deve mandar o burrinho ficar');
  const parked = { x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase };
  engine.state.player.x -= 180;
  engine.step(0.2);
  assert.deepEqual({ x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase }, parked, 'burrinho parado não deve acompanhar o jogador');
  engine.state.player.x += 180;
  engine.toggleCart();
  assert.equal(cart.following, true, 'aproximar e interagir deve chamar o burrinho para seguir');
  cart.x = engine.state.player.x + 270; cart.y = feetY; cart.wheelPhase = 0;
  const donkeyBefore = { x: cart.x + Math.cos(cart.angle) * CONFIG.donkey.cartDistance, y: cart.y + Math.sin(cart.angle) * CONFIG.donkey.cartDistance };
  const distanceBefore = Math.hypot(engine.state.player.x - donkeyBefore.x, feetY - donkeyBefore.y);
  engine.step(0.04);
  const donkeyAfter = { x: cart.x + Math.cos(cart.angle) * CONFIG.donkey.cartDistance, y: cart.y + Math.sin(cart.angle) * CONFIG.donkey.cartDistance };
  const traveled = Math.hypot(donkeyAfter.x - donkeyBefore.x, donkeyAfter.y - donkeyBefore.y);
  assert.ok(Math.abs(traveled - CONFIG.cart.unloadedPullSpeed * 0.04) < 0.02, 'burrinho deve andar a 87 unidades/s');
  assert.ok(Math.hypot(engine.state.player.x - donkeyAfter.x, feetY - donkeyAfter.y) < distanceBefore, 'burrinho deve aproximar-se do jogador');
  assert.ok(Math.abs(Math.hypot(donkeyAfter.x - cart.x, donkeyAfter.y - cart.y) - CONFIG.donkey.cartDistance) < 1e-6, 'carroça deve manter distância rígida');
  assert.ok(cart.wheelPhase > 0, 'rodas devem girar com o deslocamento');
  cart.angle = Math.PI; cart.x = engine.state.player.x + CONFIG.donkey.cartDistance - CONFIG.donkey.stopDistance; cart.y = feetY;
  const stopped = { x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase };
  engine.step(0.04);
  assert.deepEqual({ x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase }, stopped, 'a 75 unidades o conjunto deve parar');
  // Se o personagem se aproxima para dentro dos 75, o burrinho não recua.
  cart.x = engine.state.player.x + CONFIG.donkey.cartDistance - 40; cart.y = feetY; cart.angle = Math.PI;
  const closeRange = { x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase };
  engine.step(0.04);
  assert.deepEqual({ x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase }, closeRange, 'o burrinho não deve recuar quando o jogador se aproxima');
  cart.x = engine.state.player.x + CONFIG.donkey.visionRange + CONFIG.donkey.cartDistance + 10; cart.y = feetY; cart.angle = Math.PI;
  const outOfSight = { x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase };
  engine.step(0.04);
  assert.deepEqual({ x: cart.x, y: cart.y, angle: cart.angle, wheelPhase: cart.wheelPhase }, outOfSight, 'fora dos 300 de visão deve parar');
  engine.stop();

  const initial = createDonkeyCartState(120, 240, 75, [{ itemId: 'stone', quantity: 2 }, { itemId: 'wood', quantity: 1 }]);
  assert.equal(initial.stage, 'broken');
  assert.equal(initial.health, 0);
  assert.equal(initial.everBuilt, false);
  assert.equal(initial.maxHealth, 75);
  assert.deepEqual(getDonkeyCartConstructionCost(initial), { wood: 1, cotton: 0 });
  const firstBuild = constructDonkeyCart(initial, [{ itemId: 'wood', quantity: 1 }]);
  assert.equal(firstBuild.built, true);
  assert.deepEqual(firstBuild.inventory, []);
  assert.equal(firstBuild.state.health, 75);
  assert.deepEqual(firstBuild.state.inventory, [{ itemId: 'stone', quantity: 2 }, { itemId: 'wood', quantity: 1 }]);

  let damaged = firstBuild.state;
  for (let hit = 0; hit < 74; hit++) damaged = damageDonkeyCart(damaged);
  assert.equal(damaged.stage, 'built', '74 impactos não devem quebrar a carroça');
  assert.equal(damaged.health, 1, 'cada impacto deve remover exatamente 1 ponto');

  const broken = damageDonkeyCart(damaged);
  assert.equal(broken.stage, 'broken');
  assert.equal(broken.health, 0);
  assert.equal(broken.carried, false);
  assert.equal(broken.following, false, 'carroça quebrada deve parar de seguir');
  assert.deepEqual(broken.inventory, [{ itemId: 'stone', quantity: 2 }, { itemId: 'wood', quantity: 1 }], 'todos os itens devem permanecer na carroça ao quebrar');
  assert.deepEqual(getDonkeyCartConstructionCost(broken), { wood: 1, cotton: 0 });

  const missingWood = constructDonkeyCart(broken, []);
  assert.equal(missingWood.built, false);
  assert.deepEqual(missingWood.inventory, []);

  const rebuilt = constructDonkeyCart(broken, [
    { itemId: 'wood:rare', quantity: 1 },
  ]);
  assert.equal(rebuilt.built, true);
  assert.equal(rebuilt.state.stage, 'built');
  assert.equal(rebuilt.state.health, 75);
  assert.equal(rebuilt.state.following, true);
  assert.deepEqual(rebuilt.inventory, []);

  const alreadyBuilt = constructDonkeyCart(rebuilt.state, [{ itemId: 'wood', quantity: 1 }]);
  assert.equal(alreadyBuilt.built, false);
  assert.deepEqual(alreadyBuilt.inventory, [{ itemId: 'wood', quantity: 1 }]);

  const engineCart = engine.state.cart;
  engineCart.stage = 'built'; engineCart.health = 75; engineCart.maxHealth = 75; engineCart.following = true;
  engineCart.inventory = [{ itemId: 'stone', quantity: 2 }, { itemId: 'wood', quantity: 1 }];
  for (let hit = 0; hit < 75; hit++) engine.damageCartFromEnemyHit();
  assert.equal(engine.state.cart.stage, 'broken', '75 impactos do engine devem quebrar a carroça');
  assert.equal(engine.state.cart.health, 0);
  assert.equal(engine.state.cart.following, false);
  assert.deepEqual(engine.state.cart.inventory, [{ itemId: 'stone', quantity: 2 }, { itemId: 'wood', quantity: 1 }]);

  engine.state.player.x = engine.state.cart.x;
  engine.state.player.y = engine.state.cart.y - CONFIG.player.footOffset;
  engine.state.inventory = [];
  engine.buildCart();
  assert.equal(engine.state.cart.stage, 'broken', 'madeira dentro da carroça não pode consertá-la');
  engine.transferCartToBag(1);
  assert.deepEqual(engine.state.inventory, [{ itemId: 'wood', quantity: 1 }], 'jogador deve retirar madeira da carroça quebrada');
  engine.buildCart();
  assert.equal(engine.state.cart.stage, 'built', 'madeira transferida para a mochila permite reparar');
  assert.equal(engine.state.cart.health, 75);
  assert.deepEqual(engine.state.cart.inventory, [{ itemId: 'stone', quantity: 2 }], 'reparo não deve apagar os itens que ficaram na carroça');

  const prepareEnemyCartScenario = (following, enemyX) => {
    const testEngine = new GameEngine(() => {}, { headless: true, seed: 20261103 });
    testEngine.hordeTarget = 0;
    testEngine.state.trees = [];
    testEngine.state.rocks = [];
    testEngine.state.cottonPlants = [];
    testEngine.state.house.x = 300; testEngine.state.house.y = 300;
    testEngine.state.refinery.x = 300; testEngine.state.refinery.y = testEngine.world - 300;
    testEngine.state.tecelaria.x = testEngine.world - 300; testEngine.state.tecelaria.y = 300;
    testEngine.state.player.x = 1670;
    testEngine.state.player.y = 1460; // pés em y=1500
    testEngine.state.cart.x = 1500;
    testEngine.state.cart.y = 1500;
    testEngine.state.cart.angle = 0; // burrinho à direita, em direção ao jogador
    testEngine.state.cart.stage = 'built';
    testEngine.state.cart.health = 75;
    testEngine.state.cart.maxHealth = 75;
    testEngine.state.cart.following = following;
    testEngine.state.cart.carried = false;
    testEngine.state.enemies = [{ id: 9001, x: enemyX, y: 1500, hp: 30, hitWait: 0, wobble: 0 }];
    return testEngine;
  };

  const movingCartEngine = prepareEnemyCartScenario(true, 1540);
  const movingCartStartX = movingCartEngine.state.enemies[0].x;
  movingCartEngine.step(0.04);
  assert.equal(movingCartEngine.state.cart.health, 74, 'slime próximo deve retirar 1 ponto da carroça enquanto ela acompanha o jogador');
  assert.ok(movingCartEngine.state.enemies[0].x > movingCartStartX, 'slime deve continuar se deslocando em direção ao jogador, não perseguir a carroça');
  movingCartEngine.stop();

  const parkedCartEngine = prepareEnemyCartScenario(false, 1540);
  parkedCartEngine.step(0.04);
  assert.equal(parkedCartEngine.state.cart.health, 75, 'carroça parada pelo botão não pode receber dano');
  parkedCartEngine.stop();

  const playerPriorityEngine = prepareEnemyCartScenario(true, 1638);
  const playerPriorityStartX = playerPriorityEngine.state.enemies[0].x;
  playerPriorityEngine.step(0.04);
  assert.equal(playerPriorityEngine.state.cart.health, 75, 'quando o slime alcança o jogador, a carroça não recebe o impacto');
  assert.ok(playerPriorityEngine.state.enemies[0].x > playerPriorityStartX, 'movimento do slime deve continuar orientado ao jogador');
  assert.ok(playerPriorityEngine.state.enemies[0].hitWait > 0, 'contato com o jogador mantém o cooldown normal do slime');
  playerPriorityEngine.stop();

  const brokenCartEngine = prepareEnemyCartScenario(true, 1540);
  brokenCartEngine.state.cart.stage = 'broken';
  brokenCartEngine.state.cart.health = 0;
  brokenCartEngine.step(0.04);
  assert.equal(brokenCartEngine.state.cart.health, 0, 'carroça quebrada não pode receber novos impactos');
  brokenCartEngine.stop();

  const obstacleEngine = new GameEngine(() => {}, { headless: true, seed: 20261104 });
  obstacleEngine.hordeTarget = 0;
  obstacleEngine.state.trees = [];
  obstacleEngine.state.rocks = [];
  obstacleEngine.state.cottonPlants = [];
  obstacleEngine.state.house.x = 1660; obstacleEngine.state.house.y = 1499;
  obstacleEngine.state.refinery.x = 300; obstacleEngine.state.refinery.y = obstacleEngine.world - 300;
  obstacleEngine.state.tecelaria.x = obstacleEngine.world - 300; obstacleEngine.state.tecelaria.y = 300;
  obstacleEngine.state.player.x = 1800; obstacleEngine.state.player.y = 1460;
  obstacleEngine.state.cart.x = 1500; obstacleEngine.state.cart.y = 1500;
  obstacleEngine.state.cart.angle = 0;
  obstacleEngine.state.cart.stage = 'built';
  obstacleEngine.state.cart.following = true;
  const blockedPose = {
    x: obstacleEngine.state.cart.x,
    y: obstacleEngine.state.cart.y,
    angle: obstacleEngine.state.cart.angle,
    wheelPhase: obstacleEngine.state.cart.wheelPhase,
  };
  obstacleEngine.step(0.04);
  assert.deepEqual({
    x: obstacleEngine.state.cart.x,
    y: obstacleEngine.state.cart.y,
    angle: obstacleEngine.state.cart.angle,
    wheelPhase: obstacleEngine.state.cart.wheelPhase,
  }, blockedPose, 'construção entre jogador e burrinho deve fazê-lo parar antes de se aproximar');
  obstacleEngine.state.player.y = 1060; // pés em y=1100: jogador contornou a construção
  obstacleEngine.step(0.04);
  assert.ok(
    Math.hypot(obstacleEngine.state.cart.x - blockedPose.x, obstacleEngine.state.cart.y - blockedPose.y) > 0,
    'caminho livre após contornar a construção deve retomar o acompanhamento',
  );
  obstacleEngine.stop();

  console.log('OK: durabilidade 75, dano fixo 1 por impacto, inventário preservado, reparo, seguir/parar, velocidade, visão, vínculo rígido, rodas e contato secundário dos slimes.');
} finally {
  await server.close();
}
