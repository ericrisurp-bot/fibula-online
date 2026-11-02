import { useEffect, useRef, useState, type PointerEvent, type MouseEvent, type CSSProperties } from 'react';
import { playerFeet } from './game/ground';
import { createGrassTile, drawResourceRarityAura, drawRock, drawTree } from './game/environment';
import { getBaseItemId, getItemRarity } from './game/inventory';
import { ARSENAL_CAPACITY, EQUIPMENT_SLOTS, equipArsenalItem, unequipArsenalSlot, type ArsenalEquipment, type EquipmentLoadout, type EquipmentSlotId } from './game/arsenal';
import { CLASSES, CONFIG, type ClassId, type WeaponId } from './game/config';
import { ATTRIBUTE_USAGE, getAttributeEffectPerLevel, getDamageMultiplier, getPlayerAttributes, type AttributeKey } from './game/attributes';
import { getClassPower } from './game/power';
import { GameEngine, type GameSnapshot } from './game/engine';
import { finishSoloMatchSession, loadHouseInventory, readLocalHouseInventory, startSoloMatchSession, syncHouseInventory } from './game/persistence';
import { drawLadino, ladinoFeetY } from './game/ladino';
import { drawArrowShot, drawFloatingWeapon, isFloatingWeaponVisible } from './game/weapons';

import { drawFloatingTool } from './game/tools';
import { drawCart } from './game/cart';
import Controls from './ui/Controls';
import PlayerProfileModal from './ui/PlayerProfileModal';
import FriendsModal from './ui/FriendsModal';
import { useArenaAuth } from './auth/AuthGate';
import { fibulaSupabase } from './auth/supabase';
import { audioManager } from './audio/audioManager';
import { ambience } from './audio/ambience';
import { registerCombatSounds } from './audio/combatSounds';
import { registerGatherSounds } from './audio/gatherSounds';
import { registerStepSounds } from './audio/stepSounds';

type RankingEntry = {
  user_id: string;
  display_name: string | null;
  avatar_character: ClassId;
  highest_pd: number;
  highest_survival_level: number;
  kills: number;
  created_at: string;
};

let floatingWeaponSide: 1 | -1 = 1;

registerCombatSounds();
registerGatherSounds();
registerStepSounds();

const initial: GameSnapshot = {
  walkPhase: 0,
  player: { x: 1200, y: 1200, hp: 100, maxHp: 100, level: 0, xp: 0, nextXp: 4, moving: false, facingX: 0, facingY: 1 },
  house: { x: 600, y: 600, woodDelivered: 0, built: false, inventory: [] },
  refinery: { x: 3000, y: 3000, woodDelivered: 0, stoneDelivered: 0, built: false, stoneStock: 0, stonesProcessed: 0, bronzeProduced: 0 },
  tecelaria: { x: 1000, y: 3240, bronzeDelivered: 0, woodDelivered: 0, cottonDelivered: 0, stoneDelivered: 0, built: false, cottonStock: 0, cottonProcessed: 0, linenProduced: 0 },
  cart: { x: 1800, y: 600, angle: 0, repairWood: 0, repaired: false, carried: false, inventory: [] },
  enemies: [], trees: [], rocks: [], cottonPlants: [], woodDrops: [], stoneDrops: [], cottonDrops: [], linenDrops: [], bronzeDrops: [], inventory: [], xpOrbs: [], healingOrbs: [], shots: [], explosions: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, dayNight: 'day', phaseElapsed: 0, nightNumber: 0, startedAtNight: false, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0, rockMineAngle: 0, rockMineTimer: 0, cottonHarvestAngle: 0, cottonHarvestTimer: 0, gatherX: 0, gatherY: 0, gatherDepth: 0, showRange: false, cameraFull: false, dead: false, kills: 0,
};
const PROFILE_CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const CLASS_STYLE: Record<ClassId, string> = { guerreiro: 'Tanque', mago: 'Explosivo', arqueiro: 'Independente', druida: 'Suporte' };
const attributeUnusedClass = (classId: ClassId, key: AttributeKey) => ATTRIBUTE_USAGE[classId][key] > 0 ? '' : ' attr-unused';
const PROFILE_CLASS_WEAPONS: Record<ClassId, WeaponId> = {
  guerreiro: 'espada',
  mago: 'cajado',
  arqueiro: 'arco',
  druida: 'bastao',
};
const ARSENAL_SLOT_INFO: Record<EquipmentSlotId, { label: string }> = {
  capacete: { label: 'capacete' }, peitoral: { label: 'peitoral' },
  leggings: { label: 'leggings' }, bota: { label: 'bota' },
  arma: { label: 'arma' }, luva: { label: 'luva' },
  colar: { label: 'colar' }, bolsa: { label: 'bolsa' },
  pulseira: { label: 'pulseira' }, cinto: { label: 'cinto' },
};
const ARSENAL_SLOT_LAYOUT: { slot: EquipmentSlotId; row: number; column: number }[] = [
  { slot: 'colar', row: 1, column: 1 }, { slot: 'capacete', row: 1, column: 2 },
  { slot: 'bolsa', row: 1, column: 3 }, { slot: 'arma', row: 2, column: 1 },
  { slot: 'peitoral', row: 2, column: 2 }, { slot: 'luva', row: 2, column: 3 },
  { slot: 'cinto', row: 3, column: 1 }, { slot: 'leggings', row: 3, column: 2 }, { slot: 'pulseira', row: 3, column: 3 },
  { slot: 'bota', row: 4, column: 2 },
];

function readSavedArsenal(): ArsenalEquipment[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem('fibula-arsenal-items') ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.flatMap((item): ArsenalEquipment[] => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.icon !== 'string') return [];
      const slot = item.slot === 'armadura' ? 'peitoral' : item.slot === 'calca' ? 'leggings' : item.slot === 'arma1' ? 'arma' : item.slot;
      return EQUIPMENT_SLOTS.includes(slot as EquipmentSlotId) ? [{ ...item, slot: slot as EquipmentSlotId }] : [];
    }).slice(0, ARSENAL_CAPACITY);
  } catch { return []; }
}

type HouseStorageStack = { itemId: string; quantity: number };
const HOUSE_STORAGE_KEY = 'fibula-house-storage';

function readSavedHouseStorage(): HouseStorageStack[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(HOUSE_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const merged = new Map<string, number>();
    for (const item of saved) {
      if (!item || typeof item.itemId !== 'string' || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
      merged.set(item.itemId, (merged.get(item.itemId) ?? 0) + Math.floor(item.quantity));
    }
    return Array.from(merged, ([itemId, quantity]) => ({ itemId, quantity })).slice(0, 50);
  } catch { return []; }
}

function readSavedLoadout(): EquipmentLoadout {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem('fibula-arsenal-equipped') ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).flatMap(([rawSlot, id]) => {
      const slot = rawSlot === 'armadura' ? 'peitoral' : rawSlot === 'calca' ? 'leggings' : rawSlot === 'arma1' ? 'arma' : rawSlot;
      return EQUIPMENT_SLOTS.includes(slot as EquipmentSlotId) && typeof id === 'string' ? [[slot, id]] : [];
    })) as EquipmentLoadout;
  } catch { return {}; }
}

type ClassEquipmentLoadouts = Partial<Record<ClassId, EquipmentLoadout>>;

function readSavedLoadouts(): ClassEquipmentLoadouts {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem('fibula-arsenal-equipped-by-class') ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).filter(([classId, loadout]) =>
        isProfileClassId(classId) && !!loadout && typeof loadout === 'object' && !Array.isArray(loadout),
      )) as ClassEquipmentLoadouts;
    }
    const legacy = readSavedLoadout();
    if (!Object.keys(legacy).length) return {};
    const preferences = JSON.parse(window.localStorage.getItem('fibula-character-preferences') ?? '["guerreiro","druida"]');
    const primary = Array.isArray(preferences) && isProfileClassId(preferences[0]) ? preferences[0] : 'guerreiro';
    return { [primary]: legacy };
  } catch { return {}; }
}

const isProfileClassId = (value: unknown): value is ClassId =>
  typeof value === 'string' && PROFILE_CLASS_IDS.includes(value as ClassId);

function ProfileClassStats({ classId }: { classId: ClassId }) {
  const attributes = getPlayerAttributes(classId, 0);
  const weapon = CONFIG.weapons[PROFILE_CLASS_WEAPONS[classId]];
  const hpPerLevel = getAttributeEffectPerLevel(classId, 1, 'vida');
  const damagePerLevel = (getDamageMultiplier(classId, 1) - 1) * 100;
  const movementPerLevel = getAttributeEffectPerLevel(classId, 1, 'velocidadeMovimento');
  const armorPerLevel = getAttributeEffectPerLevel(classId, 1, 'armadura');
  const attackSpeedPerLevel = getAttributeEffectPerLevel(classId, 1, 'velocidadeAtaque') * 100;
  const dodgePerLevel = getAttributeEffectPerLevel(classId, 1, 'esquiva') * 100;
  const nextLevelAttributes = getPlayerAttributes(classId, 1);
  const attributeKeyByLabel: Record<string, AttributeKey> = {
    'Força': 'forca', 'Inteligência': 'inteligencia', 'Destreza': 'destreza', 'Armadura': 'armadura', 'Resistência mágica': 'resistenciaMagica',
    'Velocidade de movimento': 'velocidadeMovimento', 'Velocidade de ataque': 'velocidadeAtaque', 'Alcance de ataque': 'alcanceAtaque', 'Esquiva': 'esquiva', 'Área de ataque': 'areaAtaque',
  };
  const attributeRows = [
    ['Força', nextLevelAttributes.forca - attributes.forca],
    ['Inteligência', nextLevelAttributes.inteligencia - attributes.inteligencia],
    ['Destreza', nextLevelAttributes.destreza - attributes.destreza],
    ['Armadura', nextLevelAttributes.armadura - attributes.armadura],
    ['Resistência mágica', nextLevelAttributes.resistenciaMagica - attributes.resistenciaMagica],
    ['Velocidade de movimento', nextLevelAttributes.velocidadeMovimento - attributes.velocidadeMovimento],
    ['Velocidade de ataque', nextLevelAttributes.velocidadeAtaque - attributes.velocidadeAtaque],
    ['Alcance de ataque', nextLevelAttributes.alcanceAtaque - attributes.alcanceAtaque],
    ['Esquiva', nextLevelAttributes.esquiva - attributes.esquiva],
    ['Área de ataque', nextLevelAttributes.areaAtaque - attributes.areaAtaque],
  ] as const;
  const growthRows = ([['forca', 'Força', '💪'], ['armadura', 'Armadura', '🛡️'], ['inteligencia', 'Inteligência', '🧠'], ['destreza', 'Destreza', '🎯']] as const).map(([key, label, icon]) => {
    const gain = nextLevelAttributes[key] - attributes[key];
    const best = Math.max(0.0001, ...PROFILE_CLASS_IDS.map(id => getPlayerAttributes(id, 1)[key] - getPlayerAttributes(id, 0)[key]));
    return { label, icon, gain, percent: Math.max(0, Math.min(100, Math.round(gain / best * 100))), unused: ATTRIBUTE_USAGE[classId][key] === 0 };
  });
  const ability = {
    guerreiro: 'Espada corpo a corpo: atinge até 4 inimigos no arco do golpe e aplica empurrão.',
    mago: `A cada 4º ataque, cria uma explosão de raio ${CONFIG.mageExplosion.radius} com dano multiplicado por ${CONFIG.mageExplosion.damageMultiplier.toFixed(1)}.`,
    arqueiro: `Arco de longo alcance; as flechas perfuram inimigos e perdem dano nos alvos seguintes. A cada ${CONFIG.archerHeal.arrowsPerHeal} flechas disparadas, recupera ${CONFIG.archerHeal.amount} de vida.`,
    druida: `Cajado natural à distância; aplica lentidão de ${Math.round((1 - CONFIG.druidSlow.speedMultiplier) * 100)}% por ${CONFIG.druidSlow.duration}s e veneno por ${CONFIG.druidPoison.duration}s. Cura ${CONFIG.druidHeal.basicHitAmount} de vida a cada ${CONFIG.druidHeal.basicHitsPerHeal} acertos e gera 1 orbe a cada ${CONFIG.druidHeal.killsPerOrb} eliminações (máx. ${CONFIG.druidHeal.maxOrbs}).`,
  }[classId];

  const statIcons: Record<string, string> = {
    'Força': '💪', 'Inteligência': '🧠', 'Destreza': '🎯', 'Armadura': '🛡️',
    'Resistência mágica': '✨', 'Velocidade de movimento': '👢',
    'Velocidade de ataque': '⚔️', 'Alcance de ataque': '🏹',
    'Esquiva': '💨', 'Área de ataque': '💥',
  };
  return <div className="profile-stats-content">
    <div className="profile-weapon-note"><span>ARMA INICIAL</span><strong>⚔️ {weapon.label}</strong></div>
    <div className="profile-stat-summary">
      <div className="stat-health"><span>❤️ VIDA / HP</span><strong>{CONFIG.attributes.classStartHealth[classId]}</strong><small>+{hpPerLevel.toFixed(1)} por nível</small></div>
      <div className="stat-damage"><span>💥 DANO</span><strong>{weapon.damage}</strong><small>+{damagePerLevel.toFixed(2)}% por nível</small></div>
      <div className="stat-range"><span>🎯 ALCANCE</span><strong>{weapon.range}</strong><small>unidades do jogo</small></div>
      <div className="stat-speed"><span>⚔️ ATAQUES / SEG</span><strong>{weapon.attackSpeed.toFixed(2)}</strong><small>+{attackSpeedPerLevel.toFixed(2)}% por nível</small></div>
    </div>
    <section className="profile-stat-section profile-growth">
      <h4>📈 Cresce a cada nível</h4>
      <p className="profile-stat-note">A barra compara com as outras classes.</p>
      {growthRows.map(row => <div className={`profile-growth-row${row.unused ? ' attr-unused' : ''}`} title={row.unused ? 'Esta classe não usa este atributo: ele não soma no PODER.' : undefined} key={row.label}><span><i aria-hidden="true">{row.icon}</i>{row.label}</span><b aria-hidden="true"><u style={{ width: `${row.percent}%` }} /></b><strong>+{row.gain.toFixed(2)}</strong></div>)}
    </section>
    <section className="profile-ability"><span>✨ HABILIDADE / ESTILO</span><p>{ability}</p></section>
    <details className="profile-more">
    <summary>Todos os atributos e mobilidade</summary>
    <section className="profile-stat-section">
      <h4>🧭 Sobrevivência e mobilidade</h4>
      <div className="profile-stat-list">
        <div><span>👢 Velocidade de movimento</span><strong>{CONFIG.player.speed} <small>+{movementPerLevel.toFixed(2)} / nível</small></strong></div>
        <div><span>🛡️ Armadura inicial</span><strong>{CONFIG.player.armor} <small>+{armorPerLevel.toFixed(2)} / nível</small></strong></div>
        <div><span>💨 Esquiva inicial</span><strong>{(CONFIG.player.dodge * 100).toFixed(1)}% <small>+{dodgePerLevel.toFixed(2)} p.p. / nível</small></strong></div>
      </div>
    </section>
    <section className="profile-stat-section">
      <h4>📊 Atributos da classe</h4>
      <p className="profile-stat-note">Quanto cada atributo aumenta a cada nível.</p>
      <div className="profile-attribute-list">
        {attributeRows.map(([label, gain]) => <div key={label} className={attributeUnusedClass(classId, attributeKeyByLabel[label]).trim() || undefined} title={ATTRIBUTE_USAGE[classId][attributeKeyByLabel[label]] > 0 ? undefined : 'Esta classe não usa este atributo: ele não soma no PODER.'}><span><i aria-hidden="true">{statIcons[label]}</i>{label}</span><strong>+{gain.toFixed(2)} <small>/ nível</small></strong></div>)}
      </div>
    </section>
    </details>
  </div>;
}

