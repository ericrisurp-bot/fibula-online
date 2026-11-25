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

  const { CONFIG } = await server.ssrLoadModule('/src/game/config.ts');
  const prepareCampfirePlacement = (engine) => {
    engine.state.player.x = CONFIG.map.size / 2;
    engine.state.player.y = CONFIG.map.size / 2;
    engine.state.trees = [];
    engine.state.rocks = [];
    engine.state.lake = { ...engine.state.lake, x: 0, y: 0, rx: 0, ry: 0 };
    engine.state.cart.x = CONFIG.map.size * 0.9;
    engine.state.cart.y = CONFIG.map.size * 0.9;
    engine.state.inventory = [
      { itemId: 'wood', quantity: 9 },
      { itemId: 'stone', quantity: 8 },
      { itemId: 'cotton', quantity: 7 },
    ];
    engine.state.cart.inventory = [];
  };
  const campPosition = (campfire, slot) => ({
    x: campfire.x + CONFIG.campLayout[slot].dx,
    y: campfire.y + CONFIG.campLayout[slot].dy,
  });

  // Estruturas permanentes surgem nos slots quando a fogueira é acesa,
  // sem consumir materiais além do custo normal da própria fogueira.
  const permanentChest = createEngine(0x12345678);
  permanentChest.setPermanentCamp({ bau: true, refinery: false, tecelaria: false });
  prepareCampfirePlacement(permanentChest);
  const inventoryBeforeCampfire = permanentChest.state.inventory.map(item => ({ ...item }));
  assert.deepEqual(permanentChest.placeCampfire(), { ok: true });
  const chestSlot = campPosition(permanentChest.state.campfire, 'bau');
  assert.equal(permanentChest.state.house.built, true);
  assert.deepEqual(
    { x: permanentChest.state.house.x, y: permanentChest.state.house.y },
    chestSlot,
    'O baú permanente deve nascer no slot definido pelo layout do acampamento.',
  );
  assert.deepEqual(
    permanentChest.state.inventory,
    [
      { itemId: 'wood', quantity: inventoryBeforeCampfire.find(item => item.itemId === 'wood').quantity - CONFIG.campfire.woodCost },
      { itemId: 'stone', quantity: inventoryBeforeCampfire.find(item => item.itemId === 'stone').quantity - CONFIG.campfire.stoneCost },
      { itemId: 'cotton', quantity: inventoryBeforeCampfire.find(item => item.itemId === 'cotton').quantity - CONFIG.campfire.cottonCost },
    ],
    'Somente os materiais da fogueira podem ser consumidos; o baú permanente é gratuito.',
  );
  assert.deepEqual(permanentChest.state.house.inventory, [], 'A restauração não deve alterar o inventário do baú.');

  // restart limpa as estruturas da partida, preserva as flags permanentes e exige nova fogueira.
  permanentChest.restart();
  assert.deepEqual(permanentChest.permanentCamp, { bau: true, refinery: false, tecelaria: false });
  assert.equal(permanentChest.state.campfire, null);
  assert.equal(permanentChest.state.house.built, false, 'Sem fogueira, o baú não deve existir.');
  assert.equal(permanentChest.state.refinery.built, false, 'Sem fogueira, a refinaria não deve existir.');
  assert.equal(permanentChest.state.tecelaria.built, false, 'Sem fogueira, a tecelaria não deve existir.');
  prepareCampfirePlacement(permanentChest);
  assert.deepEqual(permanentChest.placeCampfire(), { ok: true });
  assert.equal(permanentChest.state.house.built, true, 'O novo acampamento deve recriar o baú após acender a fogueira.');

  // As três estruturas permanentes devem ocupar seus slots relativos à fogueira.
  const fullPermanentCamp = createEngine(0x87654321);
  fullPermanentCamp.setPermanentCamp({ bau: true, refinery: true, tecelaria: true });
  prepareCampfirePlacement(fullPermanentCamp);
  assert.deepEqual(fullPermanentCamp.placeCampfire(), { ok: true });
  for (const [slot, structure] of [
    ['bau', fullPermanentCamp.state.house],
    ['refinery', fullPermanentCamp.state.refinery],
    ['tecelaria', fullPermanentCamp.state.tecelaria],
  ]) {
    assert.equal(structure.built, true, `A estrutura ${slot} deve ser recriada junto com a fogueira.`);
    assert.deepEqual(
      { x: structure.x, y: structure.y },
      campPosition(fullPermanentCamp.state.campfire, slot),
      `A estrutura ${slot} deve respeitar CONFIG.campLayout.`,
    );
  }
  permanentChest.stop();
  fullPermanentCamp.stop();

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
  assert.equal(first.state.classId, 'arqueiro', 'O reinício deve preservar a classe selecionada.');
  assert.equal(first.state.dayNight, 'day');

  first.stop();
  repeated.stop();

  // O Guerreiro mantém o arco nos golpes 1, 2 e 4; o terceiro golpe atinge 360°.
  const shockwaveEngine = createEngine(0x13572468);
  const ringEnemies = () => Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI / 4;
    return {
      id: 100 + index,
      x: shockwaveEngine.state.player.x + Math.cos(angle) * 60,
      y: shockwaveEngine.state.player.y + Math.sin(angle) * 60,
      hp: 1000,
      hitWait: 0,
      wobble: 0,
    };
  });
  const strikeRing = () => {
    shockwaveEngine.state.enemies = ringEnemies();
    shockwaveEngine.primaryPlayer.runtime.attackTimer = 2;
    shockwaveEngine.autoAttack();
    return shockwaveEngine.state.enemies
      .filter(enemy => enemy.hp < 1000)
      .map(enemy => ({ id: enemy.id, damage: 1000 - enemy.hp }));
  };
  const firstWarriorStrike = strikeRing();
  const firstWarriorKnockback = Math.hypot(
    shockwaveEngine.state.enemies.find(enemy => enemy.id === 100).x - shockwaveEngine.state.player.x,
    shockwaveEngine.state.enemies.find(enemy => enemy.id === 100).y - shockwaveEngine.state.player.y,
  );
  const secondWarriorStrike = strikeRing();
  const thirdWarriorStrike = strikeRing();
  const thirdWarriorKnockback = Math.hypot(
    shockwaveEngine.state.enemies.find(enemy => enemy.id === 100).x - shockwaveEngine.state.player.x,
    shockwaveEngine.state.enemies.find(enemy => enemy.id === 100).y - shockwaveEngine.state.player.y,
  );
  const fourthWarriorStrike = strikeRing();
  assert.equal(firstWarriorStrike.length, 3, 'O primeiro golpe deve atingir somente o arco normal.');
  assert.equal(secondWarriorStrike.length, 3, 'O segundo golpe deve atingir somente o arco normal.');
  assert.equal(thirdWarriorStrike.length, 8, 'O terceiro golpe deve atingir os oito slimes em 360 graus.');
  assert.equal(fourthWarriorStrike.length, 3, 'O quarto golpe deve voltar ao arco normal.');
  assert.ok(Math.abs(thirdWarriorStrike[0].damage / firstWarriorStrike[0].damage - CONFIG.warriorShockwave.damageMultiplier) < 1e-9,
    'O terceiro golpe deve aplicar exatamente o multiplicador de dano configurado.');
  assert.ok(Math.abs(firstWarriorKnockback - (60 + CONFIG.weapons.espada.knockback)) < 1e-6,
    'O golpe normal deve preservar o empurrão original.');
  assert.ok(Math.abs(thirdWarriorKnockback - (60 + CONFIG.weapons.espada.knockback * CONFIG.warriorShockwave.knockbackMultiplier)) < 1e-6,
    'A onda deve aplicar o multiplicador de empurrão configurado.');
  assert.equal(shockwaveEngine.state.explosions.at(-1)?.radius, CONFIG.warriorShockwave.radius,
    'A onda deve publicar seu raio visual configurado.');
  assert.equal(shockwaveEngine.state.explosions.at(-1)?.color, '#f2d06b');

  // Um slime além do raio não pode ser atingido pela onda; animais também ficam excluídos.
  shockwaveEngine.primaryPlayer.runtime.warriorAttackCount = CONFIG.warriorShockwave.everyAttack - 1;
  const outsideEnemies = ringEnemies();
  outsideEnemies.push({
    id: 199, x: shockwaveEngine.state.player.x + 150, y: shockwaveEngine.state.player.y,
    hp: 1000, hitWait: 0, wobble: 0,
  });
  outsideEnemies.push({
    id: 200, x: shockwaveEngine.state.player.x + 20, y: shockwaveEngine.state.player.y,
    hp: 1000, hitWait: 0, wobble: 0, animalKind: 'wolf',
  });
  shockwaveEngine.state.enemies = outsideEnemies;
  shockwaveEngine.primaryPlayer.runtime.attackTimer = 2;
  shockwaveEngine.autoAttack();
  assert.equal(shockwaveEngine.state.enemies.find(enemy => enemy.id === 199)?.hp, 1000,
    'A onda não deve atingir slimes além do raio de 90.');
  assert.equal(shockwaveEngine.state.enemies.find(enemy => enemy.id === 200)?.hp, 1000,
    'A onda não deve atingir animais.');

  // O contador zera no restart e ao trocar de classe.
  shockwaveEngine.primaryPlayer.runtime.warriorAttackCount = 2;
  shockwaveEngine.restart();
  assert.equal(shockwaveEngine.primaryPlayer.runtime.warriorAttackCount, 0, 'restart() deve zerar o contador do Guerreiro.');
  shockwaveEngine.primaryPlayer.runtime.warriorAttackCount = 2;
  shockwaveEngine.setClass('mago');
  assert.equal(shockwaveEngine.primaryPlayer.runtime.warriorAttackCount, 0, 'A troca de classe deve zerar o contador do Guerreiro.');

  // As classes de ataque à distância mantêm alvo e dano-base do disparo original.
  for (const [classId, weaponId, targetId] of [
    ['mago', 'cajado', 301],
    ['arqueiro', 'arco', 301],
    ['druida', 'bastao', 301],
  ]) {
    const rangedEngine = createEngine(0x24681357);
    rangedEngine.setClass(classId);
    const player = rangedEngine.state.player;
    rangedEngine.state.enemies = [
      { id: 301, x: player.x + 60, y: player.y, hp: 1000, hitWait: 0, wobble: 0 },
      { id: 302, x: player.x + 100, y: player.y, hp: 1000, hitWait: 0, wobble: 0 },
    ];
    rangedEngine.primaryPlayer.runtime.attackTimer = 2;
    rangedEngine.autoAttack();
    assert.equal(rangedEngine.state.shots.length, 1, `${classId} deve continuar criando um único disparo.`);
    assert.equal(rangedEngine.state.shots[0].targetId, targetId, `${classId} deve preservar o alvo mais próximo.`);
    assert.equal(rangedEngine.state.shots[0].weapon, weaponId);
    assert.equal(rangedEngine.state.shots[0].damage, CONFIG.weapons[weaponId].damage,
      `${classId} deve preservar o dano-base do projétil.`);
    rangedEngine.stop();
  }
  shockwaveEngine.stop();


  // M1: o Mago dispara explosões no 3º e no 6º tiro, sem alterar o restante do ciclo.
  const mageCycle = createEngine(0x31415926);
  mageCycle.setClass('mago');
  const mageShotFlags = [];
  for (let shotNumber = 1; shotNumber <= 6; shotNumber++) {
    mageCycle.state.enemies = [{
      id: 400, x: mageCycle.state.player.x + 60, y: mageCycle.state.player.y,
      hp: 1000, hitWait: 0, wobble: 0,
    }];
    mageCycle.state.shots = [];
    mageCycle.primaryPlayer.runtime.attackTimer = 2;
    mageCycle.autoAttack();
    assert.equal(mageCycle.state.shots.length, 1, `O tiro ${shotNumber} do Mago deve gerar um projétil.`);
    mageShotFlags.push(mageCycle.state.shots[0].explosive);
    assert.equal(
      mageCycle.state.shots[0].explosive,
      shotNumber === 3 || shotNumber === 6,
      `Somente os tiros 3 e 6 devem ser explosivos (tiro ${shotNumber}).`,
    );
  }
  assert.deepEqual(mageShotFlags, [false, false, true, false, false, true]);

  // O contador de explosões do Mago zera no restart e na troca de classe.
  mageCycle.primaryPlayer.runtime.mageAttackCount = 2;
  mageCycle.restart();
  assert.equal(mageCycle.primaryPlayer.runtime.mageAttackCount, 0, 'restart() deve zerar o contador do Mago.');
  mageCycle.primaryPlayer.runtime.mageAttackCount = 2;
  mageCycle.setClass('guerreiro');
  assert.equal(mageCycle.primaryPlayer.runtime.mageAttackCount, 0, 'A troca de classe deve zerar o contador do Mago.');

  // A explosão mantém o dano básico no alvo e aplica 1,5× somente aos outros slimes dentro do raio.
  const mageImpact = createEngine(0x27182818);
  mageImpact.setClass('mago');
  const impactTarget = {
    id: 410, x: mageImpact.state.player.x + 100, y: mageImpact.state.player.y,
    hp: 1000, hitWait: 0, wobble: 0,
  };
  const nearbySlime = {
    id: 411, x: impactTarget.x + 50, y: impactTarget.y,
    hp: 1000, hitWait: 0, wobble: 0,
  };
  const distantSlime = {
    id: 412, x: impactTarget.x + CONFIG.mageExplosion.radius + 10, y: impactTarget.y,
    hp: 1000, hitWait: 0, wobble: 0,
  };
  const nearbyAnimal = {
    id: 413, x: impactTarget.x + 40, y: impactTarget.y,
    hp: 1000, hitWait: 0, wobble: 0, animalKind: 'wolf',
  };
  mageImpact.state.enemies = [impactTarget, nearbySlime, distantSlime, nearbyAnimal];
  mageImpact.state.shots = [{
    id: 900, x: impactTarget.x - 1, y: impactTarget.y, vx: 200, vy: 0,
    damage: 10, kind: 'orb', life: 1, targetId: impactTarget.id,
    weapon: 'cajado', explosive: true,
  }];
  mageImpact.moveShots(0.01);
  assert.equal(impactTarget.hp, 990, 'O alvo principal deve receber apenas o dano básico.');
  assert.equal(nearbySlime.hp, 985, 'Outro slime dentro do raio deve receber dano 1,5×.');
  assert.equal(distantSlime.hp, 1000, 'Slime fora do raio não deve receber dano da explosão.');
  assert.equal(nearbyAnimal.hp, 1000, 'Animais não devem receber dano da explosão.');

  // Arqueiro e Druida não ganham projéteis explosivos; Guerreiro continua no ataque melee.
  for (const [classId, weaponId] of [
    ['arqueiro', 'arco'],
    ['druida', 'bastao'],
  ]) {
    const unchangedEngine = createEngine(0x16180339);
    unchangedEngine.setClass(classId);
    unchangedEngine.state.enemies = [{
      id: 420, x: unchangedEngine.state.player.x + 60, y: unchangedEngine.state.player.y,
      hp: 1000, hitWait: 0, wobble: 0,
    }];
    unchangedEngine.primaryPlayer.runtime.attackTimer = 2;
    unchangedEngine.autoAttack();
    assert.equal(unchangedEngine.state.shots.length, 1);
    assert.equal(unchangedEngine.state.shots[0].weapon, weaponId);
    assert.equal(unchangedEngine.state.shots[0].explosive, false,
      `${classId} não deve herdar a explosão periódica do Mago.`);
    unchangedEngine.stop();
  }
  const unchangedWarrior = createEngine(0x14142135);
  unchangedWarrior.state.enemies = [{
    id: 430, x: unchangedWarrior.state.player.x + 60, y: unchangedWarrior.state.player.y,
    hp: 1000, hitWait: 0, wobble: 0,
  }];
  unchangedWarrior.primaryPlayer.runtime.attackTimer = 2;
  unchangedWarrior.autoAttack();
  assert.equal(unchangedWarrior.state.shots.length, 0, 'Guerreiro deve continuar atacando com melee.');
  unchangedWarrior.stop();
  mageCycle.stop();
  mageImpact.stop();

  console.log('OK: seed fixa, ciclo dia/noite, troca de classe, reinício, onda do Guerreiro e explosão M1 do Mago.');
} finally {
  await server.close();
}
