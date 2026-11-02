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
  const createEngine = (seed) => new GameEngine(() => {}, {
    seed,
    headless: true,
    houseInventory: [],
  });

  // Uma seed fixa deve reproduzir o mesmo estado inicial.
  const first = createEngine(0x12345678);
  const repeated = createEngine(0x12345678);
  assert.deepEqual(
    {
      player: first.state.player,
      house: first.state.house,
      cart: first.state.cart,
      trees: first.state.trees,
      rocks: first.state.rocks,
      cottonPlants: first.state.cottonPlants,
      dayNight: first.state.dayNight,
    },
    {
      player: repeated.state.player,
      house: repeated.state.house,
      cart: repeated.state.cart,
      trees: repeated.state.trees,
      rocks: repeated.state.rocks,
      cottonPlants: repeated.state.cottonPlants,
      dayNight: repeated.state.dayNight,
    },
    'A mesma seed deve gerar o mesmo estado inicial.',
  );

  // A seed escolhida começa de dia; o avanço controlado deve alcançar a noite.
  assert.equal(first.state.dayNight, 'day');
  for (let elapsed = 0; elapsed < 60.04; elapsed += 0.04) {
    first.step(0.04);
  }
  assert.equal(first.state.dayNight, 'night', 'O ciclo deve sair do dia e entrar na noite.');

  // O gate cooperativo emite um único evento ao limpar a horda e mantém o mundo ativo.
  const completedNights = [];
  const cooperative = new GameEngine(() => {}, {
    seed: 0x12345678,
    headless: true,
    houseInventory: [],
    cooperative: {
      waitForNightRelease: true,
      onNightComplete: (nightNumber) => completedNights.push(nightNumber),
    },
  });
  assert.equal(cooperative.state.dayNight, 'day');
  for (let elapsed = 0; elapsed < 60.04; elapsed += 0.04) {
    cooperative.step(0.04);
  }
  assert.equal(cooperative.state.dayNight, 'night');
  // Força apenas a condição de horda limpa para testar a fronteira de integração.
  cooperative.hordeTarget = 0;
  cooperative.hordeSpawned = 0;
  cooperative.state.enemies = [];
  cooperative.step(0.04);
  assert.equal(cooperative.isWaitingForCooperativeNight, true);
  assert.deepEqual(completedNights, [1], 'A conclusão deve ser notificada uma única vez.');
  const xBeforeWaitStep = cooperative.state.player.x;
  cooperative.setMove(1, 0);
  cooperative.step(0.04);
  assert.ok(cooperative.state.player.x > xBeforeWaitStep, 'O mundo local deve continuar ativo durante a espera.');
  assert.deepEqual(completedNights, [1], 'A espera não pode repetir o evento de conclusão.');
  assert.equal(cooperative.releaseCooperativeNight(), true);
  assert.equal(cooperative.isWaitingForCooperativeNight, false);
  cooperative.step(0.04);
  assert.equal(cooperative.state.dayNight, 'dawn');
  assert.equal(cooperative.releaseCooperativeNight(), false, 'Uma liberação repetida deve ser ignorada.');
  cooperative.stop();

  // A fachada do jogador local é dona da entrada e da direção de movimento.
  first.setKey('W', true);
  assert.equal(first.primaryPlayer.runtime.keys.has('w'), true);
  first.setKey('W', false);
  assert.equal(first.primaryPlayer.runtime.keys.has('w'), false);
  first.setMove(3, 4);
  assert.deepEqual(first.primaryPlayer.runtime.input, { x: 3, y: 4 });
  assert.equal(first.primaryPlayer.pub.facingX, 0.6);
  assert.equal(first.primaryPlayer.pub.facingY, 0.8);

  // Troca de classe mantém o motor headless funcional e atualiza a arma.
  first.primaryPlayer.setClass('mago');
  assert.equal(first.state.classId, 'mago');
  assert.equal(first.state.weapon, 'cajado');
  assert.equal(first.primaryPlayer.classId, 'mago');
  first.setClass('arqueiro');
  assert.equal(first.primaryPlayer.classId, 'arqueiro', 'O adaptador público do motor deve delegar a troca à entidade.');
  assert.equal(first.state.weapon, 'arco');

  // Uma entidade morta não pode trocar classe nem alterar a arma.
  first.primaryPlayer.dead = true;
  first.primaryPlayer.setClass('druida');
  assert.equal(first.primaryPlayer.classId, 'arqueiro');
  assert.equal(first.primaryPlayer.weapon, 'arco');
  first.primaryPlayer.dead = false;

  // Um motor marcado como morto não avança; reiniciar restaura a partida.
  const xBeforeDeath = first.state.player.x;
  first.state.dead = true;
  first.step(0.04);
  assert.equal(first.state.player.x, xBeforeDeath, 'Uma partida encerrada não deve continuar simulando.');
  first.restart();
  assert.equal(first.state.dead, false);
  assert.equal(first.state.classId, 'mago', 'O reinício deve preservar a classe selecionada.');
  assert.equal(first.state.dayNight, 'day');

  first.stop();
  repeated.stop();
  console.log('OK: seed fixa, ciclo dia/noite, troca de classe, estado encerrado e reinício.');
} finally {
  await server.close();
}