const itemIcon = (itemId: string) => getBaseItemId(itemId) === 'wood' ? '🪵' : getBaseItemId(itemId) === 'stone' ? '🪨' : getBaseItemId(itemId) === 'bronze' ? '🟤' : getBaseItemId(itemId) === 'cotton' ? '☁️' : getBaseItemId(itemId) === 'linen' ? '🧵' : '📦';
const inventoryItemIcon = (itemId: string) => getBaseItemId(itemId) === 'cotton' ? (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
    <g fill="#fffaf0" stroke="#c8c3b6" strokeWidth="1" strokeLinejoin="round">
      <polygon points="3,12 5,7 9,6 12,9 11,15 6,16" />
      <polygon points="8,9 9,4 14,3 18,6 17,12 12,14" />
      <polygon points="13,13 17,10 21,12 20,17 16,18 13,16" />
    </g>
    <g fill="none" stroke="#ffffff" strokeWidth="1" strokeLinecap="round">
      <path d="M5.5 10 7.5 8 M11.5 6 13.5 5" />
    </g>
  </svg>
) : getBaseItemId(itemId) === 'stone' ? (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
    <g stroke="#454d53" strokeWidth="0.9" strokeLinejoin="round">
      <polygon points="2,14 3,9 7,5 11,2 15,3 19,7 22,12 20,17 16,20 10,21 5,19" fill="#788188" />
      <polygon points="2,14 3,9 7,5 8,11 6,15 5,19" fill="#929ba1" stroke="none" />
      <polygon points="3,9 7,5 11,2 13,8 8,11" fill="#aab2b7" stroke="none" />
      <polygon points="11,2 15,3 16,8 13,8" fill="#c0c6ca" stroke="none" />
      <polygon points="15,3 19,7 16,10 13,8" fill="#aeb7bd" stroke="none" />
      <polygon points="19,7 22,12 18,13 16,10" fill="#89939a" stroke="none" />
      <polygon points="8,11 13,8 16,10 14,14 9,15" fill="#9ca6ac" stroke="none" />
      <polygon points="16,10 18,13 16,17 14,14" fill="#737e85" stroke="none" />
      <polygon points="5,19 6,15 9,15 9,19" fill="#7e898f" stroke="none" />
      <polygon points="9,15 14,14 16,17 12,20 9,19" fill="#a2abb0" stroke="none" />
      <polygon points="16,17 18,13 20,17 16,20 12,20" fill="#68737a" stroke="none" />
      <path d="M5 8 7 6 M14 4 15 5" fill="none" stroke="#e6ebee" strokeWidth="0.8" />
    </g>
  </svg>
) : itemIcon(itemId);
const itemLabel = (itemId: string) => {
  const base = getBaseItemId(itemId);
  const label = base === 'wood' ? 'Madeira' : base === 'stone' ? 'Pedra' : base === 'bronze' ? 'Bronze' : base === 'cotton' ? 'Algodão' : base === 'linen' ? 'Linho' : base;
  const rarity = getItemRarity(itemId);
  const rarityLabel = rarity === 'common' ? 'Comum' : rarity === 'uncommon' ? 'Incomum' : rarity === 'rare' ? 'Raro' : rarity === 'legendary' ? 'Lendário' : '';
  return rarityLabel ? `${label} · ${rarityLabel}` : label;
};
const itemRarityGlow = (itemId: string): React.CSSProperties => {
  const rarity = getItemRarity(itemId);
  const color = rarity === 'common' ? '#36d66f' : rarity === 'uncommon' ? '#348cff' : rarity === 'rare' ? '#a34be8' : rarity === 'legendary' ? '#ff8a24' : 'transparent';
  return rarity ? { filter: `drop-shadow(0 0 5px ${color})` } : {};
};

const LOBBY_CRAFTING_STATIONS = [
  { id: 'bigorna', label: 'BIGORNA', icon: '⚒️', title: 'Bigorna', description: 'Estação de metalurgia para fabricar e aprimorar equipamentos metálicos.', products: 'Armas, capacetes e peças de armadura' },
  { id: 'costura', label: 'COSTURA', icon: '🧵', title: 'Alfaiataria', description: 'Mesa de costura para trabalhar tecidos e materiais flexíveis.', products: 'Luvas, botas e peças de tecido' },
  { id: 'joalheria', label: 'JOIAS', icon: '💎', title: 'Joalheria', description: 'Bancada para criar acessórios que complementam os atributos do personagem.', products: 'Colares e pulseiras' },
  { id: 'fogao', label: 'FOGÃO', icon: '🍲', title: 'Fogão', description: 'Estação culinária para preparar refeições e cozidos com ingredientes coletados.', products: 'Cozidos e refeições com efeitos' },
] as const;

