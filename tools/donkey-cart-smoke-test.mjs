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

  const initialInventory = [
    { itemId: 'wood:common', quantity: 6 },
    { itemId: 'wood', quantity: 4 },
    { itemId: 'cotton:uncommon', quantity: 5 },
  ];
  const initial = createDonkeyCartState(120, 240, 100, []);
  assert.equal(initial.stage, 'broken');
  assert.equal(initial.health, 0);
  assert.equal(initial.everBuilt, false);
  assert.deepEqual(getDonkeyCartConstructionCost(initial), { wood: 10, cotton: 0 });

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
  assert.deepEqual(getDonkeyCartConstructionCost(broken), { wood: 10, cotton: 5 });

  const missingCotton = constructDonkeyCart(broken, [{ itemId: 'wood', quantity: 10 }, { itemId: 'cotton', quantity: 4 }]);
  assert.equal(missingCotton.built, false);
  assert.deepEqual(missingCotton.inventory, [{ itemId: 'wood', quantity: 10 }, { itemId: 'cotton', quantity: 4 }]);

  const rebuilt = constructDonkeyCart(broken, [
    { itemId: 'wood:rare', quantity: 10 },
    { itemId: 'cotton:common', quantity: 2 },
    { itemId: 'cotton', quantity: 3 },
  ]);
  assert.equal(rebuilt.built, true);
  assert.equal(rebuilt.state.stage, 'built');
  assert.equal(rebuilt.state.health, 100);
  assert.deepEqual(rebuilt.inventory, []);

  const alreadyBuilt = constructDonkeyCart(rebuilt.state, [{ itemId: 'wood', quantity: 10 }]);
  assert.equal(alreadyBuilt.built, false);
  assert.deepEqual(alreadyBuilt.inventory, [{ itemId: 'wood', quantity: 10 }]);

  console.log('OK: estado inicial, construção, dano, quebra e reconstrução do conjunto burrinho-carroça.');
} finally {
  await server.close();
}
