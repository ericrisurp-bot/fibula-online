import type { ProficiencyEvent, ProficiencyKey } from './engine';

export type ProficiencyCounter = {
  userId: string;
  key: ProficiencyKey;
  total: number;
  syncedTotal: number;
  updatedAt: number;
};

const DATABASE_NAME = 'fibula-proficiency-local-v1';
const DATABASE_VERSION = 2;
const STORE_NAME = 'counters';
const USER_INDEX = 'by_user_id';
const PENDING_BATCH_STORE = 'pending_batches';

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB não está disponível neste ambiente.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: ['userId', 'key'] });
        store.createIndex(USER_INDEX, 'userId', { unique: false });
      }
      if (!database.objectStoreNames.contains(PENDING_BATCH_STORE)) {
        database.createObjectStore(PENDING_BATCH_STORE, { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        databasePromise = null;
        database.close();
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Não foi possível abrir o armazenamento local de proficiências.'));
    };

    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('A atualização do armazenamento local de proficiências está bloqueada por outra aba.'));
    };
  });

  return databasePromise;
}

/**
 * Soma um evento validado pelo motor em uma transação IndexedDB atômica.
 * Os contadores são separados pelo ID da conta Arena e nunca são enviados à rede.
 */
export async function recordProficiencyEvent(userId: string, event: ProficiencyEvent): Promise<void> {
  if (!userId.trim()) throw new Error('Não é possível salvar proficiência sem uma conta identificada.');
  if (!event || typeof event.key !== 'string'
    || !Number.isSafeInteger(event.amount) || event.amount <= 0) {
    throw new Error('Evento de proficiência inválido.');
  }

  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get([userId, event.key]);
    let failure: Error | null = null;

    request.onsuccess = () => {
      const current = request.result as ProficiencyCounter | undefined;
      const nextTotal = (current?.total ?? 0) + event.amount;
      if (!Number.isSafeInteger(nextTotal)) {
        failure = new Error('O contador local de proficiência excedeu o limite seguro.');
        transaction.abort();
        return;
      }

      const next: ProficiencyCounter = {
        userId,
        key: event.key,
        total: nextTotal,
        syncedTotal: current?.syncedTotal ?? 0,
        updatedAt: Date.now(),
      };
      store.put(next);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('Falha ao gravar proficiência local.'));
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Gravação local de proficiência cancelada.'));
  });
}

/** Lê os totais locais de uma única conta, sem acessar dados de outras contas do dispositivo. */
export async function readProficiencyCounters(userId: string): Promise<ProficiencyCounter[]> {
  if (!userId.trim()) return [];
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).index(USER_INDEX).getAll(userId);
    let counters: ProficiencyCounter[] = [];
    request.onsuccess = () => {
      counters = (request.result as ProficiencyCounter[])
        .filter(counter => counter.userId === userId)
        .sort((a, b) => a.key.localeCompare(b.key));
    };
    request.onerror = () => reject(request.error ?? new Error('Não foi possível ler as proficiências locais.'));
    transaction.oncomplete = () => resolve(counters);
    transaction.onabort = () => reject(transaction.error ?? new Error('Leitura das proficiências locais cancelada.'));
  });
}


export type PendingProficiencyBatch = {
  userId: string;
  batchId: string;
  deltas: Partial<Record<ProficiencyKey, number>>;
  createdAt: number;
};

/**
 * Cria ou recupera o único lote pendente da conta. O snapshot e o recibo local
 * são gravados na mesma transação, antes de qualquer envio à rede.
 */