export default function App() {
  const { session } = useArenaAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lobbyCharacterCanvasRef = useRef<HTMLCanvasElement>(null);
  const arsenalCharacterCanvasRef = useRef<HTMLCanvasElement>(null);
  const lobbyGrassCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const houseLoadReadyRef = useRef(false);
  const houseChangedDuringLoadRef = useRef(false);
  const initialHouseInventoryRef = useRef(JSON.stringify(readLocalHouseInventory()));
  const lastSyncedHouseInventoryRef = useRef(initialHouseInventoryRef.current);
  const matchSummaryHandledRef = useRef(false);
  const matchSessionIdRef = useRef<string | null>(null);
  const gameStartPendingRef = useRef(false);
  const [state, setState] = useState<GameSnapshot>(() => ({ ...initial, house: { ...initial.house, inventory: readLocalHouseInventory() } }));
  const [houseLoadReady, setHouseLoadReady] = useState(false);
  const houseInventoryJson = JSON.stringify(state.house.inventory);

  useEffect(() => {
    const userId = session.user.sub;
    if (!fibulaSupabase || !userId) return;
    let cancelled = false;
    void loadHouseInventory(fibulaSupabase, userId).then(({ inventory, source }) => {
      if (cancelled) return;
      const changedWhileLoading = houseChangedDuringLoadRef.current;
      if (source === 'cloud' && !changedWhileLoading) {
        engineRef.current?.setHouseInventory(inventory);
        lastSyncedHouseInventoryRef.current = JSON.stringify(inventory);
      } else {
        lastSyncedHouseInventoryRef.current = '';
      }
      houseLoadReadyRef.current = true;
      setHouseLoadReady(true);
    }).catch(() => {
      if (cancelled) return;
      houseLoadReadyRef.current = true;
      setHouseLoadReady(true);
      lastSyncedHouseInventoryRef.current = '';
    });
    return () => { cancelled = true; };
  }, [session.user.sub]);

  useEffect(() => {
    const userId = session.user.sub;
    if (!fibulaSupabase || !userId) return;
    const supabaseClient = fibulaSupabase;
    if (!houseLoadReadyRef.current) {
      if (houseInventoryJson !== initialHouseInventoryRef.current) houseChangedDuringLoadRef.current = true;
      return;
    }
    if (houseInventoryJson === lastSyncedHouseInventoryRef.current) return;
    lastSyncedHouseInventoryRef.current = houseInventoryJson;
    const inventory = JSON.parse(houseInventoryJson) as Array<{ itemId: string; quantity: number }>;
    const sync = () => { void syncHouseInventory(supabaseClient, userId, inventory); };
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [houseInventoryJson, session.user.sub, houseLoadReady]);

  useEffect(() => {
    if (!state.dead) {
      matchSummaryHandledRef.current = false;
      return;
    }
    if (matchSummaryHandledRef.current) return;
    matchSummaryHandledRef.current = true;

    const sessionId = matchSessionIdRef.current;
    matchSessionIdRef.current = null;
    if (!sessionId || !fibulaSupabase) return;

    const survivalNights = Math.max(0, state.nightNumber - (state.dayNight === 'night' ? 1 : 0));
    void finishSoloMatchSession(fibulaSupabase, sessionId, {
      kills: state.kills,
      survivalNights,
    }).then((result) => {
      if (result === 'rejected') {
        window.alert('O servidor recusou o resultado desta partida por não passar na validação. Seu progresso não foi atualizado.');
      }
    }).catch(() => {
      window.alert('Não foi possível validar o resultado no encerramento. Esta partida não foi salva no perfil.');
    });
  }, [state.dead, state.kills, state.nightNumber, state.dayNight]);
  const [avatarCharacter, setAvatarCharacter] = useState<ClassId>('guerreiro');
  const [characterPreferences, setCharacterPreferences] = useState<[ClassId | null, ClassId | null]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(window.localStorage.getItem('fibula-character-preferences') ?? 'null');
        if (Array.isArray(saved) && saved.length === 2 &&
          (saved[0] === null || isProfileClassId(saved[0])) &&
          (saved[1] === null || isProfileClassId(saved[1])) &&
          saved[0] !== saved[1]) {
          return [saved[0], saved[1]];
        }
      } catch { /* Preferências inválidas são substituídas pelos padrões. */ }
    }
    return ['guerreiro', 'druida'];
  });
  const [arsenalOpen, setArsenalOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [chestOpen, setChestOpen] = useState(false);
  const [lobbyChestItems, setLobbyChestItems] = useState<HouseStorageStack[]>(readSavedHouseStorage);
  const [arsenalCharacterTab, setArsenalCharacterTab] = useState<'principal' | 'secundario'>('principal');
  const [arsenalItems] = useState<ArsenalEquipment[]>(readSavedArsenal);
  const [equipmentLoadouts, setEquipmentLoadouts] = useState<ClassEquipmentLoadouts>(readSavedLoadouts);
  const [selectedArsenalItemId, setSelectedArsenalItemId] = useState<string | null>(null);
  const [selectedEquipmentSlot, setSelectedEquipmentSlot] = useState<EquipmentSlotId>('capacete');
  const activeArsenalClassId = characterPreferences[arsenalCharacterTab === 'principal' ? 0 : 1];
  const equipmentLoadout = activeArsenalClassId ? equipmentLoadouts[activeArsenalClassId] ?? {} : {};
  const [profileOpen, setProfileOpen] = useState(false);
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false);
  const [viewedProfileUserId, setViewedProfileUserId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [rankingMode, setRankingMode] = useState<'solo' | 'duo'>('solo');
  const [rankingCategory, setRankingCategory] = useState<'power' | 'survival' | 'kills'>('survival');
  const [rankingRows, setRankingRows] = useState<RankingEntry[]>([]);
  const [rankingOwnProfile, setRankingOwnProfile] = useState<RankingEntry | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState('');
  useEffect(() => {
    if (!rankingOpen) return;
    const supabase = fibulaSupabase;
    if (!supabase || rankingMode !== 'solo') {
      setRankingRows([]);
      setRankingOwnProfile(null);
      setRankingError('');
      setRankingLoading(false);
      return;
    }
    let active = true;
    const loadRanking = async () => {
      setRankingLoading(true);
      setRankingError('');
      const valueField = rankingCategory === 'power'
        ? 'highest_pd'
        : rankingCategory === 'survival' ? 'highest_survival_level' : 'kills';
      try {
        const [boardResult, ownResult] = await Promise.all([
          supabase.from('fibula_profiles')
            .select('user_id,display_name,avatar_character,highest_pd,highest_survival_level,kills,created_at')
            .gt(valueField, 0)
            .order(valueField, { ascending: false })
            .order('created_at', { ascending: true })
            .limit(100),
          supabase.from('fibula_profiles')
            .select('user_id,display_name,avatar_character,highest_pd,highest_survival_level,kills,created_at')
            .eq('user_id', session.user.sub)
            .maybeSingle(),
        ]);
        if (boardResult.error) throw boardResult.error;
        if (ownResult.error) throw ownResult.error;
        if (!active) return;
        setRankingRows((boardResult.data ?? []) as RankingEntry[]);
        setRankingOwnProfile(ownResult.data as RankingEntry | null);
      } catch (cause) {
        if (active) setRankingError(cause instanceof Error ? cause.message : 'Não foi possível carregar o ranking.');
      } finally {
        if (active) setRankingLoading(false);
      }
    };
    void loadRanking();
    return () => { active = false; };
  }, [rankingOpen, rankingMode, rankingCategory, session.user.sub]);

  const [craftingStationId, setCraftingStationId] = useState<string | null>(null);
  const activeCraftingStation = LOBBY_CRAFTING_STATIONS.find(station => station.id === craftingStationId) ?? null;
  const [profileClassTab, setProfileClassTab] = useState<ClassId>('guerreiro');
  const [interfaceScale, setInterfaceScale] = useState<100 | 130 | 160>(() => {
    if (typeof window === 'undefined') return 130;
    const saved = window.localStorage.getItem('fibula-interface-scale');
    return saved === '100' || saved === '160' ? Number(saved) as 100 | 160 : 130;
  });
  const [landscapeMode, setLandscapeMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [audioMuted, setAudioMuted] = useState(() => audioManager.isMuted());
  const [audioVolume, setAudioVolume] = useState(() => audioManager.getVolume());
  const [showStart, setShowStart] = useState(true);
  const gameStartedRef = useRef(false);
  const zoomRef = useRef(window.matchMedia('(pointer: coarse)').matches ? 1.55 : 1.3);
  const cameraTransformRef = useRef({ scale: 1, left: 0, top: 0 });
  const flagsRef = useRef<Array<{ colorId: string; color: string; x: number; y: number; attachedToCart?: boolean }>>([]);
  const flagHoldRef = useRef<{ pointerId: number; clientX: number; clientY: number; timer: number | null } | null>(null);
  const [, setFlags] = useState<Array<{ colorId: string; color: string; x: number; y: number; attachedToCart?: boolean }>>([]);
  const [flagWheel, setFlagWheel] = useState<{ pointerId: number; screenX: number; screenY: number; originX: number; originY: number; selected: string | null } | null>(null);
  const flagWheelRef = useRef<{ pointerId: number; screenX: number; screenY: number; originX: number; originY: number; selected: string | null } | null>(null);
  const flagHotkeyOpenRef = useRef(false);
  const [flagHotkeyOpen, setFlagHotkeyOpen] = useState(false);
  const inventoryPanelOpenRef = useRef(false);
  const [inventoryPanelOpen, setInventoryPanelOpen] = useState(false);
  const lastTouchInventoryCloseAt = useRef(0);
  // Se a partida começou à noite, o amanhecer seguinte conclui o primeiro dia; não avance para Dia 2 nesse primeiro amanhecer.
  const survivalDay = state.startedAtNight ? Math.max(1, state.nightNumber) : state.nightNumber + 1;
  const feet = playerFeet(state.player);
  const cartDistance = Math.hypot(feet.x - state.cart.x, feet.y - state.cart.y);
  const cartAccessible = state.cart.repaired && (state.cart.carried || cartDistance <= CONFIG.cart.interactRadius);
  const houseDistance = Math.hypot(feet.x - state.house.x, feet.y - state.house.y);
  const houseAccessible = state.house.built && houseDistance <= CONFIG.house.interactRadius;
  const houseBuildAccessible = !state.house.built && houseDistance <= CONFIG.house.interactRadius;
  const refineryDistance = Math.hypot(feet.x - state.refinery.x, feet.y - state.refinery.y);
  const refineryBuildAccessible = !state.refinery.built && refineryDistance <= CONFIG.refinery.interactRadius;
  const tecelariaDistance = Math.hypot(feet.x - state.tecelaria.x, feet.y - state.tecelaria.y);
  const tecelariaBuildAccessible = !state.tecelaria.built && tecelariaDistance <= CONFIG.tecelaria.interactRadius;
  const cartBuildAccessible = !state.cart.repaired && cartDistance <= CONFIG.cart.interactRadius;
  const cartActionVisible = state.cart.repaired && (state.cart.carried || cartDistance <= CONFIG.cart.interactRadius);
  useEffect(() => {
    window.localStorage.setItem('fibula-interface-scale', String(interfaceScale));
  }, [interfaceScale]);

  useEffect(() => {
    window.localStorage.setItem('fibula-character-preferences', JSON.stringify(characterPreferences));
  }, [characterPreferences]);

  useEffect(() => {
    window.localStorage.setItem('fibula-arsenal-items', JSON.stringify(arsenalItems));
  }, [arsenalItems]);

  useEffect(() => {
    window.localStorage.setItem('fibula-arsenal-equipped-by-class', JSON.stringify(equipmentLoadouts));
  }, [equipmentLoadouts]);

  useEffect(() => {
    if (!friendsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFriendsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [friendsOpen]);

  useEffect(() => {
    if (!chestOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChestOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [chestOpen]);

  useEffect(() => {
    if (!playerProfileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPlayerProfileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [playerProfileOpen]);

  useEffect(() => {
    if (!fibulaSupabase || !session.user.sub) return;
    let active = true;
    void fibulaSupabase.from('fibula_profiles').select('avatar_character').eq('user_id', session.user.sub).maybeSingle()
      .then(({ data, error }) => {
        if (active && !error && data && isProfileClassId(data.avatar_character)) setAvatarCharacter(data.avatar_character);
      });
    return () => { active = false; };
  }, [session.user.sub]);

  useEffect(() => {
    if (!fibulaSupabase || !session.user.sub) return;
    void fibulaSupabase.from('fibula_profiles').upsert(
      { user_id: session.user.sub },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  }, [session.user.sub]);

  useEffect(() => {
    if (!profileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [profileOpen]);

  useEffect(() => {
    if (!statusOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatusOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [statusOpen]);

  useEffect(() => {
    if (!arsenalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArsenalOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [arsenalOpen]);

  useEffect(() => {
    if (!arsenalOpen) return;
    const canvas = arsenalCharacterCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const classId = characterPreferences[arsenalCharacterTab === 'principal' ? 0 : 1];
    if (!canvas || !ctx || !classId) return;
    let frame = 0;
    const renderArsenalCharacter = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / 65, height / 260);
      ctx.save();
      ctx.translate(width / 2, height * 0.78);
      ctx.scale(scale, scale);
      const weapon = PROFILE_CLASS_WEAPONS[classId];
      drawPlayer(ctx, 0, 0, weapon, classId, now / 1000, 0, 0, false, 0, false, 1, 0, -Math.PI / 2, false, true, false);
      ctx.restore();
      frame = window.requestAnimationFrame(renderArsenalCharacter);
    };
    frame = window.requestAnimationFrame(renderArsenalCharacter);
    return () => window.cancelAnimationFrame(frame);
  }, [arsenalOpen, arsenalCharacterTab, characterPreferences]);

  useEffect(() => {
    if (!showStart) return;
    const canvas = lobbyGrassCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const grassTile = createGrassTile();
    const drawGrass = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const pattern = ctx.createPattern(grassTile, 'repeat');
      if (pattern) pattern.setTransform(new DOMMatrix().scale(0.2));
      ctx.fillStyle = pattern ?? '#557a43';
      ctx.fillRect(0, 0, width, height);
    };
    drawGrass();
    window.addEventListener('resize', drawGrass);
    return () => window.removeEventListener('resize', drawGrass);
  }, [showStart]);

  useEffect(() => {
    if (!showStart) return;
    const canvas = lobbyCharacterCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    const renderCharacter = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / 220, height / 310);
      ctx.save();
      ctx.translate(width / 2, height * 0.82);
      ctx.scale(scale, scale);
      const lobbyClass = characterPreferences[0] ?? characterPreferences[1] ?? 'guerreiro';
      const lobbyWeapon = PROFILE_CLASS_WEAPONS[lobbyClass];
      drawPlayer(ctx, 0, 0, lobbyWeapon, lobbyClass, now / 1000, 0, 0, false, 0, false, 0, 1, -Math.PI / 2, false, false);
      drawFloatingWeapon(ctx, lobbyWeapon, CONFIG.player.radius, { time: now / 1000, facingX: 1, moving: false, hasEnemies: false, hasTarget: false, aimAngle: -Math.PI / 2, carried: false, swingTimer: 0, swingAngle: 0, forceVisible: true, preferredSide: -1 });
      ctx.restore();
      frame = window.requestAnimationFrame(renderCharacter);
    };
    frame = window.requestAnimationFrame(renderCharacter);
    return () => window.cancelAnimationFrame(frame);
  }, [showStart, characterPreferences]);

  useEffect(() => {
    ambience.setActive(!showStart && !state.dead);
    return () => ambience.setActive(false);
  }, [showStart, state.dead]);

  useEffect(() => {
    const syncFullscreenOrientation = () => {
      if (!document.fullscreenElement && landscapeMode) {
        try { window.screen.orientation?.unlock(); } catch { /* API indisponível neste navegador. */ }
        setLandscapeMode(false);
      }
    };
    document.addEventListener('fullscreenchange', syncFullscreenOrientation);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenOrientation);
  }, [landscapeMode]);

  useEffect(() => {
    const unlockAudio = () => {
      void audioManager.unlock();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio, { passive: true });

    const debugEnabled = new URLSearchParams(window.location.search).get('audiodebug') === '1';
    const debugWindow = window as Window & { __fibulaAudio?: typeof audioManager };
    if (debugEnabled) debugWindow.__fibulaAudio = audioManager;
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      if (debugEnabled && debugWindow.__fibulaAudio === audioManager) delete debugWindow.__fibulaAudio;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const engine = new GameEngine((next) => setState(next)); engine.onSound = (event) => audioManager.play(event); engineRef.current = engine;
    let frame = 0;
    const fpsEnabled = new URLSearchParams(window.location.search).get('fps') === '1';
    let fpsDisplay: HTMLDivElement | null = null;
    let fpsFrameCount = 0;
    let fpsWindowStart = performance.now();
    if (fpsEnabled) {
      fpsDisplay = document.createElement('div');
      Object.assign(fpsDisplay.style, {
        position: 'fixed', top: '8px', right: '8px', pointerEvents: 'none',
        zIndex: '2147483647', padding: '3px 6px', color: '#fff',
        background: 'rgba(0, 0, 0, 0.65)', font: '12px monospace',
      });
      fpsDisplay.textContent = 'FPS: --';
      document.body.appendChild(fpsDisplay);
    }
    // O terreno estático é preparado uma vez antes de liberar o início da partida.
    const terrainScale = 0.5;
    const terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = Math.ceil(engine.world * terrainScale);
    terrainCanvas.height = Math.ceil(engine.world * terrainScale);
    const terrainCtx = terrainCanvas.getContext('2d');
    const grassTile = createGrassTile();
    if (terrainCtx) {
      terrainCtx.scale(terrainScale, terrainScale);
      const grassPattern = terrainCtx.createPattern(grassTile, 'repeat');
      if (grassPattern) grassPattern.setTransform(new DOMMatrix().scale(0.2));
      terrainCtx.fillStyle = grassPattern ?? '#557a43';
      terrainCtx.fillRect(0, 0, engine.world, engine.world);


    }
    const overlay = document.createElement('canvas');
    const octx = overlay.getContext('2d');
    const fogTexture = document.createElement('canvas');
    const fogTextureCtx = fogTexture.getContext('2d');
    let fogTextureKey = '';
    const vignetteTexture = document.createElement('canvas');
    const vignetteTextureCtx = vignetteTexture.getContext('2d');
    let vignetteTextureKey = '';
    const overlayScale = 0.0625;
    const render = () => {
      if (fpsDisplay) {
        fpsFrameCount++;
        const now = performance.now();
        const elapsed = now - fpsWindowStart;
        if (elapsed >= 1000) {
          fpsDisplay.textContent = `FPS: ${Math.round(fpsFrameCount * 1000 / elapsed)}`;
          fpsFrameCount = 0;
          fpsWindowStart = now;
        }
      }
      const w = canvas.clientWidth, h = canvas.clientHeight;
      // Limita o buffer interno a Full HD conforme a orientação, sem alterar o tamanho visual.
      const portrait = h > w;
      const maxWidth = portrait ? 1080 : 1920;
      const maxHeight = portrait ? 1920 : 1080;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, maxWidth / w, maxHeight / h);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#121b21'; ctx.fillRect(0, 0, w, h);
      // O Canvas lê o estado mutável do motor a cada frame, sem render React por quadro.
      const s = engine.state;
      const scale = (s.cameraFull ? Math.min(w, h) / (engine.world + 80) : Math.min(w / 950, h / 680, 1.45)) * zoomRef.current;
      const viewW = w / scale, viewH = h / scale;
      const left = s.cameraFull
        ? engine.world / 2 - viewW / 2
        : viewW >= engine.world
          ? (engine.world - viewW) / 2
          : Math.max(0, Math.min(s.player.x - viewW / 2, engine.world - viewW));
      const top = s.cameraFull
        ? engine.world / 2 - viewH / 2
        : viewH >= engine.world
          ? (engine.world - viewH) / 2
          : Math.max(0, Math.min(s.player.y - viewH / 2, engine.world - viewH));
      cameraTransformRef.current = { scale, left, top };
      ctx.save(); ctx.scale(scale, scale); ctx.translate(-left, -top);
      ctx.drawImage(terrainCanvas, 0, 0, engine.world, engine.world);
      ctx.strokeStyle = '#91a99a'; ctx.lineWidth = CONFIG.map.wall; ctx.strokeRect(CONFIG.map.wall / 2, CONFIG.map.wall / 2, engine.world - CONFIG.map.wall, engine.world - CONFIG.map.wall);
      if (s.showRange && !s.cameraFull) {
        ctx.save();
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y, CONFIG.weapons[s.weapon].range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(135,205,179,0.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(135,205,179,0.24)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      // Efeitos de chão/voo ficam em camada própria; entidades sólidas usam ordenação por profundidade Y.
      for (const orb of s.xpOrbs) {
        ctx.beginPath(); ctx.arc(orb.x, orb.y, CONFIG.xp.radius, 0, Math.PI * 2); ctx.fillStyle = '#77e6c0'; ctx.fill();
        ctx.strokeStyle = '#d4fff0'; ctx.lineWidth = 2; ctx.stroke();
      }
      for (const effect of s.explosions) {
        const progress = effect.age / effect.duration;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.strokeStyle = '#c8a8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(effect.x, effect.y, CONFIG.mageExplosion.radius * (0.75 + progress * 0.25), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      for (const shot of s.shots) {
        ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
        if (shot.kind === 'arrow') drawArrowShot(ctx, CONFIG.player.radius);
        else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = s.classId === 'druida' ? '#65e65d' : '#a98cff'; ctx.fill(); if (s.classId === 'druida') { ctx.strokeStyle = '#c6ffad'; ctx.lineWidth = 2; ctx.stroke(); } }
        ctx.restore();
      }
      const range = CONFIG.weapons[s.weapon].range;
      const rangeSquared = range * range;
      let aimTarget: typeof s.enemies[number] | undefined;
      let closestDistanceSquared = rangeSquared;
      for (const enemy of s.enemies) {
        const dx = enemy.x - s.player.x;
        const dy = enemy.y - s.player.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= rangeSquared && (!aimTarget || distanceSquared < closestDistanceSquared)) {
          aimTarget = enemy;
          closestDistanceSquared = distanceSquared;
        }
      }
      if (s.player.facingX < -0.35) floatingWeaponSide = 1;
      else if (s.player.facingX > 0.35) floatingWeaponSide = -1;
      const bowGripX = s.player.x + floatingWeaponSide * CONFIG.player.auraRadius;
      const bowGripY = s.player.y - CONFIG.player.radius * 0.1;
      const aimAngle = aimTarget
        ? s.weapon === 'arco'
          ? Math.atan2(aimTarget.y - bowGripY, aimTarget.x - bowGripX)
          : Math.atan2(aimTarget.y - s.player.y, aimTarget.x - s.player.x)
        : s.player.facingX < -0.35 ? Math.PI : 0;
      const worldDrawables: Array<{ depth: number; draw: () => void }> = [];
      if (s.classId === 'druida') {
        s.healingOrbs.forEach((_, index) => {
          const angle = s.elapsed * 1.4 + index * (Math.PI * 2 / Math.max(1, s.healingOrbs.length));
          const orbitRadius = CONFIG.player.radius * (30 / 18);
          const ox = s.player.x + Math.cos(angle) * orbitRadius;
          const oy = s.player.y + Math.sin(angle) * orbitRadius;
          const playerDepth = s.player.y + ladinoFeetY(CONFIG.player.radius) - CONFIG.player.radius * 0.1;
          const orbDepth = Math.sin(angle) >= 0 ? playerDepth + 1 : s.player.y - CONFIG.player.radius;
          worldDrawables.push({ depth: orbDepth, draw: () => {
            ctx.save(); ctx.shadowColor = '#8dff9c'; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fillStyle = '#9bff9b'; ctx.fill();
            ctx.strokeStyle = '#e3ffe0'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
          }});
        });
      }
      for (const flag of flagsRef.current) {
        if (!flag.attachedToCart) worldDrawables.push({ depth: flag.y + 15, draw: () => drawFlag(ctx, flag.x, flag.y, flag.color, s.elapsed) });
        else worldDrawables.push({ depth: s.cart.y + 15, draw: () => drawFlag(ctx, s.cart.x, s.cart.y - 34, flag.color, s.elapsed) });
      }
      worldDrawables.push({ depth: s.house.y + 28, draw: () => drawHouse(ctx, s.house) });
      worldDrawables.push({ depth: s.refinery.y + 28, draw: () => drawRefinery(ctx, s.refinery) });
      worldDrawables.push({ depth: s.tecelaria.y + 28, draw: () => drawTecelaria(ctx, s.tecelaria) });
      worldDrawables.push({ depth: s.cart.y + 14, draw: () => {
        const playerGround = playerFeet(s.player);
        drawCart(ctx, s.cart, Math.hypot(playerGround.x - s.cart.x, playerGround.y - s.cart.y) <= CONFIG.cart.interactRadius, s.elapsed, s.player.moving && s.cart.carried, s.cart.carried ? s.walkPhase : undefined);
      }});
      for (const plant of s.cottonPlants) {
        const scale = 1.2;
        worldDrawables.push({ depth: plant.y + 13 * scale, draw: () => {
          drawResourceRarityAura(ctx, plant.x, plant.y + 12, plant.size === 'large' ? 42 : plant.size === 'medium' ? 34 : 26, plant.rarity);
          ctx.save(); ctx.translate(plant.x, plant.y); ctx.scale(scale * 0.9, scale * 1.15);
          ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 12, 18, 7, 0, 0, Math.PI * 2); ctx.fill();

          // Algodoeiro baixo: galhos lenhosos e secos, não uma planta verde.
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = '#765038'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 12); ctx.lineTo(0, 2); ctx.lineTo(-2, -6); ctx.lineTo(-7, -13);
          ctx.moveTo(-2, -5); ctx.lineTo(6, -11); ctx.lineTo(9, -17);
          ctx.moveTo(-1, 1); ctx.lineTo(-10, -5); ctx.lineTo(-13, -11);
          ctx.moveTo(0, 3); ctx.lineTo(10, 0); ctx.lineTo(14, -6);
          ctx.stroke();

          // Folhas pequenas e queimadas, em tons de palha, ocre e marrom.
          const dryLeaf = (x: number, y: number, angle: number, color: string) => {
            ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
            ctx.fillStyle = color; ctx.strokeStyle = '#76543a'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(-5, -5, -1, -9);
            ctx.lineTo(1, -4); ctx.lineTo(2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore();
          };
          dryLeaf(-5, -10, -0.65, '#9b7549');
          dryLeaf(-10, -5, -1.1, '#b18a58');
          dryLeaf(5, -10, 0.7, '#a27a4d');
          dryLeaf(10, -1, 0.9, '#8d6945');
          dryLeaf(-2, -3, -0.35, '#b08a5c');

          // Capulhos brancos e macios nas pontas dos galhos.
          const boll = (x: number, y: number, size: number) => {
            ctx.save(); ctx.translate(x, y);
            ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#d8d0c1'; ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(-size * 0.42, 0, size * 0.48, 0, Math.PI * 2);
            ctx.arc(0, -size * 0.28, size * 0.55, 0, Math.PI * 2);
            ctx.arc(size * 0.42, 0, size * 0.46, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.arc(-size * 0.1, -size * 0.42, size * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          };
          const bollCount = plant.size === 'small' ? 2 : plant.size === 'medium' ? 4 : 6;
          const bolls = [[-7, -14], [9, -18], [-13, -12], [14, -7], [0, -7], [-3, -21]] as const;
          for (let i = 0; i < bollCount; i++) {
            const [bx, by] = bolls[i];
            boll(bx, by, plant.size === 'small' ? 4.5 : plant.size === 'medium' ? 4.6 : 4.8);
          }
          ctx.restore();
        }});
      }
      for (const tree of s.trees) {
        const scale = tree.size === 'small' ? 1.75 : tree.size === 'medium' ? 2.45 : 3.25;
        worldDrawables.push({ depth: tree.y + 30 * scale, draw: () => { drawResourceRarityAura(ctx, tree.x, tree.y + 29 * scale, tree.size === 'large' ? 64 : tree.size === 'medium' ? 50 : 38, tree.rarity); drawTree(ctx, tree.x, tree.y, tree.size); } });
      }
      for (const rock of s.rocks) {
        const scale = rock.size === 'small' ? 1.22 : rock.size === 'medium' ? 1.5 : 1.85;
        worldDrawables.push({ depth: rock.y + 12 * scale, draw: () => { drawResourceRarityAura(ctx, rock.x, rock.y + 12 * scale, rock.size === 'large' ? 46 : rock.size === 'medium' ? 36 : 28, rock.rarity); drawRock(ctx, rock.x, rock.y, rock.size); } });
      }
      for (const drop of s.cottonDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 4, 18, drop.rarity);
          ctx.save(); ctx.translate(drop.x, drop.y); ctx.scale(1.12, 1.12);
          // Capulho de algodão em lóbulos facetados, mantendo o aspecto macio.
          ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#c8c3b6'; ctx.lineWidth = 1;
          const lobe = (points: Array<[number, number]>) => {
            ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            ctx.closePath(); ctx.fill(); ctx.stroke();
          };
          lobe([[-7, 0], [-5, -4], [-2, -5], [1, -2], [0, 3], [-4, 4]]);
          lobe([[-2, -2], [-1, -6], [3, -7], [6, -4], [5, 1], [1, 3]]);
          lobe([[2, 1], [5, -1], [8, 1], [7, 5], [3, 5], [1, 3]]);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-2, -4); ctx.moveTo(2, -4); ctx.lineTo(4, -5); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.linenDrops) {
        worldDrawables.push({ depth: drop.y + 5, draw: () => {
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#e5d6b5'; ctx.strokeStyle = '#8b7857'; ctx.lineWidth = 1.3;
          ctx.fillRect(-6, -4, 12, 8); ctx.strokeRect(-6, -4, 12, 8);
          ctx.strokeStyle = '#b39a70'; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-3, 4); ctx.moveTo(1, -4); ctx.lineTo(1, 4); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.stoneDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 6, 20, drop.rarity);
          ctx.save(); ctx.translate(drop.x, drop.y); ctx.scale(0.84, 0.84);
          // Pedra low-poly com a mesma paleta cinza da rocha minerável e dos slots.
          const facet = (points: Array<[number, number]>, fill: string) => {
            ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
          };
          ctx.beginPath();
          ctx.moveTo(-10, 1); ctx.lineTo(-9, -4); ctx.lineTo(-5, -8); ctx.lineTo(-2, -11);
          ctx.lineTo(2, -10); ctx.lineTo(5, -11); ctx.lineTo(9, -6); ctx.lineTo(11, -2);
          ctx.lineTo(9, 3); ctx.lineTo(5, 6); ctx.lineTo(0, 7); ctx.lineTo(-5, 6); ctx.closePath();
          ctx.fillStyle = '#788188'; ctx.fill(); ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1.2; ctx.stroke();
          facet([[-10, 1], [-9, -4], [-5, -8], [-4, -2], [-6, 2], [-5, 6]], '#929ba1');
          facet([[-9, -4], [-5, -8], [-2, -11], [0, -5], [-4, -2]], '#aab2b7');
          facet([[-2, -11], [2, -10], [4, -6], [0, -5]], '#c0c6ca');
          facet([[2, -10], [5, -11], [9, -6], [5, -4], [4, -6]], '#aeb7bd');
          facet([[9, -6], [11, -2], [7, 0], [5, -4]], '#89939a');
          facet([[-4, -2], [0, -5], [4, -6], [2, -1], [-2, 2]], '#9ca6ac');
          facet([[4, -6], [5, -4], [7, 0], [3, 2], [2, -1]], '#737e85');
          facet([[-6, 2], [-4, -2], [-2, 2], [-3, 5], [-5, 6]], '#7e898f');
          facet([[-2, 2], [2, -1], [3, 2], [1, 5], [-3, 5]], '#a2abb0');
          facet([[3, 2], [7, 0], [9, 3], [5, 6], [1, 5]], '#68737a');
          facet([[-5, 6], [-3, 5], [1, 5], [5, 6], [0, 7]], '#657078');
          ctx.strokeStyle = 'rgba(48,56,61,0.58)'; ctx.lineWidth = 0.65;
          ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(-6, -3); ctx.moveTo(6, 2); ctx.lineTo(5, 4); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.bronzeDrops) {
        worldDrawables.push({ depth: drop.y + 5, draw: () => {
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#b87333'; ctx.strokeStyle = '#70451f'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-4, -3); ctx.lineTo(0, -5); ctx.lineTo(5, -2); ctx.lineTo(6, 2); ctx.lineTo(1, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#e0a15e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(2, -1); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.woodDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 3, 22, drop.rarity);
          ctx.save(); ctx.translate(drop.x, drop.y);
          // Usa o mesmo ícone da mochila, agora como um único tronco.
          ctx.font = '22px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(itemIcon('wood'), 0, 0);
          ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(drop.amount), 0, -13); ctx.restore();
        }});
      }
      for (const enemy of s.enemies) {
        worldDrawables.push({ depth: enemy.y + CONFIG.enemy.radius * 0.7, draw: () => drawSlime(ctx, enemy.x, enemy.y, CONFIG.enemy.radius, '#70d78d', '#397e58', enemy.wobble) });
      }
      for (const enemy of s.dyingEnemies) {
        const progress = Math.min(1, enemy.deathAge / 0.48);
        worldDrawables.push({ depth: enemy.y + CONFIG.enemy.radius * 0.7 + progress * CONFIG.enemy.radius * 0.65, draw: () => {
          ctx.save(); ctx.globalAlpha = 1 - progress;
          ctx.translate(enemy.x, enemy.y + progress * CONFIG.enemy.radius * 0.65);
          ctx.scale(1 + progress * 0.38, Math.max(0.06, 1 - progress * 0.92));
          drawSlime(ctx, 0, 0, CONFIG.enemy.radius, '#70d78d', '#397e58', enemy.wobble);
          ctx.restore();
        }});
      }
      worldDrawables.push({ depth: s.player.y + ladinoFeetY(CONFIG.player.radius) - CONFIG.player.radius * 0.1, draw: () => drawPlayer(ctx, s.player.x, s.player.y, s.weapon, s.classId, s.elapsed, s.swordSwingAngle, s.swordSwingTimer, s.player.moving, s.walkPhase, s.cart.carried, s.player.facingX, s.player.facingY, aimAngle, aimTarget != null, s.dayNight === 'night') });
      // Ferramentas de coleta ficam ancoradas no recurso (não no jogador) e em camada própria, à frente do recurso.
      const gatherTool = s.treeChopTimer > 0 ? { tool: 'machadinho' as const, timer: s.treeChopTimer, angle: s.treeChopAngle }
        : s.rockMineTimer > 0 ? { tool: 'picareta' as const, timer: s.rockMineTimer, angle: s.rockMineAngle }
        : s.cottonHarvestTimer > 0 ? { tool: 'foice' as const, timer: s.cottonHarvestTimer, angle: s.cottonHarvestAngle } : null;
      if (gatherTool) {
        worldDrawables.push({ depth: s.gatherDepth, draw: () => {
          ctx.save(); ctx.translate(s.gatherX, s.gatherY);
          drawFloatingTool(ctx, gatherTool.tool, CONFIG.player.radius, { angle: gatherTool.angle, timer: gatherTool.timer, duration: CONFIG.gathering.toolAnimationDuration, reach: 0, minGrip: -9999 });
          ctx.restore();
        } });
      }
      worldDrawables.sort((a, b) => a.depth - b.depth);
      for (const drawable of worldDrawables) drawable.draw();
      for (const damage of s.floatingDamage) {
        const progress = Math.min(1, damage.age / damage.duration);
        const pop = progress < 0.18
          ? 0.82 + (progress / 0.18) * 0.3
          : 1.12 - Math.min(1, (progress - 0.18) / 0.82) * 0.12;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.translate(damage.x, damage.y - progress * 46);
        ctx.scale(pop * damage.scale, pop * damage.scale);
        ctx.font = '900 25px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = 'rgba(8, 12, 14, 0.92)';
        ctx.strokeText((Number.isInteger(damage.amount) ? String(damage.amount) : damage.amount.toFixed(1)), 0, 0);
        ctx.fillStyle = damage.color;
        ctx.fillText((Number.isInteger(damage.amount) ? String(damage.amount) : damage.amount.toFixed(1)), 0, 0);
        ctx.restore();
      }
      const transition = CONFIG.dayNight.transitionDuration;
      const darkness = s.dayNight === 'night'
        ? 1
        : Math.max(0, Math.min(1, (s.phaseElapsed - (CONFIG.dayNight.dayDuration - transition)) / transition));
      ctx.restore();
      // Neblina e vinheta são renderizadas em um overlay reutilizado a 6,25% da resolução para reduzir o custo de renderização.
      if (darkness > 0.01 && octx) {
        const overlayWidth = Math.ceil(w * overlayScale);
        const overlayHeight = Math.ceil(h * overlayScale);
        if (overlay.width !== overlayWidth || overlay.height !== overlayHeight) {
          overlay.width = overlayWidth;
          overlay.height = overlayHeight;
        }
        octx.setTransform(1, 0, 0, 1, 0, 0);

        // Reutiliza a textura da neblina; só a recria se tamanho, escala ou configuração mudarem.
        const fogRadius = CONFIG.dayNight.visibilityRange * 1.5;
        const fogTextureWidth = overlay.width * 2;
        const fogTextureHeight = overlay.height * 2;
        const nextFogTextureKey = `${fogTextureWidth}x${fogTextureHeight}:${scale}:${fogRadius}:${Math.min(0.78, CONFIG.dayNight.nightOverlayStrength)}`;
        if (fogTextureCtx && fogTextureKey !== nextFogTextureKey) {
          fogTexture.width = fogTextureWidth;
          fogTexture.height = fogTextureHeight;
          const fogCenterX = fogTextureWidth / 2;
          const fogCenterY = fogTextureHeight / 2;
          const fog = fogTextureCtx.createRadialGradient(
            fogCenterX, fogCenterY, 0,
            fogCenterX, fogCenterY, fogRadius * scale * overlayScale,
          );
          fog.addColorStop(0, 'rgba(5, 8, 18, 0.14)');
          fog.addColorStop(0.45, 'rgba(5, 8, 18, 0.32)');
          fog.addColorStop(0.78, 'rgba(5, 8, 18, 0.58)');
          fog.addColorStop(1, `rgba(5, 8, 18, ${Math.min(0.78, CONFIG.dayNight.nightOverlayStrength)})`);
          fogTextureCtx.fillStyle = fog;
          fogTextureCtx.fillRect(0, 0, fogTextureWidth, fogTextureHeight);
          fogTextureKey = nextFogTextureKey;
        }
        if (fogTextureCtx) {
          const playerScreenX = (s.player.x - left) * scale * overlayScale;
          const playerScreenY = (s.player.y - top) * scale * overlayScale;
          octx.globalCompositeOperation = 'copy';
          octx.globalAlpha = darkness;
          octx.drawImage(
            fogTexture,
            fogTexture.width / 2 - playerScreenX,
            fogTexture.height / 2 - playerScreenY,
            overlay.width,
            overlay.height,
            0, 0, overlay.width, overlay.height,
          );
          octx.globalAlpha = 1;
          octx.globalCompositeOperation = 'source-over';
        }

        // A vinheta também usa uma textura reutilizável; o recorte acompanha a posição do jogador.
        const playerScreenX = (s.player.x - left) * scale;
        const playerScreenY = (s.player.y - top) * scale;
        const vignetteWidth = overlay.width * 3;
        const vignetteHeight = overlay.height * 3;
        const nextVignetteTextureKey = `${vignetteWidth}x${vignetteHeight}:${w}x${h}`;
        if (vignetteTextureCtx && vignetteTextureKey !== nextVignetteTextureKey) {
          vignetteTexture.width = vignetteWidth;
          vignetteTexture.height = vignetteHeight;
          const vignetteCenterX = vignetteWidth / 2;
          const vignetteCenterY = vignetteHeight / 2;
          const vignette = vignetteTextureCtx.createRadialGradient(
            vignetteCenterX, vignetteCenterY, Math.min(w, h) * 0.08 * overlayScale,
            vignetteCenterX, vignetteCenterY, Math.hypot(w / 2, h / 2) * overlayScale,
          );
          vignette.addColorStop(0, 'rgba(3, 5, 13, 0.02)');
          vignette.addColorStop(0.35, 'rgba(3, 5, 13, 0.05)');
          vignette.addColorStop(0.6, 'rgba(3, 5, 13, 0.18)');
          vignette.addColorStop(0.82, 'rgba(3, 5, 13, 0.38)');
          vignette.addColorStop(1, 'rgba(3, 5, 13, 0.55)');
          vignetteTextureCtx.fillStyle = vignette;
          vignetteTextureCtx.fillRect(0, 0, vignetteWidth, vignetteHeight);
          vignetteTextureKey = nextVignetteTextureKey;
        }
        if (vignetteTextureCtx) {
          const sourceX = vignetteTexture.width / 2 - overlay.width / 2 + (w / 2 - playerScreenX) * overlayScale;
          const sourceY = vignetteTexture.height / 2 - overlay.height / 2 + (h / 2 - playerScreenY) * overlayScale;
          octx.globalAlpha = darkness;
          octx.drawImage(
            vignetteTexture,
            sourceX, sourceY, overlay.width, overlay.height,
            0, 0, overlay.width, overlay.height,
          );
          octx.globalAlpha = 1;
        }

        // ctx já voltou ao transform de DPR, como no desenho original da vinheta.
        ctx.drawImage(overlay, 0, 0, w, h);
      }
      // Indicadores discretos na borda para bandeiras fora da área visível.
      for (const flag of flagsRef.current) {
        const flagX = flag.attachedToCart ? s.cart.x : flag.x;
        const flagY = flag.attachedToCart ? s.cart.y - 34 : flag.y;
        const targetX = (flagX - left) * scale;
        const targetY = (flagY - top) * scale;
        if (targetX >= 0 && targetX <= w && targetY >= 0 && targetY <= h) continue;
        const dx = targetX - w / 2;
        const dy = targetY - h / 2;
        const inset = 20;
        const halfW = Math.max(1, w / 2 - inset);
        const halfH = Math.max(1, h / 2 - inset);
        const factor = Math.min(halfW / Math.max(0.0001, Math.abs(dx)), halfH / Math.max(0.0001, Math.abs(dy)));
        const x = w / 2 + dx * factor;
        const y = h / 2 + dy * factor;
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = flag.color;
        ctx.shadowColor = flag.color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-5, -4.5);
        ctx.lineTo(-5, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const resize = () => { canvas.style.width = '100%'; };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); fpsDisplay?.remove(); engine.stop(); window.removeEventListener('resize', resize); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const engine = engineRef.current; if (!engine) return;
    const down = (e: KeyboardEvent) => {
      if (!gameStartedRef.current) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) closeFlagMenu();
      if (k === 'escape') {
        closeFlagMenu();
        closeInventoryPanel();
        return;
      }
      if (k === 'b' && !e.repeat) {
        toggleInventoryPanel();
        return;
      }
      if ((e.target instanceof HTMLElement) && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
      if (k === 'q' && !e.repeat) {
        const current = engine.state;
        const currentFeet = playerFeet(current.player);
        const cartDistanceNow = Math.hypot(currentFeet.x - current.cart.x, currentFeet.y - current.cart.y);
        const houseDistanceNow = Math.hypot(currentFeet.x - current.house.x, currentFeet.y - current.house.y);
        const canUseCart = current.cart.repaired && (current.cart.carried || cartDistanceNow <= CONFIG.cart.interactRadius);
        const canUseHouse = current.house.built && houseDistanceNow <= CONFIG.house.interactRadius;
        if (canUseCart || canUseHouse) {
          if (canUseCart && (!canUseHouse || cartDistanceNow <= houseDistanceNow)) engine.storeAllBagToCart();
          else engine.storeAllBagToHouse();
        }
        return;
      }
      if (k === 'e' && !e.repeat) {
        const current = engine.state;
        const currentFeet = playerFeet(current.player);
        const options: Array<{ distance: number; radius: number; available: boolean; build: () => void }> = [
          { distance: Math.hypot(currentFeet.x - current.cart.x, currentFeet.y - current.cart.y), radius: CONFIG.cart.interactRadius, available: !current.cart.repaired, build: () => engine.buildCart() },
          { distance: Math.hypot(currentFeet.x - current.house.x, currentFeet.y - current.house.y), radius: CONFIG.house.interactRadius, available: !current.house.built, build: () => engine.buildHouse() },
          { distance: Math.hypot(currentFeet.x - current.refinery.x, currentFeet.y - current.refinery.y), radius: CONFIG.refinery.interactRadius, available: !current.refinery.built, build: () => engine.buildRefinery() },
          { distance: Math.hypot(currentFeet.x - current.tecelaria.x, currentFeet.y - current.tecelaria.y), radius: CONFIG.tecelaria.interactRadius, available: !current.tecelaria.built, build: () => engine.buildTecelaria() },
        ];
        const nearest = options.filter(option => option.available && option.distance <= option.radius).sort((a, b) => a.distance - b.distance)[0];
        nearest?.build();
        return;
      }
      if (k === 't' && !e.repeat) {
        if (removeFlagAtPlayer()) {
          closeFlagMenu();
          closeInventoryPanel();
          return;
        }
        if (flagHotkeyOpenRef.current) closeFlagMenu();
        else {
          closeInventoryPanel();
          flagHotkeyOpenRef.current = true;
          setFlagHotkeyOpen(true);
          closeFlagWheel();
        }
        return;
      }
      if (flagHotkeyOpenRef.current && ['1', '2', '3', '4'].includes(k)) {
        placeFlagByIndex(Number(k) - 1);
        closeFlagMenu();
        return;
      }
      engine.setKey(k, true);
      
      if (k === '1') engine.setClass('guerreiro');
      if (k === '2') engine.setClass('mago');
      if (k === '3') engine.setClass('arqueiro');
      if (k === '4') engine.setClass('druida');
      if (k === 'r') engine.toggleRange();
      if (k === ' ' && !e.repeat) engine.toggleCart();
    };
    const up = (e: KeyboardEvent) => { if (gameStartedRef.current) engine.setKey(e.key, false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const startGame = async () => {
    const engine = engineRef.current;
    if (!engine || gameStartedRef.current || gameStartPendingRef.current) return;
    gameStartPendingRef.current = true;
    try {
      if (!fibulaSupabase || !session.user.sub) {
        throw new Error('Entre na sua conta e conecte-se à internet para iniciar uma partida com progresso validado.');
      }
      const sessionId = await startSoloMatchSession(fibulaSupabase);
      matchSessionIdRef.current = sessionId;
      matchSummaryHandledRef.current = false;
      const selectedClass = characterPreferences[0] ?? characterPreferences[1] ?? 'guerreiro';
      engine.setClass(selectedClass);
      engine.start();
      gameStartedRef.current = true;
      setShowStart(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível registrar o início da partida. Tente novamente.');
    } finally {
      gameStartPendingRef.current = false;
    }
  };
  const pickClass = (id: ClassId) => engineRef.current?.setClass(id);
  const toggleRange = () => engineRef.current?.toggleRange();
  const toggleCart = () => engineRef.current?.toggleCart();
  const discardBagItem = (index: number) => engineRef.current?.discardBagItem(index);
  const transferCartToBag = (index: number) => engineRef.current?.transferCartToBag(index);
  const transferHouseToBag = (itemId: string) => engineRef.current?.transferHouseToBag(itemId);
  const storeAllBagToHouse = () => engineRef.current?.storeAllBagToHouse();
  const storeAllBagToCart = () => engineRef.current?.storeAllBagToCart();
  const buildHouse = () => engineRef.current?.buildHouse();
  const buildRefinery = () => engineRef.current?.buildRefinery();
  const buildCart = () => engineRef.current?.buildCart();
  const setWheel = (next: { pointerId: number; screenX: number; screenY: number; originX: number; originY: number; selected: string | null } | null) => {
    flagWheelRef.current = next;
    setFlagWheel(next);
  };
  const closeFlagWheel = () => { if (flagWheelRef.current) setWheel(null); };
  const closeFlagMenu = () => {
    closeFlagWheel();
    if (flagHotkeyOpenRef.current) {
      flagHotkeyOpenRef.current = false;
      setFlagHotkeyOpen(false);
    }
  };
  const closeInventoryPanel = () => {
    inventoryPanelOpenRef.current = false;
    setInventoryPanelOpen(false);
  };
  const handleInventoryClosePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    lastTouchInventoryCloseAt.current = Date.now();
    closeInventoryPanel();
  };
  const handleInventoryCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 && Date.now() - lastTouchInventoryCloseAt.current < 800) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    closeInventoryPanel();
  };
  const toggleInventoryPanel = () => {
    closeFlagMenu();
    const nextOpen = !inventoryPanelOpenRef.current;
    inventoryPanelOpenRef.current = nextOpen;
    setInventoryPanelOpen(nextOpen);
  };
  const removeFlagAtPlayer = () => {
    const player = engineRef.current?.state.player;
    const cart = engineRef.current?.state.cart;
    if (!player) return false;
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    flagsRef.current.forEach((flag, index) => {
      const x = flag.attachedToCart && cart ? cart.x : flag.x;
      const y = flag.attachedToCart && cart ? cart.y - 34 : flag.y;
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex < 0 || nearestDistance > 34) return false;
    const next = flagsRef.current.filter((_, index) => index !== nearestIndex);
    flagsRef.current = next;
    setFlags(next);
    return true;
  };
  const placeFlagByIndex = (index: number) => {
    const color = CONFIG.flags.colors[index];
    const player = engineRef.current?.state.player;
    const cart = engineRef.current?.state.cart;
    if (!color || !player) return;
    const attachToCart = !!cart && Math.hypot(playerFeet(player).x - cart.x, playerFeet(player).y - cart.y) <= CONFIG.cart.interactRadius;
    const next = [...flagsRef.current.filter(flag => flag.colorId !== color.id), {
      colorId: color.id,
      color: color.color,
      x: attachToCart && cart ? cart.x : player.x,
      y: attachToCart && cart ? cart.y - 34 : player.y,
      ...(attachToCart ? { attachedToCart: true } : {}),
    }];
    flagsRef.current = next;
    setFlags(next);
  };
  const returnToLobby = () => {
    const engine = engineRef.current;
    if (!engine || gameStartPendingRef.current) return;
    gameStartedRef.current = false;
    engine.restart();
    engine.stop();
    flagsRef.current = [];
    setFlags([]);
    setWheel(null);
    closeFlagMenu();
    closeInventoryPanel();
    setShowHelp(false);
    setShowStart(true);
  };
  const restart = async () => {
    const engine = engineRef.current;
    if (!engine || gameStartPendingRef.current) return;
    gameStartPendingRef.current = true;
    try {
      if (!fibulaSupabase || !session.user.sub) {
        throw new Error('Conecte-se à internet para iniciar outra partida com progresso validado.');
      }
      const sessionId = await startSoloMatchSession(fibulaSupabase);
      matchSessionIdRef.current = sessionId;
      matchSummaryHandledRef.current = false;
      flagsRef.current = [];
      setFlags([]);
      setWheel(null);
      closeFlagMenu();
      closeInventoryPanel();
      engine.restart();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível registrar o início da nova partida.');
    } finally {
      gameStartPendingRef.current = false;
    }
  };
  const worldPointAt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const transform = cameraTransformRef.current;
    return { x: (clientX - rect.left) / transform.scale + transform.left, y: (clientY - rect.top) / transform.scale + transform.top };
  };
  const openFlagWheelAt = (clientX: number, clientY: number, pointerId: number) => {
    const stage = canvasRef.current?.parentElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const marginX = Math.min(90, rect.width / 2);
    const marginY = Math.min(90, rect.height / 2);
    const screenX = Math.max(marginX, Math.min(clientX - rect.left, rect.width - marginX));
    const screenY = Math.max(marginY, Math.min(clientY - rect.top, rect.height - marginY));
    setWheel({ pointerId, screenX, screenY, originX: clientX, originY: clientY, selected: null });
  };
  const onFlagTap = (clientX: number, clientY: number) => {
    const point = worldPointAt(clientX, clientY);
    const player = engineRef.current?.state.player;
    if (!point || !player || Math.hypot(point.x - player.x, point.y - player.y) < 40) return false;
    const cart = engineRef.current?.state.cart;
    const existing = flagsRef.current.find(flag => {
      const flagX = flag.attachedToCart && cart ? cart.x : flag.x;
      const flagY = flag.attachedToCart && cart ? cart.y - 34 : flag.y;
      return Math.hypot(flagX - point.x, flagY - point.y) <= 22;
    });
    if (!existing) return false;
    const next = flagsRef.current.filter(flag => flag.colorId !== existing.colorId);
    flagsRef.current = next; setFlags(next);
    return true;
  };
  const updateWheelSelection = (clientX: number, clientY: number, pointerId: number) => {
    const wheel = flagWheelRef.current;
    const stage = canvasRef.current?.parentElement;
    if (!wheel || wheel.pointerId !== pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = clientX - (rect.left + wheel.screenX);
    const dy = clientY - (rect.top + wheel.screenY);
    let selected: string | null = null;
    const dragged = Math.hypot(clientX - wheel.originX, clientY - wheel.originY) >= 30;
    if (dragged && Math.hypot(dx, dy) >= 30) {
      if (Math.abs(dx) > Math.abs(dy)) selected = dx > 0 ? 'green' : 'blue';
      else selected = dy > 0 ? 'red' : 'yellow';
    }
    if (wheel.selected !== selected) setWheel({ ...wheel, selected });
  };
  const onWheelMove = (clientX: number, clientY: number, pointerId: number) => updateWheelSelection(clientX, clientY, pointerId);
  const onWheelEnd = (clientX: number, clientY: number, pointerId: number) => {
    if (flagWheelRef.current?.pointerId !== pointerId) return;
    updateWheelSelection(clientX, clientY, pointerId);
    const wheel = flagWheelRef.current;
    const color = wheel?.selected ? CONFIG.flags.colors.find(item => item.id === wheel.selected) : null;
    const player = engineRef.current?.state.player;
    const cart = engineRef.current?.state.cart;
    if (color && player) {
      const attachToCart = !!cart && Math.hypot(playerFeet(player).x - cart.x, playerFeet(player).y - cart.y) <= CONFIG.cart.interactRadius;
      const next = [...flagsRef.current.filter(flag => flag.colorId !== color.id), {
        colorId: color.id, color: color.color,
        x: attachToCart && cart ? cart.x : player.x,
        y: attachToCart && cart ? cart.y - 34 : player.y,
        ...(attachToCart ? { attachedToCart: true } : {}),
      }];
      flagsRef.current = next; setFlags(next);
    }
    setWheel(null);
  };
  const onJoystickLongPress = (clientX: number, clientY: number, pointerId: number) => openFlagWheelAt(clientX, clientY, pointerId);
  const onFlagPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (flagWheelRef.current) return;
    if (event.button === 2) {
      event.preventDefault();
      openFlagWheelAt(event.clientX, event.clientY, event.pointerId);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (onFlagTap(event.clientX, event.clientY)) { event.preventDefault(); return; }
    const pending = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, timer: null as number | null };
    pending.timer = window.setTimeout(() => {
      if (flagHoldRef.current !== pending) return;
      openFlagWheelAt(pending.clientX, pending.clientY, pending.pointerId);
      flagHoldRef.current = null;
    }, 400);
    flagHoldRef.current = pending;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onFlagPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (flagWheelRef.current?.pointerId === event.pointerId) { updateWheelSelection(event.clientX, event.clientY, event.pointerId); return; }
    const pending = flagHoldRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY) > 10) {
      if (pending.timer !== null) window.clearTimeout(pending.timer);
      flagHoldRef.current = null;
    }
  };
  const onFlagPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (flagWheelRef.current?.pointerId === event.pointerId) { onWheelEnd(event.clientX, event.clientY, event.pointerId); return; }
    const pending = flagHoldRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (pending.timer !== null) window.clearTimeout(pending.timer);
    flagHoldRef.current = null;
  };
  const onFlagContextMenu = (event: MouseEvent<HTMLCanvasElement>) => { event.preventDefault(); };
  const toggleLandscapeMode = async () => {
    const orientation = window.screen.orientation as typeof window.screen.orientation & {
      lock?: (value: 'landscape') => Promise<void>;
    };
    if (landscapeMode) {
      try { orientation?.unlock(); } catch { /* API indisponível neste navegador. */ }
      setLandscapeMode(false);
      return;
    }
    const stage = canvasRef.current?.parentElement;
    try {
      if (stage?.requestFullscreen && !document.fullscreenElement) await stage.requestFullscreen();
      if (!orientation?.lock) return;
      await orientation.lock('landscape');
      setLandscapeMode(true);
    } catch {
      // A orientação forçada depende do suporte do navegador e normalmente exige tela cheia.
      setLandscapeMode(false);
    }
  };

  return <main className="game-shell" style={{ '--interface-scale': interfaceScale / 100 } as CSSProperties}>
    <header className="topbar">
      <div className="brand-mark">F<span>Í</span>BULA</div>
      <div className="subtitle">ONLINE <i /> SOBREVIVÊNCIA</div>
      <button className="help-button" onClick={() => { const nextMuted = !audioMuted; setAudioMuted(nextMuted); audioManager.setMuted(nextMuted); }} aria-label={audioMuted ? "Ligar efeitos sonoros" : "Desligar efeitos sonoros"} aria-pressed={!audioMuted} title={audioMuted ? "Ligar efeitos sonoros" : "Desligar efeitos sonoros"}>{audioMuted ? "🔇" : "🔊"}</button>
      <button className="help-button" onClick={() => setShowHelp(v => !v)} aria-label="Ajuda">?</button>
    </header>
    <section className="game-stage">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Campo de jogo 2D" onPointerDown={onFlagPointerDown} onPointerMove={onFlagPointerMove} onPointerUp={onFlagPointerUp} onPointerCancel={onFlagPointerUp} onContextMenu={onFlagContextMenu} />
      <div className="hud-top" aria-label="Status da partida">
        <div className="hud-left-stack">
          <div className="hud-vitals-panel">
            <div className="hud-level">NÍVEL <strong>{state.player.level}</strong></div>
            <div className="hud-meter health-meter"><span>HP</span><div className="bar"><i style={{ width: Math.max(0, state.player.hp / state.player.maxHp * 100) + '%' }} /></div><b>{Math.floor(state.player.hp)}/{Math.floor(state.player.maxHp)}</b></div>
            <div className="hud-meter xp-meter"><span>XP</span><div className="bar xp-bar"><i style={{ width: state.player.xp / state.player.nextXp * 100 + '%' }} /></div><b>{state.player.xp}/{state.player.nextXp}</b></div>
          </div>
          <div className="hud-center-stack">
            <div className="hud-chip timer"><span>DIA / NOITE</span><strong>{state.dayNight === 'night' ? 'NOITE' : state.dayNight === 'dawn' ? 'AMANHECENDO' : 'DIA'}</strong></div>
            <div className="hud-substats">
              <div className="hud-chip compact"><span>DIA</span><strong>{survivalDay}</strong></div>
              <div className="hud-chip kills-chip"><span>☠ MORTOS</span><strong>{state.kills}</strong></div>
            </div>
          </div>
        </div>
      </div>
      {showStart && <div className="lobby-screen" role="dialog" aria-label="Lobby do Fíbula Online">
        <div className="lobby-sky" aria-hidden="true">
          <i className="lobby-moon"/>
          <i className="lobby-star star-one"/><i className="lobby-star star-two"/><i className="lobby-star star-three"/>
          <i className="lobby-star star-four"/><i className="lobby-star star-five"/><i className="lobby-star star-six"/><i className="lobby-star star-seven"/>
          <i className="lobby-comet" aria-hidden="true"/>
        </div>
        <canvas ref={lobbyGrassCanvasRef} className="lobby-grass-floor" aria-hidden="true"/>
        <i className="lobby-ground-light" aria-hidden="true"/>
        <div className="lobby-character-wrap"><canvas ref={lobbyCharacterCanvasRef} className="lobby-character-canvas" aria-hidden="true"/><button type="button" className="lobby-character-profile-trigger" aria-label="Abrir meu perfil de jogador" title="Meu perfil" onClick={() => { setViewedProfileUserId(session.user.sub); setPlayerProfileOpen(true); }}/><button className="lobby-duo-invite" type="button" aria-label="Convidar uma pessoa para jogar em duo" title="Convidar duo">+</button></div>
        
          <button className="lobby-arsenal-trigger" type="button" aria-label="Abrir Arsenal" title="Arsenal" onClick={() => setArsenalOpen(true)}>
            <span className="lobby-top-emoji" aria-hidden="true">⚔️</span>
            <span>ARSENAL</span>
          </button>
          <button className="lobby-friends-trigger" type="button" aria-label="Abrir lista de amigos" title="Amigos" onClick={() => setFriendsOpen(true)}>
            <span className="lobby-top-emoji" aria-hidden="true">👥</span>
            <span>AMIGOS</span>
          </button>
          <button className="lobby-chest-trigger" type="button" aria-label="Abrir Baú de recursos" title="Baú" onClick={() => { setLobbyChestItems(readSavedHouseStorage()); setChestOpen(true); }}>
            <span className="lobby-top-emoji" aria-hidden="true">🧰</span>
            <span>BAÚ</span>
          </button>
          <button className="lobby-profile-trigger" type="button" aria-label="Abrir seleção de classes" title="Classes" onClick={() => setProfileOpen(true)}>
            <span className="lobby-top-emoji" aria-hidden="true">🧙</span>
            <span>CLASSES</span>
          </button>
          <button className="lobby-ranking-trigger" type="button" aria-label="Abrir Ranking" title="Ranking" onClick={() => setRankingOpen(true)}>
            <span className="lobby-ranking-spark lobby-ranking-spark-one" aria-hidden="true">✦</span>
            <span className="lobby-ranking-trophy" aria-hidden="true">🏆</span>
            <span>RANKING</span>
            <span className="lobby-ranking-spark lobby-ranking-spark-two" aria-hidden="true">✧</span>
          </button>
          <button className="lobby-status-trigger" type="button" aria-label="Abrir status dos personagens" title="Status" onClick={() => setStatusOpen(true)}>
            <span className="lobby-top-emoji" aria-hidden="true">📊</span>
            <span>STATUS</span>
          </button>
        <button className="lobby-play-trigger" type="button" onClick={startGame} aria-label="Jogar" title="Entrar no mundo">
          Jogar
        </button>
        <nav className="lobby-crafting-stations" aria-label="Estações de criação">
          {LOBBY_CRAFTING_STATIONS.map(station => <button
            key={station.id}
            className="lobby-crafting-trigger"
            type="button"
            aria-label={`Abrir estação: ${station.title}`}
            title={station.title}
            onClick={() => setCraftingStationId(station.id)}
          >
            <span className="lobby-crafting-icon" aria-hidden="true">{station.icon}</span>
            <span>{station.label}</span>
          </button>)}
        </nav>
        {activeCraftingStation && <div className="lobby-crafting-backdrop" onClick={() => setCraftingStationId(null)}>
          <section className="lobby-crafting-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-crafting-title" onClick={event => event.stopPropagation()}>
            <header className="lobby-crafting-header">
              <div><span>ESTAÇÃO DE CRIAÇÃO</span><h2 id="lobby-crafting-title">{activeCraftingStation.title}</h2></div>
              <button type="button" className="lobby-crafting-close" aria-label="Fechar estação" onClick={() => setCraftingStationId(null)}>×</button>
            </header>
            <div className="lobby-crafting-content">
              <div className="lobby-crafting-emblem" aria-hidden="true">{activeCraftingStation.icon}</div>
              <p>{activeCraftingStation.description}</p>
              <div className="lobby-crafting-products"><span>PRODUÇÃO PREVISTA</span><strong>{activeCraftingStation.products}</strong></div>
              <small>Esta estação está sendo preparada. As receitas e a fabricação serão ativadas em uma próxima etapa.</small>
            </div>
          </section>
        </div>}
        {arsenalOpen && <div className="lobby-arsenal-backdrop" onClick={() => setArsenalOpen(false)}>
          <section className="lobby-arsenal-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-arsenal-title" onClick={event => event.stopPropagation()}>
            <header className="lobby-arsenal-header">
              <div><span>EQUIPAMENTOS DO PERSONAGEM</span><h2 id="lobby-arsenal-title">Arsenal</h2></div>
              <div className="lobby-arsenal-count">{arsenalItems.length}/{ARSENAL_CAPACITY} espaços</div>
              <button type="button" className="lobby-profile-close" aria-label="Fechar Arsenal" onClick={() => setArsenalOpen(false)}>×</button>
            </header>
            <div className="lobby-arsenal-content">
              <section className="arsenal-equipment-section" aria-label="Equipamentos equipados">
                 <div className="arsenal-character-tabs" role="tablist" aria-label="Personagem do Arsenal">
                   <button type="button" role="tab" aria-selected={arsenalCharacterTab === 'principal'} className={arsenalCharacterTab === 'principal' ? 'active' : ''} onClick={() => setArsenalCharacterTab('principal')}>Principal</button>
                   <button type="button" role="tab" aria-selected={arsenalCharacterTab === 'secundario'} className={arsenalCharacterTab === 'secundario' ? 'active' : ''} onClick={() => setArsenalCharacterTab('secundario')}>Secundário</button>
                 </div>
                 <div className="arsenal-section-heading"><strong>{arsenalCharacterTab === 'principal' ? 'PERSONAGEM PRINCIPAL' : 'PERSONAGEM SECUNDÁRIO'}</strong><span>Selecione um espaço para equipar</span></div>
                 <div className="arsenal-equipment-stage">
                    <span className="arsenal-power-label" aria-label="Poder do personagem">PD</span>
                   {characterPreferences[arsenalCharacterTab === 'principal' ? 0 : 1] ? <canvas ref={arsenalCharacterCanvasRef} className="arsenal-character-canvas" aria-label={`Personagem ${CLASSES[characterPreferences[arsenalCharacterTab === 'principal' ? 0 : 1]!].label} com sua arma flutuante`} /> : <div className="arsenal-no-character">Nenhum personagem selecionado nesta posição.</div>}
                   <div className="arsenal-equipment-grid">
                     {ARSENAL_SLOT_LAYOUT.map(({ slot, row, column }) => {
                       const equipped = arsenalItems.find(item => item.id === equipmentLoadout[slot]);
                       const info = ARSENAL_SLOT_INFO[slot];
                       return <button type="button" key={slot} className={`arsenal-equipment-slot ${selectedEquipmentSlot === slot ? 'selected' : ''} ${equipped ? 'equipped' : ''}`} style={{ gridRow: row, gridColumn: column }} disabled={!activeArsenalClassId} onClick={() => { setSelectedEquipmentSlot(slot); setSelectedArsenalItemId(equipped?.id ?? null); }} aria-label={`${info.label}: ${equipped ? equipped.name + ', equipado' : 'vazio'}`}>
                         <strong>{info.label}</strong>{equipped && <span className="arsenal-equipped-item">{equipped.name}</span>}
                       </button>;
                     })}
                   </div>
                 </div>
               </section>
               <section className="arsenal-inventory-section">
                <div className="arsenal-section-heading"><strong>INVENTÁRIO DE EQUIPAMENTOS</strong><span>Itens obtidos e fabricados ficam aqui</span></div>
                <div className="arsenal-inventory-grid">
                  {Array.from({ length: ARSENAL_CAPACITY }, (_, index) => {
                    const item = arsenalItems[index];
                    const isEquipped = !!item && Object.values(equipmentLoadout).includes(item.id);
                    return <button type="button" key={index} className={`arsenal-inventory-slot ${item ? 'filled' : ''} ${item?.id === selectedArsenalItemId ? 'selected' : ''} ${isEquipped ? 'is-equipped' : ''}`} disabled={!item} onClick={() => { if (item) { setSelectedArsenalItemId(item.id); setSelectedEquipmentSlot(item.slot); } }} aria-label={item ? `Selecionar ${item.name}${isEquipped ? ', equipado' : ''}` : `Espaço ${index + 1} vazio`}>
                      {item ? <><span>{item.icon}</span><small>{item.name}</small>{isEquipped && <em>EQUIPADO</em>}</> : <span className="arsenal-empty-number">{index + 1}</span>}
                    </button>;
                  })}
                </div>
                <div className="arsenal-actions">
                  <div className="arsenal-selection-label">{arsenalItems.find(item => item.id === selectedArsenalItemId)?.name ?? 'Selecione um equipamento'}</div>
                  <button type="button" disabled={!activeArsenalClassId || !arsenalItems.some(item => item.id === selectedArsenalItemId) || arsenalItems.find(item => item.id === selectedArsenalItemId)?.slot !== selectedEquipmentSlot} onClick={() => {
                    const selected = arsenalItems.find(item => item.id === selectedArsenalItemId);
                    if (selected && selected.slot === selectedEquipmentSlot && activeArsenalClassId) setEquipmentLoadouts(current => ({ ...current, [activeArsenalClassId]: equipArsenalItem(current[activeArsenalClassId] ?? {}, selected) }));
                  }}>Equipar</button>
                  <button type="button" className="arsenal-unequip" disabled={!activeArsenalClassId || !equipmentLoadout[selectedEquipmentSlot]} onClick={() => {
                    if (activeArsenalClassId) setEquipmentLoadouts(current => ({ ...current, [activeArsenalClassId]: unequipArsenalSlot(current[activeArsenalClassId] ?? {}, selectedEquipmentSlot) }));
                    setSelectedArsenalItemId(null);
                  }}>Desequipar</button>
                </div>
                <p className="arsenal-footnote">Somente equipamentos entram no Arsenal. Materiais e recursos continuam na mochila e no armazém da casa.</p>
              </section>
            </div>
          </section>
        </div>}
        <FriendsModal open={friendsOpen} userId={session.user.sub} onClose={() => setFriendsOpen(false)} onOpenProfile={userId => { setViewedProfileUserId(userId); setFriendsOpen(false); setPlayerProfileOpen(true); }} />
        {chestOpen && <div className="lobby-chest-backdrop" onClick={() => setChestOpen(false)}>
          <section className="lobby-chest-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-chest-title" onClick={event => event.stopPropagation()}>
            <header className="lobby-chest-header">
              <div><h2 id="lobby-chest-title">Baú</h2><p>Sua coleção de itens</p></div>
              <button type="button" className="lobby-chest-close" aria-label="Fechar Baú" onClick={() => setChestOpen(false)}>×</button>
            </header>
            <div className="lobby-chest-grid" aria-label="Itens guardados no Baú">
              {lobbyChestItems.map(item => <div key={item.itemId} className="quick-slot filled lobby-chest-slot" aria-label={`${itemLabel(item.itemId)}: ${item.quantity}`}>
                <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b>
              </div>)}
            </div>
          </section>
        </div>}
        {statusOpen && <div className="lobby-profile-backdrop lobby-status-backdrop" onClick={() => setStatusOpen(false)}>
          <section className="lobby-profile-modal lobby-status-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-status-title" onClick={event => event.stopPropagation()}>
            <header className="lobby-profile-header">
              <div><span>RESUMO DOS PERSONAGENS ESCOLHIDOS</span><h2 id="lobby-status-title">Status</h2></div>
              <button type="button" className="lobby-profile-close" aria-label="Fechar Status" onClick={() => setStatusOpen(false)}>×</button>
            </header>
            <div className="lobby-profile-content lobby-status-content">
              {characterPreferences.map((classId, index) => {
                if (!classId) return <section className="lobby-status-card lobby-status-empty" key={index}>
                  <span>{index === 0 ? 'PRINCIPAL' : 'SECUNDÁRIA'}</span>
                  <strong>Nenhuma classe selecionada</strong>
                </section>;
                const attributes = getPlayerAttributes(classId, state.player.level);
                const weapon = CONFIG.weapons[PROFILE_CLASS_WEAPONS[classId]];
                const powerDamage = weapon.damage * getDamageMultiplier(classId, state.player.level);
                const classPower = getClassPower(classId, state.player.level).total;
                const classPowerAt10 = getClassPower(classId, 10).total;
                const loadout = equipmentLoadouts[classId] ?? {};
                const equippedItems = Object.values(loadout).flatMap(itemId => {
                  const item = arsenalItems.find(candidate => candidate.id === itemId);
                  return item ? [item] : [];
                });
                return <section className={`lobby-status-card class-${classId}`} key={classId}>
                  <div className="lobby-status-card-heading">
                    <div><span>{index === 0 ? '★ PRINCIPAL' : '② SECUNDÁRIA'}</span><h3><span aria-hidden="true">{{ guerreiro: '⚔️', mago: '🔮', arqueiro: '🏹', druida: '🌿' }[classId]}</span> {CLASSES[classId].label}</h3></div>
                    <strong className="lobby-status-level">NÍVEL {state.player.level}</strong>
                  </div>
                  <i className="lobby-status-tag" aria-hidden="true" />
                  <div className="lobby-status-poder">
                    <div><span>PODER</span><strong>{classPower.toFixed(0)}</strong></div>
                    <small>{CLASS_STYLE[classId]} · no nível 10: {classPowerAt10.toFixed(0)}</small>
                  </div>
                  <div className="lobby-status-power-grid">
                    <div className="lobby-status-power"><span>PD / GOLPE</span><strong>{powerDamage.toFixed(1)}</strong></div>
                    <div className={`lobby-status-power${attributeUnusedClass(classId, 'forca')}`}><span>FORÇA</span><strong>{attributes.forca.toFixed(1)}</strong></div>
                  </div>
                  <div className="lobby-status-attributes">
                    <div className={attributeUnusedClass(classId, 'vida').trim()}><span>❤️ Vida</span><strong>{attributes.vida.toFixed(1)}</strong></div>
                    <div className={attributeUnusedClass(classId, 'inteligencia').trim()}><span>🧠 Int.</span><strong>{attributes.inteligencia.toFixed(1)}</strong></div>
                    <div className={attributeUnusedClass(classId, 'destreza').trim()}><span>🎯 Dest.</span><strong>{attributes.destreza.toFixed(1)}</strong></div>
                    <div className={attributeUnusedClass(classId, 'armadura').trim()}><span>🛡️ Arm.</span><strong>{(CONFIG.player.armor + attributes.armadura - CONFIG.attributes.baseValue).toFixed(1)}</strong></div>
                  </div>
                  <div className="lobby-status-equipment">
                    <span>EQUIPAMENTOS · {equippedItems.length}</span>
                    {equippedItems.length ? <div>{equippedItems.map(item => <small key={item.id}>{item.icon} {item.name}</small>)}</div> : <small>Sem equipamentos</small>}
                  </div>
                </section>;
              })}
              <p className="lobby-status-note">O PODER soma a base do personagem: vida, armadura, esquiva, velocidades e dano. Ele não mede quem é melhor: cada classe foi feita para um estilo de combate, e um número menor só mostra que ela cumpre outro papel. Atributo em vermelho riscado não é usado pela classe e não soma.</p>
            </div>
          </section>
        </div>}
        {profileOpen && <div className="lobby-profile-backdrop" onClick={() => setProfileOpen(false)}>
          <section className="lobby-profile-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-profile-title" onClick={event => event.stopPropagation()}>
            <header className="lobby-profile-header">
              <div><span>SELEÇÃO E CONFIGURAÇÃO</span><h2 id="lobby-profile-title">Classes</h2></div>
              <button type="button" className="lobby-profile-close" aria-label="Fechar Classes" onClick={() => setProfileOpen(false)}>×</button>
            </header>
            <nav className="lobby-profile-tabs" role="tablist" aria-label="Classes disponíveis">
              {PROFILE_CLASS_IDS.map(classId => <button
                type="button"
                role="tab"
                aria-selected={profileClassTab === classId}
                className={`profile-class-tab class-${classId} ${profileClassTab === classId ? 'active' : ''}`}
                key={classId}
                onClick={() => setProfileClassTab(classId)}
              >
                <span className="profile-class-emoji" aria-hidden="true">{{ guerreiro: '⚔️', mago: '🔮', arqueiro: '🏹', druida: '🌿' }[classId]}</span>
                <strong>{CLASSES[classId].label}</strong>
                <small>{characterPreferences[0] === classId ? '★ PRINCIPAL' : characterPreferences[1] === classId ? '② SECUNDÁRIO' : 'NÃO SELECIONADO'}</small>
              </button>)}
            </nav>
            <div className="lobby-profile-content">
              <section className={`profile-class-details class-${profileClassTab}`}>
                <div className="profile-section-heading">
                  <div><span>NÍVEL 0 · INÍCIO DA PARTIDA</span><h3><span aria-hidden="true">{{ guerreiro: '⚔️', mago: '🔮', arqueiro: '🏹', druida: '🌿' }[profileClassTab]}</span> {CLASSES[profileClassTab].label}{(characterPreferences[0] === profileClassTab || characterPreferences[1] === profileClassTab) && <em className="profile-class-pill">{characterPreferences[0] === profileClassTab ? '★ PRINCIPAL' : '② SECUNDÁRIO'}</em>}</h3></div>
                </div>
                <p className="profile-class-description">{CLASSES[profileClassTab].description}</p>
                <div className="profile-priority-controls" aria-label="Prioridade da classe">
                  <span>USAR COMO</span>
                  <button type="button" className={characterPreferences[0] === profileClassTab ? 'chosen primary' : ''} aria-pressed={characterPreferences[0] === profileClassTab} onClick={() => setCharacterPreferences((current): [ClassId | null, ClassId | null] => {
                    if (current[0] === profileClassTab) return [null, current[1]];
                    if (current[1] === profileClassTab) return [profileClassTab, current[0]];
                    return [profileClassTab, current[1]];
                  })}><b>1</b> Principal</button>
                  <button type="button" className={characterPreferences[1] === profileClassTab ? 'chosen secondary' : ''} aria-pressed={characterPreferences[1] === profileClassTab} onClick={() => setCharacterPreferences((current): [ClassId | null, ClassId | null] => {
                    if (current[1] === profileClassTab) return [current[0], null];
                    if (current[0] === profileClassTab) return [current[1], profileClassTab];
                    return [current[0], profileClassTab];
                  })}><b>2</b> Secundário</button>
                  {characterPreferences[0] !== profileClassTab && characterPreferences[1] !== profileClassTab && <small>Toque em 1 ou 2 para escolher. Toque de novo para desligar.</small>}
                </div>
                <ProfileClassStats classId={profileClassTab} />
              </section>
              <p className="profile-save-note">Preferências salvas neste navegador · a sincronização com conta online ainda não está conectada.</p>
            </div>
          </section>
        </div>}
        {rankingOpen && <div className="lobby-ranking-backdrop" onClick={() => setRankingOpen(false)}>
          <section className="lobby-ranking-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-ranking-title" onClick={event => event.stopPropagation()}>
            <header className="lobby-ranking-header">
              <div><span>FÍBULA ONLINE · HALL DA FAMA</span><h2 id="lobby-ranking-title"><span aria-hidden="true">🏆</span> Ranking</h2></div>
              <button type="button" className="lobby-ranking-close" aria-label="Fechar Ranking" onClick={() => setRankingOpen(false)}>×</button>
            </header>
            <nav className="lobby-ranking-mode-tabs" role="tablist" aria-label="Modalidade do ranking">
              <button type="button" role="tab" aria-selected={rankingMode === 'solo'} className={rankingMode === 'solo' ? 'active' : ''} onClick={() => setRankingMode('solo')}>SOLO</button>
              <button type="button" role="tab" aria-selected={rankingMode === 'duo'} className={rankingMode === 'duo' ? 'active' : ''} onClick={() => setRankingMode('duo')}>DUO</button>
            </nav>
            <div className="lobby-ranking-body">
              <nav className="lobby-ranking-category-tabs" aria-label="Categoria do ranking">
                <button type="button" aria-pressed={rankingCategory === 'survival'} className={rankingCategory === 'survival' ? 'active' : ''} onClick={() => setRankingCategory('survival')}>
                  <span aria-hidden="true">🌄</span><span>DIAS</span>
                </button>
                <button type="button" aria-pressed={rankingCategory === 'power'} className={rankingCategory === 'power' ? 'active' : ''} onClick={() => setRankingCategory('power')}>
                  <span aria-hidden="true">⚔️</span><span>PD</span>
                </button>
                <button type="button" aria-pressed={rankingCategory === 'kills'} className={rankingCategory === 'kills' ? 'active' : ''} onClick={() => setRankingCategory('kills')}>
                  <span aria-hidden="true">💀</span><span>ABATES</span>
                </button>
              </nav>
              <section className="lobby-ranking-board" aria-live="polite">
                <div className="lobby-ranking-board-heading">
                  <div><span>TOP 100</span><h3>{rankingMode === 'solo' ? 'Lendas individuais' : 'Duplas lendárias'}</h3></div>
                  <strong>{rankingCategory === 'power' ? '⚔️ PD' : rankingCategory === 'survival' ? '🌄 DIAS' : '💀 ABATES'}</strong>
                </div>
                {rankingMode === 'duo' ? <div className="lobby-ranking-empty">
                  <span aria-hidden="true">🤝</span><strong>Ranking Duo em preparação</strong>
                  <p>As classificações Solo são individuais. O modo Duo terá uma tabela própria quando as partidas em equipe forem ativadas.</p>
                </div> : rankingLoading ? <div className="lobby-ranking-empty"><span aria-hidden="true">⌛</span><strong>Carregando classificação...</strong></div>
                  : rankingError ? <div className="lobby-ranking-empty"><span aria-hidden="true">⚠️</span><strong>Não foi possível carregar o ranking</strong><p>{rankingError}</p></div>
                  : rankingRows.length === 0 ? <div className="lobby-ranking-empty">
                    <span aria-hidden="true">{rankingCategory === 'power' ? '⚔️' : rankingCategory === 'survival' ? '🌄' : '💀'}</span>
                    <strong>{rankingCategory === 'power' ? 'Ainda não há PD registrado' : rankingCategory === 'survival' ? 'Ainda não há dias registrados' : 'Ainda não há abates registrados'}</strong>
                    <p>Os melhores resultados dos jogadores aparecerão aqui assim que forem validados e salvos.</p>
                    {rankingCategory === 'power' && <small>O registro seguro do PD depende da atualização da validação de partidas no banco.</small>}
                  </div> : <div className="lobby-ranking-list">
                    {rankingRows.map((entry, index) => {
                      const value = rankingCategory === 'power' ? entry.highest_pd
                        : rankingCategory === 'survival' ? entry.highest_survival_level : entry.kills;
                      const avatar = entry.avatar_character === 'mago' ? '🔮' : entry.avatar_character === 'arqueiro' ? '🏹'
                        : entry.avatar_character === 'druida' ? '🌿' : '⚔️';
                      return <article className="lobby-ranking-entry" key={entry.user_id}>
                        <span className="lobby-ranking-entry-position">{index + 1}</span>
                        <span className="lobby-ranking-entry-avatar" aria-hidden="true">{avatar}</span>
                        <strong>{entry.display_name || 'Jogador sem nome'}</strong>
                        <b>{new Intl.NumberFormat('pt-BR').format(value)}</b>
                      </article>;
                    })}
                  </div>}
              </section>
            </div>
            <footer className="lobby-ranking-player-position">
              <div><span>SUA POSIÇÃO</span><strong>{rankingRows.findIndex(entry => entry.user_id === session.user.sub) >= 0
                ? `#${rankingRows.findIndex(entry => entry.user_id === session.user.sub) + 1}`
                : (rankingOwnProfile && (rankingCategory === 'power' ? rankingOwnProfile.highest_pd
                  : rankingCategory === 'survival' ? rankingOwnProfile.highest_survival_level : rankingOwnProfile.kills) > 0) ? 'FORA DO TOP 100' : '—'}</strong></div>
              <div><span>{rankingCategory === 'power' ? 'SEU PD' : rankingCategory === 'survival' ? 'SEUS DIAS' : 'SEUS ABATES'}</span><strong>{rankingOwnProfile
                ? new Intl.NumberFormat('pt-BR').format(rankingCategory === 'power' ? rankingOwnProfile.highest_pd
                  : rankingCategory === 'survival' ? rankingOwnProfile.highest_survival_level : rankingOwnProfile.kills) : '—'}</strong></div>
              <small>Classificação individual atualizada a partir dos perfis públicos do jogo.</small>
            </footer>
          </section>
        </div>}
        {playerProfileOpen && <PlayerProfileModal
          userId={viewedProfileUserId ?? session.user.sub}
          isOwner={(viewedProfileUserId ?? session.user.sub) === session.user.sub}
          currentCharacter={characterPreferences[0] ?? state.classId}
          avatarCharacter={avatarCharacter}
          onAvatarChange={setAvatarCharacter}
          onClose={() => { setPlayerProfileOpen(false); setViewedProfileUserId(null); }}
        />}
      </div>}
      {showHelp && <div className="help-card"><button className="close-help" onClick={() => setShowHelp(false)}>×</button><h3>Como sobreviver</h3><p><b>WASD / setas</b> movem o personagem. <b>1 Guerreiro, 2 Mago, 3 Arqueiro e 4 Druida</b> selecionam a classe, sua aparência, habilidades e arma correspondente. <b>A câmera mantém a visão limitada ao redor do personagem.</b> <b>R</b> liga/desliga o alcance e, no celular, <b>Zoom + / Zoom −</b> aproximam ou afastam a visão. O Druida regenera vida ao acertar ataques e guarda até 7 orbes, que são consumidos automaticamente quando a vida cai abaixo de 40%. <b>Espaço</b> pega/solta o carrinho reparado quando estiver perto. <b>T</b> abre a roda de bandeiras; 1–4 colocam a bandeira na direção correspondente, e T sobre uma bandeira a remove. <b>B</b> abre a mochila e o conteúdo do carrinho. Ao puxar o carrinho, o ataque automático fica desativado.</p></div>}
      {state.dead && <div className="game-over"><div className="skull">✦</div><p className="eyebrow">FIM DE JOGO</p><h2>A névoa venceu.</h2><p>Você resistiu até a onda <b>{state.wave}</b>.</p><div className="summary"><div><span>DIAS</span><b>{survivalDay}</b></div><div><span>NÍVEL</span><b>{state.player.level}</b></div><div><span>SLIMES</span><b>{state.kills}</b></div></div><div className="game-over-actions"><button className="restart-button" onClick={restart}>↻ Tentar novamente</button><button className="lobby-return-button" onClick={returnToLobby}>⌂ Voltar ao lobby</button></div></div>}
      {showHelp && <div className="help-backdrop" onClick={() => setShowHelp(false)} />}
      {(flagWheel || flagHotkeyOpen) && <div className="flag-wheel" role="dialog" aria-label="Roda de bandeiras" style={flagWheel ? { left: flagWheel.screenX, top: flagWheel.screenY } : { left: '50%', top: '50%' }}>
        {CONFIG.flags.colors.map(item => <div key={item.id} className={`flag-wheel-option ${item.id} ${flagWheel?.selected === item.id ? 'selected' : ''}`} aria-label={item.label} title={item.label}><span style={{ background: item.color }} /></div>)}
        <div className="flag-wheel-center" aria-hidden="true">×</div>
      </div>}
      {inventoryPanelOpen && !showStart && !state.dead && <div className="inventory-quick-panel" role="dialog" aria-label="Casa, mochila e carrinho">
        <header><strong>INVENTÁRIO</strong><button type="button" className="inventory-close-button" onPointerDown={handleInventoryClosePointerDown} onClick={handleInventoryCloseClick} aria-label="Fechar mochila" title="Fechar">×</button></header>

        <section>
          <h3>Mochila <small>{state.inventory.length}/{CONFIG.inventory.maxSlots}</small></h3>
          <div className="quick-slot-grid bag">
            {Array.from({ length: CONFIG.inventory.maxSlots }, (_, index) => {
              const item = state.inventory[index];
              return <div key={index} className={item ? 'quick-slot filled' : 'quick-slot'} style={{ position: 'relative' }} aria-label={item ? `${item.itemId} x${item.quantity}` : `Espaço ${index + 1} vazio`}>
                {item ? <><span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b><button type="button" className="bag-discard-button" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, lineHeight: '16px', borderRadius: 999, background: '#632f35', color: '#fff', border: '1px solid #d98b8b', fontSize: 14 }} onClick={(event) => { event.stopPropagation(); discardBagItem(index); }} aria-label={`Descartar ${item.itemId} x${item.quantity} da mochila`} title="Descartar item">×</button></> : <span className="quick-slot-empty">{index + 1}</span>}
              </div>;
            })}
          </div>
        </section>
        <section>
          <h3>Carrinho <small>{state.cart.inventory.length}/{CONFIG.cart.capacitySlots}</small></h3>
          <div className="quick-slot-grid cart">
            {Array.from({ length: CONFIG.cart.capacitySlots }, (_, index) => {
              const item = state.cart.inventory[index];
              return <div key={index} className={item ? 'quick-slot filled' : 'quick-slot'} aria-label={item ? `${item.itemId} x${item.quantity}` : `Espaço ${index + 1} vazio`}>
                {item ? <button type="button" className="inventory-transfer-slot" disabled={!cartAccessible} onClick={(event) => { event.stopPropagation(); transferCartToBag(index); }} aria-label={`Retirar ${item.itemId} x${item.quantity} do carrinho para a mochila`} title="Retirar para a mochila"><span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b></button> : <span className="quick-slot-empty">{index + 1}</span>}
              </div>;
            })}
          </div>
        </section>
        {state.house.built && <section className="house-storage-section">
          <h3>Armazém da casa <small>{state.house.inventory.length} tipos</small></h3>
          {state.house.inventory.length > 0 ? <div className="quick-slot-grid house-storage">
            {state.house.inventory.map(item => <button key={item.itemId} type="button" className="quick-slot filled inventory-transfer-slot" disabled={!houseAccessible} onClick={(event) => { event.stopPropagation(); transferHouseToBag(item.itemId); }} aria-label={`Retirar ${item.itemId} x${item.quantity} da casa para a mochila`} title={houseAccessible ? "Retirar para a mochila (até 5 por clique)" : "Aproxime-se da casa para retirar"}>
              <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b>
            </button>)}
          </div> : <p className="house-storage-empty">{state.house.built ? 'A casa está vazia. Use “Guardar tudo” quando quiser armazenar seus itens.' : 'Conclua a construção para usar o armazém.'}</p>}
        </section>}
      </div>}
      {cartDistance <= CONFIG.cart.interactRadius && !state.cart.repaired && <div className="cart-repair-status" role="status">CARRINHO · {state.cart.repairWood}/{CONFIG.cart.repairCost} MADEIRAS</div>}

{!showStart && !state.dead &&             <Controls onInventoryToggle={toggleInventoryPanel} onCartToggle={toggleCart} cartActionVisible={cartActionVisible && !state.dead && !showStart} cartCarried={state.cart.carried} storeToCartVisible={cartAccessible && !state.dead && !showStart} storeToCartDisabled={state.inventory.length === 0} onStoreToCart={storeAllBagToCart} storeToHouseVisible={houseAccessible && !state.dead && !showStart} storeToHouseDisabled={state.inventory.length === 0 && !((state.cart.carried || Math.hypot(state.cart.x - state.house.x, state.cart.y - state.house.y) <= CONFIG.house.interactRadius) && state.cart.inventory.length > 0)} onStoreToHouse={storeAllBagToHouse} buildHouseVisible={houseBuildAccessible && !state.dead && !showStart} buildRefineryVisible={refineryBuildAccessible && !state.dead && !showStart} buildTecelariaVisible={tecelariaBuildAccessible && !state.dead && !showStart} buildCartVisible={cartBuildAccessible && !state.dead && !showStart} onBuildHouse={buildHouse} onBuildRefinery={buildRefinery} onBuildTecelaria={() => engineRef.current?.buildTecelaria()} onBuildCart={buildCart} flagWheelOpen={flagWheel !== null} onLongPress={onJoystickLongPress} onFlagTap={onFlagTap} onWheelMove={onWheelMove} onWheelEnd={onWheelEnd} onMovementStart={closeFlagMenu} onMove={(x, y) => { if (gameStartedRef.current) engineRef.current?.setMove(x, y); }} onRange={toggleRange} onZoom={(delta) => { const maxZoom = window.matchMedia('(pointer: coarse)').matches ? 1.75 : 1.45; zoomRef.current = Math.max(0.8, Math.min(maxZoom, zoomRef.current + delta)); }} onClass={pickClass} classId={state.classId} showRange={state.showRange} weaponLabel={CONFIG.weapons[state.weapon].label} inventoryPanelOpen={inventoryPanelOpen} audioVolume={audioVolume} onAudioVolumeChange={(volume) => { setAudioVolume(volume); audioManager.setVolume(volume); }} interfaceScale={interfaceScale} onInterfaceScaleChange={setInterfaceScale} landscapeMode={landscapeMode} onToggleLandscape={() => { void toggleLandscapeMode(); }} />}
    </section>

  </main>;
}

function drawHouse(ctx: CanvasRenderingContext2D, house: GameSnapshot['house']) {
  const { x, y, woodDelivered, built } = house;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, 20, 38, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (!built) ctx.scale(1.7, 1.7);
  if (built) {
    ctx.fillStyle = '#755038'; ctx.fillRect(-28, -10, 56, 38);
    ctx.strokeStyle = '#38271d'; ctx.lineWidth = 3; ctx.strokeRect(-28, -10, 56, 38);
    ctx.fillStyle = '#503323'; ctx.beginPath(); ctx.moveTo(-36, -10); ctx.lineTo(0, -38); ctx.lineTo(36, -10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2b211b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#38271d'; ctx.fillRect(-7, 7, 14, 21);
    ctx.fillStyle = '#b6d8ce'; ctx.fillRect(-21, 0, 10, 10); ctx.fillRect(11, 0, 10, 10);
    ctx.strokeStyle = '#38271d'; ctx.lineWidth = 2; ctx.strokeRect(-21, 0, 10, 10); ctx.strokeRect(11, 0, 10, 10);
  } else {
    // Casa inacabada como ruína exclusivamente de madeira: vigas tombadas e paredes de tábuas partidas.
    // Silhueta baixa e assimétrica para não confundir com as ruínas de pedra das oficinas.
    ctx.lineCap = 'round';
    // Poucas tábuas restantes numa parede lateral, com lacunas grandes.
    ctx.fillStyle = '#795337'; ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-29, 10); ctx.lineTo(-27, -8); ctx.lineTo(-20, -13); ctx.lineTo(-17, 7); ctx.lineTo(-22, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a97949';
    ctx.beginPath(); ctx.moveTo(-26, -7); ctx.lineTo(-20, -12); ctx.lineTo(-19, -3); ctx.lineTo(-25, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a472e'; ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(23, -3); ctx.lineTo(30, 1); ctx.lineTo(28, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Vigas expostas e quebradas, sem telhado completo.
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-25, 8); ctx.lineTo(-22, -14); ctx.stroke();
    ctx.strokeStyle = '#b18350'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-24, 7); ctx.lineTo(-21, -13); ctx.stroke();
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(24, 9); ctx.lineTo(27, -2); ctx.stroke();
    ctx.strokeStyle = '#b18350'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(27, -1); ctx.stroke();
    // Restos de caibros caídos cruzados no chão.
    ctx.save(); ctx.translate(-1, 9); ctx.rotate(-0.24);
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(19, 0); ctx.stroke();
    ctx.strokeStyle = '#a97949'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-19, -1); ctx.lineTo(16, -1); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(8, 15); ctx.rotate(0.18);
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
    ctx.strokeStyle = '#b18350'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-12, -1); ctx.lineTo(12, -1); ctx.stroke();
    ctx.restore();
    // Pequenos pedaços de tábua espalhados; nenhuma pedra ou alvenaria.
    ctx.fillStyle = '#a97949'; ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-34, 15); ctx.lineTo(-25, 12); ctx.lineTo(-22, 15); ctx.lineTo(-31, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17, 16); ctx.lineTo(27, 13); ctx.lineTo(30, 16); ctx.lineTo(20, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
    const progress = Math.min(1, woodDelivered / CONFIG.house.buildCost);
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-24, -27, 48, 6);
    ctx.fillStyle = '#8fceaa'; ctx.fillRect(-24, -27, 48 * progress, 6);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-24, -27, 48, 6);
  }
  ctx.restore();
}

