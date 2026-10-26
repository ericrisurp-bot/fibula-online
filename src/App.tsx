import { useEffect, useRef, useState, type PointerEvent, type MouseEvent, type CSSProperties } from 'react';
import { CONFIG, type ClassId, type WeaponId } from './game/config';
import { GameEngine, type GameSnapshot } from './game/engine';
import { drawLadino } from './game/ladino';
import { drawFloatingWeapon, isFloatingWeaponVisible } from './game/weapons';
import Controls from './ui/Controls';
import BackgroundMusic from './ui/BackgroundMusic';
import { audioManager } from './audio/audioManager';
import { ambience } from './audio/ambience';
import { registerCombatSounds } from './audio/combatSounds';
import { registerGatherSounds } from './audio/gatherSounds';
import { registerStepSounds } from './audio/stepSounds';

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
  enemies: [], trees: [], rocks: [], cottonPlants: [], woodDrops: [], stoneDrops: [], cottonDrops: [], linenDrops: [], bronzeDrops: [], inventory: [], xpOrbs: [], healingOrbs: [], shots: [], explosions: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, dayNight: 'day', phaseElapsed: 0, nightNumber: 0, startedAtNight: false, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0, rockMineAngle: 0, rockMineTimer: 0, cottonHarvestAngle: 0, cottonHarvestTimer: 0, showRange: false, cameraFull: false, dead: false, kills: 0,
};
const itemIcon = (itemId: string) => itemId === 'wood' ? '🪵' : itemId === 'stone' ? '🪨' : itemId === 'bronze' ? '🟤' : itemId === 'cotton' ? '☁️' : itemId === 'linen' ? '🧵' : '📦';
const inventoryItemIcon = (itemId: string) => itemId === 'cotton' ? (
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
) : itemId === 'stone' ? (
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
const itemLabel = (itemId: string) => itemId === 'wood' ? 'Madeira' : itemId === 'stone' ? 'Pedra' : itemId === 'bronze' ? 'Bronze' : itemId === 'cotton' ? 'Algodão' : itemId === 'linen' ? 'Linho' : itemId;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [state, setState] = useState<GameSnapshot>(initial);
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
  const [worldReady, setWorldReady] = useState(false);
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
  // Se a partida começou à noite, o amanhecer seguinte conclui o primeiro dia; não avance para Dia 2 nesse primeiro amanhecer.
  const survivalDay = state.startedAtNight ? Math.max(1, state.nightNumber) : state.nightNumber + 1;
  const cartDistance = Math.hypot(state.player.x - state.cart.x, state.player.y - state.cart.y);
  const cartAccessible = state.cart.repaired && (state.cart.carried || cartDistance <= CONFIG.cart.interactRadius);
  const houseDistance = Math.hypot(state.player.x - state.house.x, state.player.y - state.house.y);
  const houseAccessible = state.house.built && houseDistance <= CONFIG.house.interactRadius;
  const houseBuildAccessible = !state.house.built && houseDistance <= CONFIG.house.interactRadius;
  const refineryDistance = Math.hypot(state.player.x - state.refinery.x, state.player.y - state.refinery.y);
  const refineryBuildAccessible = !state.refinery.built && refineryDistance <= CONFIG.refinery.interactRadius;
  const tecelariaDistance = Math.hypot(state.player.x - state.tecelaria.x, state.player.y - state.tecelaria.y);
  const tecelariaBuildAccessible = !state.tecelaria.built && tecelariaDistance <= CONFIG.tecelaria.interactRadius;
  const cartBuildAccessible = !state.cart.repaired && cartDistance <= CONFIG.cart.interactRadius;
  const cartActionVisible = state.cart.repaired && (state.cart.carried || cartDistance <= CONFIG.cart.interactRadius);
  useEffect(() => {
    window.localStorage.setItem('fibula-interface-scale', String(interfaceScale));
  }, [interfaceScale]);

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
    let readyTimer: number | null = null;
    let firstFrameRendered = false;
    const loadingStartedAt = performance.now();
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
    const grassTile = document.createElement('canvas');
    grassTile.width = 256; grassTile.height = 256;
    const grassCtx = grassTile.getContext('2d');
    if (grassCtx && terrainCtx) {
      let seed = 173;
      const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      grassCtx.fillStyle = '#557a43'; grassCtx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 46; i++) {
        const x = random() * 256, y = random() * 256;
        const radius = 8 + random() * 25;
        grassCtx.fillStyle = ['rgba(105,139,69,0.24)', 'rgba(38,91,48,0.18)', 'rgba(133,145,76,0.12)'][Math.floor(random() * 3)];
        grassCtx.beginPath(); grassCtx.ellipse(x, y, radius, radius * (0.45 + random() * 0.6), random() * Math.PI, 0, Math.PI * 2); grassCtx.fill();
      }
      for (let i = 0; i < 420; i++) {
        const x = random() * 256, y = random() * 256;
        grassCtx.strokeStyle = random() > 0.5 ? 'rgba(158,180,104,0.32)' : 'rgba(31,75,39,0.28)';
        grassCtx.lineWidth = 0.7 + random() * 0.8;
        grassCtx.beginPath(); grassCtx.moveTo(x, y); grassCtx.lineTo(x + (random() - 0.5) * 4, y - 1 - random() * 4); grassCtx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const x = random() * 256, y = random() * 256;
        grassCtx.fillStyle = 'rgba(105,78,48,0.18)';
        grassCtx.beginPath(); grassCtx.ellipse(x, y, 3 + random() * 7, 2 + random() * 4, random() * Math.PI, 0, Math.PI * 2); grassCtx.fill();
      }

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
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y, CONFIG.weapons[s.weapon].range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(135,205,179,0.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(135,205,179,0.24)'; ctx.lineWidth = 2; ctx.stroke();
      }
      // Efeitos de chão/voo ficam em camada própria; entidades sólidas usam ordenação por profundidade Y.
      for (const orb of s.xpOrbs) {
        ctx.beginPath(); ctx.arc(orb.x, orb.y, CONFIG.xp.radius, 0, Math.PI * 2); ctx.fillStyle = '#77e6c0'; ctx.fill();
        ctx.strokeStyle = '#d4fff0'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (s.classId === 'druida') {
        s.healingOrbs.forEach((_, index) => {
          const angle = s.elapsed * 1.4 + index * (Math.PI * 2 / Math.max(1, s.healingOrbs.length));
          const ox = s.player.x + Math.cos(angle) * 30, oy = s.player.y + Math.sin(angle) * 30;
          ctx.save(); ctx.shadowColor = '#8dff9c'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fillStyle = '#9bff9b'; ctx.fill();
          ctx.strokeStyle = '#e3ffe0'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        });
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
        if (shot.kind === 'arrow') { ctx.strokeStyle = '#f3d59b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(6, -4); ctx.moveTo(12, 0); ctx.lineTo(6, 4); ctx.stroke(); }
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
      const aimAngle = aimTarget
        ? Math.atan2(aimTarget.y - s.player.y, aimTarget.x - s.player.x)
        : s.player.facingX < -0.35 ? Math.PI : 0;
      const worldDrawables: Array<{ depth: number; draw: () => void }> = [];
      for (const flag of flagsRef.current) {
        if (!flag.attachedToCart) worldDrawables.push({ depth: flag.y + 15, draw: () => drawFlag(ctx, flag.x, flag.y, flag.color) });
        else worldDrawables.push({ depth: s.cart.y + 15, draw: () => drawFlag(ctx, s.cart.x, s.cart.y - 34, flag.color) });
      }
      worldDrawables.push({ depth: s.house.y + 28, draw: () => drawHouse(ctx, s.house) });
      worldDrawables.push({ depth: s.refinery.y + 28, draw: () => drawRefinery(ctx, s.refinery) });
      worldDrawables.push({ depth: s.tecelaria.y + 28, draw: () => drawTecelaria(ctx, s.tecelaria) });
      worldDrawables.push({ depth: s.cart.y + 14, draw: () => drawCart(ctx, s.cart, Math.hypot(s.player.x - s.cart.x, s.player.y - s.cart.y) <= CONFIG.cart.interactRadius, s.elapsed, s.player.moving && s.cart.carried) });
      for (const plant of s.cottonPlants) {
        const scale = 1.2;
        worldDrawables.push({ depth: plant.y + 13 * scale, draw: () => {
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
        worldDrawables.push({ depth: tree.y + 30 * scale, draw: () => {
          ctx.save(); ctx.translate(tree.x, tree.y); ctx.scale(scale, scale);
          const polygon = (points: Array<[number, number]>, fill: string, stroke?: string) => {
            ctx.beginPath();
            points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
            ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
            if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
          };
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.ellipse(0, 29, 19, 8, 0, 0, Math.PI * 2); ctx.fill();

          // Tronco facetado, raízes e galhos visíveis sob a copa.
          polygon([[-5, 0], [-3, 3], [-4, 25], [-8, 29], [-3, 28], [0, 30], [3, 28], [8, 29], [4, 24], [4, 1], [0, -2]], '#805333', '#593820');
          polygon([[-3, 4], [-1, 2], [-1, 26], [-4, 27]], '#b98451');
          polygon([[1, 7], [3, 5], [3, 24], [1, 26]], '#694329');
          polygon([[-3, 11], [-9, 5], [-11, 0], [-8, 7], [-2, 14]], '#805333', '#593820');
          polygon([[3, 12], [8, 6], [10, 1], [9, 8], [2, 16]], '#805333', '#593820');

          // Silhueta irregular e facetas de sombra/luz para o visual low-poly.
          polygon([[-20, 1], [-18, -8], [-12, -12], [-13, -20], [-6, -25], [0, tree.size === 'large' ? -39 : -34], [7, -26], [15, -24], [14, -16], [20, -10], [18, 0], [10, 7], [0, 10], [-12, 7]], '#214d34', '#173d2a');
          polygon([[-18, -7], [-12, -12], [-13, -20], [-6, -25], [0, -34], [2, -19], [-5, -10], [-7, 2], [-15, 2]], '#397b4c');
          polygon([[0, -34], [7, -26], [15, -24], [14, -16], [20, -10], [18, 0], [8, 4], [3, -7], [7, -17]], '#2d6942');
          polygon([[-18, -7], [-12, -12], [-6, -8], [-10, -1], [-15, 2]], '#4a8a51');
          polygon([[-13, -20], [-6, -25], [0, -34], [-1, -21], [-7, -14]], '#60965a');
          polygon([[-7, -14], [-1, -21], [5, -17], [3, -8], [-5, -5]], '#4c8750');
          polygon([[2, -19], [7, -26], [15, -24], [9, -16]], '#43804a');
          polygon([[9, -16], [14, -16], [20, -10], [12, -7], [5, -10]], '#285b3b');
          polygon([[-15, 2], [-7, 2], [-2, 8], [-12, 7], [-18, 1]], '#285b3b');
          polygon([[3, -7], [8, 4], [0, 10], [-2, 1]], '#245537');
          ctx.restore();
        }});
      }
      for (const rock of s.rocks) {
        const scale = rock.size === 'small' ? 1.22 : rock.size === 'medium' ? 1.5 : 1.85;
        worldDrawables.push({ depth: rock.y + 12 * scale, draw: () => {
          ctx.save(); ctx.translate(rock.x, rock.y);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(2, 10 * scale, 19 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();

          const facet = (points: Array<[number, number]>, fill: string) => {
            ctx.beginPath();
            points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x * scale, y * scale) : ctx.lineTo(x * scale, y * scale));
            ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
          };

          // Contorno irregular e planos pequenos, distribuídos pela forma da rocha.
          ctx.beginPath();
          ctx.moveTo(-18 * scale, 2 * scale);
          ctx.lineTo(-16 * scale, -6 * scale);
          ctx.lineTo(-11 * scale, -12 * scale);
          ctx.lineTo(-5 * scale, -18 * scale);
          ctx.lineTo(2 * scale, -16 * scale);
          ctx.lineTo(7 * scale, -18 * scale);
          ctx.lineTo(14 * scale, -11 * scale);
          ctx.lineTo(19 * scale, -4 * scale);
          ctx.lineTo(16 * scale, 4 * scale);
          ctx.lineTo(13 * scale, 9 * scale);
          ctx.lineTo(5 * scale, 12 * scale);
          ctx.lineTo(-4 * scale, 11 * scale);
          ctx.lineTo(-12 * scale, 9 * scale);
          ctx.closePath();
          ctx.fillStyle = '#788188'; ctx.fill();
          ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1.5; ctx.stroke();

          // Facetas quebradas e assimétricas: evitam uma faixa clara atravessando o centro.
          facet([[-18, 2], [-16, -6], [-11, -12], [-8, -4], [-10, 3], [-12, 9]], '#929ba1');
          facet([[-16, -6], [-11, -12], [-5, -18], [-2, -9], [-8, -4]], '#aab2b7');
          facet([[-5, -18], [2, -16], [5, -10], [-2, -9]], '#c0c6ca');
          facet([[2, -16], [7, -18], [14, -11], [8, -7], [5, -10]], '#aeb7bd');
          facet([[14, -11], [19, -4], [12, -1], [8, -7]], '#89939a');
          facet([[-8, -4], [-2, -9], [5, -10], [2, -2], [-4, 3]], '#9ca6ac');
          facet([[5, -10], [8, -7], [12, -1], [5, 3], [2, -2]], '#737e85');
          facet([[-10, 3], [-8, -4], [-4, 3], [-5, 8], [-12, 9]], '#7e898f');
          facet([[-4, 3], [2, -2], [5, 3], [1, 8], [-5, 8]], '#a2abb0');
          facet([[5, 3], [12, -1], [16, 4], [13, 9], [5, 12], [1, 8]], '#68737a');
          facet([[-12, 9], [-5, 8], [1, 8], [5, 12], [-4, 11]], '#657078');
          facet([[12, -1], [19, -4], [16, 4]], '#59646b');

          // Microfissuras assimétricas, integradas às facetas (sem formar um rosto).
          ctx.strokeStyle = 'rgba(48,56,61,0.58)'; ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(-13 * scale, -7 * scale); ctx.lineTo(-11 * scale, -5 * scale); ctx.lineTo(-12 * scale, -3 * scale);
          ctx.moveTo(10 * scale, 4 * scale); ctx.lineTo(8 * scale, 6 * scale);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(230,235,238,0.34)'; ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(-10 * scale, -10 * scale); ctx.lineTo(-6 * scale, -15 * scale);
          ctx.moveTo(3 * scale, -14 * scale); ctx.lineTo(5 * scale, -15 * scale);
          ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.cottonDrops) {
        worldDrawables.push({ depth: drop.y + 6, draw: () => {
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
          ctx.save(); ctx.translate(drop.x, drop.y);
          // Usa o mesmo ícone da mochila, agora como um único tronco.
          ctx.font = '22px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
      worldDrawables.push({ depth: s.player.y + CONFIG.player.radius * 0.8, draw: () => drawPlayer(ctx, s.player.x, s.player.y, s.weapon, s.classId, s.elapsed, s.swordSwingAngle, s.swordSwingTimer, s.player.moving, s.walkPhase, s.cart.carried, s.player.facingX, s.player.facingY, aimAngle, aimTarget != null, s.enemies.length > 0, s.treeChopAngle, s.treeChopTimer, s.rockMineAngle, s.rockMineTimer, s.cottonHarvestAngle, s.cottonHarvestTimer) });
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
        ? Math.max(0, Math.min(1, (CONFIG.dayNight.dayDuration - s.phaseElapsed) / transition))
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
      if (!firstFrameRendered) {
        firstFrameRendered = true;
        const remainingLoadingMs = Math.max(0, 800 - (performance.now() - loadingStartedAt));
        readyTimer = window.setTimeout(() => setWorldReady(true), remainingLoadingMs);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const resize = () => { canvas.style.width = '100%'; };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); if (readyTimer !== null) window.clearTimeout(readyTimer); fpsDisplay?.remove(); engine.stop(); window.removeEventListener('resize', resize); engineRef.current = null; };
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
        const cartDistanceNow = Math.hypot(current.player.x - current.cart.x, current.player.y - current.cart.y);
        const houseDistanceNow = Math.hypot(current.player.x - current.house.x, current.player.y - current.house.y);
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
        const options: Array<{ distance: number; radius: number; available: boolean; build: () => void }> = [
          { distance: Math.hypot(current.player.x - current.cart.x, current.player.y - current.cart.y), radius: CONFIG.cart.interactRadius, available: !current.cart.repaired, build: () => engine.buildCart() },
          { distance: Math.hypot(current.player.x - current.house.x, current.player.y - current.house.y), radius: CONFIG.house.interactRadius, available: !current.house.built, build: () => engine.buildHouse() },
          { distance: Math.hypot(current.player.x - current.refinery.x, current.player.y - current.refinery.y), radius: CONFIG.refinery.interactRadius, available: !current.refinery.built, build: () => engine.buildRefinery() },
          { distance: Math.hypot(current.player.x - current.tecelaria.x, current.player.y - current.tecelaria.y), radius: CONFIG.tecelaria.interactRadius, available: !current.tecelaria.built, build: () => engine.buildTecelaria() },
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
    const attachToCart = !!cart && Math.hypot(player.x - cart.x, player.y - cart.y) <= CONFIG.cart.interactRadius;
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
  const restart = () => {
    flagsRef.current = [];
    setFlags([]);
    setWheel(null);
    closeFlagMenu();
    closeInventoryPanel();
    engineRef.current?.restart();
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
      const attachToCart = !!cart && Math.hypot(player.x - cart.x, player.y - cart.y) <= CONFIG.cart.interactRadius;
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
  const beginGame = () => {
    if (!worldReady) return;
    gameStartedRef.current = true;
    // Sorteia novamente ao iniciar de verdade, não enquanto a tela inicial fica aberta.
    flagsRef.current = []; setFlags([]); setWheel(null);
    closeFlagMenu();
    closeInventoryPanel();
    engineRef.current?.restart();
    setShowStart(false);
  };
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

  const startGame = () => {
    void audioManager.unlock();
    const stage = canvasRef.current?.parentElement;
    if (stage?.requestFullscreen) {
      void stage.requestFullscreen().catch(() => {
        // Alguns navegadores ou modos incorporados não permitem tela cheia.
      });
    }
    beginGame();
  };

  return <main className="game-shell" style={{ '--interface-scale': interfaceScale / 100 } as CSSProperties}>
    <BackgroundMusic active={!showStart && !state.dead} />
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
            <div className="hud-chip timer"><span>DIA / NOITE</span><strong>{state.dayNight === 'night' ? 'NOITE' : 'DIA'}</strong></div>
            <div className="hud-substats">
              <div className="hud-chip compact"><span>DIA</span><strong>{survivalDay}</strong></div>
              <div className="hud-chip kills-chip"><span>☠ MORTOS</span><strong>{state.kills}</strong></div>
            </div>
          </div>
        </div>
      </div>
      {showStart && <div className="start-overlay" role="dialog" aria-label="Iniciar Fíbula Online">
        <div className="start-panel">
          <div className="start-eyebrow">FÍBULA ONLINE</div>
          <h1>{worldReady ? 'Pronto para sobreviver?' : 'Preparando o mundo...'}</h1>
          <p>{worldReady ? 'Sobreviva às noites, aproveite o dia e prepare-se para hordas cada vez maiores.' : 'Preparando o terreno e renderizando o mapa antes de liberar a partida.'}</p>
          <button className="start-fullscreen" type="button" disabled={!worldReady} onClick={startGame}><span aria-hidden="true">⛶</span> {worldReady ? 'INICIAR EM TELA CHEIA' : 'CARREGANDO...'}</button>
          <button className="start-normal" type="button" disabled={!worldReady} onClick={beginGame}>Jogar sem tela cheia</button>
        </div>
      </div>}
      {showHelp && <div className="help-card"><button className="close-help" onClick={() => setShowHelp(false)}>×</button><h3>Como sobreviver</h3><p><b>WASD / setas</b> movem o personagem. <b>1 Guerreiro, 2 Mago, 3 Arqueiro e 4 Druida</b> selecionam a classe, sua aparência, habilidades e arma correspondente. <b>A câmera mantém a visão limitada ao redor do personagem.</b> <b>R</b> liga/desliga o alcance e, no celular, <b>Zoom + / Zoom −</b> aproximam ou afastam a visão. O Druida regenera vida ao acertar ataques e guarda até 7 orbes, que são consumidos automaticamente quando a vida cai abaixo de 40%. <b>Espaço</b> pega/solta o carrinho reparado quando estiver perto. <b>T</b> abre a roda de bandeiras; 1–4 colocam a bandeira na direção correspondente, e T sobre uma bandeira a remove. <b>B</b> abre a mochila e o conteúdo do carrinho. Ao puxar o carrinho, o ataque automático fica desativado.</p></div>}
      {state.dead && <div className="game-over"><div className="skull">✦</div><p className="eyebrow">FIM DE JOGO</p><h2>A névoa venceu.</h2><p>Você resistiu até a onda <b>{state.wave}</b>.</p><div className="summary"><div><span>DIAS</span><b>{survivalDay}</b></div><div><span>NÍVEL</span><b>{state.player.level}</b></div><div><span>SLIMES</span><b>{state.kills}</b></div></div><button className="restart-button" onClick={restart}>↻ Tentar novamente</button></div>}
      {showHelp && <div className="help-backdrop" onClick={() => setShowHelp(false)} />}
      {(flagWheel || flagHotkeyOpen) && <div className="flag-wheel" role="dialog" aria-label="Roda de bandeiras" style={flagWheel ? { left: flagWheel.screenX, top: flagWheel.screenY } : { left: '50%', top: '50%' }}>
        {CONFIG.flags.colors.map(item => <div key={item.id} className={`flag-wheel-option ${item.id} ${flagWheel?.selected === item.id ? 'selected' : ''}`} aria-label={item.label} title={item.label}><span style={{ background: item.color }} /></div>)}
        <div className="flag-wheel-center" aria-hidden="true">×</div>
      </div>}
      {inventoryPanelOpen && !showStart && !state.dead && <div className="inventory-quick-panel" role="dialog" aria-label="Casa, mochila e carrinho">
        <header><strong>INVENTÁRIO</strong><span>B ou Esc fecha</span></header>

        <section>
          <h3>Mochila <small>{state.inventory.length}/{CONFIG.inventory.maxSlots}</small></h3>
          <div className="quick-slot-grid bag">
            {Array.from({ length: CONFIG.inventory.maxSlots }, (_, index) => {
              const item = state.inventory[index];
              return <div key={index} className={item ? 'quick-slot filled' : 'quick-slot'} style={{ position: 'relative' }} aria-label={item ? `${item.itemId} x${item.quantity}` : `Espaço ${index + 1} vazio`}>
                {item ? <><span>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b><button type="button" className="bag-discard-button" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, lineHeight: '16px', borderRadius: 999, background: '#632f35', color: '#fff', border: '1px solid #d98b8b', fontSize: 14 }} onClick={(event) => { event.stopPropagation(); discardBagItem(index); }} aria-label={`Descartar ${item.itemId} x${item.quantity} da mochila`} title="Descartar item">×</button></> : <span className="quick-slot-empty">{index + 1}</span>}
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
                {item ? <button type="button" className="inventory-transfer-slot" disabled={!cartAccessible} onClick={(event) => { event.stopPropagation(); transferCartToBag(index); }} aria-label={`Retirar ${item.itemId} x${item.quantity} do carrinho para a mochila`} title="Retirar para a mochila"><span>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b></button> : <span className="quick-slot-empty">{index + 1}</span>}
              </div>;
            })}
          </div>
        </section>
        {state.house.built && <section className="house-storage-section">
          <h3>Armazém da casa <small>{state.house.inventory.length} tipos</small></h3>
          {state.house.inventory.length > 0 ? <div className="quick-slot-grid house-storage">
            {state.house.inventory.map(item => <button key={item.itemId} type="button" className="quick-slot filled inventory-transfer-slot" disabled={!houseAccessible} onClick={(event) => { event.stopPropagation(); transferHouseToBag(item.itemId); }} aria-label={`Retirar ${item.itemId} x${item.quantity} da casa para a mochila`} title={houseAccessible ? "Retirar para a mochila (até 5 por clique)" : "Aproxime-se da casa para retirar"}>
              <span>{inventoryItemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b>
            </button>)}
          </div> : <p className="house-storage-empty">{state.house.built ? 'A casa está vazia. Use “Guardar tudo” quando quiser armazenar seus itens.' : 'Conclua a construção para usar o armazém.'}</p>}
        </section>}
      </div>}
      {cartDistance <= CONFIG.cart.interactRadius && !state.cart.repaired && <div className="cart-repair-status" role="status">CARRINHO · {state.cart.repairWood}/{CONFIG.cart.repairCost} MADEIRAS</div>}

{!showStart &&             <Controls onInventoryToggle={toggleInventoryPanel} onCartToggle={toggleCart} cartActionVisible={cartActionVisible && !state.dead && !showStart} cartCarried={state.cart.carried} storeToCartVisible={cartAccessible && !state.dead && !showStart} storeToCartDisabled={state.inventory.length === 0} onStoreToCart={storeAllBagToCart} storeToHouseVisible={houseAccessible && !state.dead && !showStart} storeToHouseDisabled={state.inventory.length === 0 && !((state.cart.carried || Math.hypot(state.cart.x - state.house.x, state.cart.y - state.house.y) <= CONFIG.house.interactRadius) && state.cart.inventory.length > 0)} onStoreToHouse={storeAllBagToHouse} buildHouseVisible={houseBuildAccessible && !state.dead && !showStart} buildRefineryVisible={refineryBuildAccessible && !state.dead && !showStart} buildTecelariaVisible={tecelariaBuildAccessible && !state.dead && !showStart} buildCartVisible={cartBuildAccessible && !state.dead && !showStart} onBuildHouse={buildHouse} onBuildRefinery={buildRefinery} onBuildTecelaria={() => engineRef.current?.buildTecelaria()} onBuildCart={buildCart} flagWheelOpen={flagWheel !== null} onLongPress={onJoystickLongPress} onFlagTap={onFlagTap} onWheelMove={onWheelMove} onWheelEnd={onWheelEnd} onMovementStart={closeFlagMenu} onMove={(x, y) => { if (gameStartedRef.current) engineRef.current?.setMove(x, y); }} onRange={toggleRange} onZoom={(delta) => { const maxZoom = window.matchMedia('(pointer: coarse)').matches ? 1.75 : 1.45; zoomRef.current = Math.max(0.8, Math.min(maxZoom, zoomRef.current + delta)); }} onClass={pickClass} classId={state.classId} showRange={state.showRange} weaponLabel={CONFIG.weapons[state.weapon].label} inventoryPanelOpen={inventoryPanelOpen} audioVolume={audioVolume} onAudioVolumeChange={(volume) => { setAudioVolume(volume); audioManager.setVolume(volume); }} interfaceScale={interfaceScale} onInterfaceScaleChange={setInterfaceScale} landscapeMode={landscapeMode} onToggleLandscape={() => { void toggleLandscapeMode(); }} />}
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

function drawCart(ctx: CanvasRenderingContext2D, cart: GameSnapshot['cart'], nearby: boolean, time: number, moving: boolean) {
  const { x, y, angle, repairWood, repaired, carried } = cart;
  // Mantém a regra direcional validada: rodas ocultas à esquerda e no eixo vertical.
  const hasVerticalComponent = Math.abs(Math.sin(angle)) >= 0.15;
  const showWheels = !hasVerticalComponent || Math.cos(angle) >= 0.15;
  const wheelRotation = moving ? time * 8 : 0;
  const vertical = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
  const movingUp = Math.sin(angle) < 0;
  const movingLeft = Math.cos(angle) < 0;
  ctx.save();
  ctx.translate(x, y);

  // Sombra em camadas para assentar o carrinho no terreno e separar a carroceria do chão.
  ctx.fillStyle = 'rgba(12, 19, 14, 0.18)';
  ctx.beginPath(); ctx.ellipse(2, 17, vertical ? 25 : 34, vertical ? 33 : 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(8, 12, 9, 0.24)';
  ctx.beginPath(); ctx.ellipse(3, 20, vertical ? 20 : 29, vertical ? 26 : 10, 0, 0, Math.PI * 2); ctx.fill();

  if (nearby) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath(); ctx.ellipse(0, 2, 38 + pulse * 3, 25 + pulse * 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210, 180, 125, ${0.07 + pulse * 0.06})`; ctx.fill();
    ctx.strokeStyle = `rgba(230, 200, 150, ${0.3 + pulse * 0.35})`; ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Rodas atrás da estrutura: a carroceria cobre a parte interna, criando profundidade.
  if (showWheels) {
    if (vertical) {
      for (const wheelX of [-18, 18]) {
        ctx.save(); ctx.translate(wheelX, 14); ctx.rotate(wheelRotation);
        ctx.fillStyle = '#202522'; ctx.strokeStyle = '#111713'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 9, movingLeft ? -0.12 : 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#aeb5ac'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
        ctx.restore();
      }
    } else {
      for (const wheelX of [-16, 19]) {
        ctx.save(); ctx.translate(wheelX, 7); ctx.rotate(wheelRotation);
        ctx.fillStyle = '#202522'; ctx.strokeStyle = '#111713'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 8.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#aeb5ac'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(4.5, 0); ctx.moveTo(0, -4.5); ctx.lineTo(0, 4.5); ctx.stroke();
        ctx.restore();
      }
    }
  }

  if (vertical) {
    // Estrutura vista de cima: base inferior escura, paredes altas e bordas chanfradas.
    if (repaired) {
      ctx.fillStyle = '#493021';
      ctx.beginPath(); ctx.moveTo(-25, -20); ctx.lineTo(25, -20); ctx.lineTo(21, 20); ctx.lineTo(-21, 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#69452d';
      ctx.beginPath(); ctx.moveTo(-23, -22); ctx.lineTo(23, -22); ctx.lineTo(19, 18); ctx.lineTo(-19, 18); ctx.closePath(); ctx.fill();

      const wood = ctx.createLinearGradient(-20, -20, 20, 16);
      wood.addColorStop(0, '#b9854e'); wood.addColorStop(0.48, '#95643a'); wood.addColorStop(1, '#6e472c');
      ctx.fillStyle = wood;
      ctx.beginPath(); ctx.moveTo(-19, -19); ctx.lineTo(19, -19); ctx.lineTo(16, 13); ctx.lineTo(-16, 13); ctx.closePath(); ctx.fill();

      // Tábuas individuais, com veios discretos e variação de luz.
      ctx.strokeStyle = 'rgba(63, 39, 23, 0.72)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-6, -17); ctx.lineTo(-5, 12); ctx.moveTo(7, -17); ctx.lineTo(6, 12); ctx.stroke();
      ctx.strokeStyle = 'rgba(224, 174, 111, 0.65)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-17, -14); ctx.lineTo(-7, -14); ctx.moveTo(9, -8); ctx.lineTo(16, -8); ctx.moveTo(-15, 5); ctx.lineTo(-9, 5); ctx.stroke();

      // A borda superior recebe luz; a borda inferior fica escura para dar volume.
      ctx.strokeStyle = '#e0b77a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-21, -21); ctx.lineTo(21, -21); ctx.stroke();
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-19, 16); ctx.lineTo(19, 16); ctx.stroke();
      ctx.strokeStyle = '#d0a06a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-22, -20); ctx.lineTo(-19, 17); ctx.moveTo(22, -20); ctx.lineTo(19, 17); ctx.stroke();

      // A extremidade muda de acabamento conforme o sentido, sem virar o desenho inteiro.
      ctx.strokeStyle = movingUp ? '#e0b77a' : '#4a3020'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-17, -19); ctx.lineTo(17, -19); ctx.stroke();
      if (!movingUp) {
        ctx.fillStyle = '#b17d49';
        ctx.beginPath(); ctx.moveTo(-12, -18); ctx.lineTo(12, -18); ctx.lineTo(9, -12); ctx.lineTo(-9, -12); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#d9a96c'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-9, -17); ctx.lineTo(9, -17); ctx.stroke();
      }
    } else {
      // Carrinho avariado: armação de madeira com travessas e rodas sem acabamento.
      ctx.strokeStyle = '#38271c'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-20, 17); ctx.lineTo(-16, -16); ctx.lineTo(16, -16); ctx.lineTo(20, 17); ctx.stroke();
      ctx.strokeStyle = '#9b754d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-21, -17); ctx.lineTo(0, -30); ctx.lineTo(21, -17); ctx.stroke();
      ctx.strokeStyle = '#d0a06a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-18, -16); ctx.lineTo(0, -27); ctx.lineTo(18, -16); ctx.stroke();
    }
  } else {
    // Perfil lateral espelhado: fundo escuro, tábuas com veios e bordas iluminadas.
    ctx.save(); ctx.scale(movingLeft ? -1 : 1, 1);
    ctx.strokeStyle = '#3f2a1c'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-28, -4); ctx.lineTo(22, -4); ctx.lineTo(30, 8); ctx.stroke();
    if (repaired) {
      ctx.fillStyle = '#4b3020'; ctx.fillRect(-25, -25, 47, 27);
      const sideWood = ctx.createLinearGradient(0, -25, 0, 2);
      sideWood.addColorStop(0, '#c18b50'); sideWood.addColorStop(0.45, '#98663a'); sideWood.addColorStop(1, '#694329');
      ctx.fillStyle = sideWood; ctx.fillRect(-23, -24, 42, 23);
      ctx.fillStyle = 'rgba(231, 183, 119, 0.42)'; ctx.fillRect(-22, -23, 40, 2);
      ctx.strokeStyle = '#d8a76b'; ctx.lineWidth = 2; ctx.strokeRect(-23, -24, 42, 23);
      ctx.strokeStyle = '#684326'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -22); ctx.lineTo(-10, -2); ctx.moveTo(4, -22); ctx.lineTo(4, -2); ctx.stroke();
      ctx.strokeStyle = 'rgba(226, 177, 111, 0.65)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-19, -17); ctx.lineTo(-13, -17); ctx.moveTo(7, -10); ctx.lineTo(14, -10); ctx.moveTo(-20, -6); ctx.lineTo(-15, -6); ctx.stroke();
      // Borda superior e encaixes dão leitura de espessura, sem excesso de brilho.
      ctx.fillStyle = '#d1a16a'; ctx.fillRect(-24, -27, 44, 4);
      ctx.fillStyle = '#e0b77a'; ctx.fillRect(-22, -27, 40, 1.5);
      ctx.fillStyle = '#53351f'; ctx.fillRect(-23, -2, 42, 3);
    } else {
      ctx.save(); ctx.rotate(-0.18);
      ctx.strokeStyle = '#9b754d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-22, -18); ctx.lineTo(18, -3); ctx.moveTo(-18, -3); ctx.lineTo(16, -19); ctx.stroke();
      ctx.strokeStyle = '#60432b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-17, 8, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(20, 8, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // Barra de reparo mantida no lugar atual para não alterar a interação.
  if (!repaired) {
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-26, -38, 52, 6);
    ctx.fillStyle = '#d7b17b'; ctx.fillRect(-26, -38, 52 * (repairWood / CONFIG.cart.repairCost), 6);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-26, -38, 52, 6);
  }
  if (carried) {
    ctx.strokeStyle = 'rgba(235,235,235,.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, -3, 36, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(0, -18); ctx.stroke();
  ctx.strokeStyle = '#d7d7d7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-1, 15); ctx.lineTo(-1, -18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1, -17); ctx.lineTo(18, -12); ctx.lineTo(1, -5); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,20,.7)'; ctx.lineWidth = 1; ctx.stroke();
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
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, weapon: WeaponId, classId: ClassId, time: number, swordSwingAngle: number, swordSwingTimer: number, moving: boolean, walkPhase: number, carried: boolean, facingX: number, facingY: number, aimAngle: number, hasTarget: boolean, hasEnemies: boolean, treeChopAngle: number, treeChopTimer: number, rockMineAngle: number, rockMineTimer: number, cottonHarvestAngle: number, cottonHarvestTimer: number) {
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
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, r * .8, r * 1.2, r * .46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.scale(facingScaleX, 1);
  drawLadino(ctx, classId, r, { walking: moving, phase: walkPhase, breath, carry: carried && moving, direction });
  ctx.restore();
  if (weapon === 'espada') {
    const duration = 0.24;
    const progress = swordSwingTimer > 0 ? 1 - swordSwingTimer / duration : 0;
    drawFloatingWeapon(ctx, 'espada', r, {
      time, facingX, moving, hasEnemies, hasTarget, aimAngle,
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
    drawFloatingWeapon(ctx, weapon, r, { time, facingX, moving, hasEnemies, hasTarget, aimAngle, carried, swingTimer: swordSwingTimer, swingAngle: swordSwingAngle });
  }
  if (treeChopTimer > 0) {
    const progress = 1 - treeChopTimer / 0.2;
    const swing = (progress - 0.5) * (Math.PI / 2.25);
    ctx.save(); ctx.scale(facingScaleX, 1); ctx.rotate(treeChopAngle * facingScaleX + swing);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#805333'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(r * 0.55, r * 0.05); ctx.lineTo(r * 1.45, -r * 0.3); ctx.stroke();
    // Cabeça curta e larga, com lâmina em cunha: machadinho para madeira.
    ctx.fillStyle = '#c8d4d9'; ctx.strokeStyle = '#53636b'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(r * 1.16, -r * 0.35); ctx.lineTo(r * 1.2, -r * 0.72);
    ctx.quadraticCurveTo(r * 1.48, -r * 0.82, r * 1.68, -r * 0.61);
    ctx.lineTo(r * 1.61, -r * 0.28); ctx.lineTo(r * 1.34, -r * 0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (rockMineTimer > 0) {
    // Golpe de picareta em arco descendente: de 12h para 3h (pedra à direita)
    // ou de 12h para 9h (pedra à esquerda). Mantém a ferramenta original.
    const progress = 1 - rockMineTimer / 0.22;
    const targetAngle = Math.cos(rockMineAngle) >= 0 ? 0 : -Math.PI;
    const swingAngle = -Math.PI / 2 + (targetAngle + Math.PI / 2) * progress;
    ctx.save(); ctx.scale(facingScaleX, 1); ctx.rotate(swingAngle);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#805333'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(r * 0.55, r * 0.05); ctx.lineTo(r * 1.48, -r * 0.32); ctx.stroke();
    // Cabeça metálica de picareta: ponta estreita de um lado e lâmina oposta.
    ctx.fillStyle = '#aebdc4'; ctx.strokeStyle = '#4d5b62'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(r * 1.02, -r * 0.58); ctx.lineTo(r * 1.28, -r * 0.72);
    ctx.lineTo(r * 1.43, -r * 0.58); ctx.lineTo(r * 1.78, -r * 0.7);
    ctx.lineTo(r * 1.63, -r * 0.48); ctx.lineTo(r * 1.43, -r * 0.47);
    ctx.lineTo(r * 1.2, -r * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e0e7ea'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r * 1.1, -r * 0.57); ctx.lineTo(r * 1.29, -r * 0.66); ctx.stroke();
    ctx.restore();
  }
  if (cottonHarvestTimer > 0) {
    // Foice de mão: cabo curto e lâmina fina em curva para colher algodão.
    const progress = 1 - cottonHarvestTimer / 0.24;
    ctx.save(); ctx.scale(facingScaleX, 1); ctx.rotate(cottonHarvestAngle + (progress - 0.5) * 0.45);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#805333'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(r * 0.58, r * 0.05); ctx.lineTo(r * 1.15, -r * 0.18); ctx.stroke();
    ctx.strokeStyle = '#d5dde0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(r * 1.02, -r * 0.22); ctx.quadraticCurveTo(r * 1.5, -r * 0.65, r * 1.66, -r * 0.3); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}