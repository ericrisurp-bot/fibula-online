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

  // O estado quebrado é estático: nem burrinho nem carroça se movem sozinhos.
  const brokenStart = { x: cart.x, y: cart.y, donkeyX: cart.donkeyX, donkeyY: cart.donkeyY };
  for (let i = 0; i < 25; i++) engine.step(0.04);
  assert.deepEqual(
    { x: cart.x, y: cart.y, donkeyX: cart.donkeyX, donkeyY: cart.donkeyY },
    brokenStart,
    'carroça quebrada e burrinho devem permanecer parados',
  );

  // Isola o teste de seguimento das colisões do mapa, sem alterar o código de produção.
  const center = engine.world / 2;
  engine.state.trees = [];
  engine.state.rocks = [];
  engine.state.cottonPlants = [];
  engine.state.house.x = 300;
  engine.state.house.y = 300;
  engine.state.refinery.x = 300;
  engine.state.refinery.y = engine.world - 300;
  engine.state.tecelaria.x = engine.world - 300;
  engine.state.tecelaria.y = 300;
  engine.state.player.x = center;
  engine.state.player.y = center;
  const playerFeetY = engine.state.player.y + CONFIG.player.footOffset;
  cart.stage = 'built';
  cart.donkeyX = center + 200;
  cart.donkeyY = playerFeetY;
  cart.x = cart.donkeyX - CONFIG.cart.followDistance;
  cart.y = cart.donkeyY;
  const beforeDistance = Math.hypot(
    engine.state.player.x - cart.donkeyX,
    playerFeetY - cart.donkeyY,
  );
  const beforeDonkey = { x: cart.donkeyX, y: cart.donkeyY };
  const beforeCart = { x: cart.x, y: cart.y };
  engine.step(0.04);
  const afterDistance = Math.hypot(
    engine.state.player.x - cart.donkeyX,
    playerFeetY - cart.donkeyY,
  );
  assert.ok(afterDistance < beforeDistance, 'burrinho deve reduzir a distância até o personagem');
  assert.ok(cart.donkeyX < beforeDonkey.x, 'burrinho deve andar na direção do personagem, nunca para longe');
  assert.ok(Math.abs((cart.x - beforeCart.x) - (cart.donkeyX - beforeDonkey.x)) < 1e-6);
  assert.ok(Math.abs((cart.y - beforeCart.y) - (cart.donkeyY - beforeDonkey.y)) < 1e-6);

  // Dentro da distância de descanso e fora do raio de visão, o conjunto para.
  cart.donkeyX = center + CONFIG.donkey.followDistance - 1;
  cart.donkeyY = playerFeetY;
  cart.x = cart.donkeyX - CONFIG.cart.followDistance;
  cart.y = cart.donkeyY;
  const resting = { x: cart.x, y: cart.y, donkeyX: cart.donkeyX, donkeyY: cart.donkeyY };
  engine.step(0.04);
  assert.deepEqual({ x: cart.x, y: cart.y, donkeyX: cart.donkeyX, donkeyY: cart.donkeyY }, resting);

  cart.donkeyX = center + CONFIG.donkey.visionRange + 1;
  cart.donkeyY = playerFeetY;
  cart.x = cart.donkeyX - CONFIG.cart.followDistance;
  cart.y = cart.donkeyY;
  const outOfSight = { x: cart.x, y: cart.y, donkeyX: cart.donkeyX, donkeyY: cart.donkeyY };
  engine.step(0.04);
  assert.deepEqual({ x: cart.x, y: cart.y, donkeyX: cart.donkeyX, donkeyY: cart.donkeyY }, outOfSight);
  engine.stop();

  const initialInventory = [
    { itemId: 'wood:common', quantity: 1 },
    { itemId: 'cotton:uncommon', quantity: 5 },
  ];
  const initial = createDonkeyCartState(120, 240, 100, []);
  assert.equal(initial.stage, 'broken');
  assert.equal(initial.health, 0);
  assert.equal(initial.everBuilt, false);
  assert.deepEqual(getDonkeyCartConstructionCost(initial), { wood: 1, cotton: 0 });

  const firstBuild = constructDonkeyCart(initial, initialInventory);
  assert.equal(firstBuild.built, true);
  assert.equal(firstBuild.state.stage, 'built');
  assert.equal(firstBuild.state.health, 100);
  assert.equal(firstBuild.state.everBuilt, true);
  assert.deepEqual(firstBuild.inventory, [{ itemId: 'cotton:uncommon', quantity: 5 }]);

  const damaged = damageDonkeyCart(firstBuild.state, 35);
  assert.equal(damaged.stage, 'built');
  assert.equal(damaged.health, 65);

  const broken = damageDonkeyCart(damaged, 65);
  assert.equal(broken.stage, 'broken');
  assert.equal(broken.health, 0);
  assert.equal(broken.carried, false);
  assert.deepEqual(getDonkeyCartConstructionCost(broken), { wood: 1, cotton: 5 });

  const missingCotton = constructDonkeyCart(broken, [{ itemId: 'wood', quantity: 1 }, { itemId: 'cotton', quantity: 4 }]);
  assert.equal(missingCotton.built, false);
  assert.deepEqual(missingCotton.inventory, [{ itemId: 'wood', quantity: 1 }, { itemId: 'cotton', quantity: 4 }]);

  const rebuilt = constructDonkeyCart(broken, [
    { itemId: 'wood:rare', quantity: 1 },
    { itemId: 'cotton:common', quantity: 2 },
    { itemId: 'cotton', quantity: 3 },
  ]);
  assert.equal(rebuilt.built, true);
  assert.equal(rebuilt.state.stage, 'built');
  assert.equal(rebuilt.state.health, 100);
  assert.deepEqual(rebuilt.inventory, []);

  const alreadyBuilt = constructDonkeyCart(rebuilt.state, [{ itemId: 'wood', quantity: 1 }]);
  assert.equal(alreadyBuilt.built, false);
  assert.deepEqual(alreadyBuilt.inventory, [{ itemId: 'wood', quantity: 1 }]);

  console.log('OK: estado inicial, construção, dano, quebra e reconstrução do conjunto burrinho-carroça.');
} finally {
  await server.close();
}