function drawRefinery(ctx: CanvasRenderingContext2D, refinery: GameSnapshot['refinery']) {
  const { x, y, woodDelivered, stoneDelivered, built } = refinery;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 20, 42, 13, 0, 0, Math.PI * 2); ctx.fill();
  if (!built) ctx.scale(1.7, 1.7);
  if (!built) {
    // Refinaria inacabada como ruína industrial low-poly, com forno quebrado.
    const stone = (points: Array<[number, number]>, fill: string) => {
      ctx.beginPath();
      points.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.closePath(); ctx.fillStyle = fill; ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    };
    stone([[-38, 17], [-33, 5], [-22, 3], [-15, 12], [-19, 19]], '#788188');
    stone([[-17, 18], [-14, 7], [-2, 5], [5, 14], [1, 19]], '#aab2b7');
    stone([[10, 18], [8, 8], [19, 5], [28, 12], [25, 19]], '#68737a');
    stone([[27, 14], [30, 4], [38, 7], [39, 16], [33, 19]], '#929ba1');
    // Laterais quebradas do forno e abertura escura no centro.
    stone([[-30, 8], [-29, -10], [-19, -19], [-10, -13], [-12, 8]], '#68747a');
    stone([[12, 8], [10, -8], [19, -17], [29, -11], [29, 8]], '#899399');
    stone([[-28, -10], [-19, -19], [-10, -13], [-19, -9]], '#aab2b7');
    ctx.fillStyle = '#252d30'; ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(-10, -5); ctx.lineTo(-3, -10); ctx.lineTo(10, -6); ctx.lineTo(11, 8); ctx.closePath(); ctx.fill();
    // Viga caída e pequenos restos de madeira ao redor da estrutura.
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-22, -2); ctx.lineTo(2, -12); ctx.stroke();
    ctx.strokeStyle = '#a97949'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-20, -3); ctx.lineTo(1, -12); ctx.stroke();
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(20, 12); ctx.lineTo(34, 8); ctx.stroke();
    ctx.strokeStyle = '#b18350'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(21, 11); ctx.lineTo(33, 8); ctx.stroke();
    const woodProgress = Math.min(1, woodDelivered / CONFIG.refinery.buildCostWood);
    const stoneProgress = Math.min(1, stoneDelivered / CONFIG.refinery.buildCostStone);
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-24, -31, 48, 7);
    ctx.fillStyle = '#b28a59'; ctx.fillRect(-24, -31, 48 * woodProgress, 3);
    ctx.fillStyle = '#9ba4aa'; ctx.fillRect(-24, -28, 48 * stoneProgress, 3);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-24, -31, 48, 7);
    ctx.restore(); return;
  }
  ctx.fillStyle = '#656d72'; ctx.strokeStyle = '#293438'; ctx.lineWidth = 3;
  ctx.fillRect(-34, -14, 68, 39); ctx.strokeRect(-34, -14, 68, 39);
  ctx.fillStyle = '#77838a';
  ctx.beginPath(); ctx.moveTo(-40, -14); ctx.lineTo(-25, -34); ctx.lineTo(25, -34); ctx.lineTo(40, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2d3639'; ctx.fillRect(-8, 1, 16, 24);
  ctx.fillStyle = built ? '#d98b50' : '#6c777b'; ctx.beginPath(); ctx.arc(0, 8, 7, 0, Math.PI * 2); ctx.fill();
  if (!built) {
    const woodProgress = woodDelivered / CONFIG.refinery.buildCostWood;
    const stoneProgress = stoneDelivered / CONFIG.refinery.buildCostStone;
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-40, -49, 80, 8);
    ctx.fillStyle = '#b28a59'; ctx.fillRect(-40, -49, 80 * woodProgress, 3);
    ctx.fillStyle = '#9ba4aa'; ctx.fillRect(-40, -45, 80 * stoneProgress, 4);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-40, -49, 80, 8);
  }
  ctx.restore();
}

