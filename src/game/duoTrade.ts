export type DuoTradeItem =
  | { kind: 'stack'; itemId: string; quantity: number }
  | { kind: 'weapon'; weaponId: string }
  | { kind: 'meal'; mealId: string; mealState: 'prepared' | 'ready' | 'pending' };

export type DuoTradeStatus = 'requested' | 'open' | 'completed' | 'cancelled';
export type DuoTradeSnapshot = {
  id: string;
  roomId: string;
  hostId: string;
  guestId: string;
  requesterId: string;
  status: DuoTradeStatus;
  hostOffer: DuoTradeItem[];
  guestOffer: DuoTradeItem[];
  hostConfirmed: boolean;
  guestConfirmed: boolean;
  revision: number;
};

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

function readObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function readTradeItem(value: unknown): DuoTradeItem {
  const row = readObject(value, 'O servidor retornou um item de troca inválido.');
  if (row.kind === 'stack' && typeof row.itemId === 'string'
    && Number.isSafeInteger(row.quantity) && (row.quantity as number) > 0) {
    return { kind: 'stack', itemId: row.itemId, quantity: row.quantity as number };
  }
  if (row.kind === 'weapon' && typeof row.weaponId === 'string') {
    return { kind: 'weapon', weaponId: row.weaponId };
  }
  if (row.kind === 'meal' && typeof row.mealId === 'string'
    && (row.mealState === 'prepared' || row.mealState === 'ready' || row.mealState === 'pending')) {
    return { kind: 'meal', mealId: row.mealId, mealState: row.mealState };
  }
  throw new Error('O servidor retornou um item de troca inválido.');
}

function readSnapshot(value: unknown): DuoTradeSnapshot {
  const row = readObject(value, 'O servidor retornou uma negociação inválida.');
  if (typeof row.id !== 'string' || typeof row.room_id !== 'string'
    || typeof row.host_id !== 'string' || typeof row.guest_id !== 'string'
    || typeof row.requester_id !== 'string'
    || (row.status !== 'requested' && row.status !== 'open'
      && row.status !== 'completed' && row.status !== 'cancelled')
    || !Array.isArray(row.host_offer) || !Array.isArray(row.guest_offer)
    || !row.host_offer.every(item => { try { readTradeItem(item); return true; } catch { return false; } })
    || !row.guest_offer.every(item => { try { readTradeItem(item); return true; } catch { return false; } })
    || typeof row.host_confirmed !== 'boolean' || typeof row.guest_confirmed !== 'boolean'
    || !Number.isSafeInteger(row.revision)) {
    throw new Error('O servidor retornou uma negociação incompleta ou inválida.');
  }
  return {
    id: row.id, roomId: row.room_id, hostId: row.host_id, guestId: row.guest_id,
    requesterId: row.requester_id, status: row.status,
    hostOffer: row.host_offer.map(readTradeItem), guestOffer: row.guest_offer.map(readTradeItem),
    hostConfirmed: row.host_confirmed, guestConfirmed: row.guest_confirmed,
    revision: row.revision as number,
  };
}

async function callTradeRpc(client: RpcClient, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message || 'O servidor recusou a operação de troca.');
  return data;
}

export async function requestDuoTrade(client: RpcClient, roomId: string): Promise<string> {
  const data = await callTradeRpc(client, 'fibula_duo_trade_request', { p_room_id: roomId });
  if (typeof data !== 'string' || !data) throw new Error('O servidor não confirmou a solicitação de troca.');
  return data;
}

export async function answerDuoTradeRequest(client: RpcClient, tradeId: string, accept: boolean): Promise<void> {
  const data = await callTradeRpc(client, 'fibula_duo_trade_answer', { p_trade_id: tradeId, p_accept: accept });
  if (data !== true) throw new Error('O servidor não confirmou sua resposta à solicitação.');
}

export async function getDuoTradeSnapshot(client: RpcClient, roomId: string): Promise<DuoTradeSnapshot | null> {
  const data = await callTradeRpc(client, 'fibula_duo_trade_snapshot', { p_room_id: roomId });
  if (data === null) return null;
  return readSnapshot(data);
}

export async function setDuoTradeOffer(client: RpcClient, tradeId: string, offer: DuoTradeItem[]): Promise<number> {
  if (offer.length > 5) throw new Error('Cada jogador pode oferecer no máximo 5 itens.');
  const data = await callTradeRpc(client, 'fibula_duo_trade_set_offer', {
    p_trade_id: tradeId,
    p_offer: offer,
  });
  if (!Number.isSafeInteger(data) || (data as number) !== offer.length) {
    throw new Error('O servidor não confirmou todos os itens da oferta.');
  }
  return data as number;
}

export async function confirmDuoTrade(client: RpcClient, tradeId: string): Promise<boolean> {
  const data = await callTradeRpc(client, 'fibula_duo_trade_confirm', { p_trade_id: tradeId });
  if (typeof data !== 'boolean') throw new Error('O servidor retornou uma confirmação inválida.');
  return data;
}

export async function cancelDuoTrade(client: RpcClient, tradeId: string): Promise<void> {
  const data = await callTradeRpc(client, 'fibula_duo_trade_cancel', { p_trade_id: tradeId });
  if (data !== true) throw new Error('O servidor não confirmou o cancelamento da troca.');
}
