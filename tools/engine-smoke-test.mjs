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
  first.setClass('mago');
  assert.equal(first.state.classId, 'mago');
  assert.equal(first.state.weapon, 'cajado');
  assert.equal(first.primaryPlayer.classId, 'mago');

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