function drawTecelaria(ctx: CanvasRenderingContext2D, building: GameSnapshot['tecelaria']) {
  const { x, y, built, bronzeDelivered, woodDelivered, cottonDelivered, stoneDelivered } = building;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 20, 43, 13, 0, 0, Math.PI * 2); ctx.fill();
  if (!built) ctx.scale(1.7, 1.7);
  if (!built) {
    // Tecelaria inacabada como ruína low-poly: base quebrada, pedras e madeira partida.
    const stone = (points: Array<[number, number]>, fill: string) => {
      ctx.beginPath();
      points.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.closePath(); ctx.fillStyle = fill; ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke();
    };
    // Fundação irregular e fragmentada, com espaços abertos para parecer quebrada.
    stone([[-35, 15], [-30, 5], [-18, 3], [-10, 9], [-13, 17]], '#788188');
    stone([[-14, 17], [-12, 8], [-1, 6], [5, 14], [2, 18]], '#aab2b7');
    stone([[9, 17], [8, 9], [19, 6], [27, 12], [25, 18]], '#68737a');
    stone([[25, 10], [27, 2], [35, 4], [37, 13], [31, 16]], '#929ba1');
    // Pilares de madeira quebrados e inclinados, sem fechar a silhueta numa armação.
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-27, 8); ctx.lineTo(-29, -11); ctx.lineTo(-22, -19); ctx.stroke();
    ctx.strokeStyle = '#9b754d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-27, 7); ctx.lineTo(-29, -10); ctx.stroke();
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(18, 8); ctx.lineTo(20, -8); ctx.lineTo(12, -15); ctx.stroke();
    ctx.strokeStyle = '#9b754d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(18, 7); ctx.lineTo(20, -7); ctx.stroke();
    // Um pedaço de viga caída atravessa parte da base, como resto da obra.
    ctx.strokeStyle = '#4b3323'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(3, -7); ctx.stroke();
    ctx.strokeStyle = '#a97949'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, -1); ctx.lineTo(1, -7); ctx.stroke();
    // Materiais restantes reconhecíveis, desenhados com facetas coerentes com as pedras do mapa.
    stone([[-5, 1], [0, -5], [7, -4], [11, 1], [6, 4]], '#8e989e');
    stone([[3, 5], [9, 0], [15, 2], [16, 7], [8, 9]], '#69757c');
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#d8d0c1'; ctx.lineWidth = 1;
    for (const puff of [{ x: 28, y: 0 }, { x: 33, y: 2 }, { x: 29, y: 4 }]) {
      ctx.beginPath(); ctx.arc(puff.x - 2, puff.y, 3, 0, Math.PI * 2); ctx.arc(puff.x + 2, puff.y - 1, 3, 0, Math.PI * 2); ctx.arc(puff.x, puff.y + 2, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const progress = Math.min(bronzeDelivered / CONFIG.tecelaria.buildCostBronze, woodDelivered / CONFIG.tecelaria.buildCostWood, cottonDelivered / CONFIG.tecelaria.buildCostCotton, stoneDelivered / CONFIG.tecelaria.buildCostStone);
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-25, -34, 50, 6);
    ctx.fillStyle = '#d8c39a'; ctx.fillRect(-25, -34, 50 * progress, 6);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-25, -34, 50, 6);
    ctx.restore(); return;
  }
  ctx.fillStyle = '#6f624d'; ctx.strokeStyle = '#292820'; ctx.lineWidth = 3;
  ctx.fillRect(-35, -15, 70, 40); ctx.strokeRect(-35, -15, 70, 40);
  ctx.fillStyle = '#8d7857'; ctx.beginPath(); ctx.moveTo(-42, -15); ctx.lineTo(-25, -36); ctx.lineTo(25, -36); ctx.lineTo(42, -15); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d8c39a'; ctx.fillRect(-22, -5, 44, 22); ctx.strokeStyle = '#3b3022'; ctx.lineWidth = 2; ctx.strokeRect(-22, -5, 44, 22);
  ctx.strokeStyle = '#e4d8bb'; ctx.lineWidth = 2;
  for (let xLine = -16; xLine <= 16; xLine += 8) { ctx.beginPath(); ctx.moveTo(xLine, -4); ctx.lineTo(xLine, 16); ctx.stroke(); }
  for (let yLine = 0; yLine <= 12; yLine += 6) { ctx.beginPath(); ctx.moveTo(-21, yLine); ctx.lineTo(21, yLine); ctx.stroke(); }
  if (!built) {
    const progress = Math.min(bronzeDelivered / CONFIG.tecelaria.buildCostBronze, woodDelivered / CONFIG.tecelaria.buildCostWood, cottonDelivered / CONFIG.tecelaria.buildCostCotton, stoneDelivered / CONFIG.tecelaria.buildCostStone);
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-42, -50, 84, 8); ctx.fillStyle = '#d8c39a'; ctx.fillRect(-42, -50, 84 * progress, 8);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-42, -50, 84, 8);
  }
  ctx.restore();
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, time: number) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(0, -18); ctx.stroke();
  ctx.strokeStyle = '#d7d7d7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-1, 15); ctx.lineTo(-1, -18); ctx.stroke();

  // O tecido ondula suavemente com o vento, mantendo a ponta presa à haste.
  const wave = Math.sin(time * 4.2) * 2.2;
  const waveBack = Math.sin(time * 4.2 - 0.9) * 1.6;
  ctx.beginPath();
  ctx.moveTo(1, -17);
  ctx.quadraticCurveTo(8, -18 + waveBack * 0.25, 18 + wave, -12);
  ctx.quadraticCurveTo(12 + wave * 0.65, -9 + waveBack * 0.25, 1, -5);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,20,.7)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(3, -15);
  ctx.quadraticCurveTo(8, -14 + waveBack * 0.2, 14 + wave * 0.55, -12);
  ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();
}

