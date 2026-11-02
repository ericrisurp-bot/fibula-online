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

  const sync = new DuoCycleSync({ participantIds: ['local-user', 'partner-user'] });
  const bridge = new DuoCycleEngineBridge(sync, 'local-user');
  const engine = new GameEngine(() => {}, {
    seed: 0x12345678,
    headless: true,
    houseInventory: [],
    cooperative: bridge.engineOptions,
  });
  bridge.attachEngine(engine);

  // A noite local termina primeiro: o motor fica escuro e continua independente.
  for (let elapsed = 0; elapsed < 60.04; elapsed += 0.04) engine.step(0.04);
  assert.equal(engine.state.dayNight, 'night');
  engine.hordeTarget = 0;
  engine.hordeSpawned = 0;
  engine.state.enemies = [];
  engine.step(0.04);
  assert.equal(engine.isWaitingForCooperativeNight, true);
  assert.deepEqual(bridge.getSnapshot().waitingForPlayers, ['partner-user']);

  // Só o evento explícito do parceiro libera este motor local.
  const released = bridge.reportPartnerNightComplete('partner-user', 1);
  assert.equal(released.nightReleased, true);
  assert.equal(engine.isWaitingForCooperativeNight, false);
  engine.step(0.04);
  assert.equal(engine.state.dayNight, 'dawn');

  // Eventos repetidos/atrasados não avançam a sessão novamente.
  const duplicate = bridge.reportPartnerNightComplete('partner-user', 1);
  assert.equal(duplicate.accepted, false);
  assert.equal(bridge.getSnapshot().currentNight, 2);

  engine.stop();
  console.log('OK: ponte local, espera da noite, liberação recebida e evento duplicado.');
} finally {
  await server.close();
}
