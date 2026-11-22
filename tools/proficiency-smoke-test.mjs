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
  const proficiencyLevels = await server.ssrLoadModule('/src/game/proficiencyLevels.ts');
  const integration = await server.ssrLoadModule('/src/game/proficiencyAttributeIntegration.ts');
  const sync = await server.ssrLoadModule('/src/game/proficiencySync.ts');
  const storage = await server.ssrLoadModule('/src/game/proficiencyStorage.ts');
  const bufferModule = await server.ssrLoadModule('/src/game/proficiencyBuffer.ts');
  const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/game/config.ts');

  // Balanceamento versionado: tabelas e marcos exatos de levels-v2-extreme.
  const levelTables = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES;
  assert.equal(levelTables.length, 11, 'devem existir exatamente 11 tabelas de proficiência');
  for (const table of levelTables) {
    progression.validateProficiencyProgressionTable(table);
    assert.equal(table.version, 'levels-v2-extreme');
    assert.equal(table.initialLevel, 0);
    assert.equal(table.milestones[0].totalRequired, 0);
    assert.equal(table.maxLevel, ['espada', 'arco', 'cajado', 'bastao_natureza', 'golpes_recebidos'].includes(table.key) ? 150 : 100);
  }
  const expectedLevelTotals = {
    espada: { 1: 100, 2: 250, 3: 450, 10: 11704, 30: 128263, 50: 347104, 80: 843403, 90: 1050608, 150: 2700000 },
    arco: { 1: 100, 2: 250, 3: 450, 10: 13392, 30: 147438, 50: 399111, 80: 969867, 90: 1208158, 150: 3105000 },
    cajado: { 1: 100, 2: 250, 3: 450, 10: 10803, 30: 118036, 50: 319367, 80: 775956, 90: 966582, 150: 2484000 },
    bastao_natureza: { 1: 100, 2: 250, 3: 450, 10: 10803, 30: 118036, 50: 319367, 80: 775956, 90: 966582, 150: 2484000 },
    golpes_recebidos: { 1: 80, 2: 200, 3: 350, 10: 9728, 30: 106862, 50: 289232, 80: 702819, 90: 875492, 150: 2250000 },
    machado_madeira: { 1: 80, 2: 200, 3: 350, 10: 17967, 30: 200437, 50: 543026, 80: 1319968, 90: 1644341, 100: 2000000 },
    picareta: { 1: 80, 2: 200, 3: 350, 10: 17967, 30: 200437, 50: 543026, 80: 1319968, 90: 1644341, 100: 2000000 },
    foice_mao: { 1: 80, 2: 200, 3: 350, 10: 17967, 30: 200437, 50: 543026, 80: 1319968, 90: 1644341, 100: 2000000 },
    vara_pesca: { 1: 12, 2: 30, 3: 55, 10: 1920, 30: 21239, 50: 57510, 80: 139768, 90: 174110, 100: 211765 },
    faca_esfolar: { 1: 150, 2: 350, 3: 600, 10: 16453, 30: 180650, 50: 488931, 80: 1188068, 90: 1479958, 100: 1800000 },
    carroca_distancia: { 1: 500, 2: 1500, 3: 3000, 10: 7895, 30: 58598, 50: 153794, 80: 369682, 90: 459816, 100: 558643 },
  };
  assert.deepEqual(
    levelTables.map(table => table.key).sort(),
    Object.keys(expectedLevelTotals).sort(),
    'as tabelas devem cobrir todas as chaves, sem duplicatas ou ausências',
  );
  for (const table of levelTables) {
    for (const [level, expectedTotal] of Object.entries(expectedLevelTotals[table.key])) {
      const milestone = table.milestones.find(item => item.level === Number(level));
      assert.equal(milestone?.totalRequired, expectedTotal,
        `${table.key} nível ${level}: totalRequired divergente`);
    }
  }
  assert.equal(proficiencyLevels.getProficiencyProgression('espada', 0).level, 0);
  assert.equal(proficiencyLevels.getProficiencyProgression('espada', 99).level, 0);
  assert.equal(proficiencyLevels.getProficiencyProgression('espada', 100).level, 1);
  assert.equal(proficiencyLevels.getProficiencyProgression('espada', 250).level, 2);
  assert.equal(proficiencyLevels.getProficiencyProgression('espada', 450).level, 3);
  for (const table of levelTables) {
    const maximum = table.milestones[table.milestones.length - 1];
    const atMax = proficiencyLevels.getProficiencyProgression(table.key, maximum.totalRequired);
    assert.equal(atMax.level, table.maxLevel);
    assert.equal(atMax.isMaxLevel, true);
    assert.equal(proficiencyLevels.getProficiencyProgression(
      table.key, maximum.totalRequired + 1000,
    ).isMaxLevel, true);
  }

  // Os níveis obtidos pela curva anterior continuam visíveis após o baseline.
  const legacyConfigs = {
    espada: [14.65, 1.10, 150], arco: [14.65, 1.10, 150],
    cajado: [14.65, 1.10, 150], bastao_natureza: [14.65, 1.10, 150],
    golpes_recebidos: [3.66, 1.10, 150],
    machado_madeira: [10.96, 1.08, 100], picareta: [10.96, 1.08, 100],
    foice_mao: [10.96, 1.08, 100], vara_pesca: [5.48, 1.08, 100],
    faca_esfolar: [1.37, 1.08, 100], carroca_distancia: [13.57, 1.07, 100],
  };
  for (const table of levelTables) {
    const [base, growth, maxLevel] = legacyConfigs[table.key];
    for (const level of [1, 2, 3, 10, 30, 50, 80, 90, maxLevel].filter(value => value <= maxLevel)) {
      const legacyTotal = Math.round(base * (Math.pow(growth, level) - 1) / (growth - 1));
      const preserved = proficiencyLevels.getProficiencyProgression(
        table.key, legacyTotal, { preservedLevel: level, baselineCounter: legacyTotal },
      );
      assert.equal(preserved.level, level, `${table.key}: o baseline deve preservar o nível antigo ${level}`);
    }
  }
  const baselineAtLevelOne = proficiencyLevels.getProficiencyProgression(
    'espada', 16, { preservedLevel: 1, baselineCounter: 15 },
  );
  assert.equal(baselineAtLevelOne.level, 1);
  assert.ok(baselineAtLevelOne.progressRatio > 0);
  const axeSurplus = proficiencyLevels.getProficiencyProgression('machado_madeira', 2001000);
  assert.equal(axeSurplus.level, 100);
  assert.equal(axeSurplus.isMaxLevel, true);
  assert.ok(axeSurplus.surplusAtMaxLevel > 0);
  passed.push('levels-v2-extreme: 11 tabelas, marcos exatos, limites e preservação de níveis antigos');

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

  // Simula uma instalação v3 com progresso local ainda não sincronizado.
  const legacyLocalUser = user('legacy-local');
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('fibula-proficiency-local-v1', 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      const counters = database.createObjectStore('counters', { keyPath: ['userId', 'key'] });
      counters.createIndex('by_user_id', 'userId', { unique: false });
      database.createObjectStore('pending_batches', { keyPath: 'userId' });
      database.createObjectStore('display_baselines', { keyPath: 'userId' });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('counters', 'readwrite');
      transaction.objectStore('counters').put({
        userId: legacyLocalUser, key: 'machado_madeira',
        total: 36, syncedTotal: 0, updatedAt: 1,
      });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
    request.onerror = () => reject(request.error);
  });
  const localLegacyBaselines = await storage.readLocalProficiencyProgressionBaselines(legacyLocalUser);
  assert.deepEqual(localLegacyBaselines.machado_madeira, {
    preservedLevel: 3, baselineCounter: 36,
  }, 'a atualização IndexedDB deve preservar níveis ainda não sincronizados');
  assert.equal(proficiencyLevels.getProficiencyProgression(
    'machado_madeira', 36, localLegacyBaselines.machado_madeira,
  ).level, 3);
  passed.push('IndexedDB v3→v4: preserva níveis locais offline antes da curva extrema');

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
  const multiDeviceUser = user('profile-multi-device');
  await storage.recordProficiencyEvent(multiDeviceUser, { key: 'espada', amount: 80 });
  const confirmedOnThisDevice = await storage.prepareProficiencyBatch(multiDeviceUser);
  await storage.acknowledgeProficiencyBatch(multiDeviceUser, confirmedOnThisDevice.batchId);
  await storage.recordProficiencyEvent(multiDeviceUser, { key: 'espada', amount: 20 });
  const mergedProfile = await storage.readProficiencyProgress(multiDeviceUser, { espada: 90 });
  assert.equal(mergedProfile.espada, 110,
    'o perfil deve somar o progresso local não sincronizado ao total mais recente do servidor');
  assert.equal((await storage.readProficiencyCounters(multiDeviceUser))
    .find(counter => counter.key === 'espada')?.syncedTotal, 80,
  'a leitura do perfil não pode alterar o total local já confirmado');
  passed.push('perfil: combina incremento remoto de outro dispositivo com delta local pendente sem perder progresso');

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

  // Simula seis segundos em passos de 1/60 s para cobrir aproximação, mordida e recuo.
  wolfEngine.state.dead = false;
  wolfEngine.state.player.hp = 100;
  wolfEvents.length = 0;
  wolfEngine.state.enemies = [{
    id: 90005,
    x: wolfFeetX - 160,
    y: wolfFeetY,
    hp: 100,
    hitWait: 0,
    wobble: 0,
    animalKind: 'wolf',
    facingX: 1,
    wanderAngle: 0,
  }];
  const wolfStopDistance = CONFIG.wildlife.wolves.radius + CONFIG.player.footRadius;
  let wolfFacingChanges = 0;
  let previousWolfFacing = wolfEngine.state.enemies[0].facingX;
  let wolfSawRecoil = false;
  const stoppedWolfPositions = [];
  for (let frame = 0; frame < 360; frame++) {
    wolfEngine.moveEnemies(1 / 60);
    const wolf = wolfEngine.state.enemies[0];
    if (wolf.facingX !== previousWolfFacing) wolfFacingChanges++;
    previousWolfFacing = wolf.facingX;
    const distanceToFeet = Math.hypot(wolf.x - wolfFeetX, wolf.y - wolfFeetY);
    const wolfBitesSoFar = wolfEvents.filter(event => event.key === 'golpes_recebidos').length;
    if (wolfBitesSoFar > 0
      && !wolf.moving
      && wolf.hitWait > 0
      && Math.abs(distanceToFeet - wolfStopDistance) <= 1) {
      stoppedWolfPositions.push({ x: wolf.x, y: wolf.y });
    }
    if ((wolf.wolfRecoilRemaining ?? 0) > 0 && wolf.moving) wolfSawRecoil = true;
  }
  const wolfBites = wolfEvents.filter(event => event.key === 'golpes_recebidos').length;
  const wolfDamage = 100 - wolfEngine.state.player.hp;
  const stoppedWolfSpread = stoppedWolfPositions.length
    ? Math.max(...stoppedWolfPositions.map(position => Math.hypot(
      position.x - stoppedWolfPositions[0].x,
      position.y - stoppedWolfPositions[0].y,
    )))
    : Infinity;
  assert.ok(stoppedWolfPositions.length > 0, 'lobo deve parar na distância de mordida durante o cooldown');
  assert.ok(stoppedWolfSpread <= 1, `lobo parado oscilou ${stoppedWolfSpread.toFixed(3)} px`);
  assert.ok(wolfFacingChanges <= 1, `facingX do lobo trocou ${wolfFacingChanges} vezes durante o contato`);
  assert.ok(wolfBites >= 4 && wolfBites <= 6, `esperadas aproximadamente 5 mordidas em 6 s; recebidas ${wolfBites}`);
  assert.equal(wolfDamage, wolfBites * CONFIG.wildlife.wolves.contactDamage,
    'cada mordida sem esquiva/armadura deve aplicar exatamente contactDamage');
  assert.equal(wolfSawRecoil, true, 'deve existir recuo com moving=true entre mordidas');
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
  const maxLoadedCartSteps = 50000;
  while (loadedCartDistance < 2800 && loadedCartSteps < maxLoadedCartSteps) {
    // Simula o jogador caminhando em linha reta; parado, ele alcançaria a
    // distância de parada e a carroça deixaria de acumular deslocamento.
    cartEngine.state.player.x += 1;
    cartEngine.updateDonkeyCart(0.25);
    const current = cartEngine.state.cart;
    loadedCartDistance += Math.hypot(current.x - loadedCartPrevious.x, current.y - loadedCartPrevious.y);
    loadedCartPrevious = { x: current.x, y: current.y };
    loadedCartSteps++;
  }
  assert.ok(loadedCartDistance >= 2800,
    `carroça carregada não atingiu a distância alvo de 2800 unidades em ${maxLoadedCartSteps} passos (distância: ${loadedCartDistance})`);
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
  // C1 — velocidade e alcance do burrinho derivados da proficiência da carroça.
  const cartLevel50Total = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES
    .find(table => table.key === 'carroca_distancia').milestones
    .find(milestone => milestone.level === 50).totalRequired;
  const cartLevel100Total = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES
    .find(table => table.key === 'carroca_distancia').milestones
    .find(milestone => milestone.level === 100).totalRequired;
  const createFollowingCart = (total, playerX = 2160, gap = 200) => {
    const engine = makeEngine();
    engine.setClass('guerreiro');
    engine.setCartProficiencyTotal(total);
    engine.obstacleCircles = () => [];
    engine.lakeCollisionCircles = [];
    engine.lakeAvoidanceCircles = [];
    engine.state.lake = { ...engine.state.lake, x: 0, y: 0, rx: 1, ry: 1 };
    engine.state.player.x = playerX;
    engine.state.player.y = 1000;
    engine.state.player.moving = true;
    const feetY = engine.state.player.y + CONFIG.player.footOffset;
    engine.state.cart = {
      ...engine.state.cart,
      x: playerX - gap - CONFIG.donkey.cartDistance,
      y: feetY,
      angle: 0,
      stage: 'built',
      following: true,
      carried: false,
      inventory: [{ itemId: 'wood', quantity: 1 }],
    };
    engine.donkeySpeed = 0;
    engine.donkeyAvoidTimer = 0;
    engine.donkeyStalled = false;
    return engine;
  };
  const sampleDonkeySpeed = (total) => {
    const engine = createFollowingCart(total);
    const playerSpeed = engine.getPlayerMoveSpeed();
    assert.equal(playerSpeed, CONFIG.player.classSpeed.guerreiro + engine.getLevelStats().speed,
      'getPlayerMoveSpeed deve preservar exatamente a expressão anterior de velocidade do jogador');
    const dt = 0.02;
    let sampleStartX = 0;
    for (let frame = 0; frame < 65; frame++) {
      engine.state.player.x += playerSpeed * dt;
      engine.updateDonkeyCart(dt);
      if (frame === 54) sampleStartX = engine.state.cart.x;
    }
    const measured = (engine.state.cart.x - sampleStartX) / (10 * dt);
    engine.stop();
    return { measured, playerSpeed };
  };
  const level0Speed = sampleDonkeySpeed(0);
  assert.ok(Math.abs(level0Speed.playerSpeed - 145) < 0.01,
    `velocidade base do guerreiro deveria ser 145, recebida ${level0Speed.playerSpeed}`);
  assert.ok(Math.abs(level0Speed.measured - 87) <= 1,
    `burrinho no nível 0 deveria manter 87 px/s, recebeu ${level0Speed.measured}`);
  const level50Speed = sampleDonkeySpeed(cartLevel50Total);
  assert.ok(Math.abs(level50Speed.measured - 145 * 0.85) <= 1,
    `burrinho no nível 50 deveria manter 123.25 px/s, recebeu ${level50Speed.measured}`);
  const level100Speed = sampleDonkeySpeed(cartLevel100Total);
  assert.ok(Math.abs(level100Speed.measured - 145 * 1.10) <= 1,
    `burrinho no nível 100 deveria manter 159.5 px/s, recebeu ${level100Speed.measured}`);

  const invalidTotalEngine = makeEngine();
  invalidTotalEngine.state.cart.inventory = [{ itemId: 'wood', quantity: 1 }];
  invalidTotalEngine.setCartProficiencyTotal(5516);
  for (const invalidTotal of [-1, NaN, 1.5]) {
    invalidTotalEngine.setCartProficiencyTotal(invalidTotal);
    assert.equal(invalidTotalEngine.cartProficiencyTotal, 5516,
      `setCartProficiencyTotal não deve aceitar ${String(invalidTotal)}`);
  }
  invalidTotalEngine.recordCartProficiencyDistance(280);
  assert.equal(invalidTotalEngine.cartProficiencyTotal, 5517,
    'pontos inteiros emitidos pela distância devem incrementar o acumulado do motor');
  assert.equal(invalidTotalEngine.cartProficiencyLevel, 50,
    'o nível em cache deve subir ao cruzar o marco de nível 50 durante a partida');
  invalidTotalEngine.setCartProficiencyTotal(168019);
  assert.equal(invalidTotalEngine.cartProficiencyLevel, 100);
  invalidTotalEngine.setCartProficiencyTotal(0);
  assert.equal(invalidTotalEngine.cartProficiencyLevel, 0);
  invalidTotalEngine.stop();

  const trackingEngine = createFollowingCart(cartLevel100Total, 500, 200);
  const trackingPlayerSpeed = trackingEngine.getPlayerMoveSpeed();
  const trackingDt = 0.02;
  let maximumLevel100Distance = 0;
  const trackingStartCartX = trackingEngine.state.cart.x;
  for (let frame = 0; frame < 1000; frame++) {
    trackingEngine.state.player.x += trackingPlayerSpeed * trackingDt;
    trackingEngine.updateDonkeyCart(trackingDt);
    const donkeyX = trackingEngine.state.cart.x + CONFIG.donkey.cartDistance;
    const distance = Math.abs(trackingEngine.state.player.x - donkeyX);
    maximumLevel100Distance = Math.max(maximumLevel100Distance, distance);
  }
  const finalLevel100Distance = Math.abs(
    trackingEngine.state.player.x - (trackingEngine.state.cart.x + CONFIG.donkey.cartDistance),
  );
  assert.ok(maximumLevel100Distance <= 500,
    `nível 100 excedeu visão 500 px durante 20 s: ${maximumLevel100Distance}`);
  assert.ok(finalLevel100Distance <= 500,
    `nível 100 terminou fora do alcance de visão; distância final ${finalLevel100Distance}`);
  assert.ok(trackingEngine.state.cart.x - trackingStartCartX > 2000,
    'burrinho de nível 100 deve continuar percorrendo o caminho durante os 20 s');
  trackingEngine.stop();

  const legacyTrackingEngine = createFollowingCart(0, 500, 200);
  const legacyPlayerSpeed = legacyTrackingEngine.getPlayerMoveSpeed();
  for (let frame = 0; frame < 1000; frame++) {
    legacyTrackingEngine.state.player.x += legacyPlayerSpeed * trackingDt;
    legacyTrackingEngine.updateDonkeyCart(trackingDt);
  }
  const legacyFinalDistance = Math.abs(
    legacyTrackingEngine.state.player.x
      - (legacyTrackingEngine.state.cart.x + CONFIG.donkey.cartDistance),
  );
  assert.ok(legacyFinalDistance > 300,
    `nível 0 deve registrar o comportamento antigo de perda de alcance; distância final ${legacyFinalDistance}`);
  console.log(`Diagnóstico C1 nível 0: distância final jogador–burrinho em 20 s = ${legacyFinalDistance.toFixed(1)} px.`);
  legacyTrackingEngine.stop();

  const obstacleEngine = createFollowingCart(cartLevel100Total, 1000, 400);
  const obstacle = { x: 700, y: 1000 + CONFIG.player.footOffset, radius: 35 };
  obstacleEngine.obstacleCircles = () => [obstacle];
  const obstaclePlayerSpeed = obstacleEngine.getPlayerMoveSpeed();
  let obstacleClearanceMinimum = Infinity;
  let obstacleWorstPosition = null;
  for (let frame = 0; frame < 500; frame++) {
    obstacleEngine.state.player.x += obstaclePlayerSpeed * trackingDt;
    obstacleEngine.updateDonkeyCart(trackingDt);
    const donkeyAngle = obstacleEngine.state.cart.angle;
    const donkeyX = obstacleEngine.state.cart.x + Math.cos(donkeyAngle) * CONFIG.donkey.cartDistance;
    const donkeyY = obstacleEngine.state.cart.y + Math.sin(donkeyAngle) * CONFIG.donkey.cartDistance;
    const clearance = Math.hypot(donkeyX - obstacle.x, donkeyY - obstacle.y)
      - CONFIG.donkey.collisionRadius - obstacle.radius;
    if (clearance < obstacleClearanceMinimum) {
      obstacleClearanceMinimum = clearance;
      obstacleWorstPosition = { frame, donkeyX, donkeyY, cartX: obstacleEngine.state.cart.x, cartY: obstacleEngine.state.cart.y, angle: obstacleEngine.state.cart.angle, playerX: obstacleEngine.state.player.x };
    }
  }
  assert.ok(obstacleClearanceMinimum >= -0.001,
    `burrinho atravessou o obstáculo: folga mínima ${obstacleClearanceMinimum.toFixed(3)} px; posição ${JSON.stringify(obstacleWorstPosition)}`);
  obstacleEngine.stop();

  passed.push('C1: velocidade por nível, alcance, validação do total, incremento em partida e obstáculo');



  // B1 — bônus de raridade por proficiência, sem consumir RNG no nível 0.
  const b1Engine = makeEngine();
  b1Engine.nightNumber = 30;
  b1Engine.state.nightNumber = 30;
  const b1Total100 = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES
    .find(table => table.key === 'machado_madeira').milestones
    .find(milestone => milestone.level === 100).totalRequired;
  let b1RandomCalls = 0;
  b1Engine.random = () => { b1RandomCalls++; return 0; };
  assert.equal(b1Engine.rollProficiencyRarityBonus('machado_madeira'), undefined);
  assert.equal(b1RandomCalls, 0, 'nível 0 não pode consumir nenhuma chamada de RNG');
  const b1Roll = (chance, band, target, night = 30) => {
    b1Engine.nightNumber = night;
    const values = [chance, band];
    let index = 0;
    b1Engine.random = () => values[index++] ?? 0.999999;
    return b1Engine.rollProficiencyRarityBonus('machado_madeira', target);
  };
  b1Engine.setProficiencyTotal('machado_madeira', 36, {
    preservedLevel: 3, baselineCounter: 36,
  });
  assert.equal(b1Roll(0.00209, 0), 'common',
    'o baseline deve manter o bônus de raridade do nível 3 antigo');
  assert.equal(b1Roll(0.0021, 0), undefined,
    'o baseline preserva o nível, sem alterar o percentual do bônus');
  b1Engine.setProficiencyTotal('machado_madeira', b1Total100);
  assert.equal(b1Roll(0, 0.599999), 'common');
  assert.equal(b1Roll(0, 0.6), 'uncommon');
  assert.equal(b1Roll(0, 0.88), 'rare');
  assert.equal(b1Roll(0, 0.995), 'legendary');
  assert.equal(b1Roll(0.07, 0), undefined, 'chance exatamente 7% deve falhar');
  assert.equal(b1Roll(0, 0, 'rare'), undefined, 'common não pode superar rare');
  assert.equal(b1Roll(0, 0.6, 'rare'), undefined, 'uncommon não pode superar rare');
  assert.equal(b1Roll(0, 0.88, 'rare'), undefined, 'rare não pode superar a própria raridade');
  assert.equal(b1Roll(0, 0.995, 'rare'), 'legendary', 'somente legendary supera rare');
  assert.equal(b1Roll(0, 0, 'legendary'), undefined, 'raridade lendária nunca pode receber bônus');
  assert.equal(b1Roll(0, 0.6, undefined, 1), undefined, 'noite 1 não pode renormalizar uncommon');
  assert.equal(b1Roll(0, 0.88, undefined, 1), undefined, 'noite 1 não pode renormalizar rare');
  assert.equal(b1Roll(0, 0.995, undefined, 1), undefined, 'noite 1 não pode renormalizar legendary');
  assert.equal(b1Roll(0, 0.6, undefined, 8), 'uncommon', 'uncommon fica elegível na noite 8');
  assert.equal(b1Roll(0, 0.88, undefined, 15), 'rare', 'rare fica elegível na noite 15');
  assert.equal(b1Roll(0, 0.995, undefined, 30), 'legendary', 'legendary fica elegível na noite 30');
  b1Engine.stop();
  passed.push('B1: nível 0 sem RNG, chance máxima, faixas fixas, raridade estritamente superior e noites mínimas');

  // B1 — integração dos golpes elegíveis e frequência aproximada das faixas.
  const b1EngineForTool = key => {
    const engine = makeEngine();
    engine.nightNumber = 30;
    engine.state.nightNumber = 30;
    const total = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES
      .find(table => table.key === key).milestones
      .find(milestone => milestone.level === 100).totalRequired;
    engine.setProficiencyTotal(key, total);
    return engine;
  };

  const treeBonusEngine = b1EngineForTool('machado_madeira');
  treeBonusEngine.state.trees = [{ id: 95101, x: 1000, y: 1000, hits: 3, size: 'small' }];
  treeBonusEngine.isPlayerAtTreeShadow = () => true;
  treeBonusEngine.treeBase = tree => ({ x: tree.x, y: tree.y });
  treeBonusEngine.gatherDist = () => 0;
  treeBonusEngine.local.gatheringTimer = 10;
  treeBonusEngine.random = () => 0;
  const treeBonusEvents = [];
  treeBonusEngine.onProficiencyEvent = event => treeBonusEvents.push(event);
  treeBonusEngine.autoGather();
  treeBonusEngine.local.gatheringTimer = 10;
  treeBonusEngine.autoGather();
  assert.equal(treeBonusEngine.state.trees[0].hits, 1, 'cada golpe deve atingir a árvore comum, sem exigir morte');
  assert.equal(treeBonusEngine.state.woodDrops.length, 2, 'dois golpes em árvore viva devem gerar dois bônus');
  assert.ok(treeBonusEngine.state.woodDrops.every(drop => drop.amount === 1 && drop.rarity === 'common'));
  assert.deepEqual(treeBonusEvents, [{ key: 'machado_madeira', amount: 1 }, { key: 'machado_madeira', amount: 1 }],
    'o bônus não pode duplicar a contagem de proficiência por golpe');
  treeBonusEngine.stop();

  const rockBonusEngine = b1EngineForTool('picareta');
  rockBonusEngine.state.rocks = [{ id: 95102, x: 1000, y: 1000, hits: 2, size: 'small', clusterId: 1 }];
  rockBonusEngine.rockFootprintRadius = () => 10;
  rockBonusEngine.random = () => 0;
  rockBonusEngine.recordProficiency('picareta');
  rockBonusEngine.hitRock(95102);
  assert.deepEqual(rockBonusEngine.state.stoneDrops.map(drop => ({ amount: drop.amount, rarity: drop.rarity })),
    [{ amount: 1, rarity: 'common' }], 'picareta deve gerar uma unidade extra por golpe, antes de quebrar a rocha');
  rockBonusEngine.stop();

  const cottonBonusEngine = b1EngineForTool('foice_mao');
  cottonBonusEngine.state.cottonPlants = [{ id: 95103, x: 1000, y: 1000, hits: 1, size: 'small' }];
  cottonBonusEngine.cottonFootprintRadius = () => 10;
  let cottonRollIndex = 0;
  cottonBonusEngine.random = () => [0, 0, 0.999][cottonRollIndex++] ?? 0.999;
  cottonBonusEngine.recordProficiency('foice_mao');
  cottonBonusEngine.hitCottonPlant(95103);
  assert.equal(cottonBonusEngine.state.cottonDrops.length, 2, 'algodão deve manter o bônus de proficiência e garantir uma unidade ao concluir a coleta');
  assert.equal(cottonBonusEngine.state.cottonDrops[0].rarity, 'common');
  cottonBonusEngine.stop();

  const vegetableBonusEngine = b1EngineForTool('foice_mao');
  vegetableBonusEngine.state.vegetablePlants = [{ id: 95104, x: 1000, y: 1000, hits: 1, size: 'small', kind: 'tomato' }];
  vegetableBonusEngine.vegetableFootprintRadius = () => 10;
  let vegetableRollIndex = 0;
  vegetableBonusEngine.random = () => [0, 0, 0.999][vegetableRollIndex++] ?? 0.999;
  vegetableBonusEngine.recordProficiency('foice_mao');
  vegetableBonusEngine.hitVegetable(95104);
  assert.deepEqual(vegetableBonusEngine.state.vegetableDrops.map(drop => ({ kind: drop.kind, rarity: drop.rarity })),
    [{ kind: 'tomato', rarity: 'common' }, { kind: 'tomato', rarity: undefined }], 'vegetal deve preservar o bônus de proficiência e garantir uma unidade ao concluir a coleta');
  vegetableBonusEngine.stop();

  for (const [animalKind, expectedDrop, choiceRoll] of [
    ['wolf', 'wolf_hide', 0.1],
    ['chicken', 'chicken_meat', 0.9],
  ]) {
    const knifeBonusEngine = b1EngineForTool('faca_esfolar');
    knifeBonusEngine.state.enemies = [{
      id: animalKind === 'wolf' ? 95105 : 95106,
      x: knifeBonusEngine.state.player.x + 10,
      y: knifeBonusEngine.state.player.y,
      hp: 10, hitWait: 0, wobble: 0, animalKind, hits: 0,
    }];
    knifeBonusEngine.arrowHitsSolidObstacle = () => false;
    let knifeRollIndex = 0;
    knifeBonusEngine.random = () => [0, 0, choiceRoll][knifeRollIndex++] ?? 0.999;
    const knifeEvents = [];
    knifeBonusEngine.onProficiencyEvent = event => knifeEvents.push(event);
    knifeBonusEngine.autoKnife();
    assert.equal(knifeBonusEngine.state.wildlifeDrops.length, 1, `faca deve gerar bônus para ${animalKind}`);
    assert.equal(knifeBonusEngine.state.wildlifeDrops[0].kind, expectedDrop);
    assert.equal(knifeBonusEngine.state.wildlifeDrops[0].amount, 1);
    assert.equal(knifeBonusEngine.state.wildlifeDrops[0].rarity, 'common');
    assert.deepEqual(knifeEvents, [{ key: 'faca_esfolar', amount: 1 }],
      'golpe de faca continua contando exatamente um ponto');
    knifeBonusEngine.stop();
  }

  const jabuticabaBonusEngine = b1EngineForTool('machado_madeira');
  jabuticabaBonusEngine.state.trees = [];
  jabuticabaBonusEngine.state.rocks = [];
  jabuticabaBonusEngine.state.cottonPlants = [];
  jabuticabaBonusEngine.state.vegetablePlants = [];
  jabuticabaBonusEngine.state.enemies = [];
  jabuticabaBonusEngine.state.jabuticabaTree = { id: 95107, x: 1000, y: 1000, hits: 1 };
  jabuticabaBonusEngine.gatherDist = () => 0;
  jabuticabaBonusEngine.local.gatheringTimer = 10;
  jabuticabaBonusEngine.random = () => 0.999;
  jabuticabaBonusEngine.autoGather();
  assert.deepEqual(jabuticabaBonusEngine.state.woodDrops, [],
    'tronco de jabuticaba não pode receber bônus de proficiência');
  assert.equal(jabuticabaBonusEngine.state.jabuticabaDrops.length, 1,
    'jabuticabeira deve garantir uma fruta ao concluir a colheita');
  jabuticabaBonusEngine.stop();

  const frequencyEngine = b1EngineForTool('machado_madeira');
  let frequencySeed = 0x12345678;
  frequencyEngine.random = () => {
    frequencySeed = (Math.imul(frequencySeed, 1664525) + 1013904223) >>> 0;
    return frequencySeed / 0x1_0000_0000;
  };
  const frequencyCounts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  const frequencyTrials = 200000;
  for (let i = 0; i < frequencyTrials; i++) {
    const rarity = frequencyEngine.rollProficiencyRarityBonus('machado_madeira');
    if (rarity) frequencyCounts[rarity]++;
  }
  assert.ok(frequencyCounts.common >= 7800 && frequencyCounts.common <= 9000,
    `common fora da faixa esperada: ${frequencyCounts.common}/${frequencyTrials}`);
  assert.ok(frequencyCounts.uncommon >= 3200 && frequencyCounts.uncommon <= 4600,
    `uncommon fora da faixa esperada: ${frequencyCounts.uncommon}/${frequencyTrials}`);
  assert.ok(frequencyCounts.rare >= 1100 && frequencyCounts.rare <= 2100,
    `rare fora da faixa esperada: ${frequencyCounts.rare}/${frequencyTrials}`);
  assert.ok(frequencyCounts.legendary >= 25 && frequencyCounts.legendary <= 120,
    `legendary fora da faixa esperada: ${frequencyCounts.legendary}/${frequencyTrials}`);
  frequencyEngine.stop();
  passed.push('B1: integração de árvore/rocha/algodão/vegetal/lobo/galinha, exclusão de jabuticaba e frequência simulada');

  // R2 — raridade da fauna usa as mesmas regras cumulativas dos recursos.
  const wildlifeRarityEngine = makeEngine();
  const wildlifeRarityRoll = (night, roll) => {
    wildlifeRarityEngine.nightNumber = night;
    wildlifeRarityEngine.state.nightNumber = night;
    wildlifeRarityEngine.random = () => roll;
    return wildlifeRarityEngine.rollWildlifeRarity();
  };
  for (const [roll, expected] of [
    [0.0005, 'common'],
    [0.0015, 'uncommon'],
    [0.0018, 'rare'],
    [0.0022, 'legendary'],
    [0.0025, undefined],
  ]) {
    assert.equal(wildlifeRarityRoll(30, roll), expected,
      `noite 30, roll ${roll}: raridade de fauna divergente`);
  }
  assert.equal(wildlifeRarityRoll(1, 0.0005), 'common',
    'noite 1 deve permitir common');
  assert.equal(wildlifeRarityRoll(1, 0.0015), undefined,
    'noite 1 não deve permitir uncommon antes da noite 8');
  assert.equal(wildlifeRarityRoll(8, 0.0015), 'uncommon',
    'noite 8 deve permitir uncommon');
  assert.equal(wildlifeRarityRoll(15, 0.0018), 'rare',
    'noite 15 deve permitir rare');
  assert.equal(wildlifeRarityRoll(30, 0.0022), 'legendary',
    'noite 30 deve permitir legendary');

  // Regressão: reproduz literalmente os algoritmos anteriores de recursos e vegetais.
  const oldResourceRarity = (size, mediumMineral, night, roll) => {
    if (size === 'small' || (size === 'medium' && !mediumMineral)) return undefined;
    const rules = [
      ['common', { chancePercent: 0.09, minNight: 1 }],
      ['uncommon', { chancePercent: 0.07, minNight: 8 }],
      ['rare', { chancePercent: 0.05, minNight: 15 }],
      ['legendary', { chancePercent: 0.02, minNight: 30 }],
    ];
    let remaining = roll;
    for (const [rarity, rule] of rules) {
      if (size === 'medium' && rarity !== 'common' && rarity !== 'uncommon') continue;
      if (night < rule.minNight) continue;
      remaining -= rule.chancePercent / 100;
      if (remaining < 0) return rarity;
    }
    return undefined;
  };
  const oldVegetableRarity = (night, roll) => {
    const rules = [
      ['common', { chancePercent: 0.18, minNight: 1 }],
      ['uncommon', { chancePercent: 0.16, minNight: 8 }],
      ['rare', { chancePercent: 0.15, minNight: 15 }],
      ['legendary', { chancePercent: 0.12, minNight: 30 }],
    ];
    const eligible = rules.filter(([, rule]) => night >= rule.minNight);
    for (const [rarity, rule] of eligible) if (roll < rule.chancePercent / 100) return rarity;
    return undefined;
  };
  for (const [night, roll] of [[1, 0.0005], [8, 0.0015], [15, 0.0018], [30, 0.0022], [30, 0.5]]) {
    wildlifeRarityEngine.nightNumber = night;
    wildlifeRarityEngine.state.nightNumber = night;
    wildlifeRarityEngine.random = () => roll;
    assert.equal(wildlifeRarityEngine.rollResourceRarity('large'), oldResourceRarity('large', false, night, roll),
      `rollResourceRarity large mudou na noite ${night}, roll ${roll}`);
    assert.equal(wildlifeRarityEngine.vegetableRarity(), oldVegetableRarity(night, roll),
      `vegetableRarity mudou na noite ${night}, roll ${roll}`);
  }
  wildlifeRarityEngine.stop();

  // Integração: lobo e galinha recebem rare no nascimento e preservam a raridade no drop.
  for (const kind of ['wolf', 'chicken']) {
    const animalEngine = makeEngine();
    animalEngine.nightNumber = 30;
    animalEngine.state.nightNumber = 30;
    animalEngine.state.enemies = [];
    animalEngine.validWildlifePosition = () => true;
    let randomCalls = 0;
    animalEngine.random = () => {
      randomCalls += 1;
      return randomCalls === 6 ? 0.0018 : 0.5;
    };
    assert.equal(animalEngine.spawnWildlifeGroup(kind, 1), 1,
      `deve nascer um ${kind} no teste de integração`);
    const animal = animalEngine.state.enemies.find(enemy => enemy.animalKind === kind);
    assert.ok(animal, `${kind} deve estar presente no estado`);
    assert.equal(animal.rarity, 'rare', `${kind} deve nascer com raridade rare`);
    animalEngine.random = () => 0.5;
    animalEngine.killEnemy(animal.id);
    const expectedDrop = kind === 'wolf' ? 'wolf_hide' : 'feather';
    const drop = animalEngine.state.wildlifeDrops.find(item => item.kind === expectedDrop);
    assert.ok(drop, `o abate de ${kind} deve produzir ${expectedDrop}`);
    assert.equal(drop.rarity, 'rare', `o drop ${expectedDrop} deve herdar rare do animal`);
    animalEngine.stop();
  }
  passed.push('R2: raridade cumulativa da fauna, noites mínimas, regressão de recursos/vegetais e drops herdados');

  const swordEngine = makeEngine();
  swordEngine.setClass('guerreiro');
  const swordEvents = [];
  swordEngine.onProficiencyEvent = event => swordEvents.push(event);
  swordEngine.state.enemies = [
    { id: 92501, x: swordEngine.state.player.x + 30, y: swordEngine.state.player.y, hp: 10000, hitWait: 0, wobble: 0 },
    { id: 92502, x: swordEngine.state.player.x + 42, y: swordEngine.state.player.y + 5, hp: 10000, hitWait: 0, wobble: 0 },
    { id: 92503, x: swordEngine.state.player.x + 46, y: swordEngine.state.player.y - 6, hp: 10000, hitWait: 0, wobble: 0 },
  ];
  swordEngine.local.attackTimer = 10;
  swordEngine.autoAttack();
  assert.deepEqual(swordEvents, [{ key: 'espada', amount: 1 }],
    'um golpe de espada que atinge vários inimigos deve contar exatamente um ponto');
  assert.ok(swordEngine.state.enemies.every(enemy => enemy.hp < 10000),
    'todos os inimigos atingidos pelo leque devem continuar recebendo dano');
  assert.equal(swordEngine.state.enemies.length, 3,
    'os três alvos de teste devem permanecer disponíveis para verificar o dano');
  swordEngine.stop();
  passed.push('motor headless: golpe de espada atinge três alvos e conta um ponto');

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
  arrowEngine.setClass('arqueiro');
  const arrowEvents = [];
  arrowEngine.onProficiencyEvent = event => arrowEvents.push(event);
  arrowEngine.obstacleCircles = () => [];
  arrowEngine.state.enemies = [
    { id: 93001, x: arrowEngine.state.player.x + 24, y: arrowEngine.state.player.y, hp: 100, hitWait: 0, wobble: 0 },
    { id: 93002, x: arrowEngine.state.player.x + 54, y: arrowEngine.state.player.y, hp: 100, hitWait: 0, wobble: 0 },
    { id: 93003, x: arrowEngine.state.player.x + 84, y: arrowEngine.state.player.y, hp: 100, hitWait: 0, wobble: 0 },
  ];
  arrowEngine.state.shots = [{
    id: 94001,
    x: arrowEngine.state.player.x,
    y: arrowEngine.state.player.y,
    vx: CONFIG.weapons.arco.projectileSpeed,
    vy: 0,
    damage: 10,
    kind: 'arrow',
    life: 1,
    targetId: 93001,
    weapon: 'arco',
    hitEnemyIds: [],
  }];
  const arrowDamageFactors = [...CONFIG.archerPierce.damageFactors];
  const arrowShot = arrowEngine.state.shots[0];
  for (let frame = 0; frame < 12 && arrowEngine.state.shots.length > 0; frame++) {
    arrowEngine.moveShots(0.05);
  }
  assert.deepEqual(arrowEvents, [{ key: 'arco', amount: 1 }],
    'uma flecha que atravessa três inimigos deve contar exatamente um ponto de arco');
  assert.equal(arrowShot.hitEnemyIds.length, 3,
    'a flecha deve atravessar os três alvos antes de encerrar');
  for (let i = 0; i < 3; i++) {
    const expectedDamage = 10 * arrowDamageFactors[i] * (1 + arrowEngine.getDayNightState().vulnerability);
    assert.ok(Math.abs(100 - arrowEngine.state.enemies[i].hp - expectedDamage) < 0.001,
      `alvo ${i + 1} deve receber o dano perfurante atual (${expectedDamage})`);
  }
  arrowEngine.stop();
  passed.push('motor headless: flecha atravessa três alvos, aplica fatores atuais e conta um arco');


  // B2 — bônus de espécie na pesca, limitado ao lago atual e escalado pela vara.
  const b2Engine = makeEngine();
  const b2Total100 = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES
    .find(table => table.key === 'vara_pesca').milestones
    .find(milestone => milestone.level === 100).totalRequired;
  const b2Total50 = proficiencyLevels.PROFICIENCY_PROGRESSION_TABLES
    .find(table => table.key === 'vara_pesca').milestones
    .find(milestone => milestone.level === 50).totalRequired;
  let b2RandomCalls = 0;
  b2Engine.random = () => { b2RandomCalls++; return 0; };
  assert.equal(b2Engine.rollFishingSpeciesBonus(), undefined);
  assert.equal(b2RandomCalls, 0, 'vara no nível 0 não pode consumir RNG para o bônus');
  const b2RollAt50 = (chance, selection, normalFish, lakeSize = 'large') => {
    b2Engine.state.lake = { ...b2Engine.state.lake, size: lakeSize };
    const values = [chance, selection];
    let index = 0;
    b2Engine.random = () => values[index++] ?? 0.999999;
    return b2Engine.rollFishingSpeciesBonus(normalFish);
  };
  b2Engine.setProficiencyTotal('vara_pesca', 18, {
    preservedLevel: 3, baselineCounter: 18,
  });
  assert.equal(b2RollAt50(0.00089, 0, 'tilapia'), 'tambaqui',
    'o baseline deve manter o bônus de espécie do nível 3 antigo');
  assert.equal(b2RollAt50(0.0009, 0, 'tilapia'), undefined,
    'o baseline não altera a chance proporcional da vara');
  b2Engine.setProficiencyTotal('vara_pesca', b2Total50);
  assert.equal(b2RollAt50(0.014999, 0, 'tilapia'), 'tambaqui',
    'nível 50 deve aplicar chance máxima proporcional de 1,5%');
  assert.equal(b2RollAt50(0.015, 0, 'tilapia'), undefined,
    'chance exatamente 1,5% deve falhar no nível 50');
  b2Engine.setProficiencyTotal('vara_pesca', b2Total100);
  const b2Roll = (chance, selection, normalFish, lakeSize = 'large') => {
    b2Engine.state.lake = { ...b2Engine.state.lake, size: lakeSize };
    const values = [chance, selection];
    let index = 0;
    b2Engine.random = () => values[index++] ?? 0.999999;
    return b2Engine.rollFishingSpeciesBonus(normalFish);
  };
  assert.deepEqual([
    b2Roll(0, 0.1, 'tilapia'),
    b2Roll(0, 0.5, 'tilapia'),
    b2Roll(0, 0.85, 'tilapia'),
    b2Roll(0, 0.97, 'tilapia'),
  ], ['tambaqui', 'pintado_surubim', 'lambari', 'tucunare'],
  'lago grande com normal=tilápia deve permitir as quatro espécies elegíveis');
  assert.deepEqual([
    b2Roll(0, 0.1, 'tambaqui'),
    b2Roll(0, 0.7, 'tambaqui'),
    b2Roll(0, 0.95, 'tambaqui'),
  ], ['pintado_surubim', 'lambari', 'tucunare'],
  'normal=tambaqui deve permitir somente espécies posteriores');
  assert.deepEqual([
    b2Roll(0, 0.1, 'pintado_surubim'),
    b2Roll(0, 0.8, 'pintado_surubim'),
  ], ['lambari', 'tucunare'],
  'normal=pintado deve permitir somente lambari e tucunaré');
  assert.equal(b2Roll(0, 0.5, 'lambari'), 'tucunare',
    'normal=lambari deve permitir somente tucunaré');
  assert.equal(b2Roll(0, 0.5, 'tucunare'), undefined,
    'normal=tucunaré não pode receber bônus');
  assert.deepEqual([
    b2Roll(0, 0.1, undefined),
    b2Roll(0, 0.5, undefined),
    b2Roll(0, 0.85, undefined),
    b2Roll(0, 0.97, undefined),
  ], ['tambaqui', 'pintado_surubim', 'lambari', 'tucunare'],
  'sem peixe normal, todas as quatro espécies de índice >= 1 ficam elegíveis');
  assert.deepEqual([
    b2Roll(0, 0.5, 'tilapia', 'small'),
    b2Roll(0, 0.5, 'tilapia', 'medium'),
    b2Roll(0, 0.9, 'tilapia', 'medium'),
  ], ['tambaqui', 'tambaqui', 'pintado_surubim'],
  'lago pequeno só permite tambaqui; lago médio permite tambaqui e pintado');
  assert.equal(b2Roll(0, 0.999, 'tilapia', 'small'), 'tambaqui');
  assert.equal(b2Roll(0, 0.999, 'tilapia', 'medium'), 'pintado_surubim');
  assert.equal(b2Roll(0.03, 0, 'tilapia'), undefined,
    'chance exatamente 3% deve falhar no nível 100');
  assert.equal(b2Roll(0.029999, 0, 'tilapia'), 'tambaqui',
    'chance imediatamente abaixo de 3% deve permitir o bônus');

  // Fronteiras exatas da seleção proporcional: pesos 0,8 / 0,6 / 0,3 / 0,1.
  const b2LargeThresholds = 0.8 + 0.6 + 0.3 + 0.1;
  assert.equal(b2Roll(0, 0, 'tilapia'), 'tambaqui');
  assert.equal(b2Roll(0, 0.8 / b2LargeThresholds, 'tilapia'), 'pintado_surubim');
  assert.equal(b2Roll(0, 1.4 / b2LargeThresholds, 'tilapia'), 'lambari');
  assert.equal(b2Roll(0, 1.7 / b2LargeThresholds, 'tilapia'), 'tucunare');
  assert.equal(b2Roll(0, 0.999999, 'tilapia'), 'tucunare');

  // Simulação determinística: frequência total próxima de 3% e distribuição entre as quatro espécies.
  const b2Simulate = (lakeSize, attempts, seed) => {
    b2Engine.state.lake = { ...b2Engine.state.lake, size: lakeSize };
    let randomState = seed >>> 0;
    b2Engine.random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x100000000;
    };
    const counts = { tambaqui: 0, pintado_surubim: 0, lambari: 0, tucunare: 0 };
    for (let i = 0; i < attempts; i++) {
      const fish = b2Engine.rollFishingSpeciesBonus();
      if (fish) counts[fish]++;
    }
    return counts;
  };
  const b2LargeCounts = b2Simulate('large', 200000, 0xB202611);
  const b2LargeTotal = Object.values(b2LargeCounts).reduce((sum, count) => sum + count, 0);
  assert.ok(Math.abs(b2LargeTotal / 200000 - 0.03) < 0.0015,
    `frequência total do bônus no lago grande deve ficar próxima de 3%; recebida ${b2LargeTotal / 200000}`);
  assert.ok(Object.values(b2LargeCounts).every(count => count > 0),
    'simulação no lago grande deve produzir tambaqui, pintado, lambari e tucunaré');
  const b2ExpectedShares = {
    tambaqui: 0.8 / 1.8,
    pintado_surubim: 0.6 / 1.8,
    lambari: 0.3 / 1.8,
    tucunare: 0.1 / 1.8,
  };
  for (const [fish, expectedShare] of Object.entries(b2ExpectedShares)) {
    assert.ok(Math.abs(b2LargeCounts[fish] / b2LargeTotal - expectedShare) < 0.025,
      `proporção de ${fish} deve seguir chancePercent renormalizado`);
  }
  const b2SmallCounts = b2Simulate('small', 200000, 0xB202612);
  assert.ok(b2SmallCounts.tambaqui > 0, 'simulação no lago pequeno deve produzir tambaqui');
  assert.equal(b2SmallCounts.pintado_surubim + b2SmallCounts.lambari + b2SmallCounts.tucunare, 0,
    'ignorar fishByLakeSize e usar a lista grande no lago pequeno deve quebrar este teste');

  // Integração real de updateFishing: proficiência, bônus extra e mochila cheia.
  const b2DeliveryEngine = makeEngine();
  b2DeliveryEngine.setProficiencyTotal('vara_pesca', b2Total100);
  b2DeliveryEngine.state.lake = {
    ...b2DeliveryEngine.state.lake, x: 1000, y: 1000, rx: 120, ry: 85, size: 'large',
  };
  b2DeliveryEngine.state.player.x = 1000;
  b2DeliveryEngine.state.player.y = 1000 + 85 + 10 - CONFIG.player.footOffset;
  b2DeliveryEngine.state.player.moving = false;
  b2DeliveryEngine.state.cart.carried = false;
  b2DeliveryEngine.state.enemies = [];
  b2DeliveryEngine.state.inventory = [
    { itemId: 'wood', quantity: 1 },
    { itemId: 'stone', quantity: 1 },
    { itemId: 'cotton', quantity: 1 },
  ];
  b2DeliveryEngine.fishingTimer = 6.99;
  const b2DeliveryValues = [0.99, 0, 0.999999, 0.5, 0.5];
  let b2DeliveryIndex = 0;
  b2DeliveryEngine.random = () => b2DeliveryValues[b2DeliveryIndex++] ?? 0.5;
  const b2DeliveryEvents = [];
  b2DeliveryEngine.onProficiencyEvent = event => b2DeliveryEvents.push(event);
  b2DeliveryEngine.updateFishing(0.02);
  assert.deepEqual(b2DeliveryEvents, [{ key: 'vara_pesca', amount: 1 }],
    'a puxada que gera bônus deve contar exatamente uma proficiência de vara');
  const b2BonusDrops = b2DeliveryEngine.state.wildlifeDrops.filter(drop => drop.kind === 'tucunare');
  assert.equal(b2BonusDrops.length, 1, 'o bônus deve adicionar exatamente um peixe extra');
  assert.equal(b2BonusDrops[0].lifetime, CONFIG.lake.fishDropLifetime,
    'peixe bônus fora da mochila deve respeitar fishDropLifetime');
  assert.ok(b2DeliveryEngine.state.floatingDamage.some(label => label.label === 'Mochila cheia'),
    'peixe bônus com mochila cheia deve exibir o aviso atual');
  b2DeliveryEngine.stop();
  b2Engine.stop();
  passed.push('B2: bônus de espécie escalado pela vara, elegibilidade por lago/índice, pesos proporcionais, mochila cheia e simulações');

  console.log('Grupos aprovados:');
  for (const name of passed) console.log(' - ' + name);
  console.log('NÃO testado: dano exatamente zero em golpes_recebidos. O cálculo atual applyArmorToDamage aplica Math.max(1, ...) nos dois ramos de configuração, portanto o motor garante dano mínimo 1; não há estado válido que produza dano 0 para esse caminho sem adulterar a função de dano.');
  console.log('OK: ' + passed.length + ' grupos de testes de proficiências.');
} finally {
  await server.close();
}