function drawSlime(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, shade: string, phase = 0) {
  const pulse = Math.sin(performance.now() / 115 + phase);
  const squash = Math.max(0, pulse);
  const stretch = Math.max(0, -pulse);
  const bob = stretch * -1.5 + squash * 0.7;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * (1.05 + squash * 0.08), r * (0.42 - stretch * 0.04), 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, bob);
  ctx.scale(1 + squash * 0.13 - stretch * 0.035, 1 - squash * 0.16 + stretch * 0.09);
  ctx.strokeStyle = shade; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * .45, r * .45); ctx.lineTo(-r * .62, r * .9); ctx.moveTo(r * .45, r * .45); ctx.lineTo(r * .62, r * .9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, r * .25); ctx.quadraticCurveTo(-r * 1.15, -r * .8, 0, -r); ctx.quadraticCurveTo(r * 1.15, -r * .8, r, r * .25); ctx.quadraticCurveTo(r * .8, r * .85, 0, r * .72); ctx.quadraticCurveTo(-r * .8, r * .85, -r, r * .25); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = shade; ctx.stroke();
  ctx.fillStyle = '#102c26'; ctx.beginPath(); ctx.ellipse(-r * .32, 0, r * .1, r * .16, 0, 0, Math.PI * 2); ctx.ellipse(r * .32, 0, r * .1, r * .16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, weapon: WeaponId, classId: ClassId, time: number, swordSwingAngle: number, swordSwingTimer: number, moving: boolean, walkPhase: number, carried: boolean, facingX: number, facingY: number, aimAngle: number, hasTarget: boolean, isNight: boolean, showWeapon = true) {
  const r = CONFIG.player.radius;
  const breath = Math.sin(time * 2.6);
  // Seleciona a vista pela direção; o desenho-base não é girado.
  const absX = Math.abs(facingX);
  const absY = Math.abs(facingY);
  const direction = absX > absY * 1.15
    ? (facingX < 0 ? 'left' : 'right')
    : facingY < 0
      ? (absX > absY * 0.45 ? (facingX < 0 ? 'up-left' : 'up-right') : 'back')
      : absX > absY * 0.45
        ? (facingX < 0 ? 'down-left' : 'down-right')
        : 'front';
  const facingScaleX = direction === 'left' || direction === 'up-left' || direction === 'down-left' ? -1 : 1;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, ladinoFeetY(r) - r * 0.1, r * 1.2, r * .46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.scale(facingScaleX, 1);
  drawLadino(ctx, classId, r, { walking: moving, phase: walkPhase, breath, carry: carried && moving, direction });
  ctx.restore();
  if (showWeapon && (isNight || (swordSwingTimer > 0 && (weapon === 'cajado' || weapon === 'bastao')))) {
    if (weapon === 'espada') {
      const duration = 0.24;
      const progress = swordSwingTimer > 0 ? 1 - swordSwingTimer / duration : 0;
      drawFloatingWeapon(ctx, 'espada', r, {
        time, facingX, moving, hasEnemies: true, hasTarget, aimAngle,
        carried, swingTimer: swordSwingTimer, swingAngle: swordSwingAngle,
      });
      if (swordSwingTimer > 0 && isFloatingWeaponVisible()) {
        ctx.save();
        ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.9;
        ctx.strokeStyle = '#d8f5ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, CONFIG.weapons.espada.range, swordSwingAngle - Math.PI * 0.31, swordSwingAngle + Math.PI * 0.31); ctx.stroke();
        ctx.restore();
      }
    } else {
      drawFloatingWeapon(ctx, weapon, r, { time, facingX, moving, hasEnemies: true, hasTarget, aimAngle, carried, swingTimer: swordSwingTimer, swingAngle: swordSwingAngle });
    }
  }
  ctx.restore();
}