export async function prepareProficiencyBatch(
  userId: string,
  options: { excludeKeys?: ReadonlySet<ProficiencyKey> } = {},
): Promise<PendingProficiencyBatch | null> {
  if (!userId.trim()) return null;
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, PENDING_BATCH_STORE], 'readwrite');
    const countersStore = transaction.objectStore(STORE_NAME);
    const batchesStore = transaction.objectStore(PENDING_BATCH_STORE);
    let batch: PendingProficiencyBatch | null = null;
    const pendingRequest = batchesStore.get(userId);

    pendingRequest.onsuccess = () => {
      const pending = pendingRequest.result as PendingProficiencyBatch | undefined;
      if (pending) {
        batch = pending;
        return;
      }

      const countersRequest = countersStore.index(USER_INDEX).getAll(userId);
      countersRequest.onsuccess = () => {
        const deltas: Partial<Record<ProficiencyKey, number>> = {};
        for (const counter of countersRequest.result as ProficiencyCounter[]) {
          const unsynced = Math.max(0, counter.total - counter.syncedTotal);
          if (unsynced > 0 && !options.excludeKeys?.has(counter.key)) {
            deltas[counter.key] = Math.min(10000, unsynced);
          }
        }
        if (Object.keys(deltas).length === 0) return;
        if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
          transaction.abort();
          return;
        }
        batch = {
          userId,
          batchId: crypto.randomUUID(),
          deltas,
          createdAt: Date.now(),
        };
        batchesStore.add(batch);
      };
      countersRequest.onerror = () => transaction.abort();
    };

    transaction.oncomplete = () => resolve(batch);
    transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível preparar o lote de proficiências.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Preparação do lote de proficiências cancelada.'));
    pendingRequest.onerror = () => transaction.abort();
  });
}

/**
 * Remove chaves rejeitadas de um lote que o servidor não aplicou.
 * A substituição é atômica e só ocorre se o lote ainda tiver o batchId informado.
 */
export async function repairPendingProficiencyBatch(
  userId: string,
  batchId: string,
  removeKeys: ProficiencyKey[],
): Promise<void> {
  if (!userId.trim() || !batchId.trim() || removeKeys.length === 0) return;
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PENDING_BATCH_STORE, 'readwrite');
    const batchesStore = transaction.objectStore(PENDING_BATCH_STORE);
    const pendingRequest = batchesStore.get(userId);

    pendingRequest.onsuccess = () => {
      const pending = pendingRequest.result as PendingProficiencyBatch | undefined;
      if (!pending || pending.batchId !== batchId) return;

      const removed = new Set(removeKeys);
      const deltas = Object.fromEntries(
        Object.entries(pending.deltas).filter(([key, amount]) =>
          !removed.has(key as ProficiencyKey) && Number.isSafeInteger(amount) && (amount as number) > 0,
        ),
      ) as Partial<Record<ProficiencyKey, number>>;

      if (Object.keys(deltas).length === 0) {
        batchesStore.delete(userId);
        return;
      }
      if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
        transaction.abort();
        return;
      }

      batchesStore.put({
        userId,
        batchId: crypto.randomUUID(),
        deltas,
        createdAt: Date.now(),
      } satisfies PendingProficiencyBatch);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível reparar o lote de proficiências.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Reparo do lote de proficiências cancelado.'));
    pendingRequest.onerror = () => transaction.abort();
  });
}

/**
 * Confirma localmente apenas o snapshot exato que o servidor confirmou.
 * Eventos recebidos durante o envio continuam pendentes para o próximo lote.
 */
export async function acknowledgeProficiencyBatch(userId: string, batchId: string): Promise<void> {
  if (!userId.trim() || !batchId.trim()) return;
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, PENDING_BATCH_STORE], 'readwrite');
    const countersStore = transaction.objectStore(STORE_NAME);
    const batchesStore = transaction.objectStore(PENDING_BATCH_STORE);
    const pendingRequest = batchesStore.get(userId);

    pendingRequest.onsuccess = () => {
      const pending = pendingRequest.result as PendingProficiencyBatch | undefined;
      if (!pending || pending.batchId !== batchId) return;

      for (const [key, amount] of Object.entries(pending.deltas) as [ProficiencyKey, number][]) {
        const counterRequest = countersStore.get([userId, key]);
        counterRequest.onsuccess = () => {
          const current = counterRequest.result as ProficiencyCounter | undefined;
          if (!current) return;
          countersStore.put({
            ...current,
            syncedTotal: Math.min(current.total, current.syncedTotal + amount),
          } satisfies ProficiencyCounter);
        };
      }
      batchesStore.delete(userId);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível confirmar o lote de proficiências.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Confirmação local do lote cancelada.'));
    pendingRequest.onerror = () => transaction.abort();
  });
}
