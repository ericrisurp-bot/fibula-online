import { useEffect, useRef, useState, type PointerEvent, type MouseEvent, type CSSProperties } from 'react';
import { playerFeet } from './game/ground';
import { createGrassTile, drawResourceRarityAura, drawRock, drawTree } from './game/environment';
import { getBaseItemId, getItemRarity } from './game/inventory';
import { parseCoreItemId, revealCore, coreToItemId, type CoreAttributeKey } from './game/cores';
import { ARSENAL_CAPACITY, EQUIPMENT_SLOTS, equipArsenalItem, unequipArsenalSlot, type ArsenalEquipment, type EquipmentLoadout, type EquipmentSlotId } from './game/arsenal';
import { CLASSES, CONFIG, type ClassId, type WeaponId } from './game/config';
import { getArmedClassPower } from './game/power';
import { GameEngine, type GameSnapshot } from './game/engine';
import { consumeCookingIngredients, getCookingCapacity, getCookingIngredientStacks, getPanMeal, getPanMealError, getCookingServerState, startCookingProduction, collectCookingMeal, queueCookingMeal, returnCookingMeal, discardCookingMeal, consumeReadyCookingMeal as consumeReadyCookingMealOnServer, takePendingCookingMeals, getQuickRecipe, isCookingIngredient, type CookingMeal, type CookingServerState } from './game/cooking';
import { duoHordeTotalForNight } from './game/coop/rules';
import { DuoCycleTransport } from './game/coop/DuoCycleTransport';
import { finishSoloMatchSession, loadCloudHouseInventory, loadHouseInventory, readConfirmedHouseInventory, readLocalHouseInventory, reportHighestPd, startSoloMatchSession, syncHouseInventory, transferHouseStackToDuo } from './game/persistence';
import { readMatchHistory, recordMatch, type MatchHistoryEntry } from './game/matchHistory';
import { readClassUsage, recordClassUsage, type ClassUsageRecord } from './game/classUsage';
import { drawLadino, ladinoFeetY } from './game/ladino';
import { craftWeapon, deleteWeapon, drawArrowShot, drawFloatingWeapon, isFloatingWeaponVisible, listMyWeapons, WEAPON_CLASS_BY_MODEL, WEAPON_RECIPES, WEAPON_CORE_POINTS_PER_VALUE, weaponCoreCompatibility, weaponMaterialItemId, type CraftedWeapon, type WeaponModel } from './game/weapons';

import { drawFloatingTool } from './game/tools';
import { drawCart } from './game/cart';
import { drawLake } from './game/lakeRender';
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
import { isKnownGamePath, navigateToLobby, navigateToPage, navigateToPlayerProfile, navigateToStation, readGameRoute, type GameRoute, type StationRouteId } from './ui/stationRoute';
import PageFrame from './ui/PageFrame';
import ForgeScene from './ui/ForgeScene';
import JewelryScene from './ui/JewelryScene';
import TailorScene from './ui/TailorScene';
import StationNav from './ui/StationNav';
import ClassStatBars, { ClassFace } from './ui/ClassStatBars';
import StatusDuo from './ui/StatusDuo';
import BackToLobbyButton from './ui/BackToLobbyButton';
import SideNav, { type SideNavId } from './ui/SideNav';
import { AndroidReleaseButton, useAndroidRelease } from './ui/AndroidRelease';
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

type LobbyDuoPeer = { roomId: string; matchId: string | null; friendId: string; friendName: string; avatarCharacter: ClassId; classId: ClassId; displayName: string; role: 'host' | 'guest'; status: 'connecting' | 'connected'; selfReady: boolean; peerReady: boolean };

registerCombatSounds();
registerGatherSounds();
registerStepSounds();

const initial: GameSnapshot = {
  walkPhase: 0,
  activeMeals: [],
  player: { x: 1200, y: 1200, hp: 100, maxHp: 100, level: 0, xp: 0, nextXp: 4, moving: false, facingX: 0, facingY: 1 },
  house: { x: 600, y: 600, woodDelivered: 0, built: false, inventory: [] },
  campfire: null,
  refinery: { x: 3000, y: 3000, woodDelivered: 0, stoneDelivered: 0, built: false, stoneStock: 0, stonesProcessed: 0, bronzeProduced: 0 },
  tecelaria: { x: 1000, y: 3240, bronzeDelivered: 0, woodDelivered: 0, cottonDelivered: 0, stoneDelivered: 0, built: false, cottonStock: 0, cottonProcessed: 0, linenProduced: 0, hideStock: 0, hideProcessed: 0, refinedLeatherProduced: 0 },
  lake: { x: 0, y: 0, rx: 0, ry: 0, size: 'small' }, fishing: false, fishingProgress: 0,
  cart: { x: 1800, y: 600, angle: Math.PI, wheelPhase: 0, following: true, stage: 'broken', health: 0, maxHealth: 0, everBuilt: false, carried: false, inventory: [] },
  enemies: [], trees: [], jabuticabaTree: null, jabuticabaDrops: [], rocks: [], cottonPlants: [], vegetablePlants: [], woodDrops: [], stoneDrops: [], cottonDrops: [], vegetableDrops: [], linenDrops: [], refinedLeatherDrops: [], bronzeDrops: [], wildlifeDrops: [], coreDrops: [], inventory: [], xpOrbs: [], healingOrbs: [], shots: [], explosions: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, dayNight: 'day', phaseElapsed: 0, nightNumber: 0, startedAtNight: false, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0, rockMineAngle: 0, rockMineTimer: 0, cottonHarvestAngle: 0, cottonHarvestTimer: 0, gatherX: 0, gatherY: 0, gatherDepth: 0, showRange: false, cameraFull: false, dead: false, kills: 0,
};
const PROFILE_CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
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

const itemIcon = (itemId: string) => parseCoreItemId(itemId)?.kind === 'closed' ? '💎' : parseCoreItemId(itemId)?.kind === 'revealed' ? '💠' : getBaseItemId(itemId) === 'wood' ? '🪵' : getBaseItemId(itemId) === 'stone' ? '🪨' : getBaseItemId(itemId) === 'bronze' ? '🟤' : getBaseItemId(itemId) === 'cotton' ? '☁️' : getBaseItemId(itemId) === 'tomato' ? '🍅' : getBaseItemId(itemId) === 'cabbage' ? '🥬' : getBaseItemId(itemId) === 'herbs' ? '🌿' : getBaseItemId(itemId) === 'linen' ? '🧵' : getBaseItemId(itemId) === 'wolf_meat' ? '🥩' : getBaseItemId(itemId) === 'wolf_hide' ? '🟫' : getBaseItemId(itemId) === 'chicken_meat' ? '🍗' : getBaseItemId(itemId) === 'feather' ? '🪶' : getBaseItemId(itemId) === 'jabuticaba' ? '🫐' : getBaseItemId(itemId) === 'tilapia' ? '🐟' : getBaseItemId(itemId) === 'tambaqui' ? '🐠' : getBaseItemId(itemId) === 'pintado_surubim' ? '🐡' : getBaseItemId(itemId) === 'lambari' ? '🐟' : getBaseItemId(itemId) === 'tucunare' ? '🐠' : '📦';
const MATERIAL_SPRITE_FILES: Record<string, string> = { wood: 'wood.png', stone: 'stone.png', wolf_hide: 'wolf-hide.png', cotton: 'cotton.png', bronze: 'bronze.png', linen: 'linen.png', refined_leather: 'refined-leather.png' };
const INGREDIENT_SPRITE_FILES: Record<string, string> = { wolf_meat: 'wolf-meat.png', chicken_meat: 'chicken-meat.png', tomato: 'tomato.png', cabbage: 'cabbage.png', herbs: 'herbs.png', sugarcane: 'sugarcane.png', jabuticaba: 'jabuticaba.png', potato: 'potato.png', carrot: 'carrot.png', feather: 'feather.png' };
const ITEM_SPRITE_FILES: Record<string, string> = { ...MATERIAL_SPRITE_FILES, ...INGREDIENT_SPRITE_FILES };
const CORE_SPRITE_FILES = { closed: 'nucleo-fechado.png', weapon: 'nucleo-armas.png', armor: 'nucleo-armaduras.png', accessory: 'nucleo-acessorios.png' } as const;
const coreSpriteImages: Record<string, HTMLImageElement> = {};
function drawCoreSprite(ctx: CanvasRenderingContext2D, file: string, x: number, y: number, size: number): boolean {
  if (typeof Image === 'undefined') return false;
  let sprite = coreSpriteImages[file];
  if (!sprite) { sprite = new Image(); sprite.src = `/assets/cores/${file}`; coreSpriteImages[file] = sprite; return false; }
  if (!sprite.complete || sprite.naturalWidth === 0) return false;
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size); ctx.restore(); return true;
}
const itemSpriteImages: Record<string, HTMLImageElement> = {};
function drawItemSprite(ctx: CanvasRenderingContext2D, itemId: string, x: number, y: number, size: number): boolean {
 const file=ITEM_SPRITE_FILES[itemId]; if(!file||typeof Image==='undefined')return false;
 let sprite=itemSpriteImages[itemId]; if(!sprite){sprite=new Image();sprite.src=`/assets/items/${file}`;itemSpriteImages[itemId]=sprite;return false;}
 if(!sprite.complete||sprite.naturalWidth===0)return false;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite,x-size/2,y-size/2,size,size);ctx.restore();return true;
}

const inventoryItemIcon = (itemId: string) => {
  const base = getBaseItemId(itemId);
  const parsedCore = parseCoreItemId(itemId);
  if (parsedCore) {
    const coreFile = parsedCore.kind === 'closed' ? CORE_SPRITE_FILES.closed : CORE_SPRITE_FILES[parsedCore.core.category];
    return <img src={`/assets/cores/${coreFile}`} width="30" height="30" alt="" aria-hidden="true" draggable={false} style={{ objectFit: 'contain', imageRendering: 'pixelated' }} />;
  }
  const fishFile: Record<string, string> = {
    tilapia: 'fish-tilapia.png', tambaqui: 'fish-tambaqui.png',
    pintado_surubim: 'fish-pintado-surubim.png', lambari: 'fish-lambari.png',
    tucunare: 'fish-tucunare.png',
  };
  if (ITEM_SPRITE_FILES[base]) return <img src={`/assets/items/${ITEM_SPRITE_FILES[base]}`} width="30" height="30" alt="" aria-hidden="true" draggable={false} style={{ objectFit: 'contain', imageRendering: 'pixelated' }} />;
  if (fishFile[base]) return <img src={`/assets/items/${fishFile[base]}`} width="30" height="30" alt="" aria-hidden="true" draggable={false} style={{ objectFit: 'contain', imageRendering: 'auto' }} />;
  const palette: Record<string, { fill: string; shade: string; line: string }> = {
    wood: { fill: '#bd8950', shade: '#80552f', line: '#4b3324' },
    stone: { fill: '#aab3b8', shade: '#68737a', line: '#3e474d' },
    bronze: { fill: '#d39a4e', shade: '#88552b', line: '#51351f' },
    cotton: { fill: '#fff8e9', shade: '#d8d0c1', line: '#938b7e' },
    tomato: { fill: '#e65c4f', shade: '#a93230', line: '#6d2825' },
    cabbage: { fill: '#83b96b', shade: '#477d4a', line: '#31533a' },
    herbs: { fill: '#8dbb62', shade: '#477b43', line: '#31533a' },
    linen: { fill: '#e3d4ad', shade: '#aa9870', line: '#695d45' },
    wolf_meat: { fill: '#bd6b5d', shade: '#80433e', line: '#542d2b' },
    wolf_hide: { fill: '#a98768', shade: '#69503d', line: '#47372c' },
    refined_leather: { fill: '#986b49', shade: '#65442f', line: '#3f2b20' },
    chicken_meat: { fill: '#d89a62', shade: '#9b5c3b', line: '#663b2c' },
    feather: { fill: '#e8e2d1', shade: '#a9a18f', line: '#696354' },
    jabuticaba: { fill: '#75508f', shade: '#422c62', line: '#30213f' },
  };
  const colors = palette[base] ?? { fill: '#9da49b', shade: '#626a62', line: '#3b403b' };
  return <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
    {base === 'wood' ? <>
      <path d="M5 10 22 4 27 8 10 14Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.2"/>
      <path d="M5 10 10 14 10 27 5 23Z" fill={colors.shade} stroke={colors.line} strokeWidth="1.2"/>
      <path d="M10 14 27 8 27 21 10 27Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.2"/>
      <path d="m13 17 11-4m-11 8 11-4" stroke="#f0c58d" strokeWidth="1.1" opacity=".8"/>
    </> : base === 'stone' ? <>
      <path d="m3 21 2-10 8-7 9 2 7 9-4 11-13 2Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="m5 11 8-7 3 9-7 6-6 2Z" fill="#d0d6d8"/>
      <path d="m13 4 9 2 7 9-13-2Z" fill="#c1c9cd"/>
      <path d="m9 19 7-6 13 2-4 11-13 2Z" fill={colors.shade}/>
    </> : base === 'bronze' ? <>
      <path d="M7 8h18v16H7z" rx="2" fill={colors.fill} stroke={colors.line} strokeWidth="1.4"/>
      <path d="M7 12h18M7 20h18" stroke={colors.shade} strokeWidth="2"/>
      <path d="M11 8v16m10-16v16" stroke="#f0c17b" strokeWidth="1" opacity=".8"/>
    </> : base === 'cotton' ? <>
      <g fill={colors.fill} stroke={colors.line} strokeWidth="1"><circle cx="10" cy="17" r="6"/><circle cx="16" cy="11" r="7"/><circle cx="22" cy="18" r="6"/></g>
      <path d="M9 23 16 27 23 23" fill="none" stroke="#73905d" strokeWidth="2"/>
    </> : base === 'tomato' ? <>
      <path d="M16 8c-8-1-12 5-10 13 2 8 18 8 20 0 2-8-2-14-10-13Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.3"/>
      <path d="m16 9 1-5m-1 5-6-3m6 3 6-4m-6 4 7 1" stroke="#6c9b48" strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 16c1-3 3-4 5-4" fill="none" stroke="#ffb0a1" strokeWidth="1.5" strokeLinecap="round"/>
    </> : base === 'cabbage' ? <>
      <path d="M16 5c-4-4-11 1-9 7-6 3-3 13 4 13 3 5 12 4 13-2 7-4 3-13-3-13 1-5-2-7-5-5Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.2"/>
      <path d="M16 6c-5 5-7 12-5 18m5-18c4 5 5 11 4 17M7 12c5 0 8 4 9 12m9-2c-4-4-7-6-9-6" fill="none" stroke={colors.shade} strokeWidth="1.4"/>
    </> : base === 'herbs' ? <>
      <path d="M16 27V8m0 12C8 22 5 16 6 11c6 0 10 3 10 9Zm0-5c0-7 5-11 11-10 0 6-4 11-11 12Zm0 8c-5 1-9-1-10-5 5-1 8 1 10 5Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.2" strokeLinejoin="round"/>
    </> : base === 'linen' ? <>
      <path d="m7 5 18 2 2 20-18-2Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.2"/>
      <path d="m10 8 1 15m4-14 1 15m4-14 1 15M8 13l18 2M9 19l18 2" stroke={colors.shade} strokeWidth="1"/>
    </> : base === 'wolf_meat' || base === 'chicken_meat' ? <>
      <path d="M6 17c0-6 6-10 13-8 5 1 8 6 6 11-2 6-11 8-16 4-2-2-3-4-3-7Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.4"/>
      <path d="M8 16c4-4 10-5 15-1M10 21c4 2 8 1 11-2" fill="none" stroke="#f3c2a0" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="m22 9 4-3 2 3-3 4" fill={colors.shade} stroke={colors.line} strokeWidth="1"/>
    </> : base === 'wolf_hide' || base === 'refined_leather' ? <>
      <path d="M7 5 13 8 19 5 25 9 23 15 26 23 18 27 12 24 5 26 7 18 4 12Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="m10 10 5 4 6-4m-10 9 8 3" fill="none" stroke={colors.shade} strokeWidth="1.5"/>
      {base === 'refined_leather' && <path d="m9 8 14 15" stroke="#c49a70" strokeWidth="1.2" opacity=".8"/>}
    </> : base === 'feather' ? <>
      <path d="M7 26C4 13 12 4 26 4c0 12-6 21-19 22Z" fill={colors.fill} stroke={colors.line} strokeWidth="1.2"/>
      <path d="M7 26 24 7M11 21l-1-7m5 2-1-7m2 12 7-1m-3-5 6-1" stroke={colors.shade} strokeWidth="1.1" strokeLinecap="round"/>
    </> : base === 'jabuticaba' ? <>
      <g fill={colors.fill} stroke={colors.line} strokeWidth="1"><circle cx="11" cy="17" r="7"/><circle cx="20" cy="13" r="7"/><circle cx="21" cy="22" r="6"/></g>
      <path d="m16 7 1-3m0 3 4-2" stroke="#71934d" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="9" cy="15" r="1.5" fill="#c5a5dc"/>
    </> : <>
      <path d="M5 8h22v17H5z" fill={colors.fill} stroke={colors.line} strokeWidth="1.3"/>
      <path d="M5 13h22" stroke={colors.shade} strokeWidth="2"/>
    </>}
  </svg>;
};
const cookingMealArtwork = (meal: CookingMeal) => {
  const ingredients = meal.ingredients.map(item => getBaseItemId(item.itemId));
  const hasVegetable = ingredients.some(item => item === 'tomato' || item === 'cabbage');
  const protein = ingredients.find(item => item === 'wolf_meat' || item === 'chicken_meat'
    || ['tilapia', 'tambaqui', 'pintado_surubim', 'lambari', 'tucunare'].includes(item));
  const image = protein === 'wolf_meat'
    ? (hasVegetable ? 'guisado-carne.png' : 'carne-grelhada.png')
    : protein === 'chicken_meat'
      ? (hasVegetable ? 'guisado-frango.png' : 'frango-grelhado.png')
      : protein
        ? (hasVegetable ? 'guisado-peixe.png' : 'peixe-grelhado.png')
        : 'sopa-legumes.png';
  return <img className="cooking-meal-artwork" src={`/assets/meals/${image}`} width="32" height="32"
    alt="" aria-hidden="true" draggable={false}
    style={{ display: 'block', width: 32, height: 32, objectFit: 'contain', imageRendering: 'pixelated' }} />;
};
const itemLabel = (itemId: string) => {
  const base = getBaseItemId(itemId);
  const parsedCore = parseCoreItemId(itemId);
  if (parsedCore?.kind === 'closed') return 'Núcleo fechado';
  if (parsedCore?.kind === 'revealed') {
    const core = parsedCore.core;
    if (core.category === 'weapon') {
      const modelLabel = core.weaponModel === 'arco' ? 'arco' : core.weaponModel === 'cajado'
        ? core.affinity === 'natureza' ? 'cajado da natureza' : 'cajado' : 'espada';
      return `Núcleo de ${modelLabel}`;
    }
    const equipmentLabels: Record<string, string> = {
      capacete: 'capacete', peitoral: 'peitoral', leggings: 'calça', bota: 'bota', luva: 'luva',
      colar: 'colar', pulseira: 'pulseira', cinto: 'cinto',
    };
    return `Núcleo de ${equipmentLabels[core.equipmentType ?? ''] ?? (core.category === 'armor' ? 'armadura' : 'acessório')}`;
  }
  const label = base === 'wood' ? 'Madeira' : base === 'stone' ? 'Pedra' : base === 'bronze' ? 'Bronze' : base === 'cotton' ? 'Algodão' : base === 'tomato' ? 'Tomate' : base === 'cabbage' ? 'Repolho' : base === 'herbs' ? 'Ervas' : base === 'linen' ? 'Linho' : base === 'refined_leather' ? 'Couro refinado' : base === 'wolf_meat' ? 'Carne de lobo' : base === 'wolf_hide' ? 'Couro de lobo' : base === 'chicken_meat' ? 'Frango' : base === 'feather' ? 'Pena' : base === 'jabuticaba' ? 'Jabuticaba' : base === 'tilapia' ? 'Tilápia' : base === 'tambaqui' ? 'Tambaqui' : base === 'pintado_surubim' ? 'Pintado / Surubim' : base === 'lambari' ? 'Lambari' : base === 'tucunare' ? 'Tucunaré' : base;
  return label;
};

const bauItemDetails = (itemId: string) => {
 const parsed = parseCoreItemId(itemId);
 if (parsed) return { usage: parsed.kind === 'closed' ? 'Leve à Joalheria para revelar.' : 'Usado na criação de equipamentos.', property: '' };
 const recipe = isCookingIngredient(itemId) ? getQuickRecipe(itemId,10) : null;
 const labels: Record<string,string> = {forca:'força',destreza:'destreza',inteligencia:'inteligência',velocidadeAtaque:'velocidade de ataque',velocidadeMovimento:'velocidade de movimento',healingPerSecond:'regeneração'};
 const properties = recipe ? Object.entries(recipe.effects).filter(([,value]) => typeof value === 'number' && value > 0).map(([key]) => labels[key]).filter(Boolean) : [];
 return {property:properties.length?'Propriedade: '+properties.join(' e '):'',
  usage:isCookingIngredient(itemId)?'Uso: usado em receitas':'Uso: usado em armas, armaduras, construção e outras criações.'};
};
const bauMealEffects = (meal: CookingMeal) => {
 const tier = meal.rarity === 'legendary' ? 'Grande' : meal.rarity === 'uncommon' || meal.rarity === 'rare' ? 'Médio' : 'Pequeno';
 const healingTier = tier === 'Grande' ? 'Grande' : tier === 'Médio' ? 'Média' : 'Pequena';
 const labels: Record<string,string> = {forca:'Força',destreza:'Destreza',inteligencia:'Inteligência',velocidadeAtaque:'Velocidade de ataque',velocidadeMovimento:'Velocidade de movimento',healingPerSecond:'Regeneração'};
 return Object.entries(meal.effects).filter(([,v])=>typeof v==='number'&&v>0).map(([key])=>key==='healingPerSecond'?healingTier+' regeneração':tier+' aumento de '+(labels[key]??key));
};
const bauIngredientName = (itemId: string) => itemLabel(itemId).replace(/ · (Comum|Incomum|Raro|Lendário)$/,'');

