import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import 'fake-indexeddb/auto';

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const passed = [];
const rejects = (fn, pattern) => assert.throws(fn, pattern);
const rejectsAsync = (fn, pattern) => assert.rejects(fn, pattern);
const user = (tag) => 'p4-' + tag + '-' + crypto.randomUUID();

try {
  const progression = await server.ssrLoadModule('/src/game/proficiencyProgression.ts');
  const integration = await server.ssrLoadModule('/src/game/proficiencyAttributeIntegration.ts');
  const sync = await server.ssrLoadModule('/src/game/proficiencySync.ts');
  const storage = await server.ssrLoadModule('/src/game/proficiencyStorage.ts');
  const bufferModule = await server.ssrLoadModule('/src/game/proficiencyBuffer.ts');
  const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/game/config.ts');

  // Fixture de teste, NÃO é balanceamento.
  const fixture = { version: 'fixture-v1', key: 'espada', initialLevel: 1, maxLevel: 3,
    milestones: [{ level: 1, totalRequired: 0 }, { level: 2, totalRequired: 10 }, { level: 3, totalRequired: 30 }] };
  for (const [total, level] of [[9, 1], [10, 2], [11, 2], [29, 2], [30, 3], [31, 3]]) {
    assert.equal(progression.evaluateProficiencyProgression(total, fixture).level, level);
  }
  const start = progression.evaluateProficiencyProgression(0, fixture);
  assert.equal(start.level, 1);
  assert.equal(start.progressRatio, 0);
  assert.equal(start.remainingForNextLevel, 10);
  const middle = progression.evaluateProficiencyProgression(15, fixture);
  assert.equal(middle.progressRatio, 0.25);
  assert.equal(middle.remainingForNextLevel, 15);
  const max = progression.evaluateProficiencyProgression(35, fixture);
  assert.equal(max.level, 3);
  assert.equal(max.isMaxLevel, true);
  assert.equal(max.progressRatio, 1);
  assert.equal(max.remainingForNextLevel, 0);
  assert.equal(max.surplusAtMaxLevel, 5);
  assert.equal(max.tableVersion, fixture.version);
  for (const n of [NaN, Infinity, -1, 1.2]) rejects(() => progression.evaluateProficiencyProgression(n, fixture), /inteiro seguro/);
  const invalidTables = [
    { ...fixture, milestones: [] },
    { ...fixture, milestones: [{ level: 1, totalRequired: 0 }, { level: 3, totalRequired: 10 }, { level: 3, totalRequired: 30 }] },
    { ...fixture, milestones: [{ level: 1, totalRequired: 0 }, { level: 2, totalRequired: 30 }, { level: 3, totalRequired: 20 }] },
    { ...fixture, milestones: [{ level: 1, totalRequired: 1 }, { level: 2, totalRequired: 10 }, { level: 3, totalRequired: 30 }] },
    { ...fixture, version: ' ' }, { ...fixture, maxLevel: 0 },
  ];
  for (const table of invalidTables) rejects(() => progression.validateProficiencyProgressionTable(table));
  passed.push('progressão: fronteiras, níveis, excedente, razões e validações');

  // Fixture de teste, NÃO é balanceamento.
  const reward = (id, overrides = {}) => ({ id, version: 'reward-fixture-v2', proficiencyKey: 'espada', unlockLevel: 2,
    enabled: true, scope: { type: 'character' }, effect: { type: 'attribute_base', attribute: 'forca', amount: 2 }, ...overrides });
  const resolve = (classId, rewards, tables = [fixture]) => integration.resolveProficiencyAttributeContributions({
    classId, totals: { espada: 10 }, progressionTables: tables, rewards,
  });
  assert.deepEqual(resolve('guerreiro', [reward('off', { enabled: false })]), []);
  assert.equal(resolve('guerreiro', [reward('class-ok', { scope: { type: 'class', classId: 'guerreiro' } })]).length, 1);
  assert.deepEqual(resolve('mago', [reward('class-no', { scope: { type: 'class', classId: 'guerreiro' } })]), []);
  const characterReward = reward('character', { effect: { type: 'attribute_base', attribute: 'vida', amount: 3 } });
  assert.equal(resolve('guerreiro', [characterReward]).length, 1);
  assert.equal(resolve('mago', [characterReward]).length, 1);
  assert.deepEqual(resolve('guerreiro', [reward('unused', { effect: { type: 'attribute_base', attribute: 'inteligencia', amount: 3 } })]), []);
  assert.deepEqual(resolve('guerreiro', [reward('dup'), reward('dup')]), []);
  assert.deepEqual(resolve('guerreiro', [], [fixture, fixture]), []);
  assert.deepEqual(resolve('guerreiro', [reward('no-table')], []), []);
  const mixedRewards = resolve('guerreiro', [
    reward('invalid-key', { proficiencyKey: 'unknown_key' }),
    reward('invalid-attribute', { effect: { type: 'attribute_base', attribute: 'unknown_attribute', amount: 2 } }),
    reward('negative-amount', { effect: { type: 'attribute_base', attribute: 'forca', amount: -1 } }),
    reward('infinite-amount', { effect: { type: 'attribute_base', attribute: 'forca', amount: Infinity } }),
    reward('unsafe-amount', { effect: { type: 'attribute_base', attribute: 'forca', amount: Number.MAX_SAFE_INTEGER + 1 } }),
    reward('invalid-unlock', { unlockLevel: 4 }),
    reward('valid-after-invalid'),
  ]);
  assert.deepEqual(mixedRewards.map(item => item.rewardId), ['valid-after-invalid']);
  const isolatedTableResolution = integration.resolveProficiencyAttributeContributions({
    classId: 'guerreiro',
    totals: { espada: 10, arco: 10 },
    progressionTables: [{ ...fixture, milestones: [] }, { ...fixture, key: 'arco' }],
    rewards: [reward('valid-arco', { proficiencyKey: 'arco' })],
  });
  assert.deepEqual(isolatedTableResolution.map(item => item.rewardId), ['valid-arco']);
  const contribution = resolve('guerreiro', [reward('versioned')])[0];
  assert.equal(contribution.source, 'proficiency');
  assert.equal(contribution.rewardVersion, 'reward-fixture-v2');
  assert.equal(contribution.proficiencyTableVersion, 'fixture-v1');
  passed.push('ponte de atributos: validação isolada, listas fechadas, limites, cache e source');

  const classify = sync.classifyProficiencySyncError;
  assert.deepEqual(classify({ message: 'Proficiência desconhecida ou inativa: espada.' }), { kind: 'unknown_key', keys: ['espada'] });
  for (const message of ['Quantidade inválida para a proficiência espada.', 'Lote de proficiências inválido.', 'Identificador de lote reutilizado com conteúdo diferente.']) {
    assert.equal(classify({ message }).kind, 'invalid_batch');
  }
  assert.equal(classify({ message: 'Sessão não autorizada.' }).kind, 'auth');
  assert.equal(classify({ code: '23503' }).kind, 'fk_profile');
  for (const error of [{ message: 'network request failed' }, { message: 'timeout' }, { status: 500 }, { status: 503 }, { status: 429 }]) {
    assert.equal(classify(error).kind, 'transient');
  }
  const delays = Array.from({ length: 5 }, (_, i) => sync.nextProficiencyBackoffMs(i + 1));
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] > delays[i - 1], 'backoff deve crescer antes do teto');
  for (const n of [0, -1, NaN, Infinity, ...Array.from({ length: 1000 }, (_, i) => i + 1)]) {
    const delay = sync.nextProficiencyBackoffMs(n);
    assert.ok(delay >= 27000 && delay <= 660000, 'backoff fora da faixa de 27 s a 11 min');
  }
  passed.push('sync: classificação de erros RPC e backoff com jitter');

  const migration = await readFile('supabase/migrations/20261118200215_create_fibula_proficiency_foundation.sql', 'utf8');
  const engine = await readFile('src/game/engine.ts', 'utf8');
  const insert = migration.match(/insert\s+into\s+public\.fibula_proficiency_catalog[\s\S]*?values([\s\S]*?);/i)?.[1];
  const union = engine.match(/export\s+type\s+ProficiencyKey\s*=\s*([\s\S]*?);/)?.[1];
  assert.ok(insert, 'INSERT do catálogo SQL não encontrado');
  assert.ok(union, 'união ProficiencyKey não encontrada');
  const sqlKeys = [...insert.matchAll(/\(\s*'([a-z][a-z0-9_]*)'\s*,/g)].map(m => m[1]);
  const tsKeys = [...union.matchAll(/'([a-z][a-z0-9_]*)'/g)].map(m => m[1]);
  const sqlSet = new Set(sqlKeys), tsSet = new Set(tsKeys);
  const diff = { onlySql: [...sqlSet].filter(k => !tsSet.has(k)).sort(), onlyTs: [...tsSet].filter(k => !sqlSet.has(k)).sort(),
    duplicateSql: sqlKeys.filter((k, i) => sqlKeys.indexOf(k) !== i), duplicateTs: tsKeys.filter((k, i) => tsKeys.indexOf(k) !== i) };
  assert.deepEqual(diff, { onlySql: [], onlyTs: [], duplicateSql: [], duplicateTs: [] }, 'Paridade SQL × TypeScript divergente: ' + JSON.stringify(diff));
  const rateLimitMigration = await readFile(
    'supabase/migrations/20261119183000_add_fibula_proficiency_rate_limits.sql',
    'utf8',
  );
  assert.match(rateLimitMigration, /clock_timestamp\(\)/,
    'a janela de frequência deve usar o relógio do servidor');
  assert.match(rateLimitMigration, /pg_advisory_xact_lock/,
    'envios simultâneos da mesma conta devem ser serializados');
  assert.match(rateLimitMigration, /applied_deltas/,
    'o recibo idempotente deve guardar a parcela realmente aplicada');
  assert.match(rateLimitMigration, /interval '60 seconds'/,
    'o rate limit deve usar janela móvel de 60 segundos');
  assert.match(rateLimitMigration, /enable row level security/i,
    'a tabela de rate limit deve manter RLS habilitado');
  assert.match(rateLimitMigration, /revoke all on table public\.fibula_proficiency_rate_limits from public, anon, authenticated/i,
    'o cliente não pode acessar diretamente a tabela de rate limit');
  passed.push('paridade SQL × TypeScript: catálogo e ProficiencyKey');

  const storageUser = user('storage');
  await storage.recordProficiencyEvent(storageUser, { key: 'espada', amount: 2 });
  await storage.recordProficiencyEvents(storageUser, { espada: 3, arco: 4 });
  let counters = await storage.readProficiencyCounters(storageUser);
  assert.deepEqual(Object.fromEntries(counters.map(c => [c.key, c.total])), { arco: 4, espada: 5 });
  await rejectsAsync(() => storage.recordProficiencyEvent(storageUser, { key: 'espada', amount: 0 }), /Evento de proficiência inválido/);
  await rejectsAsync(() => storage.recordProficiencyEvents(storageUser, { espada: 1, arco: -1 }), /Evento de proficiência inválido/);
  assert.deepEqual(Object.fromEntries((await storage.readProficiencyCounters(storageUser)).map(c => [c.key, c.total])), { arco: 4, espada: 5 });
  const singleOverflowUser = user('single-overflow');
  await storage.recordProficiencyEvent(singleOverflowUser, { key: 'espada', amount: Number.MAX_SAFE_INTEGER });
  await rejectsAsync(() => storage.recordProficiencyEvent(singleOverflowUser, { key: 'espada', amount: 1 }), /limite seguro/);
  assert.deepEqual((await storage.readProficiencyCounters(singleOverflowUser)).map(c => [c.key, c.total]), [['espada', Number.MAX_SAFE_INTEGER]]);
  const overflowUser = user('overflow');
  await storage.recordProficiencyEvents(overflowUser, { espada: Number.MAX_SAFE_INTEGER });
  await rejectsAsync(() => storage.recordProficiencyEvents(overflowUser, { espada: 1, arco: 2 }), /limite seguro/);
  counters = await storage.readProficiencyCounters(overflowUser);
  assert.deepEqual(counters.map(c => [c.key, c.total]), [['espada', Number.MAX_SAFE_INTEGER]]);

  const batchUser = user('batch');
  await storage.recordProficiencyEvents(batchUser, { espada: 10005, arco: 3 });
  const first = await storage.prepareProficiencyBatch(batchUser);
  assert.deepEqual(first.deltas, { espada: 10000, arco: 3 });
  await storage.recordProficiencyEvent(batchUser, { key: 'espada', amount: 2 });
  const reused = await storage.prepareProficiencyBatch(batchUser);
  assert.equal(reused.batchId, first.batchId);
  assert.deepEqual(reused.deltas, first.deltas);
  await storage.acknowledgeProficiencyBatch(batchUser, first.batchId);
  counters = await storage.readProficiencyCounters(batchUser);
  const sword = counters.find(c => c.key === 'espada');
  assert.equal(sword.total, 10007);
  assert.equal(sword.syncedTotal, 10000);
  assert.ok(counters.every(c => c.syncedTotal <= c.total));
  const next = await storage.prepareProficiencyBatch(batchUser);
  assert.deepEqual(next.deltas, { espada: 7 });
  await storage.repairPendingProficiencyBatch(batchUser, 'id-incorreto', ['espada']);
  assert.equal((await storage.prepareProficiencyBatch(batchUser)).batchId, next.batchId);
  await storage.repairPendingProficiencyBatch(batchUser, next.batchId, ['espada']);
  assert.equal(await storage.prepareProficiencyBatch(batchUser, { excludeKeys: new Set(['espada']) }), null);

  const repairUser = user('repair');
  await storage.recordProficiencyEvents(repairUser, { espada: 2, arco: 3 });
  const oldBatch = await storage.prepareProficiencyBatch(repairUser);
  await storage.repairPendingProficiencyBatch(repairUser, oldBatch.batchId, ['espada']);
  const repaired = await storage.prepareProficiencyBatch(repairUser);
  assert.notEqual(repaired.batchId, oldBatch.batchId);
  assert.deepEqual(repaired.deltas, { arco: 3 });
  const a = user('account-a'), b = user('account-b');
  await storage.recordProficiencyEvents(a, { espada: 4 });
  await storage.recordProficiencyEvents(b, { arco: 6 });
  assert.deepEqual((await storage.readProficiencyCounters(a)).map(c => c.key), ['espada']);
  assert.deepEqual((await storage.readProficiencyCounters(b)).map(c => c.key), ['arco']);
  assert.deepEqual((await storage.prepareProficiencyBatch(a)).deltas, { espada: 4 });
  assert.deepEqual((await storage.prepareProficiencyBatch(b)).deltas, { arco: 6 });
  const excluded = user('exclude');
  await storage.recordProficiencyEvents(excluded, { espada: 2, arco: 3 });
  assert.deepEqual((await storage.prepareProficiencyBatch(excluded, { excludeKeys: new Set(['espada']) })).deltas, { arco: 3 });
  assert.equal(await storage.prepareProficiencyBatch(user('empty')), null);
  const partialUser = user('partial-rate-limit');
  await storage.recordProficiencyEvent(partialUser, { key: 'espada', amount: 10 });
  const partialBatch = await storage.prepareProficiencyBatch(partialUser);
  const partialComplete = await storage.acknowledgeProficiencyBatch(
    partialUser,
    partialBatch.batchId,
    { espada: 4 },
  );
  assert.equal(partialComplete, false, 'ack parcial deve manter o restante pendente');
  counters = await storage.readProficiencyCounters(partialUser);
  assert.deepEqual(counters.map(c => [c.total, c.syncedTotal]), [[10, 4]],
    'ack parcial deve confirmar somente a quantidade aceita pelo servidor');
  const remainingBatch = await storage.prepareProficiencyBatch(partialUser);
  assert.notEqual(remainingBatch.batchId, partialBatch.batchId,
    'o restante precisa de novo ID para preservar a idempotência do recibo parcial');
  assert.deepEqual(remainingBatch.deltas, { espada: 6 },
    'o restante não pode ser descartado após limite de frequência');
  assert.equal(await storage.acknowledgeProficiencyBatch(
    partialUser,
    remainingBatch.batchId,
    remainingBatch.deltas,
  ), true);
  counters = await storage.readProficiencyCounters(partialUser);
  assert.deepEqual(counters.map(c => [c.total, c.syncedTotal]), [[10, 10]],
    'o progresso acumulado precisa ser integralmente confirmável em lotes posteriores');

  passed.push('IndexedDB: soma, validação, atomicidade, snapshot, ack, reparo, exclusão e isolamento');
  const reconcileUser = user('server-reconcile');
  await storage.recordProficiencyEvents(reconcileUser, { espada: 10 });
  const initialSync = await storage.prepareProficiencyBatch(reconcileUser);
  await storage.acknowledgeProficiencyBatch(reconcileUser, initialSync.batchId);
  await storage.recordProficiencyEvent(reconcileUser, { key: 'espada', amount: 3 });
  await storage.reconcileProficiencyCounters(reconcileUser, { espada: 15, arco: 4 });
  counters = await storage.readProficiencyCounters(reconcileUser);
  assert.deepEqual(Object.fromEntries(counters.map(c => [c.key, [c.total, c.syncedTotal]])), {
    arco: [4, 4], espada: [18, 15],
  }, 'reconciliação deve adotar o servidor e preservar o delta local ainda não enviado');
  assert.deepEqual((await storage.prepareProficiencyBatch(reconcileUser)).deltas, { espada: 3 });
  assert.equal(storage.isProficiencyKey('espada'), true);
  assert.equal(storage.isProficiencyKey('chave_inexistente'), false);
  await rejectsAsync(
    () => storage.reconcileProficiencyCounters(reconcileUser, { espada: Number.MAX_SAFE_INTEGER + 1 }),
    /contador de proficiência inválido/,
  );

  const pendingReconcileUser = user('server-reconcile-pending');
  await storage.recordProficiencyEvent(pendingReconcileUser, { key: 'arco', amount: 2 });
  const pendingReconcileBatch = await storage.prepareProficiencyBatch(pendingReconcileUser);
  await rejectsAsync(
    () => storage.reconcileProficiencyCounters(pendingReconcileUser, { arco: 2 }),
    /lote de proficiências pendente/,
  );
  counters = await storage.readProficiencyCounters(pendingReconcileUser);
  assert.deepEqual(counters.map(c => [c.total, c.syncedTotal]), [[2, 0]],
    'falha de reconciliação não pode descartar lote pendente');
  await storage.acknowledgeProficiencyBatch(pendingReconcileUser, pendingReconcileBatch.batchId);
  await storage.reconcileProficiencyCounters(pendingReconcileUser, { arco: 2 });
  counters = await storage.readProficiencyCounters(pendingReconcileUser);
  assert.deepEqual(counters.map(c => [c.total, c.syncedTotal]), [[2, 2]],
    'reconciliação após confirmação não pode duplicar o lote');
  passed.push('IndexedDB: reconciliação servidor/local, delta offline, validação e proteção contra lote pendente');


  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const bufferedUser = user('buffer'), bufferedUserB = user('buffer-b');
  const buffer = bufferModule.createProficiencyBuffer(() => {});
  buffer.add(bufferedUser, { key: 'espada', amount: 2 });
  buffer.add(bufferedUser, { key: 'espada', amount: 3 });
  buffer.add(bufferedUser, { key: 'arco', amount: 4 });
  buffer.add(bufferedUserB, { key: 'cajado', amount: 6 });
  await buffer.flush();
  counters = await storage.readProficiencyCounters(bufferedUser);
  assert.deepEqual(Object.fromEntries(counters.map(c => [c.key, c.total])), { arco: 4, espada: 5 });
  assert.deepEqual((await storage.readProficiencyCounters(bufferedUserB)).map(c => [c.key, c.total]), [['cajado', 6]]);

  const failedUser = user('buffer-failure');
  let injectNewEvent = true;
  let failureCount = 0;
  let failureBuffer;
  failureBuffer = bufferModule.createProficiencyBuffer(() => {
    failureCount++;
    if (injectNewEvent) {
      injectNewEvent = false;
      failureBuffer.add(failedUser, { key: 'espada', amount: 5 });
    }
  });
  const proto = IDBDatabase.prototype;
  const originalTransaction = proto.transaction;
  proto.transaction = function (...args) {
    if (injectNewEvent) throw new Error('falha sintética de IndexedDB');
    return originalTransaction.apply(this, args);
  };
  failureBuffer.add(failedUser, { key: 'espada', amount: 2 });
  await failureBuffer.flush();
  proto.transaction = originalTransaction;
  await failureBuffer.flush();
  counters = await storage.readProficiencyCounters(failedUser);
  assert.equal(counters.find(c => c.key === 'espada')?.total, 7);
  assert.ok(failureCount > 0);
  await failureBuffer.dispose();
  await buffer.dispose();
  passed.push('buffer: gravação em bloco, falha, restauração e evento novo concorrente');

  const timerUser = user('buffer-timer');
  const timerBuffer = bufferModule.createProficiencyBuffer(() => {});
  const originalWindowSetTimeout = window.setTimeout;
  const originalWindowClearTimeout = window.clearTimeout;
  let scheduledCallback;
  let scheduledDelay;
  window.setTimeout = (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return 9876;
  };
  window.clearTimeout = () => {};
  timerBuffer.add(timerUser, { key: 'espada', amount: 1 });
  assert.equal(scheduledDelay, 1500, 'buffer deve agendar flush em 1500 ms');
  assert.deepEqual(await storage.readProficiencyCounters(timerUser), [], 'buffer não deve gravar antes do timer');
  assert.equal(typeof scheduledCallback, 'function');
  scheduledCallback();
  await timerBuffer.flush();
  assert.deepEqual((await storage.readProficiencyCounters(timerUser)).map(c => [c.key, c.total]), [['espada', 1]]);
  await timerBuffer.dispose();
  window.setTimeout = originalWindowSetTimeout;
  window.clearTimeout = originalWindowClearTimeout;
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
  passed.push('buffer: timer de 1500 ms sem flush antecipado');

  // GameEngine headless: os métodos privados TypeScript permanecem acessíveis
  // como propriedades JavaScript no runtime, permitindo dirigir os caminhos reais.
  const makeEngine = () => new GameEngine(() => {}, {
    seed: 0x12345678,
    headless: true,
    houseInventory: [],
  });
  const damageEngine = makeEngine();
  const damageEvents = [];
  damageEngine.onProficiencyEvent = event => damageEvents.push(event);
  damageEngine.random = () => 0.99;
  damageEngine.getDodgeChance = () => 0;
  damageEngine.obstacleCircles = () => [];
  damageEngine.state.dead = false;
  damageEngine.state.player.hp = 100;
  const damageFeetY = damageEngine.state.player.y + CONFIG.player.footOffset;
  damageEngine.state.enemies = [{
    id: 90001, x: damageEngine.state.player.x, y: damageFeetY,
    hp: 100, hitWait: 0, wobble: 0,
  }];
  damageEngine.moveEnemies(0);
  assert.deepEqual(damageEvents, [{ key: 'golpes_recebidos', amount: 1 }],
    'contato com dano positivo e jogador vivo deve contar exatamente um golpe recebido');

  damageEvents.length = 0;
  damageEngine.state.dead = true;
  damageEngine.state.player.hp = 0;
  damageEngine.state.enemies = [{
    id: 90002, x: damageEngine.state.player.x, y: damageFeetY,
    hp: 100, hitWait: 0, wobble: 0,
  }];
  damageEngine.moveEnemies(0);
  assert.deepEqual(damageEvents, [], 'jogador morto não deve contar golpe recebido');
  damageEngine.stop();
  passed.push('motor headless: golpes recebidos com dano positivo e bloqueio após morte');

  const wolfEngine = makeEngine();
  const wolfEvents = [];
  wolfEngine.onProficiencyEvent = event => wolfEvents.push(event);
  wolfEngine.random = () => 0.99;
  wolfEngine.getDodgeChance = () => 0;
  wolfEngine.obstacleCircles = () => [];
  wolfEngine.state.dead = false;
  wolfEngine.state.player.hp = 100;
  const wolfFeetX = wolfEngine.state.player.x;
  const wolfFeetY = wolfEngine.state.player.y + CONFIG.player.footOffset;
  wolfEngine.state.enemies = [{
    id: 90003,
    x: wolfFeetX,
    y: wolfFeetY,
    hp: 100,
    hitWait: 0,
    animalKind: 'wolf',
    wanderAngle: 0,
  }];
  wolfEngine.moveEnemies(0);
  assert.deepEqual(wolfEvents, [{ key: 'golpes_recebidos', amount: 1 }],
    'contato do lobo com jogador vivo deve contar exatamente um golpe recebido');

  wolfEvents.length = 0;
  wolfEngine.state.dead = true;
  wolfEngine.state.player.hp = 0;
  wolfEngine.state.enemies = [{
    id: 90004,
    x: wolfFeetX,
    y: wolfFeetY,
    hp: 100,
    hitWait: 0,
    animalKind: 'wolf',
    wanderAngle: 0,
  }];
  wolfEngine.moveEnemies(0);
  assert.deepEqual(wolfEvents, [], 'lobo não deve contar golpe recebido após a morte do jogador');
  wolfEngine.stop();
  passed.push('motor headless: contato do lobo conta somente com jogador vivo');

  const cartEngine = makeEngine();
  const cartEvents = [];
  cartEngine.onProficiencyEvent = event => cartEvents.push(event);
  cartEngine.obstacleCircles = () => [];
  cartEngine.lakeCollisionCircles = [];
  cartEngine.lakeAvoidanceCircles = [];
  cartEngine.state.lake = { ...cartEngine.state.lake, x: 0, y: 0, rx: 1, ry: 1 };
  cartEngine.state.player.x = CONFIG.map.size / 2;
  cartEngine.state.player.y = CONFIG.map.size / 2;
  cartEngine.state.player.moving = true;
  const cartFeetY = cartEngine.state.player.y + CONFIG.player.footOffset;
  const resetCartPosition = () => {
    cartEngine.state.cart = {
      ...cartEngine.state.cart,
      x: cartEngine.state.player.x - 200 - CONFIG.donkey.cartDistance,
      y: cartFeetY,
      angle: 0,
      stage: 'built',
      following: true,
      carried: false,
      inventory: [{ itemId: 'wood', quantity: 1 }],
    };
    cartEngine.donkeySpeed = 0;
    cartEngine.donkeyAvoidTimer = 0;
    cartEngine.donkeyStalled = false;
  };
  resetCartPosition();
  let loadedCartPrevious = { x: cartEngine.state.cart.x, y: cartEngine.state.cart.y };
  let loadedCartDistance = 0;
  let loadedCartSteps = 0;
  const maxLoadedCartSteps = 2000;
  while (loadedCartDistance < 600 && loadedCartSteps < maxLoadedCartSteps) {
    cartEngine.updateDonkeyCart(0.25);
    const current = cartEngine.state.cart;
    loadedCartDistance += Math.hypot(current.x - loadedCartPrevious.x, current.y - loadedCartPrevious.y);
    loadedCartPrevious = { x: current.x, y: current.y };
    loadedCartSteps++;
  }
  assert.ok(loadedCartDistance >= 600,
    `carroça carregada não atingiu 600 unidades em ${maxLoadedCartSteps} passos (distância: ${loadedCartDistance})`);
  const loadedCartProficiency = cartEvents
    .filter(event => event.key === 'carroca_distancia')
    .reduce((total, event) => total + event.amount, 0);
  assert.ok(loadedCartProficiency > 0,
    'deslocamento com carga deve acumular proficiência');
  const expectedLoadedCartProficiency = Math.floor(loadedCartDistance / 280);
  assert.ok(Math.abs(loadedCartProficiency - expectedLoadedCartProficiency) <= 1,
    `proficiência da carroça carregada divergente: esperado aproximadamente ${expectedLoadedCartProficiency}, recebido ${loadedCartProficiency} (distância: ${loadedCartDistance})`);

  cartEvents.length = 0;
  resetCartPosition();
  cartEngine.state.cart.inventory = [];
  cartEngine.cartProficiencyDistanceRemainder = 0.75;
  const emptyCartStart = { x: cartEngine.state.cart.x, y: cartEngine.state.cart.y };
  for (let i = 0; i < 30; i++) cartEngine.updateDonkeyCart(0.25);
  assert.ok(Math.hypot(cartEngine.state.cart.x - emptyCartStart.x, cartEngine.state.cart.y - emptyCartStart.y) > 0,
    'carroça vazia também deve percorrer o caminho de movimento');
  assert.deepEqual(cartEvents, [], 'carroça vazia não deve contar distância');
  assert.equal(cartEngine.cartProficiencyDistanceRemainder, 0, 'carroça vazia deve zerar a fração acumulada');
  cartEngine.stop();
  passed.push('motor headless: carroça em movimento com carga e sem carga');

  const mageEngine = makeEngine();
  mageEngine.setClass('mago');
  const mageEvents = [];
  mageEngine.onProficiencyEvent = event => mageEvents.push(event);
  const impactX = mageEngine.state.player.x + 120;
  const impactY = mageEngine.state.player.y;
  mageEngine.state.enemies = [
    { id: 91001, x: impactX, y: impactY, hp: 1000, hitWait: 0, wobble: 0 },
    { id: 91002, x: impactX + 12, y: impactY + 4, hp: 1000, hitWait: 0, wobble: 0 },
    { id: 91003, x: impactX + 20, y: impactY - 5, hp: 1000, hitWait: 0, wobble: 0 },
  ];
  mageEngine.state.shots = [{
    id: 92001,
    x: impactX - 10,
    y: impactY,
    vx: CONFIG.weapons.cajado.projectileSpeed,
    vy: 0,
    damage: 10,
    kind: 'orb',
    life: 1,
    targetId: 91001,
    weapon: 'cajado',
    explosive: true,
  }];
  mageEngine.state.weapon = 'espada'; // troca após o disparo não pode alterar a proficiência do projétil.
  mageEngine.moveShots(0.05);
  assert.deepEqual(mageEvents, [{ key: 'cajado', amount: 1 }],
    'explosão atingindo vários inimigos deve contar somente o alvo principal');
  assert.ok(mageEngine.state.enemies.every(enemy => enemy.hp < 1000),
    'o alvo principal e os alvos na área precisam receber dano da explosão');
  mageEngine.stop();
  passed.push('motor headless: explosão do mago atinge múltiplos alvos e conta um cajado');

  const arrowEngine = makeEngine();
  const arrowEvents = [];
  arrowEngine.onProficiencyEvent = event => arrowEvents.push(event);
  arrowEngine.obstacleCircles = () => [];
  arrowEngine.state.enemies = [
    { id: 93001, x: arrowEngine.state.player.x + 24, y: arrowEngine.state.player.y, hp: 100, hitWait: 0, wobble: 0 },
  ];
  arrowEngine.state.shots = [{
    id: 94001,
    x: arrowEngine.state.player.x,
    y: arrowEngine.state.player.y,
    vx: 500,
    vy: 0,
    damage: 10,
    kind: 'arrow',
    life: 1,
    targetId: 93001,
    weapon: 'arco',
    hitEnemyIds: [],
  }];
  arrowEngine.state.weapon = 'espada';
  arrowEngine.moveShots(0.05);
  assert.deepEqual(arrowEvents, [{ key: 'arco', amount: 1 }],
    'flecha deve contar o arco usado no disparo, mesmo após trocar a arma equipada');
  arrowEngine.stop();
  passed.push('motor headless: projétil mantém a arma original após troca de equipamento');


  console.log('Grupos aprovados:');
  for (const name of passed) console.log(' - ' + name);
  console.log('NÃO testado: dano exatamente zero em golpes_recebidos. O cálculo atual applyArmorToDamage aplica Math.max(1, ...) nos dois ramos de configuração, portanto o motor garante dano mínimo 1; não há estado válido que produza dano 0 para esse caminho sem adulterar a função de dano.');
  console.log('OK: ' + passed.length + ' grupos de testes de proficiências.');
} finally {
  await server.close();
}
