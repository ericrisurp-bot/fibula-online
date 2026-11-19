import type { ProficiencyEvent, ProficiencyKey } from './engine';

export type ProficiencyCounter = {
  userId: string;
  key: ProficiencyKey;
  total: number;
  syncedTotal: number;
  updatedAt: number;
};

const DATABASE_NAME = 'fibula-proficiency-local-v1';
const DATABASE_VERSION = 1;
const STORE_NAME = 'counters';
const USER_INDEX = 'by_user_id';

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
