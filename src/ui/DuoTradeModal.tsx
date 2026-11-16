import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  answerDuoTradeRequest, cancelDuoTrade, confirmDuoTrade, getDuoTradeSnapshot,
  requestDuoTrade, setDuoTradeOffer, type DuoTradeItem, type DuoTradeSnapshot,
} from '../game/duoTrade';

type Stack = { itemId: string; quantity: number };
type Weapon = { id: string; model: string; rarity: string; tier: number; damage: number; surp: boolean; core_surp: boolean };
type Meal = { id: string; name: string; icon: string; rarity: string };
type Props = {
  client: SupabaseClient;
  userId: string;
  roomId: string;
  friendName: string;
  onClose: () => void;
  onCompleted: () => void;
};

const rarityName: Record<string, string> = {
  normal: 'Normal', common: 'Comum', uncommon: 'Incomum', rare: 'Rara', legendary: 'Lendária',
};
const itemName: Record<string, string> = {
  wood: 'Madeira', stone: 'Pedra', cotton: 'Algodão', bronze: 'Bronze', linen: 'Linho',
  refined_leather: 'Couro refinado', leather: 'Couro', tomato: 'Tomate', cabbage: 'Repolho',
  herbs: 'Ervas', wolf_meat: 'Carne de lobo', chicken_meat: 'Carne de frango',
  tilapia: 'Tilápia', tambaqui: 'Tambaqui', pintado_surubim: 'Pintado', lambari: 'Lambari', tucunare: 'Tucunaré',
};
const weaponName: Record<string, string> = { espada: 'Espada', arco: 'Arco', cajado: 'Cajado', bastao: 'Bastão da Natureza' };

function offerLabel(item: DuoTradeItem): string {
  if (item.kind === 'stack') return (itemName[item.itemId] || item.itemId) + ' ×' + item.quantity;
  if (item.kind === 'weapon') return (item.label || 'Arma') + (item.rarity ? ' · ' + (rarityName[item.rarity] || item.rarity) : '') + (item.tier ? ' · T' + item.tier : '');
  return (item.icon || '🍲') + ' ' + (item.label || 'Refeição') + (item.rarity ? ' · ' + (rarityName[item.rarity] || item.rarity) : '');
}