const arsenalWeaponLabels: Record<WeaponModel, string> = { espada: 'Espada', arco: 'Arco', cajado: 'Cajado', bastao: 'Bastão' };
type EquippedWeaponSelections = Partial<Record<ClassId, string>>;
const equippedWeaponStorageKey = (userId: string) => `fibula-equipped-weapons:${userId}`;
function readEquippedWeaponSelections(userId: string): EquippedWeaponSelections {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(equippedWeaponStorageKey(userId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const selections: EquippedWeaponSelections = {};
    for (const classId of ['guerreiro', 'mago', 'arqueiro', 'druida'] as const) {
      const id = (parsed as Record<string, unknown>)[classId];
      if (typeof id === 'string' && id.length > 0) selections[classId] = id;
    }
    return selections;
  } catch { return {}; }
}
function writeEquippedWeaponSelections(userId: string, selections: EquippedWeaponSelections): void {
  try { window.localStorage.setItem(equippedWeaponStorageKey(userId), JSON.stringify(selections)); } catch { /* Armazenamento local indisponível. */ }
}
function selectedWeaponForClass(weapons: CraftedWeapon[], selections: EquippedWeaponSelections, classId: ClassId): CraftedWeapon | null {
  const id = selections[classId];
  if (!id) return null;
  const weapon = weapons.find(item => item.id === id);
  return weapon && WEAPON_CLASS_BY_MODEL[weapon.model] === classId ? weapon : null;
}
const weaponAttributeLabels: Record<CoreAttributeKey, string> = {
  forca: 'Força', inteligencia: 'Inteligência', destreza: 'Destreza', velocidadeAtaque: 'Velocidade de ataque',
  vida: 'Vida', armadura: 'Armadura', resistenciaMagica: 'Resistência mágica', velocidadeMovimento: 'Velocidade de movimento', esquiva: 'Esquiva',
};
const rarityGlowStyle = (rarity: string | null | undefined): React.CSSProperties => {
  const color = rarity === 'common' ? '#36d66f' : rarity === 'uncommon' ? '#348cff' : rarity === 'rare' ? '#a34be8' : rarity === 'legendary' ? '#ff8a24' : null;
  return color ? { filter: `drop-shadow(0 0 5px ${color})` } : {};
};
const cleanItemName = (name: string) => name.replace(/\s*[·•]\s*(?:Normal|Comum|Incomum|Raro|Rara|Lendário|Lendária)$/i, '').trim();
const itemRarityGlow = (itemId: string): React.CSSProperties => {
  const parsedCore = parseCoreItemId(itemId);
  const rarity = parsedCore ? (parsedCore.kind === 'closed' ? parsedCore.rarity : parsedCore.core.rarity) : getItemRarity(itemId);
  return rarityGlowStyle(rarity);
};

const jabuticabaLevelCost = (level: number) => {
  let cost = 4;
  for (let current = 0; current < Math.max(0, Math.floor(level)); current++) cost = Math.ceil(cost * 1.25);
  return cost;
};

const LOBBY_CRAFTING_STATIONS = [
  { id: 'bigorna', label: 'BIGORNA', icon: '⚒️', title: 'Bigorna', description: 'Estação de metalurgia para fabricar e aprimorar equipamentos metálicos.', products: 'Armas, capacetes e peças de armadura' },
  { id: 'costura', label: 'COSTURA', icon: '🧵', title: 'Alfaiataria', description: 'Mesa de costura para trabalhar tecidos e materiais flexíveis.', products: 'Luvas, botas e peças de tecido' },
  { id: 'joalheria', label: 'JOIAS', icon: '💎', title: 'Joalheria', description: 'Revele núcleos fechados e descubra os atributos de armas, armaduras e acessórios.', products: 'Revelação de núcleos' },
  { id: 'fogao', label: 'FOGÃO', icon: '🍲', title: 'Fogão e Panela', description: 'Escolha os ingredientes do Baú e coloque cada unidade na panela para preparar sua refeição.', products: 'Sopas, grelhados, guisados e ensopados' },
] as const;

function drawWildlifeSprite(ctx: CanvasRenderingContext2D, animal: GameSnapshot['enemies'][number], elapsed: number) {
  const wolf = animal.animalKind === 'wolf';
  const moving = animal.moving === true;
  const phase = animal.walkPhase ?? 0;
  const wobble = animal.wobble;
  const fleeing = !wolf && animal.fleeing === true;
  const walkBob = moving ? Math.sin(phase * 2 + wobble) * (wolf ? 1.5 : 1.1) : 0;
  const breath = moving ? 1 : 1 + Math.sin(elapsed * 2.4 + wobble) * 0.02;

  ctx.save();
  ctx.translate(animal.x, animal.y);
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.beginPath(); ctx.ellipse(0, 11, wolf ? 19 : 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(animal.facingX ?? 1, 1);

  if (wolf) {
    const stride = moving ? Math.sin(phase) * 0.5 : 0;
    const tailSwing = Math.sin(elapsed * (moving ? 9 : 2.2) + wobble) * (moving ? 0.34 : 0.12);
    ctx.save(); ctx.translate(0, walkBob); ctx.scale(1, breath);
    ctx.save(); ctx.translate(-13, -1); ctx.rotate(tailSwing);
    ctx.strokeStyle = '#59483b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-11, -10, -12, -4); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#59483b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const leg of [{ x: -10, angle: stride }, { x: -3, angle: -stride }, { x: 8, angle: -stride }, { x: 14, angle: stride }]) {
      ctx.save(); ctx.translate(leg.x, 4); ctx.rotate(leg.angle);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-1, 6); ctx.lineTo(1, 7); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#8c7865'; ctx.strokeStyle = '#4d4036'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 17, 9, -0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(13, -5 + Math.sin(phase * 2 + wobble) * (moving ? 0.7 : 0.15));
    ctx.rotate(moving ? Math.sin(phase) * 0.035 : Math.sin(elapsed * 1.8 + wobble) * 0.015);
    ctx.fillStyle = '#9b8773'; ctx.strokeStyle = '#4d4036'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#675546';
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(-4, -15); ctx.lineTo(3, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(9, -12); ctx.lineTo(10, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0d8a8'; ctx.beginPath(); ctx.ellipse(6, 3, 5, 3, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#211d1a'; ctx.beginPath(); ctx.arc(5, -2, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.restore();
  } else {
    const chickenStride = moving ? Math.sin(phase * (fleeing ? 2 : 1)) * 0.5 : 0;
    const peck = moving ? Math.sin(phase * 2) * 2 : Math.pow(Math.max(0, Math.sin(elapsed * 1.9 + wobble)), 12) * 2.2;
    const wingBeat = Math.sin(elapsed * Math.PI * 2 * 9 + wobble);
    ctx.strokeStyle = '#b68b43'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const leg of [{ x: -5, angle: chickenStride }, { x: 5, angle: -chickenStride }]) {
      ctx.save(); ctx.translate(leg.x, 6); ctx.rotate(leg.angle);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 7); ctx.lineTo(leg.angle * 2, 7); ctx.stroke(); ctx.restore();
    }
    ctx.save();
    if (fleeing) ctx.rotate(-0.15);
    ctx.translate(0, walkBob); ctx.scale(1, breath);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#a9a397'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(-1, 1, 13, 10, -0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9e1d2'; ctx.beginPath(); ctx.ellipse(-4, 1, 7, 5, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (fleeing) {
      const wingAngle = -0.5 + wingBeat * 0.6;
      ctx.save(); ctx.translate(-3, -1); ctx.rotate(wingAngle);
      ctx.fillStyle = '#e4d8c3'; ctx.strokeStyle = '#a9a397'; ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -3.5, -13, -1);
      ctx.quadraticCurveTo(-11, 3.5, -5, 4); ctx.quadraticCurveTo(-1, 3, 0, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, -0.8); ctx.lineTo(-13, -1.4);
      ctx.moveTo(-9, 0.4); ctx.lineTo(-12.5, 0.2);
      ctx.moveTo(-8, 1.6); ctx.lineTo(-11.5, 2.2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(8 + peck + (fleeing ? 3 : 0), fleeing ? -10 : -8);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#a9a397'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, 6, fleeing ? 8 : 7, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d84b43'; ctx.beginPath(); ctx.arc(-2, -7, 2.5, 0, Math.PI * 2); ctx.arc(2, -8, 2.5, 0, Math.PI * 2); ctx.arc(5, -5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e5a63a'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(12, 2); ctx.lineTo(5, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#27231f'; ctx.beginPath(); ctx.arc(2, -2, 1.1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}

export default function App() {
  const { session } = useArenaAuth();
  const { updateAvailable } = useAndroidRelease();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lobbyCharacterCanvasRef = useRef<HTMLCanvasElement>(null);
  const duoPeerCanvasRef = useRef<HTMLCanvasElement>(null);
  const arsenalCharacterCanvasRef = useRef<HTMLCanvasElement>(null);
  const lobbyGrassCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const applyClassAndEquippedWeaponRef = useRef<(id: ClassId) => void>(() => {});
  const houseLoadReadyRef = useRef(false);
  const houseChangedDuringLoadRef = useRef(false);
  const initialHouseInventoryRef = useRef(JSON.stringify(readLocalHouseInventory()));
  const lastSyncedHouseInventoryRef = useRef(JSON.stringify(readConfirmedHouseInventory()));
  const pendingCloudHouseInventoryRef = useRef<Array<{ itemId: string; quantity: number }> | null>(null);
  const pendingHouseInventoryRef = useRef<string | null>(null);
  const houseSyncInFlightRef = useRef<Promise<void> | null>(null);
  const houseMatchClosedRef = useRef(false);
  const houseDeathFinalizeRef = useRef<Promise<void> | null>(null);
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
      const currentHouseInventory = engineRef.current?.state.house.inventory;
      const shouldApplyCloudInventory = source === 'cloud'
        && (!changedWhileLoading || currentHouseInventory?.length === 0 || !engineRef.current);
      if (shouldApplyCloudInventory) {
        if (engineRef.current) engineRef.current.setHouseInventory(inventory);
        else pendingCloudHouseInventoryRef.current = inventory;
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
    if (pendingCloudHouseInventoryRef.current !== null) return;

    pendingHouseInventoryRef.current = houseInventoryJson;
    const syncLatestHouseInventory = async (): Promise<void> => {
      if (houseMatchClosedRef.current) return;
      if (houseSyncInFlightRef.current) return houseSyncInFlightRef.current;

      const syncPromise = (async () => {
        while (!houseMatchClosedRef.current && pendingHouseInventoryRef.current !== null) {
          const snapshot = pendingHouseInventoryRef.current;
          if (snapshot === lastSyncedHouseInventoryRef.current) {
            pendingHouseInventoryRef.current = null;
            continue;
          }
          const inventory = JSON.parse(snapshot) as Array<{ itemId: string; quantity: number }>;
          const confirmedServerSnapshot = lastSyncedHouseInventoryRef.current;
          let serverHasConfirmedNonEmptyInventory = false;
          if (confirmedServerSnapshot) {
            try {
              const confirmedInventory = JSON.parse(confirmedServerSnapshot) as unknown;
              serverHasConfirmedNonEmptyInventory = Array.isArray(confirmedInventory)
                && confirmedInventory.length > 0;
            } catch { /* Estado do servidor desconhecido: não autoriza limpar o baú. */ }
          }
          const confirmed = await syncHouseInventory(supabaseClient, userId, inventory, {
            allowEmpty: serverHasConfirmedNonEmptyInventory,
          });
          if (!confirmed) break;
          lastSyncedHouseInventoryRef.current = snapshot;
          if (pendingHouseInventoryRef.current === snapshot) pendingHouseInventoryRef.current = null;
        }
      })();

      houseSyncInFlightRef.current = syncPromise;
      try {
        await syncPromise;
      } finally {
        if (houseSyncInFlightRef.current === syncPromise) houseSyncInFlightRef.current = null;
      }
    };

    if (houseMatchClosedRef.current) {
      pendingHouseInventoryRef.current = null;
      return;
    }
    if (houseInventoryJson !== lastSyncedHouseInventoryRef.current || houseSyncInFlightRef.current) {
      void syncLatestHouseInventory();
    } else {
      pendingHouseInventoryRef.current = null;
    }
    window.addEventListener('online', syncLatestHouseInventory);
    return () => window.removeEventListener('online', syncLatestHouseInventory);
  }, [houseInventoryJson, session.user.sub, houseLoadReady]);

  const submitSoloMatchResult = async (snapshot: GameSnapshot): Promise<void> => {
    const survivalNights = Math.max(0, snapshot.nightNumber - (snapshot.dayNight === 'night' ? 1 : 0));
    const sessionId = matchSessionIdRef.current;
    matchSessionIdRef.current = null;
    if (!sessionId || !fibulaSupabase) return;
    try {
      const result = await finishSoloMatchSession(fibulaSupabase, sessionId, {
        kills: snapshot.kills,
        survivalNights,
      });
      if (result === 'rejected') {
        window.alert('O servidor recusou o resultado desta partida por não passar na validação. Seu progresso não foi atualizado.');
      }
    } catch {
      window.alert('Não foi possível validar o resultado no encerramento. Esta partida não foi salva no perfil.');
    }
  };

  useEffect(() => {
    if (!state.dead) {
      matchSummaryHandledRef.current = false;
      return;
    }
    if (matchSummaryHandledRef.current) return;
    matchSummaryHandledRef.current = true;

    // Fecha a fila antes de finalizar: nenhuma alteração posterior à morte
    // pode iniciar outra gravação na nuvem.
    houseMatchClosedRef.current = true;
    const finalizeHouseFromConfirmedSnapshot = async () => {
      const inFlightSync = houseSyncInFlightRef.current;
      if (inFlightSync) await inFlightSync;
      pendingHouseInventoryRef.current = null;

      // A confirmação efetiva da gravação, e não navigator.onLine, define
      // qual conteúdo da Casa pode sobreviver à partida.
      const confirmedSnapshot = lastSyncedHouseInventoryRef.current
        || JSON.stringify(readConfirmedHouseInventory());
      const confirmedInventory = JSON.parse(confirmedSnapshot) as Array<{ itemId: string; quantity: number }>;
      engineRef.current?.setHouseInventory(confirmedInventory);
    };
    houseDeathFinalizeRef.current = finalizeHouseFromConfirmedSnapshot();
    void houseDeathFinalizeRef.current;

    if (duoStartedMatchIdRef.current) {
      void duoTransportRef.current?.reportDeath().catch(cause => {
        setDuoNotice(cause instanceof Error ? cause.message : 'Não foi possível registrar sua morte no servidor Duo.');
      });
      return;
    }

    const survivalNights = Math.max(0, state.nightNumber - (state.dayNight === 'night' ? 1 : 0));
    setStatusHistory(recordMatch(session.user.sub, {
      days: survivalNights,
      kills: state.kills,
      at: new Date().toISOString(),
    }));
    const matchUsage = engineRef.current?.getClassUsage();
    if (matchUsage) setStatusUsage(recordClassUsage(session.user.sub, matchUsage));

    void submitSoloMatchResult(state);
  }, [state.dead, state.kills, state.nightNumber, state.dayNight]);
  const [avatarCharacter, setAvatarCharacter] = useState<ClassId>('guerreiro');
  const [accountLevel, setAccountLevel] = useState(0);
  const [jabuticabaProgress, setJabuticabaProgress] = useState(0);
  const [jabuticabaBusy, setJabuticabaBusy] = useState(false);
  const [jabuticabaFeedback, setJabuticabaFeedback] = useState('');
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
  const [duoPeer, setDuoPeer] = useState<LobbyDuoPeer | null>(null);
  const [duoNotice, setDuoNotice] = useState('');
  const duoLeaveActionRef = useRef<(() => void) | null>(null);
  const duoReadyActionRef = useRef<(() => void) | null>(null);
  const duoStartActionRef = useRef<(() => void) | null>(null);
  const duoHouseNotifyActionRef = useRef<(() => Promise<void>) | null>(null);
  const duoStartedMatchIdRef = useRef<string | null>(null);
  const duoMatchStartingRef = useRef(false);
  const duoTransportRef = useRef<DuoCycleTransport | null>(null);
  const duoSoloFromNightRef = useRef(Number.MAX_SAFE_INTEGER);
  const [chestOpen, setChestOpen] = useState(false);
  const [chestTab, setChestTab] = useState<'resources' | 'meals'>('resources');
  const [houseStorageTab, setHouseStorageTab] = useState<'resources' | 'meals'>('resources');
  const [lobbyChestItems, setLobbyChestItems] = useState<HouseStorageStack[]>(readSavedHouseStorage);
  const [chestTransferItemId, setChestTransferItemId] = useState<string | null>(null);
  const [chestTransferQuantity, setChestTransferQuantity] = useState('1');
  const [chestTransferBusy, setChestTransferBusy] = useState(false);
  const [chestCloudReady, setChestCloudReady] = useState(false);
  const [chestTransferFeedback, setChestTransferFeedback] = useState('');
  const [bauAction, setBauAction] = useState<
    | { kind:'item'; item:HouseStorageStack; view:'actions'|'details'|'confirm' }
    | { kind:'meal'; meal:CookingMeal; view:'actions'|'details'|'confirm' }
    | null
  >(null);
  const [bauDeleteQuantity,setBauDeleteQuantity] = useState('1');
  const [bauDeleteBusy,setBauDeleteBusy] = useState(false);
  const [selectedJewelryCoreId, setSelectedJewelryCoreId] = useState<string | null>(null);
  const [jewelryResultCoreId, setJewelryResultCoreId] = useState<string | null>(null);
  const [jewelryRevealAnimating, setJewelryRevealAnimating] = useState(false);
  const [jewelryRevealBusy, setJewelryRevealBusy] = useState(false);
  const [jewelryFeedback, setJewelryFeedback] = useState('');
  const jewelrySlotCoreId = selectedJewelryCoreId ?? jewelryResultCoreId;
  const jewelrySlotCore = jewelrySlotCoreId ? parseCoreItemId(jewelrySlotCoreId) : null;
  useEffect(() => {
    if (!jewelryResultCoreId) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setJewelryRevealAnimating(false);
      return;
    }
    setJewelryRevealAnimating(true);
    const timeout = window.setTimeout(() => setJewelryRevealAnimating(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [jewelryResultCoreId]);
  const [arsenalCharacterTab, setArsenalCharacterTab] = useState<'principal' | 'secundario'>('principal');
  const [arsenalItems, setArsenalItems] = useState<ArsenalEquipment[]>(readSavedArsenal);
  const [equipmentLoadouts, setEquipmentLoadouts] = useState<ClassEquipmentLoadouts>(readSavedLoadouts);
  const [selectedArsenalItemId, setSelectedArsenalItemId] = useState<string | null>(null);
  const [arsenalActionItem, setArsenalActionItem] = useState<
    | { kind: 'weapon'; weapon: CraftedWeapon; equipped: boolean }
    | { kind: 'equipment'; item: ArsenalEquipment; equipped: boolean }
    | null
  >(null);
  const [arsenalDeleteConfirmation, setArsenalDeleteConfirmation] = useState<
    | { kind: 'weapon'; weapon: CraftedWeapon }
    | { kind: 'equipment'; item: ArsenalEquipment }
    | null
  >(null);
  const [arsenalDeleteBusy, setArsenalDeleteBusy] = useState(false);
  const [weaponInfoModal, setWeaponInfoModal] = useState<
    | { kind: 'weapon'; weapon: CraftedWeapon }
    | { kind: 'equipment'; item: ArsenalEquipment }
    | null
  >(null);
  const [weaponInfoComparison, setWeaponInfoComparison] = useState<CraftedWeapon | null>(null);
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
  const [statusHistory, setStatusHistory] = useState<MatchHistoryEntry[]>(() => readMatchHistory(session.user.sub));
  const [statusUsage, setStatusUsage] = useState<ClassUsageRecord>(() => readClassUsage(session.user.sub));
  const [statusRanks, setStatusRanks] = useState({
    power: { position: null as number | null, total: 0, previous: null as number | null, error: false },
    days: { position: null as number | null, total: 0, previous: null as number | null, error: false },
  });
  const lastReportedPdRef = useRef<{ userId: string; pd: number } | null>(null);
  const lastReportedMainCharacterRef = useRef<{ userId: string; character: ClassId } | null>(null);
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

  const [activeGameRoute, setActiveGameRoute] = useState<GameRoute>(() => readGameRoute() ?? { page: 'lobby' });
  const [preparedCookingMeals, setPreparedCookingMeals] = useState<CookingMeal[]>([]);
  const [readyCookingMeals, setReadyCookingMeals] = useState<CookingMeal[]>([]);
  const [pendingCookingMeals, setPendingCookingMeals] = useState<CookingMeal[]>([]);
  const [cookingClockOffset, setCookingClockOffset] = useState(0);
  const [cookingOnline, setCookingOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [panCookingSelections, setPanCookingSelections] = useState<Array<{ itemId: string; quantity: number }>>([]);
  const [cookingFeedback, setCookingFeedback] = useState('');
  const [cookingClock, setCookingClock] = useState(() => Date.now());
  const [selectedWeaponCoreId, setSelectedWeaponCoreId] = useState<string | null>(null);
  const [selectedWeaponMaterials, setSelectedWeaponMaterials] = useState<Array<{ slot: string; itemId: string; quantity: number }>>([]);
  const [forgeHammering, setForgeHammering] = useState(false);
  const [forgeCraftResult, setForgeCraftResult] = useState('');
  const [craftedWeapons, setCraftedWeapons] = useState<CraftedWeapon[]>([]);
  const [equippedWeaponIds, setEquippedWeaponIds] = useState<EquippedWeaponSelections>({});
  const [weaponsLoading, setWeaponsLoading] = useState(false);
  const [weaponsLoaded, setWeaponsLoaded] = useState(false);
  const [weaponCraftBusy, setWeaponCraftBusy] = useState(false);
  const weaponCraftLockRef = useRef(false);
  const [weaponFeedback, setWeaponFeedback] = useState('');
  const equippedArsenalWeapon = activeArsenalClassId ? selectedWeaponForClass(craftedWeapons, equippedWeaponIds, activeArsenalClassId) : null;
  const arsenalArmedPower = activeArsenalClassId
    ? getArmedClassPower(activeArsenalClassId, 0, 1 + accountLevel * 0.05, {
      weapon: equippedArsenalWeapon ? {
        model: equippedArsenalWeapon.model,
        damage: equippedArsenalWeapon.damage,
        attributes: equippedArsenalWeapon.attributes,
      } : null,
    })
    : null;
  const arsenalPowerValue = arsenalArmedPower ? Math.round(arsenalArmedPower.total) : null;
  const statusPowerReady = weaponsLoaded && !weaponsLoading;
  const statusPowers: Partial<Record<ClassId, number>> = {};
  if (statusPowerReady) {
    for (const classId of characterPreferences) {
      if (!classId) continue;
      const weapon = selectedWeaponForClass(craftedWeapons, equippedWeaponIds, classId);
      statusPowers[classId] = Math.round(getArmedClassPower(classId, 0, 1 + accountLevel * 0.05, {
        weapon: weapon ? { model: weapon.model, damage: weapon.damage, attributes: weapon.attributes } : null,
      }).total);
    }
  }
  const statusDuoPower = statusPowerReady
    ? characterPreferences.reduce((sum, classId) => sum + (classId ? statusPowers[classId] ?? 0 : 0), 0)
    : 0;

  useEffect(() => {
    if (!fibulaSupabase || !session.user.sub || !statusPowerReady || statusDuoPower <= 0) return;
    if (lastReportedPdRef.current?.userId === session.user.sub
      && lastReportedPdRef.current.pd === statusDuoPower) return;
    lastReportedPdRef.current = { userId: session.user.sub, pd: statusDuoPower };
    void reportHighestPd(fibulaSupabase, statusDuoPower);
  }, [statusPowerReady, statusDuoPower, session.user.sub]);
  const arsenalInventoryEntries = [
    ...arsenalItems.map(item => ({ kind: 'equipment' as const, item })),
    ...craftedWeapons.filter(weapon => equippedWeaponIds[WEAPON_CLASS_BY_MODEL[weapon.model]] !== weapon.id).map(weapon => ({ kind: 'weapon' as const, weapon })),
  ];
  const arsenalInventoryCapacity = Math.max(ARSENAL_CAPACITY, arsenalInventoryEntries.length);
  const activeCraftingStation = LOBBY_CRAFTING_STATIONS.find(station => station.id === activeGameRoute.page) ?? null;
  const openStation = (id: StationRouteId) => {
    navigateToStation(id);
    const latestRevealedCore = [...lobbyChestItems].reverse().find(item => parseCoreItemId(item.itemId)?.kind === 'revealed');
    setJewelryResultCoreId(id === 'joalheria' ? latestRevealedCore?.itemId ?? null : null);
    setActiveGameRoute({ page: id });
    setSelectedWeaponCoreId(null);
    setWeaponFeedback('');
    setForgeCraftResult('');
    setSelectedJewelryCoreId(null);
    setJewelryResultCoreId(null);
    setJewelryRevealAnimating(false);
    setJewelryFeedback('');
    setCookingFeedback(!cookingOnline && id === 'fogao' ? 'Sem conexão: cozinhar exige internet.' : '');
  };
  const closeGamePage = () => {
    navigateToLobby();
    setActiveGameRoute({ page: 'lobby' });
    setArsenalOpen(false); setFriendsOpen(false); setChestOpen(false);
    setStatusOpen(false); setProfileOpen(false); setRankingOpen(false);
    setPlayerProfileOpen(false); setViewedProfileUserId(null);
  };
  useEffect(() => {
    const syncGameRoute = () => {
      const route = readGameRoute(window.location.pathname) ?? { page: 'lobby' as const };
      setActiveGameRoute(route);
      setArsenalOpen(route.page === 'arsenal');
      setFriendsOpen(route.page === 'amigos');
      setChestOpen(route.page === 'bau');
      setStatusOpen(route.page === 'status');
      setProfileOpen(route.page === 'classes');
      setRankingOpen(route.page === 'ranking');
      setPlayerProfileOpen(route.page === 'jogador');
      setViewedProfileUserId(route.page === 'jogador' ? route.playerId : null);
    };
    window.addEventListener('popstate', syncGameRoute);
    if (!isKnownGamePath(window.location.pathname)) window.history.replaceState(null, '', '/');
    syncGameRoute();
    return () => window.removeEventListener('popstate', syncGameRoute);
  }, []);
  const cookingIngredientStacks = getCookingIngredientStacks(lobbyChestItems);
  const cookingSelectedTotal = panCookingSelections.reduce((sum, item) => sum + item.quantity, 0);
  const cookingCapacity = getCookingCapacity(panCookingSelections.length);
  const jewelryClosedCoreStacks = lobbyChestItems.reduce<HouseStorageStack[]>((stacks, item) => {
    const parsed = parseCoreItemId(item.itemId);
    if (parsed?.kind !== 'closed' || item.quantity <= 0) return stacks;
    const stackId = `jewelry-closed:${parsed.rarity}`;
    const existing = stacks.find(stack => stack.itemId === stackId);
    if (existing) existing.quantity += item.quantity;
    else stacks.push({ itemId: stackId, quantity: item.quantity });
    return stacks;
  }, []);
  const anvilWeaponCoreStacks = lobbyChestItems.reduce<HouseStorageStack[]>((stacks, item) => {
    const parsed = parseCoreItemId(item.itemId);
    if (parsed?.kind !== 'revealed' || parsed.core.category !== 'weapon' || item.quantity <= 0) return stacks;
    const existing = stacks.find(stack => stack.itemId === item.itemId);
    if (existing) existing.quantity += item.quantity;
    else stacks.push({ itemId: item.itemId, quantity: item.quantity });
    return stacks;
  }, []);
  const tailorFabricStacks = lobbyChestItems.reduce<HouseStorageStack[]>((stacks, item) => {
    const base = getBaseItemId(item.itemId);
    if (!['cotton', 'linen', 'refined_leather'].includes(base) || item.quantity <= 0) return stacks;
    const existing = stacks.find(stack => getBaseItemId(stack.itemId) === base);
    if (existing) existing.quantity += item.quantity;
    else stacks.push({ itemId: item.itemId, quantity: item.quantity });
    return stacks;
  }, []);
  const anvilMaterialStacks = lobbyChestItems.reduce<HouseStorageStack[]>((stacks, item) => {
    const base = getBaseItemId(item.itemId);
    if (!['wood', 'stone', 'bronze', 'linen'].includes(base) || item.quantity <= 0) return stacks;
    const existing = stacks.find(stack => stack.itemId === item.itemId);
    if (existing) existing.quantity += item.quantity;
    else stacks.push({ itemId: item.itemId, quantity: item.quantity });
    return stacks;
  }, []);
  const selectedWeaponCoreParsed = selectedWeaponCoreId ? parseCoreItemId(selectedWeaponCoreId) : null;
  const selectedWeaponCore = selectedWeaponCoreParsed?.kind === 'revealed'
    && selectedWeaponCoreParsed.core.category === 'weapon' ? selectedWeaponCoreParsed.core : null;
  const selectedWeaponModel: WeaponModel | null = selectedWeaponCore
    ? selectedWeaponCore.weaponModel === 'espada' ? 'espada'
      : selectedWeaponCore.weaponModel === 'arco' ? 'arco'
        : selectedWeaponCore.affinity === 'natureza' ? 'bastao' : 'cajado'
    : null;
  const weaponRecipeRows = selectedWeaponCore && selectedWeaponModel
    ? WEAPON_RECIPES[selectedWeaponModel].materials.map(material => {
      const slot = material.base;
      const selection = selectedWeaponMaterials.find(item => item.slot === slot) ?? null;
      const candidateBases = material.base === 'mineral' ? ['stone', 'bronze'] : [material.base];
      const candidates = candidateBases.map(base => {
        const itemId = weaponMaterialItemId(base, selectedWeaponCore.rarity);
        const available = lobbyChestItems.reduce((total, stack) => stack.itemId === itemId ? total + stack.quantity : total, 0);
        return { itemId, available };
      }).filter(item => item.available > 0);
      return { slot, material, selection, candidates };
    })
    : [];
  const weaponCompatibilityError = selectedWeaponCore && selectedWeaponModel ? weaponCoreCompatibility(selectedWeaponModel, selectedWeaponCore) : null;
  const selectedMineral = selectedWeaponMaterials.find(item => item.slot === 'mineral');
  const selectedWeaponTier: 1 | 2 = selectedMineral && getBaseItemId(selectedMineral.itemId) === 'bronze' ? 2 : 1;
  const weaponMaterialsReady = weaponRecipeRows.length > 0 && weaponRecipeRows.every(row => row.selection?.quantity === row.material.quantity);
  const forgeIntensity = !selectedWeaponCore ? 0 : selectedWeaponCore.rarity === 'legendary' ? 3
    : selectedWeaponCore.rarity === 'uncommon' || selectedWeaponCore.rarity === 'rare' ? 2 : 1;
  useEffect(() => {
    window.localStorage.removeItem('fibula-prepared-meals');
    window.localStorage.removeItem('fibula-ready-meals');
    window.localStorage.removeItem('fibula-pending-meals');
  }, []);
  useEffect(() => {
    const updateOnline = () => setCookingOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); };
  }, []);
  useEffect(() => {
    if (activeGameRoute.page !== 'fogao') return;
    setCookingClock(Date.now() + cookingClockOffset);
    const timer = window.setInterval(() => setCookingClock(Date.now() + cookingClockOffset), 1000);
    return () => window.clearInterval(timer);
  }, [activeGameRoute.page, cookingClockOffset]);
  const [profileClassTab, setProfileClassTab] = useState<ClassId>('guerreiro');
  const [interfaceScale, setInterfaceScale] = useState<70 | 100 | 130>(() => {
    if (typeof window === 'undefined') return 100;
    const saved = window.localStorage.getItem('fibula-interface-scale');
    return saved === '70' ? 70 : saved === '130' ? 130 : 100;
  });
  const [landscapeMode, setLandscapeMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [audioMuted, setAudioMuted] = useState(() => audioManager.isMuted());
  const [audioVolume, setAudioVolume] = useState(() => audioManager.getVolume());
  const [showStart, setShowStart] = useState(true);
  const [mobileLobbyLandscape, setMobileLobbyLandscape] = useState(false);
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
  const [campMenuOpen, setCampMenuOpen] = useState(false);
  const campMenuOpenRef = useRef(false);
  campMenuOpenRef.current = campMenuOpen;
  const lastTouchInventoryCloseAt = useRef(0);
  // Se a partida começou à noite, o amanhecer seguinte conclui o primeiro dia; não avance para Dia 2 nesse primeiro amanhecer.
  const survivalDay = state.startedAtNight ? Math.max(1, state.nightNumber) : state.nightNumber + 1;
  const feet = playerFeet(state.player);
  const cartDistance = Math.hypot(feet.x - state.cart.x, feet.y - state.cart.y);
  const cartAccessible = cartDistance <= CONFIG.cart.interactRadius;
  const cartCanStore = state.cart.stage === 'built' && cartAccessible;
  const houseDistance = Math.hypot(feet.x - state.house.x, feet.y - state.house.y);
  const houseAccessible = state.house.built && houseDistance <= CONFIG.house.interactRadius;
  const campfireDistance = state.campfire ? Math.hypot(feet.x - state.campfire.x, feet.y - state.campfire.y) : Infinity;
  const campMenuVisible = !!state.campfire && campfireDistance <= CONFIG.house.interactRadius;
  const chestBuildStatus = engineRef.current?.getChestBuildStatus() ?? { ok: false as const, reason: 'nofire' as const };
  const chestBuildStatusLabel = chestBuildStatus.ok ? 'Construir'
    : chestBuildStatus.reason === 'already' ? 'Já construído'
    : chestBuildStatus.reason === 'resources' ? 'Sem madeira'
    : chestBuildStatus.reason === 'outside' ? 'Fora do raio'
    : chestBuildStatus.reason === 'blocked' ? 'Local ocupado' : 'Sem fogueira';
  const refineryBuildStatus = engineRef.current?.getRefineryCampStatus() ?? { ok: false as const, reason: 'nofire' as const };
  const tecelariaBuildStatus = engineRef.current?.getTecelariaCampStatus() ?? { ok: false as const, reason: 'nofire' as const };
  const campMachineStatusLabel = (status: typeof refineryBuildStatus) => status.ok ? 'Construir'
    : status.reason === 'already' ? 'Já construída'
    : status.reason === 'resources' ? 'Sem material'
    : status.reason === 'outside' ? 'Fora do raio'
    : status.reason === 'blocked' ? 'Local ocupado' : 'Sem fogueira';
  const refineryBuildStatusLabel = campMachineStatusLabel(refineryBuildStatus);
  const tecelariaBuildStatusLabel = campMachineStatusLabel(tecelariaBuildStatus);
  const cartBuildAccessible = state.cart.stage === 'broken' && cartDistance <= CONFIG.cart.interactRadius;
  const donkeyX = state.cart.x + Math.cos(state.cart.angle) * CONFIG.donkey.cartDistance;
  const donkeyY = state.cart.y + Math.sin(state.cart.angle) * CONFIG.donkey.cartDistance;
  const donkeyDistance = Math.hypot(feet.x - donkeyX, feet.y - donkeyY);
  const cartActionVisible = state.cart.stage === 'built' && donkeyDistance <= CONFIG.cart.interactRadius;
  useEffect(() => {
    window.localStorage.setItem('fibula-interface-scale', String(interfaceScale));
  }, [interfaceScale]);

  useEffect(() => {
    window.localStorage.setItem('fibula-character-preferences', JSON.stringify(characterPreferences));
  }, [characterPreferences]);

  const primaryCharacter = characterPreferences[0];
  useEffect(() => {
    if (!fibulaSupabase || !session.user.sub || !primaryCharacter) return;
    if (lastReportedMainCharacterRef.current?.userId === session.user.sub
      && lastReportedMainCharacterRef.current.character === primaryCharacter) return;
    lastReportedMainCharacterRef.current = { userId: session.user.sub, character: primaryCharacter };
    void fibulaSupabase.from('fibula_profiles')
      .update({ main_character: primaryCharacter, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.sub)
      .then(() => undefined, () => undefined);
  }, [primaryCharacter, session.user.sub]);

  useEffect(() => {
    window.localStorage.setItem('fibula-arsenal-items', JSON.stringify(arsenalItems));
  }, [arsenalItems]);

  useEffect(() => {
    window.localStorage.setItem('fibula-arsenal-equipped-by-class', JSON.stringify(equipmentLoadouts));
  }, [equipmentLoadouts]);

  useEffect(() => {
    if (!weaponInfoModal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setWeaponInfoModal(null); setWeaponInfoComparison(null); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [weaponInfoModal]);

  useEffect(() => {
    if (!bauAction) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !bauDeleteBusy) setBauAction(null); };
    window.addEventListener('keydown',closeOnEscape);
    return () => window.removeEventListener('keydown',closeOnEscape);
  },[bauAction,bauDeleteBusy]);

  useEffect(() => {
    if (!arsenalActionItem) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArsenalActionItem(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [arsenalActionItem]);

  useEffect(() => {
    if (!arsenalDeleteConfirmation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !arsenalDeleteBusy) setArsenalDeleteConfirmation(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [arsenalDeleteConfirmation, arsenalDeleteBusy]);

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
    let active = true;
    void (async () => {
      const data = await loadAccountProgress();
      if (!active) return;
      const level = Math.max(0, Number(data.level) || 0);
      setAccountLevel(level);
      setJabuticabaProgress(Math.max(0, Number(data.jabuticaba_progress) || 0));
      engineRef.current?.setAccountLevel(level);
    })().catch(() => undefined);
    return () => { active = false; };
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
    setStatusHistory(readMatchHistory(session.user.sub));
    setStatusUsage(readClassUsage(session.user.sub));
  }, [session.user.sub]);

  useEffect(() => {
    if (!statusOpen) return;
    if (!fibulaSupabase || typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatusRanks({
        power: { position: null, total: 0, previous: null, error: true },
        days: { position: null, total: 0, previous: null, error: true },
      });
      return;
    }
    const supabase = fibulaSupabase;
    let active = true;
    void (async () => {
      try {
        let reportedPd: number | null = null;
        if (statusPowerReady && statusDuoPower > 0
          && (lastReportedPdRef.current?.userId !== session.user.sub || lastReportedPdRef.current.pd !== statusDuoPower)) {
          lastReportedPdRef.current = { userId: session.user.sub, pd: statusDuoPower };
          reportedPd = await reportHighestPd(supabase, statusDuoPower);
        }
        const { data: profile, error: profileError } = await supabase
          .from('fibula_profiles').select('highest_pd,highest_survival_level')
          .eq('user_id', session.user.sub).maybeSingle();
        if (profileError) throw profileError;
        const highestPd = profile?.highest_pd;
        const highestDays = profile?.highest_survival_level;
        const powerValue = reportedPd ?? (typeof highestPd === 'number' && Number.isSafeInteger(highestPd) ? highestPd : 0);
        const daysValue = typeof highestDays === 'number' && Number.isSafeInteger(highestDays) ? highestDays : 0;
        const fields = [
          { key: 'power' as const, field: 'highest_pd', value: powerValue },
          { key: 'days' as const, field: 'highest_survival_level', value: daysValue },
        ];
        const next = await Promise.all(fields.map(async item => {
          if (item.value <= 0) return { key: item.key, position: null, total: 0, previous: null };
          const [ahead, total] = await Promise.all([
            supabase.from('fibula_profiles').select('user_id', { count: 'exact', head: true }).gt(item.field, item.value),
            supabase.from('fibula_profiles').select('user_id', { count: 'exact', head: true }).gt(item.field, 0),
          ]);
          if (ahead.error) throw ahead.error;
          if (total.error) throw total.error;
          return { key: item.key, position: (ahead.count ?? 0) + 1, total: total.count ?? 0, previous: null as number | null };
        }));
        if (!active) return;
        let saved: Record<string, { current: number | null; previous: number | null }> = {};
        const storageKey = 'fibula-status-rank-v1:' + session.user.sub;
        try {
          const raw = window.localStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed === 'object') saved = parsed;
        } catch { saved = {}; }
        const updated: Record<string, { current: number | null; previous: number | null }> = { ...saved };
        const rankState = { power: { position: null as number | null, total: 0, previous: null as number | null, error: false }, days: { position: null as number | null, total: 0, previous: null as number | null, error: false } };
        for (const item of next) {
          const old = saved[item.key];
          const changed = !!old && old.current !== item.position;
          const previous = changed ? old.current : item.position === null ? null : item.position;
          updated[item.key] = { current: item.position, previous };
          rankState[item.key] = { position: item.position, total: item.total, previous: changed ? previous : item.position, error: false };
        }
        try { window.localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* Histórico de posição opcional. */ }
        setStatusRanks(rankState);
      } catch {
        if (active) setStatusRanks({
          power: { position: null, total: 0, previous: null, error: true },
          days: { position: null, total: 0, previous: null, error: true },
        });
      }
    })();
    return () => { active = false; };
  }, [statusOpen, statusPowerReady, statusDuoPower, session.user.sub]);

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
    if (!showStart || activeGameRoute.page !== 'lobby') return;
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
  }, [showStart, activeGameRoute.page]);

  useEffect(() => {
    if (!showStart || activeGameRoute.page !== 'lobby') return;
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
  }, [showStart, characterPreferences, activeGameRoute.page]);

  useEffect(() => {
    if (!showStart || !duoPeer || activeGameRoute.page !== 'lobby') return;
    const canvas = duoPeerCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderPeer = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const weapon = PROFILE_CLASS_WEAPONS[duoPeer.classId];
      const time = reducedMotion ? 0 : now / 1000;
      const scale = Math.min(width / 72, height / 76);
      ctx.save();
      ctx.translate(width / 2, height * 0.82);
      ctx.scale(scale, scale);
      drawPlayer(ctx, 0, 0, weapon, duoPeer.classId, time, 0, 0, false, 0, false, 0, 1, -Math.PI / 2, false, false);
      drawFloatingWeapon(ctx, weapon, CONFIG.player.radius, { time, facingX: 1, moving: false, hasEnemies: false, hasTarget: false, aimAngle: -Math.PI / 2, carried: false, swingTimer: 0, swingAngle: 0, forceVisible: true, preferredSide: -1 });
      ctx.restore();
      if (!reducedMotion) frame = window.requestAnimationFrame(renderPeer);
    };
    renderPeer(performance.now());
    return () => { if (frame) window.cancelAnimationFrame(frame); };
  }, [showStart, duoPeer?.classId, duoPeer?.status, activeGameRoute.page]);

  useEffect(() => {
    ambience.setActive(!showStart && !state.dead);
    return () => ambience.setActive(false);
  }, [showStart, state.dead]);

  useEffect(() => {
    const mobileLandscapeQuery = window.matchMedia('(pointer: coarse) and (orientation: landscape) and (max-height: 600px) and (max-width: 950px)');
    const syncMobileLobbyOrientation = () => setMobileLobbyLandscape(mobileLandscapeQuery.matches);
    syncMobileLobbyOrientation();
    mobileLandscapeQuery.addEventListener('change', syncMobileLobbyOrientation);
    window.addEventListener('resize', syncMobileLobbyOrientation);
    window.addEventListener('orientationchange', syncMobileLobbyOrientation);
    return () => {
      mobileLandscapeQuery.removeEventListener('change', syncMobileLobbyOrientation);
      window.removeEventListener('resize', syncMobileLobbyOrientation);
      window.removeEventListener('orientationchange', syncMobileLobbyOrientation);
    };
  }, []);

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
    if (activeGameRoute.page !== 'lobby') return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const engine = new GameEngine((next) => setState(next), { accountLevel }); engine.onSound = (event) => audioManager.play(event); engineRef.current = engine;
    const pendingCloudInventory = pendingCloudHouseInventoryRef.current;
    if (pendingCloudInventory !== null) {
      engine.setHouseInventory(pendingCloudInventory);
      pendingCloudHouseInventoryRef.current = null;
    }
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
      drawLake(ctx, s.lake, s.elapsed, left, top, viewW, viewH);
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
      if (s.campfire) {
        if (campMenuOpenRef.current) worldDrawables.push({ depth: s.campfire.y + 10, draw: () => drawCampfireRange(ctx, s.campfire!) });
        worldDrawables.push({ depth: s.campfire.y + 12, draw: () => drawCampfire(ctx, s.campfire!, s.elapsed) });
      }
      if (s.house.built) worldDrawables.push({ depth: s.house.y + 28, draw: () => drawCampChest(ctx, s.house) });
      if (s.refinery.built) worldDrawables.push({ depth: s.refinery.y + 28, draw: () => drawRefinery(ctx, s.refinery, s.elapsed) });
      if (s.tecelaria.built) worldDrawables.push({ depth: s.tecelaria.y + 28, draw: () => drawTecelaria(ctx, s.tecelaria) });
      worldDrawables.push({ depth: s.cart.y + 14, draw: () => {
        const playerGround = playerFeet(s.player);
        drawCart(ctx, s.cart, Math.hypot(playerGround.x - s.cart.x, playerGround.y - s.cart.y) <= CONFIG.cart.interactRadius, s.elapsed, false, s.cart.wheelPhase);
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
      for (const plant of s.vegetablePlants) {
        // O crescimento aumenta um pouco o porte, mas principalmente a quantidade de partes da planta.
        const sizeScale = plant.size === 'small' ? 0.9 : plant.size === 'medium' ? 1 : 1.1;
        const scaleX = 1.2 * 0.9 * sizeScale;
        const scaleY = 1.2 * 1.15 * sizeScale;
        const isSmall = plant.size === 'small';
        const isLarge = plant.size === 'large';
        worldDrawables.push({ depth: plant.y + 13 * 1.2 * sizeScale, draw: () => {
          drawResourceRarityAura(ctx, plant.x, plant.y + 12, plant.size === 'large' ? 42 : plant.size === 'medium' ? 34 : 26, plant.rarity);
          ctx.save(); ctx.translate(plant.x, plant.y); ctx.scale(scaleX, scaleY);
          ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 12, 17 * sizeScale, 6 * sizeScale, 0, 0, Math.PI * 2); ctx.fill();
          const leaf = (x: number, y: number, angle: number, color: string) => { ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color; ctx.strokeStyle = '#315c2d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-13, -9, -4, -19); ctx.quadraticCurveTo(8, -14, 0, 0); ctx.fill(); ctx.stroke(); ctx.restore(); };
          if (plant.kind === 'tomato') {
            ctx.strokeStyle = '#52783a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -12); ctx.lineTo(-10, -19); ctx.moveTo(0, -7); ctx.lineTo(11, -17); ctx.moveTo(0, 1); ctx.lineTo(-14, -5); ctx.moveTo(0, -1); ctx.lineTo(14, -8); ctx.stroke();
            const tomatoLeaves = [[-8,-13,-0.8,'#4e963d'],[7,-12,0.8,'#65a844'],[-11,-4,-1.2,'#3f8538'],[10,-4,1.1,'#55963d'],[-15,-7,-1.3,'#4b8f3b'],[14,-10,1.2,'#5a9d42'],[-2,-19,-0.2,'#70aa49']] as const;
            const leafCount = isSmall ? 4 : isLarge ? 7 : 6;
            for (let i = 0; i < leafCount; i++) { const [x,y,a,c] = tomatoLeaves[i]; leaf(x,y,a,c); }
            const fruits = [[-9,-8],[9,-13],[1,-20],[-15,-3],[14,-6],[0,-5]] as const;
            const fruitCount = isSmall ? 2 : isLarge ? 6 : 4;
            for (let i = 0; i < fruitCount; i++) {
              const [x,y] = fruits[i];
              ctx.fillStyle = '#d9362b'; ctx.strokeStyle = '#8f241f'; ctx.beginPath(); ctx.arc(x,y,4.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
              ctx.fillStyle = '#4d8a37'; ctx.beginPath(); ctx.moveTo(x,y-4); ctx.lineTo(x-3,y-7); ctx.lineTo(x,y-6); ctx.lineTo(x+3,y-8); ctx.fill();
            }
          } else if (plant.kind === 'cabbage') {
            // O repolho cresce rente ao solo; plantas maiores ganham camadas de folhas largas.
            const outerLeaves = [[-12,10,-1.25,'#4f963e'],[12,10,1.25,'#438735'],[-10,5,-0.9,'#65a94d'],[10,5,0.9,'#5b9c43'],[-5,2,-0.45,'#4b913d'],[5,2,0.45,'#70ad4e'],[-15,9,-1.45,'#438735'],[15,9,1.45,'#4f963e']] as const;
            const leafCount = isSmall ? 4 : isLarge ? 8 : 6;
            for (let i = 0; i < leafCount; i++) { const [x,y,a,c] = outerLeaves[i]; leaf(x,y,a,c); }
            ctx.fillStyle = '#83bd55'; ctx.strokeStyle = '#3d7132'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(0, -3, isSmall ? 8 : isLarge ? 12 : 10, isSmall ? 9 : isLarge ? 13 : 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#c2df8a'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 8); ctx.quadraticCurveTo(-3, -3, 0, -12);
            ctx.moveTo(0, 8); ctx.quadraticCurveTo(7, -3, 7, -8);
            ctx.stroke();
          } else {
            // Ervas: touceira de hastes finas; o porte maior acrescenta hastes e pares de folhas.
            const stemCount = isSmall ? 3 : isLarge ? 7 : 5;
            ctx.strokeStyle = '#467c36'; ctx.lineWidth = 2.1;
            for (let i = 0; i < stemCount; i++) {
              const n = i - Math.floor(stemCount / 2);
              const topX = n * 5 - 3;
              const topY = -18 - (isLarge ? Math.abs(n) * 2 : isSmall ? 0 : Math.abs(n));
              ctx.beginPath(); ctx.moveTo(0,12); ctx.quadraticCurveTo(n*3,-5,topX,topY); ctx.stroke();
              leaf(n*4,-10,n*.25,n%2?'#79ad4d':'#4c963e');
              if (!isSmall) leaf(n*3+3,-4,n*.3+0.7,'#65a94d');
              if (isLarge) leaf(n*3-3,-14,n*.3-0.7,'#5a9b42');
            }
          }
          ctx.restore();
        }});
      }
      for (const tree of s.trees) {
        const scale = tree.size === 'small' ? 1.75 : tree.size === 'medium' ? 2.45 : 3.25;
        worldDrawables.push({ depth: tree.y + 30 * scale, draw: () => { drawResourceRarityAura(ctx, tree.x, tree.y + 29 * scale, tree.size === 'large' ? 64 : tree.size === 'medium' ? 50 : 38, tree.rarity); drawTree(ctx, tree.x, tree.y, tree.size); } });
      }
      if (s.jabuticabaTree) {
        const tree = s.jabuticabaTree;
        worldDrawables.push({ depth: tree.y + 98, draw: () => {
          drawTree(ctx, tree.x, tree.y, 'large');
          ctx.save(); ctx.translate(tree.x, tree.y); ctx.scale(3.25, 3.25);
          for (const [x, y] of [[-12,-18],[-3,-27],[9,-22],[15,-9],[-16,-5],[1,-12],[5,0]] as const) {
            ctx.fillStyle = '#342044'; ctx.strokeStyle = '#1e1729'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(x, y, 2.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(224,197,239,.75)'; ctx.beginPath(); ctx.arc(x - 0.8, y - 0.9, 0.8, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        } });
      }
      for (const rock of s.rocks) {
        const scale = rock.size === 'small' ? 1.22 : rock.size === 'medium' ? 1.5 : 1.85;
        worldDrawables.push({ depth: rock.y + 12 * scale, draw: () => { drawResourceRarityAura(ctx, rock.x, rock.y + 12 * scale, rock.size === 'large' ? 46 : rock.size === 'medium' ? 36 : 28, rock.rarity); drawRock(ctx, rock.x, rock.y, rock.size); } });
      }
      for (const drop of s.jabuticabaDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          if (drawItemSprite(ctx, 'jabuticaba', drop.x, drop.y, 24)) return;
          ctx.fillStyle = '#342044'; ctx.beginPath(); ctx.arc(drop.x, drop.y, 5, 0, Math.PI * 2); ctx.fill();
        } });
      }
      for (const drop of s.vegetableDrops) {
        worldDrawables.push({ depth: drop.y + 5, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 3, 17, drop.rarity);
          if (drawItemSprite(ctx, drop.kind, drop.x, drop.y, 24)) return;
          ctx.save(); ctx.translate(drop.x, drop.y);
          // O item no chão representa uma unidade colhida, não o tamanho da planta de origem.
          if (drop.kind === 'tomato') { ctx.fillStyle = '#df392e'; ctx.strokeStyle = '#85251e'; ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#4c8a36'; ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(-2,-5); ctx.lineTo(0,-4); ctx.lineTo(2,-5); ctx.fill(); }
          else if (drop.kind === 'cabbage') { ctx.fillStyle = '#8fbd59'; ctx.strokeStyle = '#426d35'; ctx.beginPath(); ctx.ellipse(0,0,5,3.8,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#c2df8a'; ctx.beginPath(); ctx.moveTo(0,3); ctx.lineTo(0,-3); ctx.stroke(); }
          else { ctx.strokeStyle = '#4f963e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0,4); ctx.lineTo(-2,-3); ctx.moveTo(0,4); ctx.lineTo(2,-4); ctx.moveTo(0,2); ctx.lineTo(-4,-1); ctx.moveTo(0,2); ctx.lineTo(4,-1); ctx.stroke(); }
          ctx.restore();
        }});
      }
      for (const drop of s.cottonDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 4, 18, drop.rarity);
          if (drawItemSprite(ctx, 'cotton', drop.x, drop.y, 26)) return;
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
          if (drawItemSprite(ctx, 'linen', drop.x, drop.y, 24)) return;
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#e5d6b5'; ctx.strokeStyle = '#8b7857'; ctx.lineWidth = 1.3;
          ctx.fillRect(-6, -4, 12, 8); ctx.strokeRect(-6, -4, 12, 8);
          ctx.strokeStyle = '#b39a70'; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-3, 4); ctx.moveTo(1, -4); ctx.lineTo(1, 4); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.refinedLeatherDrops) {
        worldDrawables.push({ depth: drop.y + 5, draw: () => {
          if (drawItemSprite(ctx, 'refined_leather', drop.x, drop.y, 24)) return;
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#986b49'; ctx.strokeStyle = '#3f2b20'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-2, -6); ctx.lineTo(5, -4); ctx.lineTo(7, 2); ctx.lineTo(3, 6); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#c49a70'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, 3); ctx.moveTo(1, -4); ctx.lineTo(5, 0); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.stoneDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 6, 20, drop.rarity);
          if (drawItemSprite(ctx, 'stone', drop.x, drop.y, 26)) return;
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
          if (drawItemSprite(ctx, 'bronze', drop.x, drop.y, 24)) return;
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#b87333'; ctx.strokeStyle = '#70451f'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-4, -3); ctx.lineTo(0, -5); ctx.lineTo(5, -2); ctx.lineTo(6, 2); ctx.lineTo(1, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#e0a15e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(2, -1); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.wildlifeDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 3, 17, drop.rarity);
          if (drawItemSprite(ctx, drop.kind, drop.x, drop.y, 24)) { if (drop.amount > 1) { ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(String(drop.amount), drop.x, drop.y - 12); } return; }
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.font = '21px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          if (!drawItemSprite(ctx, drop.kind, 0, 0, 24)) ctx.fillText(itemIcon(drop.kind), 0, 0);
          if (drop.amount > 1) { ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillText(String(drop.amount), 0, -12); }
          ctx.restore();
        }});
      }
      for (const drop of s.coreDrops) {
        worldDrawables.push({ depth: drop.y + 7, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 3, 20, drop.core.rarity === 'normal' ? undefined : drop.core.rarity);
          ctx.save(); ctx.translate(drop.x, drop.y);
          if (!drawCoreSprite(ctx, CORE_SPRITE_FILES.closed, 0, 0, 24)) {
            ctx.font = '24px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('💎', 0, 0);
          }
          ctx.restore();
        }});
      }
      for (const drop of s.woodDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
          drawResourceRarityAura(ctx, drop.x, drop.y + 3, 22, drop.rarity);
          ctx.save(); ctx.translate(drop.x, drop.y);
          if (drawItemSprite(ctx, 'wood', 0, 0, 24)) { ctx.restore(); ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(String(drop.amount), drop.x, drop.y - 13); return; }
          // Usa o mesmo ícone da mochila, agora como um único tronco.
          ctx.font = '22px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(itemIcon('wood'), 0, 0);
          ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(drop.amount), 0, -13); ctx.restore();
        }});
      }
      for (const enemy of s.enemies) {
        worldDrawables.push({ depth: enemy.y + CONFIG.enemy.radius * 0.7, draw: () => {
          if (enemy.animalKind) { drawResourceRarityAura(ctx, enemy.x, enemy.y + 4, enemy.animalKind === 'wolf' ? 26 : 22, enemy.rarity); drawWildlifeSprite(ctx, enemy, s.elapsed); }
          else drawSlime(ctx, enemy.x, enemy.y, CONFIG.enemy.radius, '#70d78d', '#397e58', enemy.wobble);
        }});
      }
      for (const enemy of s.dyingEnemies) {
        const progress = Math.min(1, enemy.deathAge / 0.48);
        worldDrawables.push({ depth: enemy.y + CONFIG.enemy.radius * 0.7 + progress * CONFIG.enemy.radius * 0.65, draw: () => {
          ctx.save(); ctx.globalAlpha = 1 - progress;
          ctx.translate(enemy.x, enemy.y + progress * CONFIG.enemy.radius * 0.65);
          ctx.scale(1 + progress * 0.38, Math.max(0.06, 1 - progress * 0.92));
          if (enemy.animalKind) drawWildlifeSprite(ctx, { ...enemy, x: 0, y: 0 }, s.elapsed);
          else drawSlime(ctx, 0, 0, CONFIG.enemy.radius, '#70d78d', '#397e58', enemy.wobble);
          ctx.restore();
        }});
      }
      worldDrawables.push({ depth: s.player.y + ladinoFeetY(CONFIG.player.radius) - CONFIG.player.radius * 0.1, draw: () => drawPlayer(ctx, s.player.x, s.player.y, s.weapon, s.classId, s.elapsed, s.swordSwingAngle, s.swordSwingTimer, s.player.moving, s.walkPhase, s.cart.carried, s.player.facingX, s.player.facingY, aimAngle, aimTarget != null, s.dayNight === 'night', true, s.fishing, s.fishingProgress) });
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
        ctx.strokeText(damage.label ?? (Number.isInteger(damage.amount) ? String(damage.amount) : damage.amount.toFixed(1)), 0, 0);
        ctx.fillStyle = damage.color;
        ctx.fillText(damage.label ?? (Number.isInteger(damage.amount) ? String(damage.amount) : damage.amount.toFixed(1)), 0, 0);
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
  }, [activeGameRoute.page]);

  useEffect(() => {
    const engine = engineRef.current; if (!engine || activeGameRoute.page !== 'lobby') return;
    const down = (e: KeyboardEvent) => {
      if (!gameStartedRef.current) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { closeFlagMenu(); closeCampMenu(); }
      if (k === 'escape') {
        closeFlagMenu();
        closeInventoryPanel();
        setCampMenuOpen(false);
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
        const canUseCart = current.cart.stage === 'built' && (current.cart.carried || cartDistanceNow <= CONFIG.cart.interactRadius);
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
          { distance: Math.hypot(currentFeet.x - current.cart.x, currentFeet.y - current.cart.y), radius: CONFIG.cart.interactRadius, available: current.cart.stage === 'broken', build: () => engine.buildCart() },
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
      
      if (k === '1') applyClassAndEquippedWeaponRef.current('guerreiro');
      if (k === '2') applyClassAndEquippedWeaponRef.current('mago');
      if (k === '3') applyClassAndEquippedWeaponRef.current('arqueiro');
      if (k === '4') applyClassAndEquippedWeaponRef.current('druida');
      if (k === 'r') engine.toggleRange();
      if (k === ' ' && !e.repeat) engine.toggleCart();
    };
    const up = (e: KeyboardEvent) => { if (gameStartedRef.current) engine.setKey(e.key, false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [activeGameRoute.page]);

  const refreshLobbyChestFromCloud = async () => {
    if (!fibulaSupabase || !session.user.sub) throw new Error('Entre na sua conta para atualizar o Baú.');
    const inventory = await loadCloudHouseInventory(fibulaSupabase, session.user.sub);
    lastSyncedHouseInventoryRef.current = JSON.stringify(inventory);
    engineRef.current?.setHouseInventory(inventory);
    setLobbyChestItems(inventory);
    setChestCloudReady(true);
    return inventory;
  };

  const loadAccountProgress = async () => {
    if (!fibulaSupabase || !session.user.sub) throw new Error('Entre na sua conta para carregar o progresso.');
    const current = await fibulaSupabase.from('fibula_profiles').select('level,jabuticaba_progress')
      .eq('user_id', session.user.sub).single();
    if (!current.error && current.data) return current.data;
    const fallback = await fibulaSupabase.from('fibula_profiles').select('level')
      .eq('user_id', session.user.sub).single();
    if (fallback.error || !fallback.data) throw fallback.error ?? new Error('Perfil não encontrado.');
    return { level: fallback.data.level, jabuticaba_progress: 0 };
  };

  const consumeJabuticaba = async () => {
    if (jabuticabaBusy || !fibulaSupabase) return;
    setJabuticabaBusy(true);
    setJabuticabaFeedback('');
    try {
      const { data, error } = await fibulaSupabase.rpc('fibula_consume_jabuticaba');
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Resposta inválida do servidor.');
      const result = data as Record<string, unknown>;
      const level = Number(result.level);
      const progress = Number(result.progress);
      if (!Number.isSafeInteger(level) || level < 0 || !Number.isSafeInteger(progress) || progress < 0) {
        throw new Error('O servidor retornou um progresso inválido.');
      }
      setAccountLevel(level);
      setJabuticabaProgress(progress);
      engineRef.current?.setAccountLevel(level);
      await refreshLobbyChestFromCloud();
      setJabuticabaFeedback(result.leveled_up === true
        ? `Nível geral aumentado para ${level}! O progresso da próxima etapa começou do zero.`
        : `Jabuticaba consumida: ${progress}/${Number(result.next_cost) || jabuticabaLevelCost(level)} para o próximo nível.`);
    } catch (cause) {
      setJabuticabaFeedback(cause instanceof Error ? cause.message : 'Não foi possível consumir a jabuticaba.');
    } finally {
      setJabuticabaBusy(false);
    }
  };

  const openLobbyChest = () => {
    navigateToPage('bau');
    setActiveGameRoute({ page: 'bau' });
    setChestTab('resources');
    setChestOpen(true);
    setChestTransferItemId(null);
    setChestTransferFeedback('');
    setChestCloudReady(false);
    setLobbyChestItems(readSavedHouseStorage());
    if (!cookingOnline) setCookingFeedback('Sem conexão: cozinhar exige internet.');
    void refreshLobbyChestFromCloud().catch(cause => {
      setChestCloudReady(false);
      setChestTransferFeedback(cause instanceof Error ? cause.message : 'Não foi possível atualizar o Baú.');
    });
  };

  const openSidePage = (id: SideNavId): void => {
    if (id === 'bau') {
      openLobbyChest();
    } else {
      navigateToPage(id);
      setActiveGameRoute({ page: id });
    }
    setArsenalOpen(id === 'arsenal');
    setFriendsOpen(id === 'amigos');
    setChestOpen(id === 'bau');
    setStatusOpen(id === 'status');
    setProfileOpen(id === 'classes');
    setRankingOpen(false);
    setPlayerProfileOpen(false);
    setViewedProfileUserId(null);
  };

  const sendLobbyChestItem = async () => {
    const peer = duoPeer;
    const item = lobbyChestItems.find(entry => entry.itemId === chestTransferItemId);
    const quantity = Number(chestTransferQuantity);
    if (!peer || peer.status !== 'connected' || peer.matchId || !item || !chestCloudReady) return;
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > item.quantity) {
      setChestTransferFeedback('Informe uma quantidade válida para enviar.');
      return;
    }
    if (!fibulaSupabase) {
      setChestTransferFeedback('O serviço de armazenamento não está disponível.');
      return;
    }
    setChestTransferBusy(true);
    setChestTransferFeedback('');
    try {
      await transferHouseStackToDuo(fibulaSupabase, peer.roomId, item.itemId, quantity);
      setChestTransferItemId(null);
      let senderRefreshFailed = false;
      try {
        await refreshLobbyChestFromCloud();
      } catch {
        setChestCloudReady(false);
        senderRefreshFailed = true;
      }
      let peerNotifyFailed = false;
      const notifyPeer = duoHouseNotifyActionRef.current;
      if (notifyPeer) {
        try { await notifyPeer(); } catch { peerNotifyFailed = true; }
      } else {
        peerNotifyFailed = true;
      }
      if (senderRefreshFailed || peerNotifyFailed) {
        setChestTransferFeedback('Item enviado para ' + peer.friendName + '. Um dos Baús não atualizou automaticamente; feche e abra o Baú novamente para sincronizar.');
      } else {
        setChestTransferFeedback('Enviado: ' + quantity + ' × ' + itemLabel(item.itemId) + ' para ' + peer.friendName + '.');
      }
    } catch (cause) {
      setChestTransferFeedback(cause instanceof Error ? cause.message : 'Não foi possível enviar o item.');
    } finally {
      setChestTransferBusy(false);
    }
  };
  const applyCookingInventory = (nextInventory: HouseStorageStack[]) => {
    setLobbyChestItems(nextInventory);
    engineRef.current?.setHouseInventory(nextInventory);
    try { window.localStorage.setItem(HOUSE_STORAGE_KEY, JSON.stringify(nextInventory)); } catch { /* Armazenamento local indisponível. */ }
  };
  const openBauItemActions = (item:HouseStorageStack) => {setBauDeleteQuantity('1');setBauAction({kind:'item',item,view:'actions'});};
  const openBauMealActions = (meal:CookingMeal) => setBauAction({kind:'meal',meal,view:'actions'});
  const showBauActionDetails = () => setBauAction(current=>current?{...current,view:'details'}:null);
  const requestBauActionDeletion = () => setBauAction(current=>current?{...current,view:'confirm'}:null);
  const discardBauMeal = async (meal:CookingMeal) => {
    if(!cookingOnline||!fibulaSupabase){setCookingFeedback('Sem conexão: excluir refeições exige internet.');return;}
    setBauDeleteBusy(true);setCookingFeedback('');
    try {const result=await discardCookingMeal(fibulaSupabase,meal.id);applyCookingServerState(result);setBauAction(null);setCookingFeedback(meal.name+' foi excluída do Baú.');}
    catch(cause){setCookingFeedback(cause instanceof Error?cause.message:'Não foi possível excluir a refeição.');}
    finally{setBauDeleteBusy(false);}
  };
  const discardBauItem = async (deleteAll=false) => {
    if(bauAction?.kind!=='item'||bauDeleteBusy)return;
    const currentItem=lobbyChestItems.find(entry=>entry.itemId===bauAction.item.itemId);
    if(!currentItem){setChestTransferFeedback('Este item não está mais no Baú. Atualize a página.');setBauAction(null);return;}
    const quantity=deleteAll?currentItem.quantity:Number(bauDeleteQuantity);
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>currentItem.quantity){setChestTransferFeedback('Informe uma quantidade válida para excluir.');return;}
    if(!fibulaSupabase||!session.user.sub){setChestTransferFeedback('O serviço de armazenamento não está disponível.');return;}
    setBauDeleteBusy(true);setChestTransferFeedback('');
    try {
      const nextInventory=lobbyChestItems.flatMap(entry=>{if(entry.itemId!==currentItem.itemId)return [entry];const remaining=entry.quantity-quantity;return remaining>0?[{...entry,quantity:remaining}]:[];});
      const saved=await syncHouseInventory(fibulaSupabase,session.user.sub,nextInventory,{allowEmpty:true});
      if(!saved)throw new Error('Não foi possível confirmar a gravação do novo estoque. O Baú não foi alterado.');
      lastSyncedHouseInventoryRef.current = JSON.stringify(nextInventory);
      applyCookingInventory(nextInventory);setBauAction(null);setChestTransferFeedback('Excluído: '+quantity+' × '+itemLabel(currentItem.itemId)+'.');
    } catch(cause){setChestTransferFeedback(cause instanceof Error?cause.message:'Não foi possível excluir o item.');}
    finally{setBauDeleteBusy(false);}
  };
  const selectForgeCore = (itemId: string) => {
    setSelectedWeaponCoreId(current => current === itemId ? null : itemId);
    setSelectedWeaponMaterials([]);
    setForgeCraftResult('');
    setWeaponFeedback('');
  };
  const selectForgeMaterial = (slot: string, itemId: string, required: number, available: number) => {
    if (!selectedWeaponCore || available < 1 || weaponCraftBusy) return;
    setSelectedWeaponMaterials(current => [
      ...current.filter(item => item.slot !== slot),
      { slot, itemId, quantity: Math.min(required, available) },
    ]);
    setForgeCraftResult('');
    setWeaponFeedback('');
  };
  const clearForgeMaterial = (slot: string) => {
    setSelectedWeaponMaterials(current => current.filter(item => item.slot !== slot));
  };
  const openCraftedWeaponInArsenal = () => {
    navigateToPage('arsenal');
    setActiveGameRoute({ page: 'arsenal' });
    setArsenalOpen(true);
  };
  const craftAnvilWeapon = async () => {
    if (!cookingOnline || !fibulaSupabase) {
      setWeaponFeedback('Sem conexão: fabricar exige internet.');
      return;
    }
    if (weaponCraftLockRef.current || weaponCraftBusy) return;
    if (!selectedWeaponCoreId || !selectedWeaponCore || !selectedWeaponModel) {
      setWeaponFeedback('Selecione um núcleo revelado de arma.');
      return;
    }
    if (weaponCompatibilityError || !weaponMaterialsReady) {
      setWeaponFeedback(weaponCompatibilityError ?? 'Preencha todos os materiais da receita.');
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animationStartedAt = Date.now();
    weaponCraftLockRef.current = true;
    setWeaponCraftBusy(true);
    setForgeHammering(!reducedMotion);
    setForgeCraftResult('');
    setWeaponFeedback('');
    let serverCallMade = false;
    try {
      serverCallMade = true;
      const result = await craftWeapon(fibulaSupabase, selectedWeaponModel, selectedWeaponTier, selectedWeaponCoreId);
      applyCookingInventory(result.inventory.map(stack => ({ itemId: stack.itemId, quantity: stack.quantity })));
      if (!reducedMotion) {
        await new Promise(resolve => window.setTimeout(resolve, Math.max(0, 1500 - (Date.now() - animationStartedAt))));
      }
      setForgeHammering(false);
      setForgeCraftResult(arsenalWeaponLabels[result.weapon.model] + ' fabricada!');
      setSelectedWeaponCoreId(null);
      setSelectedWeaponMaterials([]);
      try {
        setCraftedWeapons(await listMyWeapons(fibulaSupabase));
      } catch (cause) {
        setWeaponFeedback('Não foi possível atualizar a lista de armas: '
          + (cause instanceof Error ? cause.message : 'erro ao carregar armas.'));
      }
    } catch (cause) {
      setForgeHammering(false);
      setForgeCraftResult('');
      setWeaponFeedback(cause instanceof Error ? cause.message : 'Não foi possível fabricar a arma.');
      if (serverCallMade) {
        try {
          await refreshLobbyChestFromCloud();
        } catch (refreshCause) {
          setWeaponFeedback(current => current + ' Não foi possível recarregar o Baú da nuvem: '
            + (refreshCause instanceof Error ? refreshCause.message : 'erro ao atualizar o Baú.'));
        }
      }
    } finally {
      weaponCraftLockRef.current = false;
      setWeaponCraftBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    const savedSelections = readEquippedWeaponSelections(session.user.sub);
    setCraftedWeapons([]);
    setWeaponsLoaded(false);
    setEquippedWeaponIds(savedSelections);
    engineRef.current?.setEquippedWeapon(null);
    if (!fibulaSupabase || !cookingOnline) {
      setWeaponsLoading(false);
      return () => { active = false; };
    }
    setWeaponsLoading(true);
    void listMyWeapons(fibulaSupabase).then(items => {
      if (!active) return;
      const validSelections: EquippedWeaponSelections = {};
      for (const classId of ['guerreiro', 'mago', 'arqueiro', 'druida'] as const) {
        const selected = selectedWeaponForClass(items, savedSelections, classId);
        if (selected) validSelections[classId] = selected.id;
      }
      setCraftedWeapons(items);
      setWeaponsLoaded(true);
      setEquippedWeaponIds(validSelections);
      writeEquippedWeaponSelections(session.user.sub, validSelections);
      const activeClass = engineRef.current?.state.classId ?? characterPreferences[0] ?? characterPreferences[1] ?? 'guerreiro';
      const equipped = selectedWeaponForClass(items, validSelections, activeClass);
      engineRef.current?.setEquippedWeapon(equipped ? { model: equipped.model, damage: equipped.damage, attributes: equipped.attributes } : null);
      setWeaponFeedback('');
    }).catch(cause => {
      if (active) {
        engineRef.current?.setEquippedWeapon(null);
        setWeaponFeedback(cause instanceof Error ? cause.message : 'Não foi possível carregar as armas fabricadas.');
      }
    }).finally(() => { if (active) setWeaponsLoading(false); });
    return () => { active = false; };
  }, [session.user.sub, cookingOnline, statusOpen, characterPreferences[0], characterPreferences[1]]);

  const revealCoreFromChest = async (itemId: string) => {
    if (jewelryRevealBusy) return;
    const selectedRarity = itemId.startsWith('jewelry-closed:') ? itemId.slice('jewelry-closed:'.length) : null;
    if (!selectedRarity) return;
    const sourceIndex = lobbyChestItems.findIndex(item => {
      const parsed = parseCoreItemId(item.itemId);
      return parsed?.kind === 'closed' && parsed.rarity === selectedRarity;
    });
    if (sourceIndex < 0) return;
    const source = lobbyChestItems[sourceIndex], parsed = parseCoreItemId(source.itemId);
    if (!parsed || parsed.kind !== 'closed') return;
    if (!fibulaSupabase || !session.user.sub) {
      setJewelryFeedback('Entre na sua conta e conecte-se para salvar a revelação.');
      return;
    }
    if (source.quantity > 1 && lobbyChestItems.length >= 50) {
      setJewelryFeedback('Baú cheio: libere um espaço para revelar o núcleo'); return;
    }
    const random = () => {
      const values = new Uint32Array(1); window.crypto.getRandomValues(values);
      return values[0] / 0x1_0000_0000;
    };
    const revealedItemId = coreToItemId(revealCore(random, parsed.category, parsed.rarity, window.crypto.randomUUID(), parsed.weaponModel));
    const next = lobbyChestItems.map((item, index) => index !== sourceIndex ? item
      : source.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : { itemId: revealedItemId, quantity: 1 });
    if (source.quantity > 1) next.push({ itemId: revealedItemId, quantity: 1 });
    setJewelryRevealBusy(true);
    setJewelryFeedback('Salvando a revelação…');
    try {
      const saved = await syncHouseInventory(fibulaSupabase, session.user.sub, next);
      if (!saved) throw new Error('Não foi possível confirmar o salvamento. O núcleo continua fechado no Baú.');
      const snapshot = JSON.stringify(next);
      lastSyncedHouseInventoryRef.current = snapshot;
      pendingHouseInventoryRef.current = null;
      applyCookingInventory(next);
      setSelectedJewelryCoreId(null);
      setJewelryResultCoreId(revealedItemId);
      setJewelryFeedback('Núcleo revelado e salvo no Baú.');
    } catch (cause) {
      setJewelryFeedback(cause instanceof Error ? cause.message : 'Não foi possível salvar a revelação.');
    } finally {
      setJewelryRevealBusy(false);
    }
  };
  const addCookingIngredientUnit = (itemId: string) => {
    const stack = cookingIngredientStacks.find(item => item.itemId === itemId);
    if (!stack) return;
    const existing = panCookingSelections.find(item => item.itemId === itemId);
    const nextVarieties = panCookingSelections.length + (existing ? 0 : 1);
    if ((!existing && panCookingSelections.length >= 4)
      || cookingSelectedTotal >= getCookingCapacity(nextVarieties)
      || (existing?.quantity ?? 0) >= stack.quantity) return;
    setPanCookingSelections(current => {
      const selected = current.find(item => item.itemId === itemId);
      return selected ? current.map(item => item.itemId === itemId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { itemId, quantity: 1 }];
    });
    setCookingFeedback('');
  };
  const removeCookingIngredientUnit = (itemId: string) => {
    const selected = panCookingSelections.find(item => item.itemId === itemId);
    if (!selected) return;
    const nextTotal = cookingSelectedTotal - 1;
    const nextVarieties = panCookingSelections.length - (selected.quantity === 1 ? 1 : 0);
    if (nextTotal > getCookingCapacity(nextVarieties)) return;
    setPanCookingSelections(current => current.flatMap(item => item.itemId !== itemId ? [item]
      : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []));
    setCookingFeedback('');
  };
  const applyCookingServerState = (result: CookingServerState) => {
    setPreparedCookingMeals(result.prepared);
    setReadyCookingMeals(result.ready);
    setPendingCookingMeals(result.pending);
    const receivedAt = Date.now();
    const offset = result.now_ms - receivedAt;
    setCookingClockOffset(offset);
    setCookingClock(receivedAt + offset);
  };
  const requireCookingConnection = () => {
    if (!cookingOnline || !fibulaSupabase) {
      setCookingFeedback('Sem conexão: cozinhar exige internet.');
      return false;
    }
    return true;
  };
  const refreshCookingState = async () => {
    if (!cookingOnline || !fibulaSupabase) {
      setCookingFeedback('Sem conexão: cozinhar exige internet.');
      throw new Error('Sem conexão: cozinhar exige internet.');
    }
    const result = await getCookingServerState(fibulaSupabase);
    applyCookingServerState(result);
    return result;
  };
  useEffect(() => {
    if (!showStart && activeGameRoute.page !== 'fogao' && !chestOpen) return;
    let active = true;
    void refreshCookingState().catch(cause => {
      if (active) setCookingFeedback(cause instanceof Error ? cause.message : 'Não foi possível sincronizar a cozinha.');
    });
    return () => { active = false; };
  }, [showStart, activeGameRoute.page, chestOpen, cookingOnline, session.user.sub]);

  const prepareCookingMeal = async () => {
    if (!requireCookingConnection()) return;
    if (preparedCookingMeals.length >= 3) {
      setCookingFeedback('Os três espaços de produção estão ocupados.');
      return;
    }
    if (!panCookingSelections.length) { setCookingFeedback('Escolha os ingredientes para a receita.'); return; }
    const ingredients = panCookingSelections.map(item => ({ itemId: item.itemId, quantity: item.quantity }));
    const recipeError = getPanMealError(ingredients);
    if (recipeError) {
      setCookingFeedback(recipeError);
      return;
    }
    const meal = getPanMeal(ingredients);
    if (!meal) {
      setCookingFeedback('Não foi possível preparar esta receita.');
      return;
    }
    const nextInventory = consumeCookingIngredients(lobbyChestItems, meal);
    if (!nextInventory) { setCookingFeedback('Você não tem todas essas unidades disponíveis no Baú.'); return; }
    try {
      const result = await startCookingProduction(fibulaSupabase!, meal);
      applyCookingInventory(nextInventory);
      applyCookingServerState(result);
      setPanCookingSelections([]);
      setCookingFeedback('Produção iniciada: ' + meal.name + '.');
    } catch (cause) {
      setCookingFeedback(cause instanceof Error ? cause.message : 'Não foi possível iniciar a produção.');
    }
  };
  const collectPreparedCookingMeal = async (meal: CookingMeal) => {
    if (!requireCookingConnection()) return;
    if ((meal.productionReadyAt ?? 0) > Date.now() + cookingClockOffset) return;
    try {
      applyCookingServerState(await collectCookingMeal(fibulaSupabase!, meal.id));
      setCookingFeedback(meal.name + ' foi para a aba Refeições do Baú.');
    } catch (cause) {
      setCookingFeedback(cause instanceof Error ? cause.message : 'Não foi possível coletar a refeição.');
    }
  };
  const queueReadyCookingMeal = async (meal: CookingMeal) => {
    if (!requireCookingConnection()) return;
    try {
      applyCookingServerState(await queueCookingMeal(fibulaSupabase!, meal.id));
    } catch (cause) {
      setCookingFeedback(cause instanceof Error ? cause.message : 'Não foi possível reservar a refeição.');
    }
  };
  const returnPendingCookingMeal = async (meal: CookingMeal) => {
    if (!requireCookingConnection()) return;
    try {
      applyCookingServerState(await returnCookingMeal(fibulaSupabase!, meal.id));
    } catch (cause) {
      setCookingFeedback(cause instanceof Error ? cause.message : 'Não foi possível devolver a refeição.');
    }
  };
  const consumeReadyCookingMeal = async (meal: CookingMeal) => {
    if (!requireCookingConnection()) return;
    const engine = engineRef.current;
    if (!houseAccessible || !engine) return;
    if (engine.state.activeMeals.some(active => active.slot === meal.slot)) {
      window.alert('Você já tem uma refeição deste tipo ativa.');
      return;
    }
    try {
      const result = await consumeReadyCookingMealOnServer(fibulaSupabase!, meal.id);
      if (!engine.activateCookingMeal(result.meal)) {
        window.alert('Não foi possível ativar a refeição. O espaço pode já estar ocupado.');
      }
      applyCookingServerState(result);
    } catch (cause) {
      setCookingFeedback(cause instanceof Error ? cause.message : 'Não foi possível consumir a refeição.');
    }
  };
  const activatePendingCookingMeals = async (engine: GameEngine) => {
    if (!cookingOnline || !fibulaSupabase) {
      window.alert('Sem conexão: cozinhar exige internet. A partida continuará sem refeições.');
      return;
    }
    try {
      const result = await takePendingCookingMeals(fibulaSupabase);
      const receivedAt = Date.now();
      const offset = result.now_ms - receivedAt;
      setCookingClockOffset(offset);
      setCookingClock(receivedAt + offset);
      engine.activateStartingMeals(result.meals);
      setPendingCookingMeals([]);
    } catch (cause) {
      window.alert((cause instanceof Error ? cause.message : 'Não foi possível carregar as refeições pendentes.')
        + ' A partida continuará sem refeições; elas permanecem no servidor.');
    }
  };

  const prepareEquippedWeaponForClass = async (engine: GameEngine, classId: ClassId) => {
    engine.setEquippedWeapon(null);
    if (!fibulaSupabase || !cookingOnline) return;
    try {
      const items = await listMyWeapons(fibulaSupabase);
      const saved = readEquippedWeaponSelections(session.user.sub);
      const valid: EquippedWeaponSelections = {};
      for (const candidateClass of ['guerreiro', 'mago', 'arqueiro', 'druida'] as const) {
        const selected = selectedWeaponForClass(items, saved, candidateClass);
        if (selected) valid[candidateClass] = selected.id;
      }
      setCraftedWeapons(items);
      setEquippedWeaponIds(valid);
      writeEquippedWeaponSelections(session.user.sub, valid);
      const selected = selectedWeaponForClass(items, valid, classId);
      engine.setEquippedWeapon(selected ? { model: selected.model, damage: selected.damage, attributes: selected.attributes } : null);
    } catch {
      // Sem uma lista validada nesta sessão, a partida segue sem arma fabricada equipada.
      engine.setEquippedWeapon(null);
    }
  };

  const handleLobbyPlay = () => {
    if (updateAvailable) return;
    if (duoPeer) {
      if (duoPeer.role === 'host' && duoPeer.status === 'connected' && duoPeer.peerReady) {
        duoStartActionRef.current?.();
      }
      return;
    }
    void startGame();
  };

  const startGame = async () => {
    const engine = engineRef.current;
    if (!engine || gameStartedRef.current || gameStartPendingRef.current) return;
    gameStartPendingRef.current = true;
    try {
      if (!fibulaSupabase || !session.user.sub) {
        throw new Error('Entre na sua conta e conecte-se à internet para iniciar uma partida com progresso validado.');
      }
      if (houseDeathFinalizeRef.current) await houseDeathFinalizeRef.current;
      const sessionId = await startSoloMatchSession(fibulaSupabase);
      const accountProfile = await loadAccountProgress();
      const currentAccountLevel = Math.max(0, Number(accountProfile.level) || 0);
      setAccountLevel(currentAccountLevel);
      setJabuticabaProgress(Math.max(0, Number(accountProfile.jabuticaba_progress) || 0));
      engine.setAccountLevel(currentAccountLevel);
      engine.configureSoloMatch();
      matchSessionIdRef.current = sessionId;
      matchSummaryHandledRef.current = false;
      houseMatchClosedRef.current = false;
      const selectedClass = characterPreferences[0] ?? characterPreferences[1] ?? 'guerreiro';
      engine.setClass(selectedClass);
      await prepareEquippedWeaponForClass(engine, selectedClass);
      engine.start();
      await activatePendingCookingMeals(engine);
      gameStartedRef.current = true;
      setShowStart(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível registrar o início da partida. Tente novamente.');
    } finally {
      gameStartPendingRef.current = false;
    }
  };
  useEffect(() => {
    const peer = duoPeer;
    if (!peer?.matchId || !fibulaSupabase || !session.user.sub
      || gameStartedRef.current || duoMatchStartingRef.current
      || duoStartedMatchIdRef.current === peer.matchId) return;
    let cancelled = false;
    let transport: DuoCycleTransport | null = null;
    duoMatchStartingRef.current = true;
    void (async () => {
      try {
        const engine = engineRef.current;
        if (!engine) throw new Error('O motor local ainda não está pronto.');
        if (houseDeathFinalizeRef.current) await houseDeathFinalizeRef.current;
        const { data, error } = await fibulaSupabase.rpc('fibula_start_duo_session', { p_room_id: peer.roomId });
        if (error) throw error;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('O servidor retornou dados inválidos para iniciar o Duo.');
        const payload = data as Record<string, unknown>;
        const matchId = payload.match_id;
        const playerSeed = payload.player_seed;
        const playerRole = payload.player_role;
        const nightNumber = payload.night_number;
        const initialTarget = payload.horde_target;
        if (matchId !== peer.matchId || !Number.isSafeInteger(playerSeed) || (playerSeed as number) < 1
          || (playerRole !== 'host' && playerRole !== 'guest')
          || !Number.isSafeInteger(nightNumber) || (nightNumber as number) < 1
          || !Number.isSafeInteger(initialTarget) || (initialTarget as number) < 0) {
          throw new Error('O servidor retornou uma configuração inválida para sua partida Duo.');
        }
        const role = playerRole as 'host' | 'guest';
        const firstNight = nightNumber as number;
        const firstTarget = initialTarget as number;
        if (firstTarget === 0) {
          duoStartedMatchIdRef.current = peer.matchId;
          setDuoNotice('Esta partida Duo já foi encerrada para você. Você voltou ao lobby e não pode retomar a mesma partida.');
          return;
        }
        const expectedFirstTarget = role === 'host'
          ? Math.ceil(duoHordeTotalForNight(firstNight) / 2)
          : Math.floor(duoHordeTotalForNight(firstNight) / 2);
        if (firstTarget !== expectedFirstTarget) throw new Error('O alvo inicial da horda recebido do servidor não corresponde às regras desta versão.');
        if (cancelled) return;

        let playerTimedOut = false;
        duoSoloFromNightRef.current = Number.MAX_SAFE_INTEGER;
        transport = new DuoCycleTransport(fibulaSupabase, matchId as string, session.user.sub, peer.friendId, serverState => {
          if (serverState.player_status === 'disconnected') {
            playerTimedOut = true;
            setDuoNotice('Sua conexão ficou ausente por mais de 15 segundos. Esta partida foi encerrada para você; voltou ao lobby.');
            setShowStart(true);
            gameStartedRef.current = false;
            engine.configureSoloMatch();
            duoStartedMatchIdRef.current = peer.matchId;
            if (duoTransportRef.current === transport) duoTransportRef.current = null;
            void transport?.disconnect();
            return;
          }
          if (serverState.status === 'playing' && serverState.player_status === 'alive' && serverState.horde_target > 0) {
            const splitTarget = role === 'host'
              ? Math.ceil(duoHordeTotalForNight(serverState.current_night) / 2)
              : Math.floor(duoHordeTotalForNight(serverState.current_night) / 2);
            if (serverState.horde_target > splitTarget) {
              const localNight = engine.state.nightNumber;
              duoSoloFromNightRef.current = localNight < serverState.current_night
                ? serverState.current_night
                : serverState.current_night + 1;
            }
          }
          if (serverState.current_night > engine.state.nightNumber && engine.isWaitingForCooperativeNight) {
            engine.releaseCooperativeNight();
          }
          if (serverState.status === 'finished') setDuoNotice('A partida Duo foi encerrada.');
        }, cause => setDuoNotice(cause instanceof Error ? cause.message : 'Falha na comunicação da partida Duo.'));
        await transport.connect();
        if (playerTimedOut) {
          await transport.disconnect();
          return;
        }
        if (cancelled) {
          await transport.disconnect();
          return;
        }

        const duoAccountProfile = await loadAccountProgress();
        const duoAccountLevel = Math.max(0, Number(duoAccountProfile.level) || 0);
        setAccountLevel(duoAccountLevel);
        setJabuticabaProgress(Math.max(0, Number(duoAccountProfile.jabuticaba_progress) || 0));
        engine.setAccountLevel(duoAccountLevel);
        const duoSelectedClass = characterPreferences[0] ?? characterPreferences[1] ?? 'guerreiro';
        engine.setClass(duoSelectedClass);
        await prepareEquippedWeaponForClass(engine, duoSelectedClass);
        engine.configureCooperativeMatch(playerSeed as number, {
          waitForNightRelease: true,
          hordeTargetForNight: night => night >= duoSoloFromNightRef.current
            ? duoHordeTotalForNight(night)
            : role === 'host'
              ? Math.ceil(duoHordeTotalForNight(night) / 2)
              : Math.floor(duoHordeTotalForNight(night) / 2),
          onNightComplete: night => {
            void transport?.reportNightComplete(night).catch(cause => {
              setDuoNotice(cause instanceof Error ? cause.message : 'Não foi possível registrar a conclusão da noite Duo.');
            });
          },
        });
        duoTransportRef.current?.disconnect();
        duoTransportRef.current = transport;
        duoStartedMatchIdRef.current = peer.matchId;
        matchSessionIdRef.current = null;
        matchSummaryHandledRef.current = false;
        houseMatchClosedRef.current = false;
        engine.restart();
        await activatePendingCookingMeals(engine);
        gameStartedRef.current = true;
        setShowStart(false);
        setDuoNotice('Duo conectado. O avanço das noites agora depende da confirmação do servidor.');
      } catch (cause) {
        if (transport) await transport.disconnect();
        if (!cancelled) setDuoNotice(cause instanceof Error ? cause.message : 'Não foi possível iniciar seu mundo Duo.');
      } finally {
        duoMatchStartingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      if (transport && duoTransportRef.current !== transport) void transport.disconnect();
    };
  }, [duoPeer?.matchId, duoPeer?.roomId, duoPeer?.friendId, session.user.sub, characterPreferences]);

  const applyClassAndEquippedWeapon = (id: ClassId) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setClass(id);
    const weapon = selectedWeaponForClass(craftedWeapons, equippedWeaponIds, id);
    engine.setEquippedWeapon(weapon ? { model: weapon.model, damage: weapon.damage, attributes: weapon.attributes } : null);
  };
  applyClassAndEquippedWeaponRef.current = applyClassAndEquippedWeapon;
  const equipCraftedWeapon = (weapon: CraftedWeapon) => {
    const classId = WEAPON_CLASS_BY_MODEL[weapon.model];
    const next = { ...equippedWeaponIds, [classId]: weapon.id };
    setEquippedWeaponIds(next);
    writeEquippedWeaponSelections(session.user.sub, next);
    if (engineRef.current?.state.classId === classId) {
      engineRef.current.setEquippedWeapon({ model: weapon.model, damage: weapon.damage, attributes: weapon.attributes });
    }
    setWeaponFeedback(arsenalWeaponLabels[weapon.model] + ' equipada.');
  };
  const unequipCraftedWeapon = (weapon: CraftedWeapon) => {
    const classId = WEAPON_CLASS_BY_MODEL[weapon.model];
    const next = { ...equippedWeaponIds };
    delete next[classId];
    setEquippedWeaponIds(next);
    writeEquippedWeaponSelections(session.user.sub, next);
    if (engineRef.current?.state.classId === classId) engineRef.current.setEquippedWeapon(null);
    setWeaponFeedback(arsenalWeaponLabels[weapon.model] + ' desequipada.');
  };
  const openArsenalWeaponActions = (weapon: CraftedWeapon, equipped: boolean) => {
    setSelectedArsenalItemId(weapon.id);
    setArsenalActionItem({ kind: 'weapon', weapon, equipped });
  };
  const openArsenalEquipmentActions = (item: ArsenalEquipment, equipped: boolean) => {
    setSelectedArsenalItemId(item.id);
    setArsenalActionItem({ kind: 'equipment', item, equipped });
  };
  const showArsenalItemDetails = () => {
    const action = arsenalActionItem;
    if (!action) return;
    if (action.kind === 'weapon') {
      const comparison = action.equipped
        ? null
        : selectedWeaponForClass(craftedWeapons, equippedWeaponIds, WEAPON_CLASS_BY_MODEL[action.weapon.model]);
      setWeaponInfoComparison(comparison);
      setWeaponInfoModal({ kind: 'weapon', weapon: action.weapon });
    } else {
      setWeaponInfoComparison(null);
      setWeaponInfoModal({ kind: 'equipment', item: action.item });
    }
    setArsenalActionItem(null);
  };
  const equipSelectedArsenalItem = () => {
    const action = arsenalActionItem;
    if (!action || !activeArsenalClassId) return;
    if (action.kind === 'weapon') {
      if (activeArsenalClassId !== WEAPON_CLASS_BY_MODEL[action.weapon.model]) return;
      equipCraftedWeapon(action.weapon);
    } else {
      setEquipmentLoadouts(current => ({
        ...current,
        [activeArsenalClassId]: equipArsenalItem(current[activeArsenalClassId] ?? {}, action.item),
      }));
      setWeaponFeedback(cleanItemName(action.item.name) + ' equipada.');
    }
    setArsenalActionItem(null);
  };
  const unequipSelectedArsenalItem = () => {
    const action = arsenalActionItem;
    if (!action || !activeArsenalClassId) return;
    if (action.kind === 'weapon') {
      unequipCraftedWeapon(action.weapon);
    } else {
      setEquipmentLoadouts(current => ({
        ...current,
        [activeArsenalClassId]: unequipArsenalSlot(current[activeArsenalClassId] ?? {}, action.item.slot),
      }));
      setWeaponFeedback(cleanItemName(action.item.name) + ' desequipado.');
    }
    setSelectedArsenalItemId(null);
    setArsenalActionItem(null);
  };
  const requestArsenalItemDeletion = () => {
    const action = arsenalActionItem;
    if (!action) return;
    setArsenalDeleteConfirmation(action.kind === 'weapon'
      ? { kind: 'weapon', weapon: action.weapon }
      : { kind: 'equipment', item: action.item });
    setArsenalActionItem(null);
  };
  const confirmArsenalItemDeletion = async () => {
    const pending = arsenalDeleteConfirmation;
    if (!pending || arsenalDeleteBusy) return;
    setArsenalDeleteBusy(true);
    if (pending.kind === 'weapon') {
      const supabase = fibulaSupabase;
      if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setArsenalDeleteConfirmation(null);
        setWeaponFeedback('Não foi possível excluir agora. Tente de novo.');
        setArsenalDeleteBusy(false);
        return;
      }
      try {
        await deleteWeapon(supabase, pending.weapon.id);
        const weaponId = pending.weapon.id;
        const weaponClass = WEAPON_CLASS_BY_MODEL[pending.weapon.model];
        if (equippedWeaponIds[weaponClass] === weaponId) {
          const next = { ...equippedWeaponIds };
          delete next[weaponClass];
          setEquippedWeaponIds(next);
          writeEquippedWeaponSelections(session.user.sub, next);
          if (engineRef.current?.state.classId === weaponClass) engineRef.current.setEquippedWeapon(null);
        }
        setCraftedWeapons(current => current.filter(weapon => weapon.id !== weaponId));
        setSelectedArsenalItemId(null);
        setWeaponFeedback('Arma excluída.');
        setArsenalDeleteConfirmation(null);
      } catch {
        setArsenalDeleteConfirmation(null);
        setWeaponFeedback('Não foi possível excluir agora. Tente de novo.');
      } finally {
        setArsenalDeleteBusy(false);
      }
      return;
    }
    const item = pending.item;
    setArsenalItems(current => current.filter(existing => existing.id !== item.id));
    setEquipmentLoadouts(current => {
      const next: ClassEquipmentLoadouts = {};
      for (const [rawClassId, loadout] of Object.entries(current)) {
        if (!isProfileClassId(rawClassId)) continue;
        const filtered = Object.fromEntries(Object.entries(loadout ?? {}).filter(([, itemId]) => itemId !== item.id)) as EquipmentLoadout;
        next[rawClassId] = filtered;
      }
      return next;
    });
    setSelectedArsenalItemId(null);
    setWeaponFeedback(cleanItemName(item.name) + ' excluído.');
    setArsenalDeleteConfirmation(null);
    setArsenalDeleteBusy(false);
  };
  const pickClass = (id: ClassId) => applyClassAndEquippedWeapon(id);
  const toggleRange = () => engineRef.current?.toggleRange();
  const toggleCart = () => engineRef.current?.toggleCart();
  const discardBagItem = (index: number) => engineRef.current?.discardBagItem(index);
  const transferCartToBag = (index: number) => engineRef.current?.transferCartToBag(index);
  const storeAllBagToHouse = () => engineRef.current?.storeAllBagToHouse();
  const storeAllBagToCart = () => engineRef.current?.storeAllBagToCart();
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
  const closeCampMenu = () => setCampMenuOpen(false);
  const openCampMenu = () => {
    closeFlagMenu();
    closeInventoryPanel();
    setCampMenuOpen(true);
  };
  const buildCampChest = () => {
    const result = engineRef.current?.buildChest();
    if (result?.ok) closeCampMenu();
  };
  const buildCampRefinery = () => {
    const result = engineRef.current?.buildRefineryAtCamp();
    if (result?.ok) closeCampMenu();
  };
  const buildCampTecelaria = () => {
    const result = engineRef.current?.buildTecelariaAtCamp();
    if (result?.ok) closeCampMenu();
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
    closeCampMenu();
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
    if (!engine.state.dead && matchSessionIdRef.current) void submitSoloMatchResult(engine.state);
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
      if (houseDeathFinalizeRef.current) await houseDeathFinalizeRef.current;
      if (!engine.state.dead && matchSessionIdRef.current) await submitSoloMatchResult(engine.state);
      const sessionId = await startSoloMatchSession(fibulaSupabase);
      engine.configureSoloMatch();
      matchSessionIdRef.current = sessionId;
      matchSummaryHandledRef.current = false;
      houseMatchClosedRef.current = false;
      flagsRef.current = [];
      setFlags([]);
      setWheel(null);
      closeFlagMenu();
      closeInventoryPanel();
      engine.restart();
      await activatePendingCookingMeals(engine);
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
      const angle = Math.atan2(dy, dx);
      const sector = Math.PI / 8;
      if (Math.abs(angle + Math.PI / 4) <= sector) selected = 'camp';
      else if (Math.abs(angle) <= sector) selected = 'green';
      else if (Math.abs(Math.abs(angle) - Math.PI) <= sector) selected = 'blue';
      else if (Math.abs(angle - Math.PI / 2) <= sector) selected = 'red';
      else if (Math.abs(angle + Math.PI / 2) <= sector) selected = 'yellow';
    }
    if (wheel.selected !== selected) setWheel({ ...wheel, selected });
  };
  const onWheelMove = (clientX: number, clientY: number, pointerId: number) => updateWheelSelection(clientX, clientY, pointerId);
  const onWheelEnd = (clientX: number, clientY: number, pointerId: number) => {
    if (flagWheelRef.current?.pointerId !== pointerId) return;
    updateWheelSelection(clientX, clientY, pointerId);
    const wheel = flagWheelRef.current;
    const color = wheel?.selected && wheel.selected !== 'camp' ? CONFIG.flags.colors.find(item => item.id === wheel.selected) : null;
    if (wheel?.selected === 'camp') engineRef.current?.placeCampfire();
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

  const stationPresentation = activeCraftingStation as { icon: string; description: string; products: string };

  return <>{activeCraftingStation ? <PageFrame eyebrow="ESTAÇÃO DE CRIAÇÃO" title={activeCraftingStation.title} onBack={closeGamePage} hideHeader={activeCraftingStation.id === 'fogao' || activeCraftingStation.id === 'bigorna' || activeCraftingStation.id === 'joalheria' || activeCraftingStation.id === 'costura'} stateClassName={activeCraftingStation.id === 'bigorna' ? 'forge-page' : activeCraftingStation.id === 'joalheria' ? 'jewelry-page' : activeCraftingStation.id === 'costura' ? 'tailor-page' : activeCraftingStation.id === 'fogao' ? (preparedCookingMeals.filter(meal => (meal.productionReadyAt ?? 0) > cookingClock).length > 0 ? 'is-burning is-burning-' + Math.min(3, preparedCookingMeals.filter(meal => (meal.productionReadyAt ?? 0) > cookingClock).length) : 'is-idle') : undefined}>
      <div className="station-page-content">
        <div className="lobby-crafting-content">

              {activeCraftingStation.id !== 'fogao' && activeCraftingStation.id !== 'bigorna' && activeCraftingStation.id !== 'joalheria' && activeCraftingStation.id !== 'costura' && <div className="lobby-crafting-emblem" aria-hidden="true">{stationPresentation.icon}</div>}
              {activeCraftingStation.id !== 'fogao' && activeCraftingStation.id !== 'bigorna' && activeCraftingStation.id !== 'joalheria' && activeCraftingStation.id !== 'costura' && <p>{stationPresentation.description}</p>}
              {activeCraftingStation.id === 'costura' ? <div className="tailor-workspace">
                <TailorScene>
                  <div className="tailor-preview-slots" aria-label="Prévia dos espaços de armadura">
                    {['Peça', 'Forro', 'Costura'].map(label => <div className="tailor-preview-slot" key={label} aria-disabled="true"><strong>{label}</strong><small>Em breve</small></div>)}
                  </div>
                </TailorScene>
                <section className="forge-zone tailor-fabrics-zone" aria-label="Tecidos no Baú">
                  <div className="forge-panel-heading"><strong>TECIDOS</strong><span>Materiais disponíveis no Baú</span></div>
                  <div className="forge-material-grid tailor-fabric-grid" aria-label="Tecidos disponíveis no Baú">
                    {tailorFabricStacks.map(item => <div className="forge-material-item tailor-fabric-item" key={item.itemId}>
                      <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><strong>{itemLabel(item.itemId)}</strong><small>×{item.quantity}</small>
                    </div>)}
                    {tailorFabricStacks.length === 0 && <p className="forge-empty tailor-empty">Nenhum tecido no Baú.</p>}
                  </div>
                  <p className="tailor-fabric-note">Aqui serão feitas as armaduras: couro (tipo 1) e bronze (tipo 2), com forro e costura.</p>
                </section>
                <div className="tailor-action-area"><button type="button" className="tailor-sew-button" disabled>Costurar · Em breve</button></div>
              </div> : activeCraftingStation.id === 'joalheria' ? <div className="jewelry-workspace">
                <div className="jewelry-stage">
                  <JewelryScene revealAnimating={jewelryRevealAnimating} />
                  <div className="jewelry-ui-layer">
                    <div className="jewelry-scene-header"><h2>JOALHERIA</h2></div>
                    <div className="jewelry-scene-slots">
                      <div className="jewelry-scene-content">
                    <button type="button" className={jewelrySlotCoreId ? 'jewelry-core-slot filled' : 'jewelry-core-slot'}
                      onClick={() => { setSelectedJewelryCoreId(null); setJewelryResultCoreId(null); setJewelryFeedback(''); }}
                      aria-label={selectedJewelryCoreId ? 'Devolver núcleo fechado à lista' : jewelrySlotCore?.kind === 'revealed' ? 'Devolver núcleo revelado ao Baú' : 'Slot vazio: Núcleo 0 de 1'}>
                      {selectedJewelryCoreId ? <>
                        <span style={itemRarityGlow(`core:${selectedJewelryCoreId.slice('jewelry-closed:'.length)}:weapon`)}>
                          <img className="jewelry-closed-core-image" src="/assets/cores/nucleo-fechado.png" alt="" aria-hidden="true" draggable={false} style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", background: "none" }} />
                        </span>
                        <strong>Núcleo fechado</strong>
                      </> : jewelrySlotCore?.kind === 'revealed' ? <>
                        <span style={itemRarityGlow(jewelrySlotCoreId!)}>
                          <img src={`/assets/cores/${CORE_SPRITE_FILES[jewelrySlotCore.core.category]}`} alt="" aria-hidden="true" draggable={false} style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", imageRendering: "pixelated" }} />
                        </span>
                        <strong>{itemLabel(jewelrySlotCoreId!)}</strong>
                      </> : <strong>＋ Núcleo 0/1</strong>}
                    </button>
                    {jewelrySlotCore?.kind === 'revealed' && <section className="jewelry-result-card" aria-label="Atributos do núcleo revelado">
                      <ul>{jewelrySlotCore.core.attributes.map(attribute => <li key={attribute.key}>
                        <span>{weaponAttributeLabels[attribute.key]}</span>
                        <b>+{(attribute.value * WEAPON_CORE_POINTS_PER_VALUE).toFixed(1).replace('.', ',')}</b>
                      </li>)}</ul>
                    </section>}
                  </div>
                    </div>
                  </div>
                </div>
                <section className="forge-zone forge-nuclei-zone jewelry-nuclei-zone" aria-label="Núcleos fechados">
                  <div className="forge-panel-heading">
                    <strong>NÚCLEOS FECHADOS</strong>
                    <span>Selecione 1 núcleo para revelar</span>
                  </div>
                  <div className="forge-core-strip">
                    {jewelryClosedCoreStacks.map(item => <button type="button" key={item.itemId}
                      className={selectedJewelryCoreId === item.itemId ? 'forge-core-item selected' : 'forge-core-item'}
                      aria-pressed={selectedJewelryCoreId === item.itemId}
                      onClick={() => { setSelectedJewelryCoreId(current => current === item.itemId ? null : item.itemId); setJewelryResultCoreId(null); setJewelryFeedback(''); }}>
                      <span style={itemRarityGlow(`core:${item.itemId.slice('jewelry-closed:'.length)}:weapon`)}>
                        <img className="jewelry-closed-core-image" src="/assets/cores/nucleo-fechado.png" alt="" aria-hidden="true" style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", background: "none", clipPath: "none", filter: "none" }} />
                      </span>
                      <strong>Núcleo fechado</strong>
                      <small>×{item.quantity}</small>
                    </button>)}
                    {jewelryClosedCoreStacks.length === 0 && <p className="forge-empty">Você não tem núcleos para revelar.</p>}
                  </div>
                </section>
                <div className="jewelry-action-area">
                  <button type="button" className="jewelry-reveal-button"
                    disabled={jewelryRevealBusy || !selectedJewelryCoreId || !jewelryClosedCoreStacks.some(item => item.itemId === selectedJewelryCoreId)}
                    onClick={() => selectedJewelryCoreId && void revealCoreFromChest(selectedJewelryCoreId)}>{jewelryRevealBusy ? 'Salvando…' : 'Revelar'}</button>
                  {jewelryFeedback && <p className="jewelry-feedback" role="status">{jewelryFeedback}</p>}
                </div>
              </div> : activeCraftingStation.id === 'bigorna' ? <>
                <div className="forge-workspace">
                  <ForgeScene intensity={forgeIntensity} hammering={forgeHammering}>
                    <div className="forge-recipe-slots" aria-label="Slots da receita">
                      {selectedWeaponCore && weaponRecipeRows.map(row => {
                        const partLabel = row.slot === 'mineral'
                          ? selectedWeaponModel === 'espada' ? 'Lâmina' : 'Ponta'
                          : row.slot === 'linen' ? 'Corda'
                            : row.slot === 'wood' ? selectedWeaponModel === 'arco' ? 'Haste' : 'Cabo' : row.slot;
                        const materialLabel = row.slot === 'mineral' ? 'Minério' : row.slot === 'wood' ? 'Madeira' : 'Linho';
                        const order = row.slot === 'linen' ? -2 : row.slot === 'wood' ? -1 : 1;
                        return <button type="button" key={row.slot}
                          className={row.selection ? 'forge-recipe-slot forge-material-recipe-slot filled' : 'forge-recipe-slot forge-material-recipe-slot'}
                          style={{ order }}
                          onClick={() => clearForgeMaterial(row.slot)}
                          aria-label={row.selection ? 'Devolver ' + itemLabel(row.selection.itemId) + ' à grade' : 'Slot ' + partLabel}>
                          <span style={row.selection ? itemRarityGlow(row.selection.itemId) : undefined}>{row.selection ? inventoryItemIcon(row.selection.itemId) : '＋'}</span>
                          <strong>{partLabel} · {materialLabel} ×{row.material.quantity}</strong>
                          <small>{row.selection?.quantity ?? 0}/{row.material.quantity}</small>
                        </button>;
                      })}
                      <button type="button" className={selectedWeaponCore ? 'forge-recipe-slot forge-core-recipe-slot filled' : 'forge-recipe-slot forge-core-recipe-slot'}
                        style={{ order: 0 }}
                        onClick={() => { if (weaponCraftBusy) return; setSelectedWeaponCoreId(null); setSelectedWeaponMaterials([]); setForgeCraftResult(''); setWeaponFeedback(''); }}
                        aria-label={selectedWeaponCore ? 'Devolver núcleo à grade' : 'Slot vazio do núcleo'}>
                        <span style={selectedWeaponCoreId ? itemRarityGlow(selectedWeaponCoreId) : undefined}>{selectedWeaponCoreId ? inventoryItemIcon(selectedWeaponCoreId) : '＋'}</span>
                        <strong>{selectedWeaponCoreId ? itemLabel(selectedWeaponCoreId) : 'Núcleo'}</strong>
                        {!selectedWeaponCore && <small>0/1</small>}
                      </button>
                    </div>
                  </ForgeScene>
                  <section className="forge-zone forge-nuclei-zone" aria-label="Núcleos">
                    <div className="forge-panel-heading">
                      <strong>NÚCLEOS</strong>
                      <span>Núcleos revelados de arma</span>
                    </div>
                    <div className="forge-core-strip">
                      {anvilWeaponCoreStacks.map(item => {
                        const parsed = parseCoreItemId(item.itemId);
                        if (parsed?.kind !== 'revealed' || parsed.core.category !== 'weapon') return null;
                        return <button type="button" key={item.itemId}
                          className={selectedWeaponCoreId === item.itemId ? 'forge-core-item selected' : 'forge-core-item'}
                          disabled={weaponCraftBusy}
                          onClick={() => selectForgeCore(item.itemId)}>
                          <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span>
                          <strong>{itemLabel(item.itemId)}</strong>
                          <small>×{item.quantity}</small>
                        </button>;
                      })}
                      {anvilWeaponCoreStacks.length === 0 && <p className="forge-empty">Nenhum núcleo revelado de arma no Baú.</p>}
                    </div>
                    <div className="forge-action-area">
                      {forgeCraftResult ? <div className="forge-result" role="status">
                        <strong>{forgeCraftResult}</strong>
                        <button type="button" onClick={openCraftedWeaponInArsenal}>Ver no Arsenal</button>
                        {weaponFeedback && <small>{weaponFeedback}</small>}
                      </div> : <button type="button" className="forge-craft-button" onClick={() => void craftAnvilWeapon()}
                        disabled={!selectedWeaponCore || !weaponMaterialsReady || !!weaponCompatibilityError || !cookingOnline || weaponCraftBusy}>
                        {weaponCraftBusy ? 'Fabricando…' : 'Fabricar'}
                      </button>}
                      {weaponFeedback && !forgeCraftResult && <p className="forge-feedback" role="alert">{weaponFeedback}</p>}
                      {!cookingOnline && <small className="forge-offline">Sem conexão: fabricar exige internet.</small>}
                    </div>
                  </section>
                  <section className="forge-zone forge-materials-zone" aria-label="Materiais">
                    <div className="forge-panel-heading">
                      <strong>MATERIAIS</strong>
                      <span>Materiais de fabricação no Baú</span>
                    </div>
                    <div className="forge-material-grid" aria-label="Todos os materiais de fabricação no Baú">
                      {anvilMaterialStacks.map(item => {
                        const base = getBaseItemId(item.itemId);
                        const rarity = getItemRarity(item.itemId) ?? 'normal';
                        const slot = base === 'stone' || base === 'bronze' ? 'mineral' : base;
                        const recipeRow = weaponRecipeRows.find(row => row.slot === slot);
                        const canSelect = !!selectedWeaponCore && !!recipeRow && rarity === selectedWeaponCore.rarity;
                        const selected = selectedWeaponMaterials.find(selection => selection.slot === slot && selection.itemId === item.itemId);
                        return <button type="button" key={item.itemId}
                          className={'forge-material-item' + (selected ? ' selected' : '')}
                          disabled={weaponCraftBusy || !canSelect}
                          onClick={() => recipeRow && selectForgeMaterial(slot, item.itemId, recipeRow.material.quantity, item.quantity)}>
                          <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span>
                          <strong>{itemLabel(item.itemId)}</strong>
                          <small>×{item.quantity}{selected ? ' · ' + selected.quantity + '/' + recipeRow?.material.quantity : ''}</small>
                        </button>;
                      })}
                      {anvilMaterialStacks.length === 0 && <p className="forge-empty">Nenhum material de fabricação no Baú.</p>}
                    </div>
                  </section>
                </div>
              </> : activeCraftingStation.id === 'fogao' ? <>
                <div className="cooking-station-form cooking-kitchen">
                  <div className={`cooking-production-panel cooking-oven-panel ${preparedCookingMeals.filter(meal => (meal.productionReadyAt ?? 0) > cookingClock).length > 0 ? 'is-burning is-burning-' + Math.min(3, preparedCookingMeals.filter(meal => (meal.productionReadyAt ?? 0) > cookingClock).length) : ''}`}>
                    <div className="cooking-pot-heading">
                      <div className="cooking-oven-heading-title">
                        <strong>FORNO DE PEDRA</strong>
                        
                      </div>
                      <span>{preparedCookingMeals.length}/3</span>
                    </div>
                    <div className="cooking-oven-mouth">
                      <div className="cooking-oven-fire" aria-hidden="true"><i /><i /><i /></div>
                      <div className="cooking-production-slots">
                      {Array.from({ length: 3 }, (_, index) => {
                        const meal = preparedCookingMeals[index];
                        const remaining = meal ? Math.max(0, Math.ceil(((meal.productionReadyAt ?? 0) - cookingClock) / 1000)) : 0;
                        return <div className={meal ? remaining > 0 ? 'cooking-production-slot cooking-in-progress' : 'cooking-production-slot cooking-ready' : 'cooking-production-slot'} key={meal?.id ?? 'production-' + index}>
                          <strong>Produção {index + 1}</strong>
                          {meal ? <>
                            <span className="cooking-production-icon" style={rarityGlowStyle(meal.rarity)}>{cookingMealArtwork(meal)}</span>
                            <b>{meal.name}</b>
                            {remaining > 0 ? <small>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</small>
                              : <button type="button" disabled={!cookingOnline} onClick={() => void collectPreparedCookingMeal(meal)}>Pronta · Guardar no Baú</button>}
                          </> : <small>Livre</small>}
                        </div>;
                      })}
                      </div>
                    </div>
                  </div>
                  <div className="cooking-pot-panel cooking-ingredient-workbench">
                    <div className="cooking-pot-heading"><strong>Ingredientes · 4 espaços</strong></div>
                    <div className="cooking-pot-slots" aria-label="Quatro espaços de ingredientes">
                      {Array.from({ length: 4 }, (_, index) => {
                        const item = panCookingSelections[index];
                        if (!item) return <div className="cooking-pot-slot" key={'empty-' + index}>
                          <span>＋</span><small>Espaço {index + 1}</small>
                        </div>;
                        const nextTotal = cookingSelectedTotal - 1;
                        const nextVarieties = panCookingSelections.length - (item.quantity === 1 ? 1 : 0);
                        const cannotRemove = nextTotal > getCookingCapacity(nextVarieties);
                        return <button type="button" className="cooking-pot-slot filled" key={item.itemId}
                          aria-label={'Retirar uma unidade de ' + itemLabel(item.itemId)}
                          onClick={() => removeCookingIngredientUnit(item.itemId)} disabled={cannotRemove}>
                          <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><strong>{itemLabel(item.itemId)}</strong><b>×{item.quantity}</b>
                        </button>;
                      })}
                    </div>
                    <button type="button" className="cooking-prepare-button" onClick={() => void prepareCookingMeal()}
                      disabled={!cookingOnline || preparedCookingMeals.length >= 3 || !panCookingSelections.length || cookingSelectedTotal < 10 || cookingSelectedTotal > cookingCapacity}>Iniciar produção · 30 min</button>
                    <div className="lobby-chest-grid cooking-ingredient-grid" aria-label="Ingredientes disponíveis no Baú">
                      {cookingIngredientStacks.map(item => {
                        const selected = panCookingSelections.find(selection => selection.itemId === item.itemId)?.quantity ?? 0;
                        const nextCapacity = getCookingCapacity(panCookingSelections.length + (selected === 0 ? 1 : 0));
                        return <button type="button" className={selected > 0 ? 'quick-slot filled lobby-chest-slot cooking-ingredient selected' : 'quick-slot filled lobby-chest-slot cooking-ingredient'} key={item.itemId}
                          onClick={() => addCookingIngredientUnit(item.itemId)}
                          disabled={selected >= item.quantity || (selected === 0 && panCookingSelections.length >= 4)
                            || cookingSelectedTotal >= nextCapacity}>
                          <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span>
                          <small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b>
                        </button>;
                      })}
                    </div>

                  </div>
                  {!cookingOnline && <small className="cooking-feedback" role="status">Sem conexão: cozinhar exige internet.</small>}
                  {cookingFeedback && <small className="cooking-feedback" role="status">{cookingFeedback}</small>}
                </div>
              </> : <>
                <div className="lobby-crafting-products"><span>PRODUÇÃO PREVISTA</span><strong>{stationPresentation.products}</strong></div>
                <small>Os recursos disponíveis no Baú são usados diretamente na fabricação.</small>
              </>}
            
        </div>
      </div>
    {(activeCraftingStation.id === 'bigorna' || activeCraftingStation.id === 'fogao' || activeCraftingStation.id === 'joalheria' || activeCraftingStation.id === 'costura') && <StationNav current={activeCraftingStation.id} onLobby={closeGamePage} onOpenStation={openStation} />}
      </PageFrame> : <main className="game-shell" style={{ '--interface-scale': 1, '--controller-scale-setting': interfaceScale / 100 } as CSSProperties}>
    <header className="topbar">
      <div className="brand-mark">F<span>Í</span>BULA</div>
      <div className="subtitle">ONLINE <i /> SOBREVIVÊNCIA</div>
      <button className="help-button" onClick={() => { const nextMuted = !audioMuted; setAudioMuted(nextMuted); audioManager.setMuted(nextMuted); }} aria-label={audioMuted ? "Ligar efeitos sonoros" : "Desligar efeitos sonoros"} aria-pressed={!audioMuted} title={audioMuted ? "Ligar efeitos sonoros" : "Desligar efeitos sonoros"}>{audioMuted ? "🔇" : "🔊"}</button>
      <button className="help-button" onClick={() => setShowHelp(v => !v)} aria-label="Ajuda">?</button>
    </header>
    <section className="game-stage">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Campo de jogo 2D" onPointerDown={onFlagPointerDown} onPointerMove={onFlagPointerMove} onPointerUp={onFlagPointerUp} onPointerCancel={onFlagPointerUp} onContextMenu={onFlagContextMenu} />
      <div className="hud-top" aria-label="Status da partida">
        {state.activeMeals.length > 0 && <div className="cooking-match-actions" aria-label="Refeições ativas">
          {state.activeMeals.map(meal => {
            const remainingSeconds = Math.ceil(meal.remainingSeconds);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            const remainingLabel = `${minutes} minutos e ${seconds} segundos restantes`;
            return <div className="cooking-active-meal" key={meal.id} title={`${meal.name}, ${remainingLabel}`} aria-label={`${meal.name}, ${remainingLabel}`}>
              <span>{cookingMealArtwork(meal)}{meal.herbExtended && <i className="cooking-herb-sparkle" aria-label="Duração estendida por ervas">✦</i>}</span>
              <small>{minutes}:{String(seconds).padStart(2, '0')}</small>
            </div>;
          })}
        </div>}
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
      {showStart && activeGameRoute.page === 'lobby' && <div className="lobby-screen" role="dialog" aria-label="Lobby do Fíbula Online">
        <div className="lobby-sky" aria-hidden="true">
          <i className="lobby-moon"/>
          <i className="lobby-star star-one"/><i className="lobby-star star-two"/><i className="lobby-star star-three"/>
          <i className="lobby-star star-four"/><i className="lobby-star star-five"/><i className="lobby-star star-six"/><i className="lobby-star star-seven"/>
          <i className="lobby-comet" aria-hidden="true"/>
        </div>
        <AndroidReleaseButton />
        <canvas ref={lobbyGrassCanvasRef} className="lobby-grass-floor" aria-hidden="true"/>
        <i className="lobby-ground-light" aria-hidden="true"/>
        <div className="lobby-character-wrap"><canvas ref={lobbyCharacterCanvasRef} className="lobby-character-canvas" aria-hidden="true"/><button type="button" className="lobby-character-profile-trigger" aria-label="Abrir meu perfil de jogador" title="Meu perfil" onClick={() => { navigateToPlayerProfile(session.user.sub); setActiveGameRoute({ page: 'jogador', playerId: session.user.sub }); setViewedProfileUserId(session.user.sub); setPlayerProfileOpen(true); }}/>{duoPeer ? <div className={`lobby-duo-peer ${duoPeer.status === 'connecting' ? 'connecting' : ''}`} role="group" aria-label={`Parceiro: ${duoPeer.friendName}`}><strong className="lobby-duo-peer-name">{duoPeer.friendName}</strong><small className={`lobby-duo-peer-status ${duoPeer.status !== 'connecting' && duoPeer.matchId === null && duoPeer.peerReady ? 'lobby-duo-peer-ready' : ''}`}>{duoPeer.status === 'connecting' ? 'Conectando…' : duoPeer.matchId !== null ? 'Em jogo' : duoPeer.peerReady ? 'Pronto' : duoPeer.role === 'host' ? 'Aguardando prontidão' : 'Online'}</small><canvas ref={duoPeerCanvasRef} className="lobby-duo-peer-avatar" aria-hidden="true"/><button type="button" className="lobby-duo-peer-leave" aria-label="Sair do grupo" title="Sair do grupo" onClick={() => duoLeaveActionRef.current?.()}>Sair</button></div> : <button className="lobby-duo-invite" type="button" aria-label="Convidar amigo para jogar em duo" title="Convidar amigo" onClick={() => { navigateToPage('amigos'); setActiveGameRoute({ page: 'amigos' }); setFriendsOpen(true); }}>+</button>}</div>
        
          <button className="lobby-arsenal-trigger" type="button" aria-label="Abrir Arsenal" title="Arsenal" onClick={() => { navigateToPage('arsenal'); setActiveGameRoute({ page: 'arsenal' }); setArsenalOpen(true); }}>
            <span className="lobby-top-emoji" aria-hidden="true">⚔️</span>
            <span>ARSENAL</span>
          </button>
          <button className="lobby-friends-trigger" type="button" aria-label="Abrir lista de amigos" title="Amigos" onClick={() => { navigateToPage('amigos'); setActiveGameRoute({ page: 'amigos' }); setFriendsOpen(true); }}>
            <span className="lobby-top-emoji" aria-hidden="true">👥</span>
            <span>AMIGOS</span>
          </button>
          <button className="lobby-chest-trigger" type="button" aria-label="Abrir Baú de recursos" title="Baú" onClick={openLobbyChest}>
            <span className="lobby-top-emoji" aria-hidden="true">🧰</span>
            <span>BAÚ</span>
          </button>
          <button className="lobby-profile-trigger" type="button" aria-label="Abrir seleção de classes" title="Classes" onClick={() => { navigateToPage('classes'); setActiveGameRoute({ page: 'classes' }); setProfileOpen(true); }}>
            <span className="lobby-top-emoji" aria-hidden="true">🧙</span>
            <span>CLASSES</span>
          </button>
          <button className="lobby-ranking-trigger" type="button" aria-label="Abrir Ranking" title="Ranking" onClick={() => { navigateToPage('ranking'); setActiveGameRoute({ page: 'ranking' }); setRankingOpen(true); }}>
            <span className="lobby-ranking-spark lobby-ranking-spark-one" aria-hidden="true">✦</span>
            <span className="lobby-ranking-trophy" aria-hidden="true">🏆</span>
            <span>RANKING</span>
            <span className="lobby-ranking-spark lobby-ranking-spark-two" aria-hidden="true">✧</span>
          </button>
          <button className="lobby-status-trigger" type="button" aria-label="Abrir status dos personagens" title="Status" onClick={() => { navigateToPage('status'); setActiveGameRoute({ page: 'status' }); setStatusOpen(true); }}>
            <span className="lobby-top-emoji" aria-hidden="true">📊</span>
            <span>STATUS</span>
          </button>
        {duoPeer?.role === 'guest' ? <button className="lobby-play-trigger duo-ready-trigger" type="button" disabled={updateAvailable || duoPeer.status !== 'connected'} aria-pressed={duoPeer.selfReady} onClick={() => duoReadyActionRef.current?.()} title={updateAvailable ? 'Atualize o aplicativo para jogar' : duoPeer.status === 'connected' ? 'Confirmar sua prontidão' : 'Aguardando conexão'}>
          {duoPeer.status !== 'connected' ? 'Conectando…' : duoPeer.selfReady ? 'CANCELAR PRONTO' : 'PRONTO'}
        </button> : <button className="lobby-play-trigger" type="button" onClick={handleLobbyPlay} disabled={updateAvailable || Boolean(duoPeer && (duoPeer.status !== 'connected' || !duoPeer.peerReady))} aria-disabled={updateAvailable || Boolean(duoPeer && (duoPeer.status !== 'connected' || !duoPeer.peerReady))} aria-label="Jogar" title={updateAvailable ? 'Atualize o aplicativo para entrar em uma partida' : duoPeer ? duoPeer.status !== 'connected' || !duoPeer.peerReady ? `Aguardando ${duoPeer.friendName} ficar pronto` : 'Modo cooperativo em preparação' : 'Entrar no mundo'}>
          Jogar
        </button>}
        {updateAvailable && <p className="lobby-update-required" role="status">Atualização obrigatória: baixe a nova versão para jogar.</p>}
        {duoNotice && <p className="lobby-duo-notice" role="status">{duoNotice}</p>}
        <nav className="lobby-crafting-stations" aria-label="Estações de criação">
          {LOBBY_CRAFTING_STATIONS.map(station => <button
            key={station.id}
            className="lobby-crafting-trigger"
            type="button"
            aria-label={`Abrir estação: ${station.title}`}
            title={station.title}
            onClick={() => openStation(station.id)}
          >
            <span className="lobby-crafting-icon" aria-hidden="true">{station.icon}</span>
            <span>{station.label}</span>
          </button>)}
        </nav>
      </div>}
                {arsenalOpen && <PageFrame eyebrow="" title="" onBack={closeGamePage} hideHeader stateClassName="side-page arsenal-side">
          <div className="station-page-content side-page-content arsenal-side-content"><section className="side-page-panel arsenal-side-panel">
            <section className="arsenal-equipment-section" aria-label="Equipamentos equipados">
              <div className="arsenal-character-tabs" role="tablist" aria-label="Personagem do Arsenal">
                <button type="button" role="tab" aria-selected={arsenalCharacterTab === 'principal'} className={arsenalCharacterTab === 'principal' ? 'active' : ''} onClick={() => setArsenalCharacterTab('principal')}>Principal</button>
                <button type="button" role="tab" aria-selected={arsenalCharacterTab === 'secundario'} className={arsenalCharacterTab === 'secundario' ? 'active' : ''} onClick={() => setArsenalCharacterTab('secundario')}>Secundário</button>
              </div>
              <div className="arsenal-equipment-stage">
                <span className="arsenal-power-label" aria-label={arsenalPowerValue === null ? "Poder do personagem" : `Poder do personagem: ${arsenalPowerValue}`}>PD{arsenalPowerValue === null ? "" : ` ${arsenalPowerValue}`}</span>
                {characterPreferences[arsenalCharacterTab === 'principal' ? 0 : 1] ? <canvas ref={arsenalCharacterCanvasRef} className="arsenal-character-canvas" aria-label={`Personagem ${CLASSES[characterPreferences[arsenalCharacterTab === 'principal' ? 0 : 1]!].label} com sua arma flutuante`} /> : <div className="arsenal-no-character">Nenhum personagem selecionado nesta posição.</div>}
                <div className="arsenal-equipment-grid">
                  {ARSENAL_SLOT_LAYOUT.map(({ slot, row, column }) => {
                    const weaponEquipped = slot === 'arma' ? equippedArsenalWeapon : null;
                    const equipped = weaponEquipped ? null : arsenalItems.find(item => item.id === equipmentLoadout[slot]);
                    const equippedName = weaponEquipped ? arsenalWeaponLabels[weaponEquipped.model] : equipped ? cleanItemName(equipped.name) : undefined;
                    const weaponIcon = weaponEquipped ? weaponEquipped.model === 'espada' ? '🗡️' : weaponEquipped.model === 'arco' ? '🏹' : weaponEquipped.model === 'cajado' ? '🔮' : '🌿' : null;
                    const rarity = weaponEquipped?.rarity ?? equipped?.rarity;
                    const info = ARSENAL_SLOT_INFO[slot];
                    return <button type="button" key={slot} className={`arsenal-equipment-slot ${equippedName ? 'equipped' : ''} ${weaponEquipped ? 'arsenal-weapon-equipped-slot' : ''}`} style={{ gridRow: row, gridColumn: column }} disabled={!equippedName} onClick={() => {
                      if (weaponEquipped) openArsenalWeaponActions(weaponEquipped, true);
                      else if (equipped) openArsenalEquipmentActions(equipped, true);
                    }} aria-label={`${info.label}: ${equippedName ? equippedName + ', equipado. Abrir ações.' : 'vazio'}`}>
                      {!equippedName && <span className="arsenal-empty-slot-label">{info.label}</span>}
                      {equippedName && <span className="arsenal-equipped-weapon-icon" style={rarityGlowStyle(rarity)} aria-hidden="true">{weaponEquipped ? weaponIcon : equipped?.icon}</span>}
                    </button>;
                  })}
                </div>
              </div>
            </section>
            <section className="arsenal-inventory-section" aria-label="Inventário de equipamentos">
              <div className="arsenal-section-heading"><strong>INVENTÁRIO</strong><span>{arsenalInventoryEntries.length}/{arsenalInventoryCapacity}</span></div>
              {weaponsLoading && <p className="arsenal-weapon-feedback" role="status">Carregando armas…</p>}
              {!weaponsLoading && arsenalInventoryEntries.length === 0
                ? <p className="arsenal-inventory-empty">Nenhum equipamento no inventário.</p>
                : <div className="arsenal-inventory-grid">
                  {arsenalInventoryEntries.map(entry => {
                    if (entry.kind === 'weapon') {
                      const weapon = entry.weapon;
                      const weaponName = arsenalWeaponLabels[weapon.model];
                      const weaponIcon = weapon.model === 'espada' ? '🗡️' : weapon.model === 'arco' ? '🏹' : weapon.model === 'cajado' ? '🔮' : '🌿';
                      return <button type="button" key={weapon.id} className={`arsenal-inventory-slot filled arsenal-weapon-item ${weapon.id === selectedArsenalItemId ? 'selected' : ''}`} onClick={() => openArsenalWeaponActions(weapon, false)} aria-label={`${weaponName}. Abrir ações.`}>
                        <span style={rarityGlowStyle(weapon.rarity)}>{weaponIcon}</span><small>{weaponName}</small>
                      </button>;
                    }
                    const item = entry.item;
                    const isEquipped = Object.values(equipmentLoadout).includes(item.id);
                    return <button type="button" key={item.id} className={`arsenal-inventory-slot filled ${item.id === selectedArsenalItemId ? 'selected' : ''} ${isEquipped ? 'is-equipped' : ''}`} onClick={() => openArsenalEquipmentActions(item, isEquipped)} aria-label={`${cleanItemName(item.name)}${isEquipped ? ', equipado' : ''}. Abrir ações.`}>
                      <span style={rarityGlowStyle(item.rarity)}>{item.icon}</span><small>{cleanItemName(item.name)}</small>{isEquipped && <em>EQUIPADO</em>}
                    </button>;
                  })}
                </div>}
              {weaponFeedback && <p className="arsenal-weapon-feedback" role="status">{weaponFeedback}</p>}
            </section>
          </section></div>
          <SideNav current="arsenal" onLobby={closeGamePage} onOpenPage={openSidePage} />
        </PageFrame>}
        {arsenalActionItem && <div className="arsenal-action-backdrop" role="presentation" onClick={() => setArsenalActionItem(null)}>
          <section className="arsenal-action-dialog" role="dialog" aria-modal="true" aria-label={arsenalActionItem.kind === 'weapon' ? arsenalWeaponLabels[arsenalActionItem.weapon.model] : cleanItemName(arsenalActionItem.item.name)} onClick={event => event.stopPropagation()}>
            <header><strong>{arsenalActionItem.kind === 'weapon' ? arsenalWeaponLabels[arsenalActionItem.weapon.model] : cleanItemName(arsenalActionItem.item.name)}</strong>
              <button type="button" aria-label="Fechar" onClick={() => setArsenalActionItem(null)}>×</button></header>
            {arsenalActionItem.kind === 'weapon' && activeArsenalClassId !== WEAPON_CLASS_BY_MODEL[arsenalActionItem.weapon.model] && <p className="arsenal-action-hint">Esta arma é do {CLASSES[WEAPON_CLASS_BY_MODEL[arsenalActionItem.weapon.model]].label}. Troque a aba.</p>}
            {arsenalActionItem.equipped
              ? <button type="button" className="arsenal-action-button" autoFocus onClick={unequipSelectedArsenalItem}>Desequipar</button>
              : <button type="button" className="arsenal-action-button" autoFocus={Boolean(activeArsenalClassId) && (arsenalActionItem.kind !== 'weapon' || activeArsenalClassId === WEAPON_CLASS_BY_MODEL[arsenalActionItem.weapon.model])} disabled={!activeArsenalClassId || (arsenalActionItem.kind === 'weapon' && activeArsenalClassId !== WEAPON_CLASS_BY_MODEL[arsenalActionItem.weapon.model])} onClick={equipSelectedArsenalItem}>Equipar</button>}
            <button type="button" className="arsenal-action-button" autoFocus={!activeArsenalClassId || (arsenalActionItem.kind === 'weapon' && activeArsenalClassId !== WEAPON_CLASS_BY_MODEL[arsenalActionItem.weapon.model])} onClick={showArsenalItemDetails}>Detalhes</button>
            <button type="button" className="arsenal-action-button danger" onClick={requestArsenalItemDeletion}>Excluir</button>
          </section>
        </div>}
        {arsenalDeleteConfirmation && <div className="arsenal-action-backdrop arsenal-confirm-backdrop" role="presentation" onClick={() => { if (!arsenalDeleteBusy) setArsenalDeleteConfirmation(null); }}>
          <section className="arsenal-action-dialog arsenal-confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirmar exclusão" onClick={event => event.stopPropagation()}>
            <header><strong>Excluir {arsenalDeleteConfirmation.kind === 'weapon'
              ? arsenalWeaponLabels[arsenalDeleteConfirmation.weapon.model]
              : cleanItemName(arsenalDeleteConfirmation.item.name)}?</strong></header>
            <p>Esta ação não pode ser desfeita.</p>
            <div className="arsenal-confirm-actions">
              <button type="button" className="arsenal-action-button" autoFocus disabled={arsenalDeleteBusy} onClick={() => setArsenalDeleteConfirmation(null)}>Cancelar</button>
              <button type="button" className="arsenal-action-button danger" disabled={arsenalDeleteBusy} onClick={() => { void confirmArsenalItemDeletion(); }}>{arsenalDeleteBusy ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </section>
        </div>}
        {weaponInfoModal && <div className="arsenal-weapon-info-backdrop" role="presentation" onClick={() => { setWeaponInfoModal(null); setWeaponInfoComparison(null); }}>
          <section className="arsenal-weapon-info-card" role="dialog" aria-modal="true" aria-label={weaponInfoModal.kind === 'weapon' ? arsenalWeaponLabels[weaponInfoModal.weapon.model] : cleanItemName(weaponInfoModal.item.name)} onClick={event => event.stopPropagation()}>
            <header><strong>{weaponInfoModal.kind === 'weapon' ? arsenalWeaponLabels[weaponInfoModal.weapon.model] : cleanItemName(weaponInfoModal.item.name)}</strong><button type="button" onClick={() => { setWeaponInfoModal(null); setWeaponInfoComparison(null); }}>Fechar</button></header>
            {weaponInfoModal.kind === 'weapon' ? <>
              <div className="arsenal-weapon-info-damage"><span>Dano</span><b>{weaponInfoModal.weapon.damage.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</b></div>
              <h3>Núcleo de {weaponInfoModal.weapon.model === 'bastao' ? 'cajado' : weaponInfoModal.weapon.model}</h3>
              <ul>{weaponInfoModal.weapon.attributes.map((attribute, index) => <li key={attribute.key + '-' + index}><span>{weaponAttributeLabels[attribute.key]}</span><b>+{(attribute.value * WEAPON_CORE_POINTS_PER_VALUE).toFixed(1).replace('.', ',')}</b></li>)}</ul>
              {weaponInfoComparison && <section className="arsenal-weapon-comparison">
                <h3>Comparado com a equipada</h3>
                <div className="arsenal-weapon-comparison-damage">
                  <span>Dano {weaponInfoModal.weapon.damage.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                  {(() => { const delta = weaponInfoModal.weapon.damage - weaponInfoComparison.damage; return <b className={delta > 0 ? 'is-better' : delta < 0 ? 'is-worse' : 'is-equal'}>{delta > 0 ? '+' + delta.toFixed(1).replace('.', ',') + ' ▲' : delta < 0 ? '−' + Math.abs(delta).toFixed(1).replace('.', ',') + ' ▼' : 'igual'}</b>; })()}
                </div>
                <ul>
                  {weaponInfoModal.weapon.attributes.map((attribute, index) => {
                    const equippedAttribute = weaponInfoComparison.attributes.find(item => item.key === attribute.key);
                    const points = attribute.value * WEAPON_CORE_POINTS_PER_VALUE;
                    if (!equippedAttribute) return <li key={'new-' + attribute.key + '-' + index}><span>{weaponAttributeLabels[attribute.key]}</span><b className="is-better">(novo) ▲</b></li>;
                    const delta = points - equippedAttribute.value * WEAPON_CORE_POINTS_PER_VALUE;
                    return <li key={'compare-' + attribute.key + '-' + index}><span>{weaponAttributeLabels[attribute.key]}</span><b className={delta > 0 ? 'is-better' : delta < 0 ? 'is-worse' : 'is-equal'}>{delta > 0 ? '+' + delta.toFixed(1).replace('.', ',') + ' ▲' : delta < 0 ? '−' + Math.abs(delta).toFixed(1).replace('.', ',') + ' ▼' : 'igual'}</b></li>;
                  })}
                  {weaponInfoComparison.attributes.filter(attribute => !weaponInfoModal.weapon.attributes.some(viewed => viewed.key === attribute.key)).map((attribute, index) => <li key={'lost-' + attribute.key + '-' + index}><span>{weaponAttributeLabels[attribute.key]}</span><b className="is-worse">(perde) ▼</b></li>)}
                </ul>
              </section>}
              <div className="arsenal-weapon-info-stars" aria-label="Cinco estrelas vazias"><i>☆</i><i>☆</i><i>☆</i><i>☆</i><i>☆</i></div>
            </> : <div className="arsenal-item-info-details">
              <div><span>Slot</span><b>{ARSENAL_SLOT_INFO[weaponInfoModal.item.slot].label}</b></div>
              <div><span>Raridade</span><b>{(({ normal: 'Normal', common: 'Comum', uncommon: 'Incomum', rare: 'Rara', legendary: 'Lendária' } as Record<string, string>)[weaponInfoModal.item.rarity ?? 'normal'] ?? weaponInfoModal.item.rarity ?? 'Normal')}</b></div>
            </div>}
          </section>
        </div>}
        {chestOpen && <PageFrame eyebrow="" title="" onBack={closeGamePage} hideHeader stateClassName="side-page bau-side">
          <div className="station-page-content side-page-content bau-side-content"><section className="side-page-panel bau-side-panel lobby-chest-modal lobby-chest-page">
            <div className="lobby-jabuticaba-progress"><strong>NÍVEL GERAL {accountLevel}</strong><span>{jabuticabaProgress}/{jabuticabaLevelCost(accountLevel)} jabuticabas para o próximo nível</span></div>
            <nav className="lobby-chest-tabs" role="tablist" aria-label="Conteúdo do Baú">
              <button type="button" role="tab" aria-selected={chestTab === 'resources'} className={chestTab === 'resources' ? 'active' : ''} onClick={() => setChestTab('resources')}>Recursos</button>
              <button type="button" role="tab" aria-selected={chestTab === 'meals'} className={chestTab === 'meals' ? 'active' : ''} onClick={() => setChestTab('meals')}>Refeições</button>
            </nav>
            {chestTab === 'resources' ? <div className="lobby-chest-grid bau-side-grid" aria-label="Itens guardados no Baú">
              {lobbyChestItems.map(item => {
                const isJabuticaba = item.itemId === 'jabuticaba';
                return <div key={item.itemId} className="bau-resource-slot">
                  <button type="button" className={`quick-slot filled lobby-chest-slot${isJabuticaba ? ' lobby-chest-slot-consumable' : ''}`}
                    aria-label={`${itemLabel(item.itemId)}: abrir ações`} onClick={() => openBauItemActions(item)}>
                    <span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b>
                  </button>
                  {duoPeer?.status === 'connected' && !duoPeer.matchId && <button type="button" className="lobby-chest-send-button" disabled={!chestCloudReady || chestTransferBusy} onClick={event => {
                    event.stopPropagation();setChestTransferItemId(item.itemId);setChestTransferQuantity('1');setChestTransferFeedback('');
                  }}>{chestCloudReady?'Enviar':'Indisponível'}</button>}
                </div>;
              })}
            </div> : <>
              <div className="lobby-chest-grid lobby-chest-meals bau-side-grid" aria-label="Refeições prontas">
                {readyCookingMeals.length ? readyCookingMeals.map(meal => <button type="button" key={meal.id} className="quick-slot filled lobby-chest-slot lobby-chest-meal-card"
                  aria-label={meal.name + ': abrir ações'} onClick={() => openBauMealActions(meal)}>
                  <span style={rarityGlowStyle(meal.rarity)}>{cookingMealArtwork(meal)}</span><small>{meal.name}</small>
                  <b>{meal.slot === 'quick' ? 'Simples' : 'Elaborada'}</b>
                </button>) : <p className="house-storage-empty bau-side-empty">Nenhuma refeição pronta. Retire as refeições concluídas no Fogão.</p>}
              </div>
              <section className="cooking-pending-panel" aria-label="Refeições para a próxima partida">
                <strong>Para a próxima partida</strong>
                <div className="cooking-pending-slots">
                  {(['quick', 'pan'] as const).map(slot => {
                    const meal = pendingCookingMeals.find(item => item.slot === slot);
                    return <div key={slot} className="cooking-pending-slot">
                      <b>{slot === 'quick' ? 'Simples' : 'Elaborada'}</b>
                      {meal ? <>
                        <span style={rarityGlowStyle(meal.rarity)}>{cookingMealArtwork(meal)}</span><small>{meal.name}</small>
                        <button type="button" className="cooking-meal-action secondary" disabled={!cookingOnline} onClick={() => void returnPendingCookingMeal(meal)}>Devolver ao Baú</button>
                      </> : <small className="cooking-pending-empty">Vazio</small>}
                    </div>;
                  })}
                </div>
              </section>
            </>}
            {chestTransferItemId && duoPeer?.status === 'connected' && !duoPeer.matchId && <div className="lobby-chest-transfer">
              <strong>Enviar {itemLabel(chestTransferItemId)} para {duoPeer.friendName}</strong>
              <label>Quantidade
                <input type="number" min="1" max={lobbyChestItems.find(item => item.itemId === chestTransferItemId)?.quantity ?? 1} step="1" value={chestTransferQuantity} onChange={event => setChestTransferQuantity(event.target.value)} />
              </label>
              <div><button type="button" disabled={chestTransferBusy} onClick={() => void sendLobbyChestItem()}>{chestTransferBusy ? 'Enviando…' : 'Confirmar envio'}</button><button type="button" className="secondary" disabled={chestTransferBusy} onClick={() => setChestTransferItemId(null)}>Cancelar</button></div>
            </div>}
            {jabuticabaFeedback && <p className="lobby-chest-feedback" role="status">{jabuticabaFeedback}</p>}
            {chestTransferFeedback && <p className="lobby-chest-feedback" role="status">{chestTransferFeedback}</p>}
            {!cookingOnline && <p className="lobby-chest-feedback" role="status">Sem conexão: cozinhar exige internet.</p>}
            {cookingFeedback && <p className="lobby-chest-feedback" role="status">{cookingFeedback}</p>}
          </section></div>
          <SideNav current="bau" onLobby={closeGamePage} onOpenPage={openSidePage} />
        </PageFrame>}
        {bauAction && <div className="bau-action-backdrop" role="presentation" onClick={()=>{if(!bauDeleteBusy)setBauAction(null);}}>
          <section className={`bau-action-dialog${bauAction.view==='details'?' bau-action-details':''}`} role="dialog" aria-modal="true"
            aria-label={bauAction.view==='confirm'?'Confirmar exclusão':bauAction.kind==='meal'?bauAction.meal.name:itemLabel(bauAction.item.itemId)}
            onClick={event=>event.stopPropagation()}>
            {bauAction.view==='actions'?<>
              <header><strong>{bauAction.kind==='meal'?bauAction.meal.name:itemLabel(bauAction.item.itemId)}</strong><button type="button" aria-label="Fechar" onClick={()=>setBauAction(null)}>×</button></header>
              {bauAction.kind==='meal'?<>
                <button type="button" className="bau-action-button" autoFocus={cookingOnline} disabled={!cookingOnline} onClick={()=>{void queueReadyCookingMeal(bauAction.meal);setBauAction(null);}}>Consumir</button>
                <button type="button" className="bau-action-button" autoFocus={!cookingOnline} onClick={showBauActionDetails}>Detalhes</button>
                <button type="button" className="bau-action-button danger" disabled={!cookingOnline} onClick={requestBauActionDeletion}>Excluir</button>
                {!cookingOnline&&<p className="bau-action-hint">Sem conexão: excluir refeições exige internet.</p>}
              </>:bauAction.item.itemId==='jabuticaba'?<>
                <button type="button" className="bau-action-button" autoFocus={chestCloudReady&&!jabuticabaBusy} disabled={!chestCloudReady||jabuticabaBusy} onClick={()=>{void consumeJabuticaba();setBauAction(null);}}>Consumir</button>
                <button type="button" className="bau-action-button" autoFocus={!chestCloudReady||jabuticabaBusy} onClick={showBauActionDetails}>Detalhes</button>
              </>:<>
                <button type="button" className="bau-action-button" autoFocus onClick={showBauActionDetails}>Detalhes</button>
                <button type="button" className="bau-action-button danger" onClick={requestBauActionDeletion}>Excluir</button>
              </>}
            </>:bauAction.view==='details'?<>
              <header><strong>{bauAction.kind==='meal'?bauAction.meal.name:itemLabel(bauAction.item.itemId)}</strong><button type="button" aria-label="Fechar" onClick={()=>setBauAction(null)}>×</button></header>
              {bauAction.kind==='meal'?<>
                <p><b>Tipo:</b> {bauAction.meal.slot==='quick'?'Simples':'Elaborada'}</p>
                <div className="bau-action-detail-section"><strong>Ingredientes</strong><ul>{bauAction.meal.ingredients.map((ingredient,index)=><li key={ingredient.itemId+'-'+index}>{bauIngredientName(ingredient.itemId)}</li>)}</ul></div>
                <div className="bau-action-detail-section"><strong>Efeito</strong><ul>{bauMealEffects(bauAction.meal).map((effect,index)=><li key={effect+'-'+index}>{effect}</li>)}</ul>
                  {bauAction.meal.durationSeconds&&<p>{bauAction.meal.durationSeconds<=1800?'Dura uma partida':'Dura um tempo limitado'}</p>}</div>
              </>:bauAction.item.itemId==='jabuticaba'?<>
                <p><b>Propriedade:</b> experiência</p><p><b>Uso:</b> consumida para subir o nível geral.</p>
              </>:<>
                {bauItemDetails(bauAction.item.itemId).property&&<p>{bauItemDetails(bauAction.item.itemId).property}</p>}
                <p>{bauItemDetails(bauAction.item.itemId).usage}</p>
              </>}
              <button type="button" className="bau-action-button" autoFocus onClick={()=>setBauAction(current=>current?{...current,view:'actions'}:null)}>Voltar</button>
            </>:<>
              <header><strong>Excluir {bauAction.kind==='meal'?bauAction.meal.name:itemLabel(bauAction.item.itemId)}?</strong><button type="button" aria-label="Fechar" disabled={bauDeleteBusy} onClick={()=>setBauAction(null)}>×</button></header>
              <p>Esta ação não pode ser desfeita.</p>
              {bauAction.kind==='item'&&bauAction.item.quantity>1&&<>
                <label className="bau-action-quantity">Quantidade a excluir<input type="number" min="1" max={lobbyChestItems.find(item=>item.itemId===bauAction.item.itemId)?.quantity??bauAction.item.quantity} step="1" value={bauDeleteQuantity} onChange={event=>setBauDeleteQuantity(event.target.value)}/></label>
                <button type="button" className="bau-action-button danger" disabled={bauDeleteBusy} onClick={()=>{void discardBauItem(true);}}>Excluir tudo</button>
              </>}
              <div className="bau-action-confirm-actions">
                <button type="button" className="bau-action-button" autoFocus disabled={bauDeleteBusy} onClick={()=>setBauAction(null)}>Cancelar</button>
                <button type="button" className="bau-action-button danger" disabled={bauDeleteBusy||(bauAction.kind==='meal'&&!cookingOnline)} onClick={()=>{if(bauAction.kind==='meal')void discardBauMeal(bauAction.meal);else void discardBauItem();}}>{bauDeleteBusy?'Excluindo…':'Excluir'}</button>
              </div>
              {bauAction.kind==='meal'&&!cookingOnline&&<p className="bau-action-hint">Sem conexão: excluir refeições exige internet.</p>}
              {bauAction.kind==='meal'&&cookingFeedback&&<p role="status">{cookingFeedback}</p>}
              {bauAction.kind==='item'&&chestTransferFeedback&&<p role="status">{chestTransferFeedback}</p>}
            </>}
          </section>
        </div>}
        {statusOpen && <PageFrame eyebrow="" title="" onBack={closeGamePage} hideHeader stateClassName="side-page status-page">
          <div className="station-page-content side-page-content"><section className="side-page-panel">
            <StatusDuo preferences={characterPreferences} powers={statusPowers} powerReady={statusPowerReady} weaponsLoading={weaponsLoading} rankings={statusRanks} lastMatch={statusHistory[0] ?? null} history={statusHistory} usage={statusUsage} onGoClasses={() => openSidePage('classes')} />
          </section></div>
          <SideNav current="status" onLobby={closeGamePage} onOpenPage={openSidePage} />
        </PageFrame>}
        {profileOpen && <PageFrame eyebrow="" title="" onBack={closeGamePage} hideHeader stateClassName="side-page classes-page">
          <div className="station-page-content side-page-content"><section className="lobby-profile-modal lobby-classes-page side-page-panel">
            <div className="lobby-profile-tabs classes-tabs" role="tablist" aria-label="Classes disponíveis">
              {PROFILE_CLASS_IDS.map(classId => <button
                type="button"
                role="tab"
                aria-selected={profileClassTab === classId}
                tabIndex={profileClassTab === classId ? 0 : -1}
                className={`profile-class-tab class-${classId} ${profileClassTab === classId ? 'active' : ''}`}
                key={classId}
                onClick={() => setProfileClassTab(classId)}
              >
                <ClassFace classId={classId} size={36} />
                <strong>{CLASSES[classId].label}</strong>
              </button>)}
            </div>
            <div className="lobby-profile-content classes-content">
              <section className={`profile-class-details class-${profileClassTab}`} aria-label={`Comparação de atributos: ${CLASSES[profileClassTab].label}`}>
                <ClassStatBars classId={profileClassTab} preferences={characterPreferences} onPreferencesChange={setCharacterPreferences} />
              </section>
            </div>
          </section></div>
          <SideNav current="classes" onLobby={closeGamePage} onOpenPage={openSidePage} />
        </PageFrame>}
        {rankingOpen && <PageFrame eyebrow="" title="" onBack={closeGamePage} hideHeader stateClassName="side-page ranking-page">
          <div className="station-page-content side-page-content ranking-page-content"><section className="side-page-panel ranking-panel">
            <nav className="ranking-mode-tabs" role="tablist" aria-label="Modalidade do ranking">
              <button type="button" role="tab" aria-selected={rankingMode === 'solo'} className={rankingMode === 'solo' ? 'active' : ''} onClick={() => setRankingMode('solo')}>SOLO</button>
              <button type="button" role="tab" aria-selected={rankingMode === 'duo'} className={rankingMode === 'duo' ? 'active' : ''} onClick={() => setRankingMode('duo')}>DUO</button>
            </nav>
            <nav className="ranking-category-tabs" aria-label="Categoria do ranking">
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
            <section className="ranking-board" aria-live="polite">
              <header className="ranking-board-heading">
                <div><span>TOP 100</span><h3>{rankingMode === 'solo' ? 'Lendas individuais' : 'Duplas lendárias'}</h3></div>
                <strong>{rankingCategory === 'power' ? '⚔️ PD' : rankingCategory === 'survival' ? '🌄 DIAS' : '💀 ABATES'}</strong>
              </header>
              {rankingMode === 'duo' ? <div className="ranking-empty">
                <span aria-hidden="true">🤝</span><strong>Ranking Duo em preparação</strong>
                <p>As classificações Solo são individuais. O modo Duo terá uma tabela própria quando as partidas em equipe forem ativadas.</p>
              </div> : rankingLoading ? <div className="ranking-empty"><span aria-hidden="true">⌛</span><strong>Carregando classificação...</strong></div>
                : rankingError ? <div className="ranking-empty"><span aria-hidden="true">⚠️</span><strong>Não foi possível carregar o ranking</strong><p>{rankingError}</p></div>
                : rankingRows.length === 0 ? <div className="ranking-empty">
                  <span aria-hidden="true">{rankingCategory === 'power' ? '⚔️' : rankingCategory === 'survival' ? '🌄' : '💀'}</span>
                  <strong>{rankingCategory === 'power' ? 'Ainda não há PD registrado' : rankingCategory === 'survival' ? 'Ainda não há dias registrados' : 'Ainda não há abates registrados'}</strong>
                  <p>Os melhores resultados dos jogadores aparecerão aqui assim que forem validados e salvos.</p>
                  {rankingCategory === 'power' && <small>Abra o Status para registrar o PD da sua dupla.</small>}
                </div> : <div className="ranking-list">
                  {rankingRows.map((entry, index) => {
                    const value = rankingCategory === 'power' ? entry.highest_pd
                      : rankingCategory === 'survival' ? entry.highest_survival_level : entry.kills;
                    const avatarClass = isProfileClassId(entry.avatar_character) ? entry.avatar_character : 'guerreiro';
                    const isOwnEntry = entry.user_id === session.user.sub;
                    return <article className={`ranking-entry class-${avatarClass}${isOwnEntry ? ' is-own' : ''}`} key={entry.user_id}>
                      <span className={`ranking-entry-position${index < 3 ? ` medal-${index + 1}` : ''}`}>{index + 1}</span>
                      <span className="ranking-entry-avatar"><ClassFace classId={avatarClass} size={28} /></span>
                      <strong title={entry.display_name || 'Jogador sem nome'}>{entry.display_name || 'Jogador sem nome'}</strong>
                      <b>{new Intl.NumberFormat('pt-BR').format(value)}</b>
                    </article>;
                  })}
                </div>}
            </section>
            <footer className="ranking-player-position">
              <div><span>SUA POSIÇÃO</span><strong>{rankingRows.findIndex(entry => entry.user_id === session.user.sub) >= 0
                ? `#${rankingRows.findIndex(entry => entry.user_id === session.user.sub) + 1}`
                : (rankingOwnProfile && (rankingCategory === 'power' ? rankingOwnProfile.highest_pd
                  : rankingCategory === 'survival' ? rankingOwnProfile.highest_survival_level : rankingOwnProfile.kills) > 0) ? 'FORA DO TOP 100' : '—'}</strong></div>
              <div><span>{rankingCategory === 'power' ? 'SEU PD' : rankingCategory === 'survival' ? 'SEUS DIAS' : 'SEUS ABATES'}</span><strong>{rankingOwnProfile
                ? new Intl.NumberFormat('pt-BR').format(rankingCategory === 'power' ? rankingOwnProfile.highest_pd
                  : rankingCategory === 'survival' ? rankingOwnProfile.highest_survival_level : rankingOwnProfile.kills) : '—'}</strong></div>
            </footer>
          </section></div>
          <BackToLobbyButton onClick={closeGamePage} />
        </PageFrame>}
        {playerProfileOpen && <PlayerProfileModal
          pageMode={activeGameRoute.page === 'jogador'}
          userId={viewedProfileUserId ?? session.user.sub}
          isOwner={(viewedProfileUserId ?? session.user.sub) === session.user.sub}
          currentCharacter={characterPreferences[0] ?? state.classId}
          avatarCharacter={avatarCharacter}
          onAvatarChange={setAvatarCharacter}
          onClose={closeGamePage}
        />}
      {showHelp && <div className="help-card"><button className="close-help" onClick={() => setShowHelp(false)}>×</button><h3>Como sobreviver</h3><p><b>WASD / setas</b> movem o personagem. <b>1 Guerreiro, 2 Mago, 3 Arqueiro e 4 Druida</b> selecionam a classe, sua aparência, habilidades e arma correspondente. <b>A câmera mantém a visão limitada ao redor do personagem.</b> <b>R</b> liga/desliga o alcance e, no celular, <b>Zoom + / Zoom −</b> aproximam ou afastam a visão. O Druida regenera vida ao acertar ataques e guarda até 7 orbes, que são consumidos automaticamente quando a vida cai abaixo de 40%. <b>Espaço</b> pega/solta a carroça construída quando estiver perto. <b>T</b> abre a roda de bandeiras; 1–4 colocam a bandeira na direção correspondente, e T sobre uma bandeira a remove. <b>B</b> abre a mochila e o conteúdo do carrinho. Ao puxar o carrinho, o ataque automático fica desativado.</p></div>}
      {state.dead && <div className="game-over"><div className="skull">✦</div><p className="eyebrow">FIM DE JOGO</p><h2>A névoa venceu.</h2><p>Você resistiu até a onda <b>{state.wave}</b>.</p><div className="summary"><div><span>DIAS</span><b>{survivalDay}</b></div><div><span>NÍVEL</span><b>{state.player.level}</b></div><div><span>SLIMES</span><b>{state.kills}</b></div></div><div className="game-over-actions"><button className="restart-button" onClick={restart}>↻ Tentar novamente</button><button className="lobby-return-button" onClick={returnToLobby}>⌂ Voltar ao lobby</button></div></div>}
      {showHelp && <div className="help-backdrop" onClick={() => setShowHelp(false)} />}
      {(flagWheel || flagHotkeyOpen) && <div className="flag-wheel" role="dialog" aria-label="Roda de bandeiras" style={flagWheel ? { left: flagWheel.screenX, top: flagWheel.screenY } : { left: '50%', top: '50%' }}>
        {CONFIG.flags.colors.map(item => <div key={item.id} className={`flag-wheel-option ${item.id} ${flagWheel?.selected === item.id ? 'selected' : ''}`} aria-label={item.label} title={item.label}><span style={{ background: item.color }} /></div>)}
        <div className={`flag-wheel-option camp ${flagWheel?.selected === 'camp' ? 'selected' : ''} ${state.campfire ? 'disabled' : ''}`} style={flagWheel ? undefined : { display: 'none' }} aria-label="Fogueira" title="Fogueira">⛺<small>Acampar</small></div>
        <div className="flag-wheel-center" aria-hidden="true">×</div>
      </div>}
      {campMenuOpen && !showStart && !state.dead && state.campfire && <div className="camp-menu-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); closeCampMenu(); } }} onClick={event => { if (event.target === event.currentTarget) closeCampMenu(); }}>
        <section className="camp-menu-panel" role="dialog" aria-modal="true" aria-label="Menu do acampamento" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
          <header><strong>ACAMPAMENTO</strong><button type="button" className="camp-menu-close" aria-label="Fechar menu do acampamento" onClick={closeCampMenu}>×</button></header>
          <button type="button" className="camp-menu-row camp-menu-chest" disabled={!chestBuildStatus.ok} onClick={buildCampChest} aria-label={`Baú: ${chestBuildStatusLabel}`}>
            <span className="camp-menu-icon">{inventoryItemIcon('wood')}</span><strong>Baú</strong><b>20</b><small>{chestBuildStatusLabel}</small>
          </button>
          <button type="button" className="camp-menu-row camp-menu-machine" disabled={!refineryBuildStatus.ok} onClick={buildCampRefinery} aria-label={`Refinaria: ${refineryBuildStatusLabel}`}>
            <span className="camp-menu-icon">{inventoryItemIcon('stone')}</span><strong>Refinaria</strong>
            <span className="camp-menu-cost"><span>{inventoryItemIcon('wood')}<b>5</b></span><span>{inventoryItemIcon('stone')}<b>15</b></span><span>{inventoryItemIcon('cotton')}<b>5</b></span></span>
            <small>{refineryBuildStatusLabel}</small>
          </button>
          <button type="button" className="camp-menu-row camp-menu-machine" disabled={!tecelariaBuildStatus.ok} onClick={buildCampTecelaria} aria-label={`Tecelaria: ${tecelariaBuildStatusLabel}`}>
            <span className="camp-menu-icon">🧵</span><strong>Tecelaria</strong>
            <span className="camp-menu-cost"><span>{inventoryItemIcon('wood')}<b>10</b></span><span>{inventoryItemIcon('stone')}<b>5</b></span><span>{inventoryItemIcon('cotton')}<b>10</b></span></span>
            <small>{tecelariaBuildStatusLabel}</small>
          </button>
        </section>
      </div>}
      {inventoryPanelOpen && !showStart && !state.dead && <div className={`inventory-quick-panel ${houseAccessible && state.house.built ? 'has-house' : ''}`} role="dialog" aria-label="Baú, mochila e carrinho">
<header><strong>INVENTÁRIO</strong><button type="button" className="inventory-close-button" onPointerDown={handleInventoryClosePointerDown} onClick={handleInventoryCloseClick} aria-label="Fechar mochila" title="Fechar">×</button></header>
<div className="inventory-quick-content">
<div className="inventory-quick-column inventory-quick-left">
<section><h3>Mochila <small>{state.inventory.length}/{CONFIG.inventory.maxSlots}</small></h3><div className="quick-slot-grid bag">
{Array.from({ length: CONFIG.inventory.maxSlots }, (_, index) => {const item=state.inventory[index];return <div key={index} className={item?'quick-slot filled':'quick-slot'} style={{position:'relative'}} aria-label={item?`${item.itemId} x${item.quantity}`:`Espaço ${index+1} vazio`}>
{item?<><span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b><button type="button" className="bag-discard-button" style={{position:'absolute',top:2,right:2,width:18,height:18,padding:0,lineHeight:'16px',borderRadius:999,background:'#632f35',color:'#fff',border:'1px solid #d98b8b',fontSize:14}} onClick={event=>{event.stopPropagation();discardBagItem(index);}} aria-label={`Descartar ${item.itemId} x${item.quantity} da mochila`} title="Descartar item">×</button></>:<span className="quick-slot-empty">{index+1}</span>}</div>;})}
</div></section>
{state.cart.stage==='built'&&cartAccessible&&<section><h3>Carrinho <small>{state.cart.inventory.length}/{CONFIG.cart.capacitySlots}</small></h3><div className="quick-slot-grid cart">
{Array.from({length:CONFIG.cart.capacitySlots},(_,index)=>{const item=state.cart.inventory[index];return <div key={index} className={item?'quick-slot filled':'quick-slot'} aria-label={item?`${item.itemId} x${item.quantity}`:`Espaço ${index+1} vazio`}>
{item?<button type="button" className="inventory-transfer-slot" disabled={!cartAccessible} onClick={event=>{event.stopPropagation();transferCartToBag(index);}} aria-label={`Retirar ${item.itemId} x${item.quantity} do carrinho para a mochila`} title="Retirar para a mochila"><span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b></button>:<span className="quick-slot-empty">{index+1}</span>}</div>;})}
</div></section>}
</div>
{houseAccessible&&state.house.built&&<div className="inventory-quick-column inventory-quick-house"><section className="house-storage-section">
<h3>Baú</h3><nav className="house-storage-tabs" role="tablist" aria-label="Itens do Baú">
<button type="button" role="tab" aria-selected={houseStorageTab==='resources'} className={houseStorageTab==='resources'?'active':''} onClick={()=>setHouseStorageTab('resources')}>Itens</button>
<button type="button" role="tab" aria-selected={houseStorageTab==='meals'} className={houseStorageTab==='meals'?'active':''} onClick={()=>setHouseStorageTab('meals')}>Refeições · {readyCookingMeals.length}</button>
</nav>
{houseStorageTab==='resources'?state.house.inventory.length>0?<div className="quick-slot-grid house-storage">
{state.house.inventory.map(item=>{const itemName=itemLabel(item.itemId);const accessibleName=`${itemName}, ${item.quantity} guardadas`;return <div key={item.itemId} className="quick-slot filled house-storage-info-slot" title={accessibleName} aria-label={accessibleName}><span style={itemRarityGlow(item.itemId)}>{inventoryItemIcon(item.itemId)}</span><b>×{item.quantity}</b></div>;})}
</div>:<p className="house-storage-empty">Nada guardado ainda.</p>
:<div className="house-meals-grid">
{!cookingOnline&&<p className="house-storage-empty" role="status">Sem conexão: cozinhar exige internet.</p>}
{readyCookingMeals.length?readyCookingMeals.map(meal=>{const slotOccupied=state.activeMeals.some(active=>active.slot===meal.slot);return <button key={meal.id} type="button" className="quick-slot filled house-meal-slot" disabled={!houseAccessible||!cookingOnline||slotOccupied} onClick={event=>{event.stopPropagation();void consumeReadyCookingMeal(meal);}} title={!houseAccessible?'Aproxime-se do Baú para consumir':!cookingOnline?'Sem conexão: cozinhar exige internet.':slotOccupied?'Você já tem uma refeição deste tipo ativa':'Consumir refeição'}>
<span style={rarityGlowStyle(meal.rarity)}>{cookingMealArtwork(meal)}</span><small>{meal.name}</small><b>{meal.slot==='quick'?'Simples':'Elaborada'}</b><b>Consumir</b></button>;}) : <p className="house-storage-empty">Nenhuma refeição pronta no Baú.</p>}
</div>}
</section></div>}
</div></div>}
{!showStart && !state.dead && cartBuildAccessible && (() => {
  const recipe = state.cart.everBuilt ? [{ itemId: 'wood', quantity: 10 }, { itemId: 'cotton', quantity: 5 }] : [{ itemId: 'wood', quantity: 1 }];
  const description = recipe.map(({ itemId, quantity }) => {
    const material = itemId === 'wood' ? (quantity === 1 ? 'madeira' : 'madeiras') : (quantity === 1 ? 'algodão' : 'algodões');
    return `${quantity} ${material}`;
  }).join(' + ');
  return <div className="game-construction-recipe" aria-label={`Carroça: ${description}`} title={`Carroça: ${description}`}>
    {recipe.map(item => <span className="game-construction-recipe-item" key={item.itemId}>
      <span className="game-construction-recipe-icon">{inventoryItemIcon(item.itemId)}</span><b>{item.quantity}</b>
    </span>)}
  </div>;
})()}
{!showStart && !state.dead && <Controls onInventoryToggle={toggleInventoryPanel} onCartToggle={toggleCart} cartActionVisible={cartActionVisible && !state.dead && !showStart} cartFollowing={state.cart.following} storeToCartVisible={cartCanStore && !state.dead && !showStart} storeToCartDisabled={state.inventory.length === 0} onStoreToCart={storeAllBagToCart} storeToHouseVisible={houseAccessible && !state.dead && !showStart} storeToHouseDisabled={state.inventory.length === 0 && !((state.cart.carried || Math.hypot(state.cart.x - state.house.x, state.cart.y - state.house.y) <= CONFIG.house.cartDeliveryRadius) && state.cart.inventory.length > 0)} onStoreToHouse={storeAllBagToHouse} buildCartVisible={cartBuildAccessible && !state.dead && !showStart} onBuildCart={buildCart} campMenuVisible={campMenuVisible && !state.dead && !showStart} onOpenCampMenu={openCampMenu} flagWheelOpen={flagWheel !== null} onLongPress={onJoystickLongPress} onFlagTap={onFlagTap} onWheelMove={onWheelMove} onWheelEnd={onWheelEnd} onMovementStart={() => { closeFlagMenu(); closeCampMenu(); }} onMove={(x, y) => { if (gameStartedRef.current) engineRef.current?.setMove(x, y); }} onRange={toggleRange} onZoom={(delta) => { const maxZoom = window.matchMedia('(pointer: coarse)').matches ? 1.75 : 1.45; zoomRef.current = Math.max(0.8, Math.min(maxZoom, zoomRef.current + delta)); }} onClass={pickClass} classId={state.classId} showRange={state.showRange} weaponLabel={CONFIG.weapons[state.weapon].label} inventoryPanelOpen={inventoryPanelOpen} audioVolume={audioVolume} onAudioVolumeChange={(volume) => { setAudioVolume(volume); audioManager.setVolume(volume); }} interfaceScale={interfaceScale} onInterfaceScaleChange={setInterfaceScale} landscapeMode={landscapeMode} onToggleLandscape={() => { void toggleLandscapeMode(); }} />}
    </section>

  </main>}
    {showStart && activeGameRoute.page === 'lobby' && mobileLobbyLandscape && <div className="lobby-orientation-guard" role="alert" aria-live="polite">
      <div className="lobby-orientation-guard-icon" aria-hidden="true"><span>▯</span><i>↻</i></div>
      <strong>Gire o celular para a posição vertical</strong>
      <p>O Lobby foi desenvolvido para jogar e organizar seus itens com o celular em pé.</p>
    </div>}
    <FriendsModal open={friendsOpen} pageMode={activeGameRoute.page === 'amigos'} userId={session.user.sub} myClassId={characterPreferences[0] ?? characterPreferences[1] ?? 'guerreiro'} myDisplayName={session.user.name || 'Jogador'} onClose={closeGamePage} onOpenSidePage={openSidePage} onLobby={closeGamePage} onOpenProfile={userId => { navigateToPlayerProfile(userId); setActiveGameRoute({ page: 'jogador', playerId: userId }); setViewedProfileUserId(userId); setFriendsOpen(false); setPlayerProfileOpen(true); }} onLobbyChange={(peer, leave, toggleReady, startMatch, notifyHouseInventoryChanged) => { setDuoPeer(peer); duoLeaveActionRef.current = leave ?? null; duoReadyActionRef.current = toggleReady ?? null; duoStartActionRef.current = startMatch ?? null; duoHouseNotifyActionRef.current = notifyHouseInventoryChanged ?? null; if (!peer) { duoStartActionRef.current = null; duoHouseNotifyActionRef.current = null; duoStartedMatchIdRef.current = null; duoTransportRef.current?.disconnect(); duoTransportRef.current = null; duoSoloFromNightRef.current = Number.MAX_SAFE_INTEGER; setDuoNotice(''); } }} onLobbyConnected={closeGamePage} onLobbyNotice={setDuoNotice} onHouseInventoryChanged={() => { void refreshLobbyChestFromCloud().catch(cause => { setChestCloudReady(false); setChestTransferFeedback(cause instanceof Error ? cause.message : 'Não foi possível atualizar o Baú.'); }); }} />
  </>;
}

function drawCampfireRange(ctx: CanvasRenderingContext2D, campfire: { x: number; y: number }) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,241,201,.06)';
  ctx.strokeStyle = 'rgba(255,241,201,.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 7]);
  ctx.beginPath(); ctx.arc(campfire.x, campfire.y, CONFIG.campfire.buildRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawCampfire(ctx: CanvasRenderingContext2D, campfire: { x: number; y: number }, elapsed: number) {
  const flicker = Math.sin(elapsed * 9) * 1.8 + Math.sin(elapsed * 15) * 1.1;
  ctx.save(); ctx.translate(campfire.x, campfire.y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 5, 27, 10, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; ctx.save(); ctx.translate(Math.cos(angle) * 19, Math.sin(angle) * 7); ctx.rotate(angle); ctx.fillStyle = i % 2 ? '#77736a' : '#aaa397'; ctx.strokeStyle = '#45413b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
  ctx.lineCap = 'round'; ctx.strokeStyle = '#4b3020'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-11, 2); ctx.lineTo(11, -3); ctx.stroke();
  ctx.strokeStyle = '#a87542'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 1); ctx.lineTo(10, -2); ctx.stroke();
  ctx.strokeStyle = '#4b3020'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(8, 4); ctx.stroke();
  ctx.fillStyle = 'rgba(255,115,25,.25)'; ctx.beginPath(); ctx.ellipse(0, -12, 13 + flicker, 17 + flicker, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f07822'; ctx.beginPath(); ctx.moveTo(-9, -5); ctx.quadraticCurveTo(-12, -17 - flicker, 0, -29 - flicker); ctx.quadraticCurveTo(13, -16 + flicker, 8, -5); ctx.quadraticCurveTo(0, 1, -9, -5); ctx.fill();
  ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.quadraticCurveTo(-4, -15 - flicker, 2, -22 - flicker); ctx.quadraticCurveTo(9, -12, 4, -5); ctx.quadraticCurveTo(0, 0, -4, -5); ctx.fill();
  ctx.restore();
}

function drawCampChest(ctx: CanvasRenderingContext2D, house: GameSnapshot['house']) {
  const { x, y } = house;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 19, 36, 10, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#755038';
  ctx.beginPath(); ctx.moveTo(-28, -5); ctx.lineTo(28, -5); ctx.lineTo(28, 22); ctx.quadraticCurveTo(0, 28, -28, 22); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#38271d'; ctx.lineWidth = 3; ctx.stroke();

  ctx.fillStyle = '#503323';
  ctx.beginPath(); ctx.moveTo(-28, -6); ctx.quadraticCurveTo(-28, -28, 0, -30); ctx.quadraticCurveTo(28, -28, 28, -6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#38271d'; ctx.lineWidth = 3; ctx.stroke();

  ctx.fillStyle = '#8d8b84'; ctx.strokeStyle = '#514f49'; ctx.lineWidth = 1.5;
  ctx.fillRect(-23, -5, 5, 28); ctx.strokeRect(-23, -5, 5, 28);
  ctx.fillRect(18, -5, 5, 28); ctx.strokeRect(18, -5, 5, 28);
  ctx.fillRect(-28, 5, 56, 4); ctx.strokeRect(-28, 5, 56, 4);
  ctx.fillRect(-5, 2, 10, 10); ctx.strokeRect(-5, 2, 10, 10);
  ctx.fillStyle = '#38271d'; ctx.beginPath(); ctx.arc(0, 7, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawRefinery(ctx: CanvasRenderingContext2D, refinery: GameSnapshot['refinery'], elapsed: number) {
  if (!refinery.built) return;
  const { x, y } = refinery;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(0, 20, 40, 12, 0, 0, Math.PI * 2); ctx.fill();

  // Moldura de madeira que sustenta o forno.
  ctx.fillStyle = '#4b3020'; ctx.strokeStyle = '#2b1c14'; ctx.lineWidth = 2.5;
  ctx.fillRect(-34, -20, 68, 43); ctx.strokeRect(-34, -20, 68, 43);
  ctx.fillStyle = '#a87542';
  ctx.fillRect(-31, -17, 5, 36); ctx.fillRect(26, -17, 5, 36);
  ctx.fillRect(-30, -18, 60, 4); ctx.fillRect(-30, 17, 60, 3);

  // Corpo de pedra com juntas visíveis.
  ctx.fillStyle = '#8d8b84'; ctx.strokeStyle = '#5c5a55'; ctx.lineWidth = 1.5;
  ctx.fillRect(-27, -13, 54, 34); ctx.strokeRect(-27, -13, 54, 34);
  ctx.beginPath(); ctx.moveTo(-27, -2); ctx.lineTo(27, -2); ctx.moveTo(-27, 9); ctx.lineTo(27, 9);
  ctx.moveTo(-9, -13); ctx.lineTo(-9, -2); ctx.moveTo(10, -2); ctx.lineTo(10, 9); ctx.moveTo(-10, 9); ctx.lineTo(-10, 21); ctx.stroke();

  // Chaminé de pedra, com topo aberto.
  ctx.fillStyle = '#8d8b84'; ctx.strokeStyle = '#5c5a55'; ctx.lineWidth = 2;
  ctx.fillRect(12, -42, 15, 30); ctx.strokeRect(12, -42, 15, 30);
  ctx.fillStyle = '#6d6b65'; ctx.fillRect(10, -44, 19, 5);
  ctx.fillStyle = '#a9a69d'; ctx.fillRect(15, -38, 3, 20);

  // Boca escura e brasa animada.
  ctx.fillStyle = '#211b17'; ctx.strokeStyle = '#44352a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-12, 1, 24, 20, 4); ctx.fill(); ctx.stroke();
  const ember = 0.72 + Math.sin(elapsed * 5.5) * 0.18;
  ctx.globalAlpha = ember; ctx.fillStyle = '#f0782f';
  ctx.beginPath(); ctx.ellipse(0, 16, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd06b'; ctx.beginPath(); ctx.ellipse(-2, 13, 2.3, 4.5, -.25, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // Fumaça leve acima da chaminé.
  for (let i = 0; i < 3; i++) {
    const phase = (elapsed * 0.34 + i / 3) % 1;
    const smokeY = -49 - phase * 19;
    const smokeX = 20 + Math.sin(elapsed * 1.2 + i) * (3 + phase * 3);
    ctx.globalAlpha = (1 - phase) * 0.24;
    ctx.fillStyle = '#d8d5ce';
    ctx.beginPath(); ctx.arc(smokeX, smokeY, 3 + phase * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTecelaria(ctx: CanvasRenderingContext2D, building: GameSnapshot['tecelaria']) {
  if (!building.built) return;
  const { x, y } = building;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(0, 20, 41, 12, 0, 0, Math.PI * 2); ctx.fill();

  // Dois pés de pedra sustentam a armação.
  ctx.fillStyle = '#8d8b84'; ctx.strokeStyle = '#5c5a55'; ctx.lineWidth = 1.5;
  ctx.fillRect(-29, 9, 15, 13); ctx.strokeRect(-29, 9, 15, 13);
  ctx.fillRect(14, 9, 15, 13); ctx.strokeRect(14, 9, 15, 13);
  ctx.beginPath(); ctx.moveTo(-29, 15); ctx.lineTo(-14, 15); ctx.moveTo(14, 15); ctx.lineTo(29, 15); ctx.stroke();

  // Tear de madeira escura com realces nas travessas.
  ctx.fillStyle = '#4b3020'; ctx.strokeStyle = '#2b1c14'; ctx.lineWidth = 3;
  ctx.fillRect(-31, -27, 7, 39); ctx.strokeRect(-31, -27, 7, 39);
  ctx.fillRect(24, -27, 7, 39); ctx.strokeRect(24, -27, 7, 39);
  ctx.fillRect(-34, -30, 68, 7); ctx.strokeRect(-34, -30, 68, 7);
  ctx.fillRect(-34, 5, 68, 6); ctx.strokeRect(-34, 5, 68, 6);
  ctx.fillStyle = '#a87542';
  ctx.fillRect(-29, -26, 3, 30); ctx.fillRect(26, -26, 3, 30);
  ctx.fillRect(-31, -28, 62, 2); ctx.fillRect(-31, 7, 62, 2);

  // Fios claros e tecido pronto no centro.
  ctx.strokeStyle = '#f3efe4'; ctx.lineWidth = 1.4;
  for (let i = -18; i <= 18; i += 6) {
    ctx.beginPath(); ctx.moveTo(i, -21); ctx.lineTo(i, 5); ctx.stroke();
  }
  ctx.fillStyle = '#e9e2cf'; ctx.strokeStyle = '#c7bda8'; ctx.lineWidth = 1.2;
  ctx.fillRect(-18, -5, 36, 12); ctx.strokeRect(-18, -5, 36, 12);
  ctx.strokeStyle = '#c7bda8'; ctx.lineWidth = 1;
  for (let i = -14; i <= 14; i += 7) {
    ctx.beginPath(); ctx.moveTo(i, -4); ctx.lineTo(i, 6); ctx.stroke();
  }

  // Lançadeira escura apoiada na borda do tecido.
  ctx.fillStyle = '#29231d'; ctx.strokeStyle = '#120f0c'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(5, 1); ctx.lineTo(8, 4); ctx.lineTo(5, 7); ctx.lineTo(-5, 7); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
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
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, weapon: WeaponId, classId: ClassId, time: number, swordSwingAngle: number, swordSwingTimer: number, moving: boolean, walkPhase: number, carried: boolean, facingX: number, facingY: number, aimAngle: number, hasTarget: boolean, isNight: boolean, showWeapon = true, fishing = false, fishingProgress = 0) {
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
  if (fishing) {
    // A puxada usa a mesma duração visual das ferramentas de coleta.
    const pullCycle = Math.max(0, Math.min(1, fishingProgress));
    const pullWindow = Math.min(1, CONFIG.gathering.toolAnimationDuration / CONFIG.lake.fishingVisibleDuration);
    const pullProgress = pullCycle >= 1 - pullWindow ? (pullCycle - (1 - pullWindow)) / pullWindow : 0;
    const pull = pullProgress > 0 ? Math.sin(Math.min(1, pullProgress) * Math.PI) : 0;
    const tipX = facingX * (43 - pull * 8);
    const tipY = -r * 0.25 + facingY * 28 - 18 - pull * 7;
    const hookX = facingX * (48 - pull * 10);
    const hookY = facingY * 38 + 5 - pull * 10;
    ctx.save();
    ctx.strokeStyle = '#6b4930'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(facingX * 7, -r * 0.25);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = '#d8c7a1'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(hookX, hookY);
    ctx.stroke();
    ctx.fillStyle = '#e7e2d5';
    ctx.beginPath(); ctx.arc(hookX, hookY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
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
