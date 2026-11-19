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
  rejects(() => resolve('guerreiro', [reward('dup'), reward('dup')]), /ID de recompensa duplicado/);
  rejects(() => resolve('guerreiro', [], [fixture, fixture]), /Progressão de proficiência duplicada/);
  assert.deepEqual(resolve('guerreiro', [reward('no-table')], []), []);
  const contribution = resolve('guerreiro', [reward('versioned')])[0];
  assert.equal(contribution.rewardVersion, 'reward-fixture-v2');
  assert.equal(contribution.proficiencyTableVersion, 'fixture-v1');
  passed.push('ponte de atributos: enabled, escopos, ATTRIBUTE_USAGE, duplicatas e versões');

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
  const delays = Array.from({ length: 10 }, (_, i) => sync.nextProficiencyBackoffMs(i + 1));
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] > delays[i - 1]);
  for (const n of [0, -1, NaN, Infinity, 1, 2, 10, 1000]) {
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
  assert.equal(await storage.prepareProficiencyBatch(batchUser), null);

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
  passed.push('IndexedDB: soma, validação, atomicidade, snapshot, ack, reparo, exclusão e isolamento');

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
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
  passed.push('buffer: gravação em bloco, falha, restauração e evento novo concorrente');

  console.log('Grupos aprovados:');
  for (const name of passed) console.log(' - ' + name);
  console.log('NÃO testado: motor headless — golpes_recebidos com dano zero/jogador morto, carroça vazia/carregada e explosão do mago. Os três cenários dependem de trajetórias de colisão/projétil e estado interno de simulação; não foi possível garantir acionamento determinístico pela API pública sem alterar src/.');
  console.log('OK: ' + passed.length + ' grupos de testes de proficiências.');
} finally {
  await server.close();
}