export default function DuoTradeModal({ client, userId, roomId, friendName, onClose, onCompleted }: Props) {
  const [trade, setTrade] = useState<DuoTradeSnapshot | null>(null);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [meals, setMeals] = useState<Array<Meal & { mealState: 'prepared' | 'ready' | 'pending' }>>([]);
  const [offer, setOffer] = useState<DuoTradeItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const completedNotifiedRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = await getDuoTradeSnapshot(client, roomId);
    setTrade(next);
    if (next?.status === 'completed' && !completedNotifiedRef.current) { completedNotifiedRef.current = true; onCompleted(); }
  }, [client, roomId, onCompleted]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [house, weaponRows, cooking] = await Promise.all([
          client.from('fibula_house_storage').select('inventory').eq('user_id', userId).maybeSingle(),
          client.from('fibula_weapons').select('id,model,rarity,tier,damage,surp,core_surp').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
          client.from('fibula_cooking_state').select('prepared,ready,pending').eq('user_id', userId).maybeSingle(),
        ]);
        if (house.error) throw house.error;
        if (weaponRows.error) throw weaponRows.error;
        if (cooking.error) throw cooking.error;
        if (!active) return;
        setStacks(Array.isArray(house.data?.inventory) ? house.data.inventory.filter((v: any) => v && typeof v.itemId === 'string' && Number.isSafeInteger(v.quantity) && v.quantity > 0) : []);
        setWeapons(Array.isArray(weaponRows.data) ? weaponRows.data as Weapon[] : []);
        const mealRows: Array<Meal & { mealState: 'prepared' | 'ready' | 'pending' }> = [];
        for (const mealState of ['prepared', 'ready', 'pending'] as const) {
          const rows = cooking.data?.[mealState];
          if (Array.isArray(rows)) for (const meal of rows) {
            if (meal && typeof meal.id === 'string') mealRows.push({ ...meal, mealState });
          }
        }
        setMeals(mealRows);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu inventário.');
      }
    };
    void load();
    return () => { active = false; };
  }, [client, userId]);

  useEffect(() => {
    let active = true;
    let running = false;
    const poll = async () => {
      if (!active || running) return;
      running = true;
      try { const next = await getDuoTradeSnapshot(client, roomId); if (active) { setTrade(next); if (next?.status === 'completed' && !completedNotifiedRef.current) { completedNotifiedRef.current = true; onCompleted(); } } }
      catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a troca.'); }
      finally { running = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [client, roomId, onCompleted]);

  const isHost = trade?.hostId === userId;
  const ownOffer = isHost ? trade?.hostOffer ?? [] : trade?.guestOffer ?? [];
  const peerOffer = isHost ? trade?.guestOffer ?? [] : trade?.hostOffer ?? [];
  const peerConfirmed = isHost ? trade?.guestConfirmed : trade?.hostConfirmed;
  useEffect(() => { if (trade?.status !== 'completed') completedNotifiedRef.current = false; }, [trade?.id, trade?.status]);
  const selfConfirmed = isHost ? trade?.hostConfirmed : trade?.guestConfirmed;
  const incomingRequest = trade?.status === 'requested' && trade.requesterId !== userId;
  const waitingRequest = trade?.status === 'requested' && trade.requesterId === userId;

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (success) setNotice(success); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };

  const toggle = (item: DuoTradeItem, key: string) => {
    setOffer(current => {
      const keyOf = (entry: DuoTradeItem) => entry.kind === 'stack' ? 'stack:' + entry.itemId
        : entry.kind === 'weapon' ? 'weapon:' + entry.weaponId : 'meal:' + entry.mealId;
      const key = keyOf(item);
      const existing = current.find(entry => keyOf(entry) === key);
      if (existing) {
        if (item.kind === 'stack' && existing.kind === 'stack' && existing.quantity !== item.quantity) {
          return current.map(entry => keyOf(entry) === key ? item : entry);
        }
        return current.filter(entry => keyOf(entry) !== key);
      }
      if (current.length >= 5) { setError('Você pode selecionar no máximo 5 itens.'); return current; }
      return [...current, item];
    });
    setError('');
    setQuantities(current => ({ ...current, [key]: current[key] || '1' }));
  };

  const saveOffer = () => run(async () => {
    await setDuoTradeOffer(client, trade!.id, offer);
    setOffer([]);
  }, 'Sua oferta foi atualizada. A confirmação anterior foi reiniciada.');

  const ownLabels = useMemo(() => ownOffer.map(offerLabel), [ownOffer]);
  const peerLabels = useMemo(() => peerOffer.map(offerLabel), [peerOffer]);

  return <div className="duo-trade-backdrop" role="presentation" onClick={onClose}>
    <section className="duo-trade-dialog" role="dialog" aria-modal="true" aria-label={'Troca com ' + friendName} onClick={event => event.stopPropagation()}>
      <header><div><small>TROCA DO DUO</small><h2>{friendName}</h2></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
      {error && <p className="duo-trade-error" role="alert">{error}</p>}
      {notice && <p className="duo-trade-notice" role="status">{notice}</p>}
      {!trade && <p>Verificando solicitação de troca…</p>}
      {incomingRequest && <div className="duo-trade-request"><strong>{friendName} quer trocar itens com você.</strong><p>Você verá somente os itens que ele escolher oferecer.</p>
        <button type="button" disabled={busy} onClick={() => void run(() => answerDuoTradeRequest(client, trade!.id, true), 'Troca aceita.')}>Aceitar</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => answerDuoTradeRequest(client, trade!.id, false), 'Solicitação recusada.')}>Recusar</button>
      </div>}
      {waitingRequest && <p>Aguardando {friendName} aceitar a solicitação…</p>}
      {trade?.status === 'open' && <>
        <div className="duo-trade-columns">
          <section><h3>Sua oferta <small>{ownOffer.length}/5</small></h3>
            <ul>{ownLabels.length ? ownLabels.map((label, i) => <li key={i}>{label}</li>) : <li>Nenhum item oferecido</li>}</ul>
            <h4>Escolha no seu inventário</h4>
            <div className="duo-trade-inventory">
              {stacks.map(stack => <div key={'s:'+stack.itemId}>
                <span>{itemName[stack.itemId] || stack.itemId} · disponível {stack.quantity}</span>
                <input aria-label={'Quantidade de '+stack.itemId} type="number" min="1" max={stack.quantity} value={quantities[stack.itemId] || '1'} onChange={e => setQuantities(v => ({...v,[stack.itemId]:e.target.value}))}/>
                <button type="button" disabled={busy} onClick={() => { const qty=Number(quantities[stack.itemId] || 1); if (!Number.isSafeInteger(qty)||qty<1||qty>stack.quantity) {setError('Quantidade inválida.');return;} toggle({kind:'stack',itemId:stack.itemId,quantity:qty},stack.itemId); }}>Selecionar</button>
              </div>)}
              {weapons.map(weapon => <div key={'w:'+weapon.id}>
                <span>{weaponName[weapon.model] || weapon.model} · {rarityName[weapon.rarity] || weapon.rarity} · T{weapon.tier}</span>
                <button type="button" disabled={busy} onClick={() => toggle({kind:'weapon',weaponId:weapon.id},weapon.id)}>Selecionar</button>
              </div>)}
              {meals.map(meal => <div key={'m:'+meal.id}>
                <span>{meal.icon || '🍲'} {meal.name} · {meal.mealState === 'pending' ? 'Próxima partida' : meal.mealState === 'prepared' ? 'Preparada' : 'Pronta'}</span>
                <button type="button" disabled={busy} onClick={() => toggle({kind:'meal',mealId:meal.id,mealState:meal.mealState},meal.id)}>Selecionar</button>
              </div>)}
              {!stacks.length && !weapons.length && !meals.length && <p>Seu inventário não tem itens disponíveis para troca.</p>}
            </div>
            <button type="button" disabled={busy || offer.length > 5} onClick={saveOffer}>Salvar oferta ({offer.length}/5)</button>
          </section>
          <section><h3>Oferta de {friendName} <small>{peerOffer.length}/5</small></h3>
            <ul>{peerLabels.length ? peerLabels.map((label, i) => <li key={i}>{label}</li>) : <li>{friendName} ainda não ofereceu itens</li>}</ul>
            <p className="duo-trade-private-note">Somente os itens escolhidos aparecem aqui. O Baú e o inventário completo do outro jogador permanecem privados.</p>
          </section>
        </div>
        <div className="duo-trade-confirmations">
          <span>Você: {selfConfirmed ? 'Confirmou' : 'Aguardando confirmação'}</span>
          <span>{friendName}: {peerConfirmed ? 'Confirmou' : 'Aguardando confirmação'}</span>
        </div>
        <div className="duo-trade-actions">
          <button type="button" disabled={busy} onClick={() => void run(() => confirmDuoTrade(client, trade.id), 'Confirmação registrada. A transferência só ocorre após os dois confirmarem.')}>Trocar / Confirmar</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => cancelDuoTrade(client, trade.id), 'Troca cancelada.')}>Cancelar troca</button>
        </div>
        <p className="duo-trade-hint">Você pode receber itens sem oferecer nada. Basta deixar sua oferta vazia e confirmar.</p>
      </>}
      {trade?.status === 'completed' && <p role="status">Troca concluída! Os itens foram transferidos.</p>}
      {trade?.status === 'cancelled' && <p role="status">Esta solicitação de troca foi encerrada.</p>}
      {!trade && <button type="button" className="secondary" onClick={() => void run(() => requestDuoTrade(client, roomId))}>Solicitar troca</button>}
      {trade?.status === 'cancelled' && <button type="button" onClick={() => void run(() => requestDuoTrade(client, roomId))}>Solicitar nova troca</button>}
      <footer><button type="button" className="secondary" onClick={onClose}>Fechar</button></footer>
    </section>
  </div>;
}
