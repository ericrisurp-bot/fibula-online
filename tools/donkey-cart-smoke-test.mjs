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
  cart.stage = 'built'; cart.carried = false; cart.angle = Math.PI;
  cart.x = engine.state.player.x + 270; cart.y = feetY; cart.wheelPhase = 0;
  const donkeyBefore = { x: cart.x + Math.cos(cart.angle) * CONFIG.donkey.cartDistance, y: cart.y + Math.sin(cart.angle) * CONFIG.donkey.cartDistance };
  const distanceBefore = Math.hypot(engine.state.player.x - donkeyBefore.x, feetY - donkeyBefore.y);
  engine.step(0.04);
  const donkeyAfter = { x: cart.x + Math.cos(cart.angle) * CONFIG.donkey.cartDistance, y: cart.y + Math.sin(cart.angle) * CONFIG.donkey.cartDistance };
  const traveled = Math.hypot(donkeyAfter.x - donkeyBefore.x, donkeyAfter.y - donkeyBefore.y);
  assert.ok(Math.abs(traveled - CONFIG.cart.unloadedPullSpeed * 0.04) < 0.02, 'burrinho deve andar a 116 unidades/s');
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

  const initial = createDonkeyCartState(120, 240, 100, []);
  assert.equal(initial.stage, 'broken');
  assert.equal(initial.health, 0);
  assert.equal(initial.everBuilt, false);
  assert.deepEqual(getDonkeyCartConstructionCost(initial), { wood: 1, cotton: 0 });
  const firstBuild = constructDonkeyCart(initial, [{ itemId: 'wood', quantity: 1 }]);
  assert.equal(firstBuild.built, true);
  assert.deepEqual(firstBuild.inventory, []);

  const damaged = damageDonkeyCart(firstBuild.state, 35);
  assert.equal(damaged.stage, 'built');
  assert.equal(damaged.health, 65);

  const broken = damageDonkeyCart(damaged, 65);
  assert.equal(broken.stage, 'broken');
  assert.equal(broken.health, 0);
  assert.equal(broken.carried, false);
  assert.deepEqual(getDonkeyCartConstructionCost(broken), { wood: 1, cotton: 0 });

  const missingWood = constructDonkeyCart(broken, []);
  assert.equal(missingWood.built, false);
  assert.deepEqual(missingWood.inventory, []);

  const rebuilt = constructDonkeyCart(broken, [
    { itemId: 'wood:rare', quantity: 1 },
  ]);
  assert.equal(rebuilt.built, true);
  assert.equal(rebuilt.state.stage, 'built');
  assert.equal(rebuilt.state.health, 100);
  assert.deepEqual(rebuilt.inventory, []);

  const alreadyBuilt = constructDonkeyCart(rebuilt.state, [{ itemId: 'wood', quantity: 1 }]);
  assert.equal(alreadyBuilt.built, false);
  assert.deepEqual(alreadyBuilt.inventory, [{ itemId: 'wood', quantity: 1 }]);

  console.log('OK: construção, quebra, velocidade, parada, visão, vínculo rígido e rodas.');
} finally {
  await server.close();
}
