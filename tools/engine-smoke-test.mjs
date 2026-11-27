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
  const { getDerivedArmor, applyArmorToDamage } = await server.ssrLoadModule('/src/game/attributes.ts');
  const { getClassPower } = await server.ssrLoadModule('/src/game/power.ts');

  // S1: armadura derivada por classe, escalada linearmente até a noite 15.
  const expectedArmor = {
    guerreiro: [1, 9, 18],
    druida: [0, 5, 11],
    arqueiro: [0, 4, 8],
    mago: [0, 2, 5],
  };
  const classIds = ['guerreiro', 'druida', 'arqueiro', 'mago'];
  const testedNights = [1, 8, 15];
  for (const classId of classIds) {
    const maxHealth = CONFIG.attributes.classStartHealth[classId];
    assert.deepEqual(
      testedNights.map(night => getDerivedArmor(classId, maxHealth, night)),
      expectedArmor[classId],
      `Armadura derivada incorreta para ${classId}.`,
    );
    assert.equal(getDerivedArmor(classId, maxHealth, 30), expectedArmor[classId][2],
      `A armadura de ${classId} não pode crescer após a noite 15.`);
    assert.ok(getDerivedArmor(classId, maxHealth + 20, 15) > getDerivedArmor(classId, maxHealth, 15),
      `Aumentar a vida máxima deve aumentar a armadura derivada de ${classId}.`);
  }
  assert.equal(getDerivedArmor('guerreiro', CONFIG.attributes.classStartHealth.guerreiro, 0), 0,
    'Antes da primeira noite, a armadura derivada deve ser zero.');
  assert.equal(applyArmorToDamage(100, 7 + getDerivedArmor('guerreiro', 150, 15)), 75,
    'A armadura de equipamento deve somar à derivada.');
  assert.equal(applyArmorToDamage(100, 100 + getDerivedArmor('guerreiro', 150, 15)), 40,
    'A redução total de armadura deve respeitar o teto de 60%.');

  // O PD de nível 0 permanece idêntico: a armadura derivada não participa de power.ts.
  const expectedPower = { guerreiro: 444.33, mago: 400.61, arqueiro: 372.60, druida: 410.36 };
  for (const [classId, expected] of Object.entries(expectedPower)) {
    assert.equal(Number(getClassPower(classId, 0).total.toFixed(2)), expected,
      `O PD de nível 0 mudou para ${classId}.`);
  }

  const forceHit = (engine) => {
    engine.random = () => 1;
    engine.getDodgeChance = () => 0;
  };
  const measureSlimeDamage = (classId, nightNumber, equipmentArmor = 0) => {
    const engine = createEngine(0x51A000 + nightNumber);
    engine.setClass(classId);
    engine.nightNumber = nightNumber;
    engine.state.nightNumber = nightNumber;
    engine.state.wave = Math.max(1, nightNumber);
    engine.phase = nightNumber === 0 ? 'day' : 'night';
    engine.state.dayNight = engine.phase;
    const player = engine.state.player;
    player.hp = player.maxHp;
    const feetY = player.y + CONFIG.player.footOffset;
    engine.state.enemies = [{
      id: 5100 + nightNumber, x: player.x + 29, y: feetY,
      hp: 30, hitWait: 0, wobble: 0,
    }];
    if (equipmentArmor > 0) engine.getLevelStats = () => ({ speed: 0, armor: equipmentArmor, dodge: 0 });
    forceHit(engine);
    engine.moveEnemies(0.01);
    const damage = player.maxHp - player.hp;
    engine.stop();
    return damage;
  };
  const measureWolfDamage = (classId, nightNumber) => {
    const engine = createEngine(0x52A000 + nightNumber);
    engine.setClass(classId);
    engine.nightNumber = nightNumber;
    engine.state.nightNumber = nightNumber;
    const player = engine.state.player;
    player.hp = player.maxHp;
    const wolf = {
      id: 5200 + nightNumber,
      x: player.x + CONFIG.wildlife.wolves.radius + CONFIG.player.footRadius,
      y: player.y + CONFIG.player.footOffset,
      hp: 34, hitWait: 0, wobble: 0, animalKind: 'wolf',
      wanderAngle: 0, wanderTimer: 10,
    };
    engine.state.enemies = [wolf];
    forceHit(engine);
    engine.moveWildlife(wolf, 0.01, []);
    const damage = player.maxHp - player.hp;
    engine.stop();
    return damage;
  };

  const expectedSlimeDamage = {
    guerreiro: [9, 9, 10],
    druida: [9, 10, 11],
    arqueiro: [9, 10, 11],
    mago: [9, 10, 11],
  };
  const expectedWolfDamage = {
    guerreiro: [4, 4, 3],
    druida: [4, 4, 4],
    arqueiro: [4, 4, 4],
    mago: [4, 4, 4],
  };
  for (const classId of classIds) {
    assert.deepEqual(
      testedNights.map(night => measureSlimeDamage(classId, night)),
      expectedSlimeDamage[classId],
      `O dano real de contato dos slimes não corresponde à armadura derivada de ${classId}.`,
    );
    assert.deepEqual(
      testedNights.map(night => measureWolfDamage(classId, night)),
      expectedWolfDamage[classId],
      `O dano real dos lobos não corresponde à armadura derivada de ${classId}.`,
    );
  }
  assert.equal(measureSlimeDamage('guerreiro', 0), 14,
    'No dia 1, antes da noite 1, o dano de contato deve continuar igual ao da main (9 × 1,5 = 13,5 arredondado para 14).');
  assert.equal(measureSlimeDamage('guerreiro', 15, 7), 9,
    'O motor deve somar os 7 pontos de armadura do equipamento aos 18 pontos derivados na noite 15.');

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

  // G2: a onda do Guerreiro é um leque frontal de 180° e alcance 140.
  assert.equal(CONFIG.warriorShockwave.radius, 140);
  assert.equal(CONFIG.warriorShockwave.arc, Math.PI);
  const shockwaveEngine = createEngine(0x13572468);
  const playerPosition = () => ({ x: shockwaveEngine.state.player.x, y: shockwaveEngine.state.player.y });
  const enemyAt = (id, distance, angle, extra = {}) => {
    const player = playerPosition();
    return {
      id,
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
      hp: 1000,
      hitWait: 0,
      wobble: 0,
      ...extra,
    };
  };
  const strikeShockwave = (enemies, attackCount = CONFIG.warriorShockwave.everyAttack - 1) => {
    shockwaveEngine.primaryPlayer.runtime.warriorAttackCount = attackCount;
    shockwaveEngine.state.enemies = enemies;
    shockwaveEngine.primaryPlayer.runtime.attackTimer = 2;
    shockwaveEngine.autoAttack();
    return shockwaveEngine.state.enemies;
  };
  const anchor = () => enemyAt(100, 40, 0);
  const normalTarget = anchor();
  strikeShockwave([normalTarget], 0);
  const normalDamage = 1000 - normalTarget.hp;
  assert.ok(normalDamage > 0, 'O golpe normal deve atingir o alvo frontal de referência.');

  // Frente próxima: alvo a 120 px, fora do alcance normal de 90, recebe 1,5× na terceira pancada.
  const frontAnchor = anchor();
  const frontNear = enemyAt(101, 120, 0);
  strikeShockwave([frontAnchor, frontNear]);
  assert.ok(frontNear.hp < 1000, 'A onda deve atingir o slime à frente dentro de 140 px.');
  assert.ok(Math.abs((1000 - frontNear.hp) / normalDamage - CONFIG.warriorShockwave.damageMultiplier) < 1e-9,
    'O slime frontal atingido pela onda deve receber exatamente 1,5× de dano.');
  assert.ok(Math.abs(frontNear.x - (playerPosition().x + 120 + CONFIG.weapons.espada.knockback * 2)) < 1e-6,
    'O slime frontal deve ser empurrado para longe do jogador com força 2×.');

  // Atrás: mesmo a 50 px, não recebe a onda nem é empurrado.
  const behindAnchor = anchor();
  const behind = enemyAt(102, 50, Math.PI);
  const behindStart = { x: behind.x, y: behind.y };
  strikeShockwave([behindAnchor, behind]);
  assert.equal(behind.hp, 1000, 'O slime atrás do jogador não deve receber a onda.');
  assert.deepEqual({ x: behind.x, y: behind.y }, behindStart, 'O slime atrás não deve sofrer empurrão.');

  // Frente além de 140 px: permanece intacta.
  const farAnchor = anchor();
  const frontFar = enemyAt(103, 150, 0);
  strikeShockwave([farAnchor, frontFar]);
  assert.equal(frontFar.hp, 1000, 'O slime frontal além de 140 px não deve receber a onda.');

  // Lateral dentro do limite angular de 90° recebe; além de 90° não recebe.
  const lateralAnchor = anchor();
  const lateralInside = enemyAt(104, 80, Math.PI * 80 / 180);
  const lateralOutside = enemyAt(105, 80, Math.PI * 100 / 180);
  const lateralOutsideStart = { x: lateralOutside.x, y: lateralOutside.y };
  strikeShockwave([lateralAnchor, lateralInside, lateralOutside]);
  assert.ok(lateralInside.hp < 1000, 'O slime lateral dentro de 90° deve receber a onda.');
  assert.equal(lateralOutside.hp, 1000, 'O slime lateral fora de 90° não deve receber a onda.');
  assert.deepEqual({ x: lateralOutside.x, y: lateralOutside.y }, lateralOutsideStart,
    'O slime fora do leque não deve sofrer empurrão.');

  // O empurrão 2× é exclusivo dos atingidos e aponta para longe do jogador.
  const knockbackAnchor = anchor();
  const knockbackHit = enemyAt(106, 100, 0);
  const knockbackMiss = enemyAt(107, 50, Math.PI);
  const hitStart = { x: knockbackHit.x, y: knockbackHit.y };
  const missStart = { x: knockbackMiss.x, y: knockbackMiss.y };
  strikeShockwave([knockbackAnchor, knockbackHit, knockbackMiss]);
  assert.ok(Math.abs(knockbackHit.x - hitStart.x - CONFIG.weapons.espada.knockback * 2) < 1e-6);
  assert.ok(Math.abs(knockbackHit.y - hitStart.y) < 1e-6);
  assert.deepEqual({ x: knockbackMiss.x, y: knockbackMiss.y }, missStart);

  // O visual publica o mesmo ângulo da pancada e o arco configurado.
  const visualAnchor = anchor();
  strikeShockwave([visualAnchor]);
  const warriorEffect = shockwaveEngine.state.explosions.at(-1);
  assert.equal(warriorEffect?.radius, CONFIG.warriorShockwave.radius);
  assert.equal(warriorEffect?.color, '#f2d06b');
  assert.equal(warriorEffect?.angle, shockwaveEngine.state.swordSwingAngle);
  assert.equal(warriorEffect?.arc, CONFIG.warriorShockwave.arc);

  // A contagem permanece 1, 2, onda, 1; a onda não altera os golpes normais.
  shockwaveEngine.primaryPlayer.runtime.warriorAttackCount = 0;
  const cycleAnchor = () => anchor();
  const cycleExtra = () => enemyAt(108, 120, 0);
  for (const [count, shouldHit] of [[1, false], [2, false], [0, true], [1, false]]) {
    const cycleTarget = cycleAnchor();
    const cycleSlime = cycleExtra();
    shockwaveEngine.state.enemies = [cycleTarget, cycleSlime];
    shockwaveEngine.primaryPlayer.runtime.attackTimer = 2;
    shockwaveEngine.autoAttack();
    assert.equal(cycleSlime.hp < 1000, shouldHit, `A contagem periódica deve manter o ciclo no golpe ${count + (count === 0 ? 3 : 0)}.`);
    assert.equal(shockwaveEngine.primaryPlayer.runtime.warriorAttackCount, count === 0 ? 0 : count);
  }

  // O contador zera no restart e na troca de classe.
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
  const impactVulnerability = 1 + mageImpact.getDayNightState().vulnerability;
  mageImpact.moveShots(0.01);
  assert.equal(mageImpact.state.explosions.at(-1)?.arc, undefined, 'A explosão do Mago deve continuar sem arco limitado (círculo completo).');
  assert.equal(mageImpact.state.explosions.at(-1)?.angle, undefined);
  assert.equal(impactTarget.hp, 1000 - 10 * impactVulnerability,
    'O alvo principal deve receber apenas o dano básico, com a vulnerabilidade vigente.');
  assert.equal(nearbySlime.hp, 1000 - 10 * CONFIG.mageExplosion.damageMultiplier * impactVulnerability,
    'Outro slime dentro do raio deve receber dano 1,5×, com a mesma vulnerabilidade.');
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


  // D1: o impacto básico do Druida aplica lentidão em área, sem espalhar dano ou veneno.
  const druidArea = createEngine(0xD1D1D1D1);
  druidArea.setClass('druida');
  const druidTarget = {
    id: 510, x: druidArea.state.player.x + 100, y: druidArea.state.player.y,
    hp: 1000, hitWait: 0, wobble: 0,
  };
  const slowedNeighbor = {
    id: 511, x: druidTarget.x + 60, y: druidTarget.y,
    hp: 1000, hitWait: 0, wobble: 0,
  };
  const outsideNeighbor = {
    id: 512, x: druidTarget.x + CONFIG.druidSlow.radius + 1, y: druidTarget.y,
    hp: 1000, hitWait: 0, wobble: 0,
  };
  const nearbyWolf = {
    id: 513, x: druidTarget.x + 30, y: druidTarget.y,
    hp: 1000, hitWait: 0, wobble: 0, animalKind: 'wolf',
  };
  const nearbyChicken = {
    id: 514, x: druidTarget.x, y: druidTarget.y + 40,
    hp: 1000, hitWait: 0, wobble: 0, animalKind: 'chicken',
  };
  druidArea.state.enemies = [druidTarget, slowedNeighbor, outsideNeighbor, nearbyWolf, nearbyChicken];
  const applyDruidImpact = (engine, target, id) => {
    engine.state.shots = [{
      id, x: target.x - 1, y: target.y, vx: 200, vy: 0,
      damage: 10, kind: 'orb', life: 1, targetId: target.id,
      weapon: 'bastao',
    }];
    engine.moveShots(0.01);
  };
  applyDruidImpact(druidArea, druidTarget, 910);
  assert.equal(druidTarget.slowRemaining, CONFIG.druidSlow.duration, 'O alvo atingido deve receber lentidão.');
  assert.equal(slowedNeighbor.slowRemaining, 2, 'O slime a 60 px do alvo deve receber 2 s de lentidão.');
  assert.equal(outsideNeighbor.slowRemaining, undefined, 'O slime além de 100 px do alvo não deve receber lentidão.');
  assert.equal(nearbyWolf.slowRemaining, undefined, 'Lobos próximos não devem receber lentidão.');
  assert.equal(nearbyChicken.slowRemaining, undefined, 'Galinhas próximas não devem receber lentidão.');
  assert.equal(slowedNeighbor.hp, 1000, 'A lentidão em área não deve causar dano ao vizinho.');
  assert.equal(slowedNeighbor.poisonRemaining, undefined, 'A lentidão em área não deve aplicar veneno ao vizinho.');
  assert.equal(slowedNeighbor.poisonDamage, undefined, 'A lentidão em área não deve definir dano de veneno no vizinho.');
  assert.equal(druidTarget.poisonRemaining, CONFIG.druidPoison.duration, 'O veneno original continua restrito ao alvo atingido.');

  // Slow mais longo é preservado; dois impactos não multiplicam nem empilham o efeito.
  slowedNeighbor.slowRemaining = 5;
  applyDruidImpact(druidArea, druidTarget, 911);
  assert.equal(slowedNeighbor.slowRemaining, 5, 'Um slow de 5 s não pode ser reduzido para 2 s.');
  slowedNeighbor.slowRemaining = 0;
  applyDruidImpact(druidArea, druidTarget, 912);
  assert.equal(slowedNeighbor.slowRemaining, 2, 'Dois acertos renovam o tempo, mas não acumulam duração.');
  const druidSlowReference = createEngine(0xD1D1D1D1);
  druidSlowReference.setClass('druida');
  druidSlowReference.state.player.x = druidArea.state.player.x;
  druidSlowReference.state.player.y = druidArea.state.player.y;
  slowedNeighbor.x = druidArea.state.player.x + 300;
  slowedNeighbor.y = druidArea.state.player.y;
  druidArea.state.enemies = [slowedNeighbor];
  druidSlowReference.state.enemies = [{
    ...slowedNeighbor,
    slowRemaining: undefined,
    poisonRemaining: undefined,
    poisonTick: undefined,
    poisonDamage: undefined,
  }];
  const speedStart = { x: slowedNeighbor.x, y: slowedNeighbor.y };
  druidArea.moveEnemies(0.1);
  druidSlowReference.moveEnemies(0.1);
  const slowedDistance = Math.hypot(druidArea.state.enemies[0].x - speedStart.x, druidArea.state.enemies[0].y - speedStart.y);
  const normalDistance = Math.hypot(druidSlowReference.state.enemies[0].x - speedStart.x, druidSlowReference.state.enemies[0].y - speedStart.y);
  assert.ok(normalDistance > 0, 'O inimigo de referência precisa se mover no teste.');
  assert.ok(Math.abs(slowedDistance / normalDistance - CONFIG.druidSlow.speedMultiplier) < 1e-6,
    'Dois acertos devem manter a velocidade efetiva em exatamente 0,7×, sem empilhar multiplicadores.');
  druidArea.stop();
  druidSlowReference.stop();

  // Guerreiro, Mago e Arqueiro não aplicam lentidão.
  for (const [classId, weaponId] of [
    ['guerreiro', 'espada'],
    ['mago', 'cajado'],
    ['arqueiro', 'arco'],
  ]) {
    const unchangedSlowEngine = createEngine(0xD1D1D1D1);
    unchangedSlowEngine.setClass(classId);
    const target = {
      id: 530, x: unchangedSlowEngine.state.player.x + 60, y: unchangedSlowEngine.state.player.y,
      hp: 1000, hitWait: 0, wobble: 0,
    };
    const neighbor = {
      id: 531, x: target.x + 50, y: target.y,
      hp: 1000, hitWait: 0, wobble: 0,
    };
    unchangedSlowEngine.state.enemies = [target, neighbor];
    unchangedSlowEngine.primaryPlayer.runtime.attackTimer = 2;
    unchangedSlowEngine.autoAttack();
    if (classId !== 'guerreiro') {
      const shot = unchangedSlowEngine.state.shots[0];
      shot.x = target.x - 1;
      shot.y = target.y;
      shot.vx = 200;
      shot.vy = 0;
      shot.life = 1;
      unchangedSlowEngine.moveShots(0.01);
    }
    assert.equal(target.slowRemaining, undefined, `${classId} não deve aplicar lentidão ao alvo.`);
    assert.equal(neighbor.slowRemaining, undefined, `${classId} não deve aplicar lentidão a inimigos próximos.`);
    assert.equal(unchangedSlowEngine.state.enemies.some(enemy => (enemy.slowRemaining ?? 0) > 0), false,
      `${classId} não deve aplicar lentidão a ninguém.`);
    unchangedSlowEngine.stop();
  }

  // B1a: módulo puro do outbox local-first do baú.
  const houseOutbox = await server.ssrLoadModule('/src/game/houseOutbox.ts');
  const {
    computeNetDelta,
    splitIntoBatches,
    deriveOpId,
    createMatchId,
    buildPendingMatch,
    savePendingMatch,
    loadPendingMatch,
    clearPendingMatch,
    markBatchConfirmed,
    getUnconfirmedBatches,
    isFullyConfirmed,
  } = houseOutbox;

  // O delta agrega duplicatas, preserva ordem de primeira aparição e omite saldo zero.
  assert.deepEqual(computeNetDelta(
    [
      { itemId: 'wood', quantity: 2 },
      { itemId: 'stone', quantity: 5 },
      { itemId: 'wood', quantity: 1 },
      { itemId: 'removed', quantity: 4 },
      { itemId: 'zero', quantity: 3 },
    ],
    [
      { itemId: 'wood', quantity: 6 },
      { itemId: 'stone', quantity: 2 },
      { itemId: 'new', quantity: 7 },
      { itemId: 'zero', quantity: 3 },
    ],
  ), [
    { itemId: 'wood', quantity: 3 },
    { itemId: 'stone', quantity: -3 },
    { itemId: 'removed', quantity: -4 },
    { itemId: 'new', quantity: 7 },
  ]);

  // Limites de lote: vazio, 1, 100, 101 e 250 entradas.
  const makeDelta = (count) => Array.from({ length: count }, (_, index) => ({
    itemId: `item-${index}`,
    quantity: 1,
  }));
  for (const [count, expectedBatchCount] of [[0, 0], [1, 1], [100, 1], [101, 2], [250, 3]]) {
    const batches = splitIntoBatches(makeDelta(count));
    assert.equal(batches.length, expectedBatchCount, `Quantidade incorreta de lotes para ${count} entradas.`);
    assert.equal(batches.flat().length, count, `Entradas perdidas ao dividir ${count} registros.`);
    assert.ok(batches.every((batch) => batch.length <= 100), 'Nenhum lote pode exceder 100 entradas.');
  }

  // Quantidades acima do teto são fragmentadas sem perder soma nem sinal.
  const largeQuantityBatches = splitIntoBatches([
    { itemId: 'large-positive', quantity: 2_000_001 },
    { itemId: 'large-negative', quantity: -2_000_000 },
  ]);
  const largeEntries = largeQuantityBatches.flat();
  assert.deepEqual(largeEntries, [
    { itemId: 'large-positive', quantity: 999_999 },
    { itemId: 'large-positive', quantity: 999_999 },
    { itemId: 'large-positive', quantity: 3 },
    { itemId: 'large-negative', quantity: -999_999 },
    { itemId: 'large-negative', quantity: -999_999 },
    { itemId: 'large-negative', quantity: -2 },
  ]);
  assert.equal(largeEntries.filter((entry) => entry.itemId === 'large-positive')
    .reduce((sum, entry) => sum + entry.quantity, 0), 2_000_001);
  assert.equal(largeEntries.filter((entry) => entry.itemId === 'large-negative')
    .reduce((sum, entry) => sum + entry.quantity, 0), -2_000_000);
  assert.ok(largeEntries.every((entry) => Math.abs(entry.quantity) <= 999_999));
  assert.ok(largeQuantityBatches.every((batch) => batch.length <= 100));

  // OpIds têm formato UUID, são determinísticos e variam por partida/lote.
  const opId = deriveOpId('match-alpha', 0);
  assert.equal(opId, deriveOpId('match-alpha', 0));
  assert.notEqual(opId, deriveOpId('match-alpha', 1));
  assert.notEqual(opId, deriveOpId('match-beta', 0));
  assert.match(opId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(createMatchId(() => 'injected-match-id'), 'injected-match-id');

  // Construção de partida mantém lotes/opIds estáveis e representa saldo vazio sem lotes.
  const emptyPending = buildPendingMatch({
    matchId: 'empty-match',
    baseline: [{ itemId: 'wood', quantity: 2 }],
    current: [{ itemId: 'wood', quantity: 2 }],
    now: 123,
  });
  assert.deepEqual(emptyPending.batches, []);
  assert.equal(isFullyConfirmed(emptyPending), true);

  const manyBaseline = [];
  const manyCurrent = [];
  for (let index = 0; index < 205; index += 1) {
    manyCurrent.push({ itemId: `crafted-${index}`, quantity: 1 });
  }
  const pendingInput = {
    matchId: 'stable-match',
    baseline: manyBaseline,
    current: manyCurrent,
    now: 456,
  };
  const pendingFirst = buildPendingMatch(pendingInput);
  const pendingSecond = buildPendingMatch(pendingInput);
  assert.deepEqual(pendingFirst, pendingSecond);
  assert.equal(pendingFirst.batches.length, 3);
  assert.deepEqual(
    pendingFirst.batches.map((batch) => batch.opId),
    pendingSecond.batches.map((batch) => batch.opId),
  );
  assert.ok(pendingFirst.batches.every((batch) => batch.delta.length <= 100));

  // Persistência com storage em memória, dados corrompidos/inválidos e falhas de storage.
  const memory = new Map();
  const memoryStorage = {
    getItem: (key) => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  assert.equal(savePendingMatch(memoryStorage, 'user-1', pendingFirst), true);
  assert.deepEqual(loadPendingMatch(memoryStorage, 'user-1'), pendingFirst);
  assert.equal(clearPendingMatch(memoryStorage, 'user-1'), true);
  assert.equal(loadPendingMatch(memoryStorage, 'user-1'), null);

  memoryStorage.setItem('fibula-house-pending:broken-json', '{not-json');
  assert.doesNotThrow(() => assert.equal(loadPendingMatch(memoryStorage, 'broken-json'), null));
  memoryStorage.setItem('fibula-house-pending:invalid-shape', JSON.stringify({
    ...pendingFirst,
    version: 2,
  }));
  assert.doesNotThrow(() => assert.equal(loadPendingMatch(memoryStorage, 'invalid-shape'), null));
  memoryStorage.setItem('fibula-house-pending:invalid-batch', JSON.stringify({
    ...pendingFirst,
    batches: [{
      opId: 'invalid',
      delta: Array.from({ length: 101 }, (_, index) => ({ itemId: `x-${index}`, quantity: 1 })),
    }],
  }));
  assert.equal(loadPendingMatch(memoryStorage, 'invalid-batch'), null);

  const throwingStorage = {
    getItem: () => { throw new Error('get failed'); },
    setItem: () => { throw new Error('set failed'); },
    removeItem: () => { throw new Error('remove failed'); },
  };
  assert.doesNotThrow(() => {
    assert.equal(savePendingMatch(throwingStorage, 'user-1', pendingFirst), false);
    assert.equal(loadPendingMatch(throwingStorage, 'user-1'), null);
    assert.equal(clearPendingMatch(throwingStorage, 'user-1'), false);
  });

  // Confirmação é imutável, não duplica opId e detecta a conclusão integral.
  const confirmationPending = buildPendingMatch({
    matchId: 'confirm-match',
    baseline: [],
    current: Array.from({ length: 101 }, (_, index) => ({
      itemId: `confirm-item-${index}`,
      quantity: 1,
    })),
    now: 789,
  });
  assert.equal(confirmationPending.batches.length, 2);
  const firstConfirmation = markBatchConfirmed(
    confirmationPending,
    confirmationPending.batches[0].opId,
  );
  assert.equal(isFullyConfirmed(firstConfirmation), false);
  assert.equal(getUnconfirmedBatches(firstConfirmation).length, 1);
  const repeatedConfirmation = markBatchConfirmed(
    firstConfirmation,
    confirmationPending.batches[0].opId,
  );
  assert.deepEqual(repeatedConfirmation.confirmedOpIds, [confirmationPending.batches[0].opId]);
  const allConfirmed = markBatchConfirmed(
    repeatedConfirmation,
    confirmationPending.batches[1].opId,
  );
  assert.equal(getUnconfirmedBatches(allConfirmed).length, 0);
  assert.equal(isFullyConfirmed(allConfirmed), true);
  assert.deepEqual(confirmationPending.confirmedOpIds, [], 'A confirmação não pode mutar o objeto recebido.');

  // R1a: carga manual, combustível por lote, raridade e baú de saída da refinaria.
  const makeRefineryEngine = (seed) => {
    const engine = createEngine(seed);
    engine.state.refinery.built = true;
    engine.state.refinery.x = 1800;
    engine.state.refinery.y = 1800;
    engine.state.player.x = 1800;
    engine.state.player.y = 1800 - CONFIG.player.footOffset;
    engine.state.cart.x = 2600;
    engine.state.cart.y = 2600;
    engine.state.cart.carried = false;
    engine.state.inventory = [];
    engine.state.cart.inventory = [];
    return engine;
  };
  const advanceRefinery = (engine, seconds) => {
    const steps = Math.ceil(seconds / 0.04);
    for (let index = 0; index < steps; index += 1) engine.step(0.04);
  };
  const originalTinChance = CONFIG.refinery.tinChance;
  try {
    const capacityRefinery = makeRefineryEngine(0x1a000001);
    capacityRefinery.state.inventory = [
      { itemId: 'stone', quantity: 20 },
      { itemId: 'wood:rare', quantity: 8 },
    ];
    assert.deepEqual(capacityRefinery.loadRefineryStone(99), { ok: true, moved: 15 });
    assert.equal(capacityRefinery.state.refinery.stoneStock, 15);
    assert.deepEqual(capacityRefinery.state.refinery.stoneBuffer, [{ itemId: 'stone', quantity: 5 }, { itemId: 'stone', quantity: 5 }, { itemId: 'stone', quantity: 5 }]);
    assert.deepEqual(capacityRefinery.loadRefineryStone(1), { ok: false, reason: 'full' });
    assert.deepEqual(capacityRefinery.loadRefineryWood(99), { ok: true, moved: 6 });
    assert.equal(capacityRefinery.state.refinery.woodStock, 6);
    assert.deepEqual(capacityRefinery.loadRefineryWood(1), { ok: false, reason: 'full' });
    capacityRefinery.state.player.x = 2400;
    assert.deepEqual(capacityRefinery.loadRefineryStone(1), { ok: false, reason: 'far' });
    assert.deepEqual(capacityRefinery.loadRefineryWood(1), { ok: false, reason: 'far' });
    capacityRefinery.stop();

    CONFIG.refinery.tinChance = 0;
    const fuelRefinery = makeRefineryEngine(0x1a000002);
    fuelRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone', quantity: 5 }];
    fuelRefinery.state.refinery.stoneStock = 5;
    advanceRefinery(fuelRefinery, 10);
    assert.equal(fuelRefinery.state.refinery.stonesProcessed, 0, 'Sem madeira, nenhuma pedra pode ser refinada.');
    fuelRefinery.state.inventory = [{ itemId: 'wood', quantity: 2 }];
    assert.deepEqual(fuelRefinery.loadRefineryWood(2), { ok: true, moved: 2 });
    advanceRefinery(fuelRefinery, 10);
    assert.equal(fuelRefinery.state.refinery.stonesProcessed, 5, 'Duas madeiras devem financiar exatamente cinco pedras.');
    assert.equal(fuelRefinery.state.refinery.fuelCharges, 0);
    assert.equal(fuelRefinery.state.refinery.woodStock, 0);
    fuelRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone', quantity: 3 }];
    fuelRefinery.state.refinery.stoneStock = 3;
    fuelRefinery.state.inventory = [{ itemId: 'wood', quantity: 2 }];
    fuelRefinery.loadRefineryWood(2);
    advanceRefinery(fuelRefinery, 6);
    assert.equal(fuelRefinery.state.refinery.stonesProcessed, 8);
    assert.equal(fuelRefinery.state.refinery.fuelCharges, 2, 'O combustível restante do lote deve continuar disponível.');
    fuelRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone', quantity: 2 }];
    fuelRefinery.state.refinery.stoneStock = 2;
    advanceRefinery(fuelRefinery, 4);
    assert.equal(fuelRefinery.state.refinery.stonesProcessed, 10);
    assert.equal(fuelRefinery.state.refinery.fuelCharges, 0);
    fuelRefinery.stop();

    const tenStoneRefinery = makeRefineryEngine(0x1a000003);
    tenStoneRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone', quantity: 10 }];
    tenStoneRefinery.state.refinery.stoneStock = 10;
    tenStoneRefinery.state.refinery.woodStock = 4;
    advanceRefinery(tenStoneRefinery, 20);
    assert.equal(tenStoneRefinery.state.refinery.stonesProcessed, 10, 'Dez pedras devem exigir quatro madeiras.');
    assert.equal(tenStoneRefinery.state.refinery.woodStock, 0);
    assert.equal(tenStoneRefinery.state.refinery.fuelCharges, 0);
    tenStoneRefinery.stop();

    CONFIG.refinery.tinChance = 1;
    const rarityRefinery = makeRefineryEngine(0x1a000004);
    rarityRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone:rare', quantity: 1 }];
    rarityRefinery.state.refinery.stoneStock = 1;
    rarityRefinery.state.refinery.woodStock = 2;
    advanceRefinery(rarityRefinery, 2);
    assert.deepEqual(rarityRefinery.state.refinery.outputInventory, [{ itemId: 'tin:rare', quantity: 1 }]);
    assert.equal(rarityRefinery.state.refinery.tinProduced, 1);
    rarityRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone', quantity: 1 }];
    rarityRefinery.state.refinery.stoneStock = 1;
    advanceRefinery(rarityRefinery, 2);
    assert.ok(rarityRefinery.state.refinery.outputInventory.some(stack => stack.itemId === 'tin' && stack.quantity === 1));
    assert.equal(rarityRefinery.state.bronzeDrops.length, 0, 'A refinaria não pode criar bronzeDrops.');
    rarityRefinery.stop();

    CONFIG.refinery.tinChance = 0;
    const noTinRefinery = makeRefineryEngine(0x1a000005);
    noTinRefinery.state.refinery.stoneBuffer = [{ itemId: 'stone', quantity: 1 }];
    noTinRefinery.state.refinery.stoneStock = 1;
    noTinRefinery.state.refinery.woodStock = 2;
    advanceRefinery(noTinRefinery, 2);
    assert.equal(noTinRefinery.state.refinery.stoneStock, 0);
    assert.equal(noTinRefinery.state.refinery.stonesProcessed, 1);
    assert.deepEqual(noTinRefinery.state.refinery.outputInventory, []);
    noTinRefinery.stop();

    const outputRefinery = makeRefineryEngine(0x1a000006);
    outputRefinery.state.refinery.outputInventory = [{ itemId: 'tin', quantity: 1 }];
    outputRefinery.state.inventory = [
      { itemId: 'wood', quantity: 1 },
      { itemId: 'stone', quantity: 1 },
      { itemId: 'cotton', quantity: 1 },
    ];
    assert.deepEqual(outputRefinery.collectRefineryOutput(), { ok: true, moved: 0, left: 1 });
    assert.equal(outputRefinery.state.refinery.outputInventory[0].quantity, 1);
    outputRefinery.state.inventory.pop();
    assert.deepEqual(outputRefinery.collectRefineryOutput(), { ok: true, moved: 1, left: 0 });
    assert.ok(outputRefinery.state.inventory.some(stack => stack.itemId === 'tin'));
    assert.deepEqual(outputRefinery.state.refinery.outputInventory, []);
    outputRefinery.stop();

    const noAutoDelivery = makeRefineryEngine(0x1a000007);
    noAutoDelivery.state.inventory = [{ itemId: 'stone', quantity: 2 }];
    advanceRefinery(noAutoDelivery, 1);
    assert.deepEqual(noAutoDelivery.state.inventory, [{ itemId: 'stone', quantity: 2 }], 'Pedras não podem ser transferidas automaticamente para a refinaria.');
    assert.equal(noAutoDelivery.state.refinery.stoneStock, 0);
    assert.equal(noAutoDelivery.state.bronzeDrops.length, 0);
    noAutoDelivery.stop();
  } finally {
    CONFIG.refinery.tinChance = originalTinChance;
  }

  console.log('OK: testes do motor, incluindo refinaria R1a (combustível, estanho, raridade e coleta).');
} finally {
  await server.close();
}
