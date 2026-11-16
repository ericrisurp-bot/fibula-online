import assert from 'node:assert/strict';
import { createServer } from 'vite';

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  },
};

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const {
    enqueueSoloMatchResult,
    readSoloMatchResultOutbox,
    flushSoloMatchResultOutbox,
  } = await server.ssrLoadModule('/src/game/persistence.ts');

  const userId = 'user-r1-test';
  const sessionId = 'session-r1-test';
  const result = { kills: 17, survivalNights: 4 };

  assert.equal(enqueueSoloMatchResult(userId, sessionId, result), true);
  assert.equal(enqueueSoloMatchResult(userId, sessionId, result), true,
    'Repetir o mesmo enfileiramento deve ser idempotente.');
  assert.equal(enqueueSoloMatchResult(userId, sessionId, { kills: 18, survivalNights: 4 }), false,
    'Uma sessão não pode receber outro resultado depois de enfileirada.');
  assert.equal(readSoloMatchResultOutbox().length, 1);

  const failed = await flushSoloMatchResultOutbox({
    rpc: async () => { throw new Error('network unavailable'); },
  }, userId);
  assert.equal(failed.pending, 1, 'Falha de rede deve preservar o resultado pendente.');

  const duplicate = await flushSoloMatchResultOutbox({
    rpc: async () => ({ data: 'duplicate', error: null }),
  }, userId);
  assert.equal(duplicate.duplicate, 1);
  assert.equal(duplicate.pending, 0,
    'Resposta duplicate confirma que o resultado já foi processado e pode sair da fila.');

  const secondSession = 'session-r1-accepted';
  assert.equal(enqueueSoloMatchResult(userId, secondSession, result), true);
  const accepted = await flushSoloMatchResultOutbox({
    rpc: async () => ({ data: 'accepted', error: null }),
  }, userId);
  assert.equal(accepted.accepted, 1);
  assert.equal(accepted.pending, 0);

  const rejectedSession = 'session-r1-rejected';
  assert.equal(enqueueSoloMatchResult(userId, rejectedSession, result), true);
  const rejected = await flushSoloMatchResultOutbox({
    rpc: async () => ({ data: 'rejected', error: null }),
  }, userId);
  assert.equal(rejected.rejected, 1);
  assert.equal(rejected.pending, 0);

  console.log('OK: persistência local, idempotência, retry de rede e confirmações accepted/duplicate/rejected.');
} finally {
  await server.close();
}
