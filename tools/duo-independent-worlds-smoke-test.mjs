import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { DuoCycleSync } = await server.ssrLoadModule('/src/game/coop/DuoCycleSync.ts');
  const { DuoCycleEngineBridge } = await server.ssrLoadModule('/src/game/coop/DuoCycleEngineBridge.ts');

  const playerA = 'player-a';
  const playerB = 'player-b';
  const syncA = new DuoCycleSync({ participantIds: [playerA, playerB] });
  const syncB = new DuoCycleSync({ participantIds: [playerA, playerB] });
  const bridgeA = new DuoCycleEngineBridge(syncA, playerA);
  const bridgeB = new DuoCycleEngineBridge(syncB, playerB);

  const engineA = new GameEngine(() => {}, {
    seed: 0x11111111,
    headless: true,
    houseInventory: [],
    cooperative: bridgeA.engineOptions,
  });
  const engineB = new GameEngine(() => {}, {
    seed: 0x22222222,
    headless: true,
    houseInventory: [],
    cooperative: bridgeB.engineOptions,
  });
  bridgeA.attachEngine(engineA);
  bridgeB.attachEngine(engineB);

  // São dois motores e dois estados de mundo distintos.
  assert.notEqual(engineA, engineB);
  assert.notEqual(engineA.state, engineB.state);
  assert.notDeepEqual(engineA.state.trees, engineB.state.trees);
  const playerBX = engineB.state.player.x;
  engineA.setMove(1, 0);
  engineA.step(0.04);
  assert.equal(engineB.state.player.x, playerBX, 'Movimento local não pode alterar o mundo do parceiro.');
  engineA.setMove(0, 0);

  // Ambos chegam à noite e limpam suas hordas locais independentemente.
  for (let elapsed = 0; elapsed < 60.04; elapsed += 0.04) {
    engineA.step(0.04);
    engineB.step(0.04);
  }
  for (const engine of [engineA, engineB]) {
    assert.equal(engine.state.dayNight, 'night');
    engine.hordeTarget = 0;
    engine.hordeSpawned = 0;
    engine.state.enemies = [];
    engine.step(0.04);
    assert.equal(engine.isWaitingForCooperativeNight, true);
  }

  // Cada coordenador recebe apenas um evento explícito simulado do outro cliente.
  assert.deepEqual(bridgeA.getSnapshot().waitingForPlayers, [playerB]);
  assert.deepEqual(bridgeB.getSnapshot().waitingForPlayers, [playerA]);
  assert.equal(bridgeA.reportPartnerNightComplete(playerB, 1).nightReleased, true);
  assert.equal(bridgeB.reportPartnerNightComplete(playerA, 1).nightReleased, true);
  assert.equal(engineA.isWaitingForCooperativeNight, false);
  assert.equal(engineB.isWaitingForCooperativeNight, false);

  // Duplicatas não liberam uma segunda vez nem avançam a noite.
  assert.equal(bridgeA.reportPartnerNightComplete(playerB, 1).accepted, false);
  assert.equal(bridgeB.reportPartnerNightComplete(playerA, 1).accepted, false);
  assert.equal(bridgeA.getSnapshot().currentNight, 2);
  assert.equal(bridgeB.getSnapshot().currentNight, 2);

  engineA.step(0.04);
  engineB.step(0.04);
  assert.equal(engineA.state.dayNight, 'dawn');
  assert.equal(engineB.state.dayNight, 'dawn');

  // Se um jogador morrer, a conclusão do sobrevivente libera o ciclo
  // sem contabilizá-lo como noite cooperativa.
  const deathSyncA = new DuoCycleSync({ participantIds: [playerA, playerB] });
  const deathSyncB = new DuoCycleSync({ participantIds: [playerA, playerB] });
  const survivorA = deathSyncA.reportNightComplete(playerA, 1);
  assert.equal(survivorA.nightReleased, false);
  const deathA = deathSyncA.reportPlayerDeath(playerB, 'defeated', 1);
  assert.equal(deathA.nightReleased, true);
  assert.equal(deathA.snapshot.currentNight, 2);
  assert.deepEqual(deathA.snapshot.participants.filter(player => player.alive).map(player => player.userId), [playerA]);

  deathSyncB.reportPlayerDeath(playerB, 'defeated', 1);
  const survivorB = deathSyncB.reportNightComplete(playerA, 1);
  assert.equal(survivorB.nightReleased, true);
  assert.equal(survivorB.snapshot.currentNight, 2);
  assert.equal(survivorB.snapshot.participants.filter(player => player.alive).length, 1);

  engineA.stop();
  engineB.stop();
  console.log('OK: dois mundos locais independentes, ciclo coordenado, duplicatas e morte.');
} finally {
  await server.close();
}
