import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { CONFIG, type ClassId, type WeaponId } from './game/config';
import { GameEngine, type GameSnapshot } from './game/engine';
import Controls from './ui/Controls';
import BackgroundMusic from './ui/BackgroundMusic';

const initial: GameSnapshot = {
  player: { x: 1200, y: 1200, hp: 100, maxHp: 100, level: 0, xp: 0, nextXp: 4, moving: false, facingX: 0, facingY: 1 },
  house: { x: 600, y: 600, woodDelivered: 0, built: false, inventory: [] },
  refinery: { x: 3000, y: 3000, woodDelivered: 0, stoneDelivered: 0, built: false, stoneStock: 0, stonesProcessed: 0, bronzeProduced: 0 },
  tecelaria: { x: 1000, y: 3240, bronzeDelivered: 0, woodDelivered: 0, cottonDelivered: 0, stoneDelivered: 0, built: false, cottonStock: 0, cottonProcessed: 0, linenProduced: 0 },
  cart: { x: 1800, y: 600, angle: 0, repairWood: 0, repaired: false, carried: false, inventory: [] },
  enemies: [], trees: [], rocks: [], cottonPlants: [], woodDrops: [], stoneDrops: [], cottonDrops: [], linenDrops: [], bronzeDrops: [], inventory: [], xpOrbs: [], healingOrbs: [], shots: [], explosions: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, dayNight: 'day', phaseElapsed: 0, nightNumber: 0, startedAtNight: false, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0, rockMineAngle: 0, rockMineTimer: 0, cottonHarvestAngle: 0, cottonHarvestTimer: 0, showRange: false, cameraFull: false, dead: false, kills: 0,
};
const itemIcon = (itemId: string) => itemId === 'wood' ? '🪵' : itemId === 'stone' ? '🪨' : itemId === 'bronze' ? '🟤' : itemId === 'cotton' ? '☁️' : itemId === 'linen' ? '🧵' : '📦';
const itemLabel = (itemId: string) => itemId === 'wood' ? 'Madeira' : itemId === 'stone' ? 'Pedra' : itemId === 'bronze' ? 'Bronze' : itemId === 'cotton' ? 'Algodão' : itemId === 'linen' ? 'Linho' : itemId;

const fmtTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return m + ':' + s;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [state, setState] = useState<GameSnapshot>(initial);
  const [showHelp, setShowHelp] = useState(false);
  const [showStart, setShowStart] = useState(true);
  const [worldReady, setWorldReady] = useState(false);
  const gameStartedRef = useRef(false);
  const zoomRef = useRef(0.8);
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
  const hordeStatus = `${state.dayNight === 'night' ? 'Noite' : 'Dia'} · ${Math.ceil(CONFIG.dayNight.dayDuration - state.phaseElapsed)}s`;
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
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const engine = new GameEngine((next) => setState(next)); engineRef.current = engine;
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
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth, h = canvas.clientHeight;
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
      const aimTarget = s.enemies
        .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - s.player.x, enemy.y - s.player.y) }))
        .filter(({ distance }) => distance <= CONFIG.weapons[s.weapon].range)
        .sort((a, b) => a.distance - b.distance)[0]?.enemy;
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
      worldDrawables.push({ depth: s.cart.y + 14, draw: () => drawCart(ctx, s.cart, Math.hypot(s.player.x - s.cart.x, s.player.y - s.cart.y) <= CONFIG.cart.interactRadius, s.elapsed) });
      for (const plant of s.cottonPlants) {
        const scale = plant.size === 'small' ? 0.72 : plant.size === 'medium' ? 1 : 1.3;
        worldDrawables.push({ depth: plant.y + 13 * scale, draw: () => {
          ctx.save(); ctx.translate(plant.x, plant.y); ctx.scale(scale, scale);
          ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 12, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#37683a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(-3, -5); ctx.moveTo(0, 12); ctx.lineTo(8, 1); ctx.moveTo(-1, 7); ctx.lineTo(-10, 0); ctx.stroke();
          ctx.fillStyle = plant.size === 'large' ? '#3f8c4d' : plant.size === 'medium' ? '#4b9957' : '#5ba763';
          for (const leaf of [[-8, 0, -0.5], [8, 1, 0.45], [-2, -6, -0.2]] as const) {
            ctx.save(); ctx.translate(leaf[0], leaf[1]); ctx.rotate(leaf[2]); ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          }
          ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#d9d2c2'; ctx.lineWidth = 1.2;
          const bollCount = plant.size === 'small' ? 1 : plant.size === 'medium' ? 3 : 5;
          for (let i = 0; i < bollCount; i++) {
            const bx = bollCount === 1 ? 0 : -8 + (i % 3) * 8;
            const by = bollCount === 1 ? -8 : -7 + Math.floor(i / 3) * 6;
            ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(bx - 2, by - 1, 2.2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }});
      }
      for (const tree of s.trees) {
        const scale = tree.size === 'small' ? 1.5 : tree.size === 'medium' ? 2.2 : 3;
        worldDrawables.push({ depth: tree.y + 30 * scale, draw: () => {
          ctx.save(); ctx.translate(tree.x, tree.y); ctx.scale(scale, scale);
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 29, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#805333'; ctx.fillRect(-5, -1, 10, 30);
          ctx.fillStyle = '#a9784e'; ctx.fillRect(-2, 1, 2, 26);
          ctx.strokeStyle = '#593820'; ctx.lineWidth = 1.5; ctx.strokeRect(-5, -1, 10, 30);
          ctx.fillStyle = tree.size === 'large' ? '#347548' : tree.size === 'medium' ? '#2d6942' : '#285b3b';
          ctx.strokeStyle = '#173d2a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-20, 2); ctx.lineTo(20, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-17, 10); ctx.lineTo(17, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
          if (tree.size === 'large') { ctx.beginPath(); ctx.moveTo(0, -39); ctx.lineTo(-13, -8); ctx.lineTo(13, -8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
          ctx.restore();
        }});
      }
      for (const rock of s.rocks) {
        const scale = rock.size === 'small' ? 0.72 : rock.size === 'medium' ? 1 : 1.35;
        worldDrawables.push({ depth: rock.y + 12 * scale, draw: () => {
          ctx.save(); ctx.translate(rock.x, rock.y);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath(); ctx.ellipse(2, 10 * scale, 19 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = rock.size === 'large' ? '#777f86' : rock.size === 'medium' ? '#858d94' : '#969da2';
          ctx.strokeStyle = '#454d53'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-17 * scale, 3 * scale); ctx.lineTo(-14 * scale, -9 * scale);
          ctx.lineTo(-4 * scale, -17 * scale); ctx.lineTo(9 * scale, -15 * scale);
          ctx.lineTo(18 * scale, -5 * scale); ctx.lineTo(16 * scale, 7 * scale);
          ctx.lineTo(5 * scale, 12 * scale); ctx.lineTo(-9 * scale, 10 * scale);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(220,226,230,0.42)';
          ctx.beginPath(); ctx.moveTo(-14 * scale, -8 * scale); ctx.lineTo(-4 * scale, -17 * scale); ctx.lineTo(9 * scale, -15 * scale); ctx.lineTo(2 * scale, -6 * scale); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(55,62,67,0.6)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-4 * scale, -2 * scale); ctx.lineTo(2 * scale, 3 * scale); ctx.lineTo(8 * scale, -1 * scale); ctx.stroke();
          ctx.restore();
        }});
      }
      for (const drop of s.cottonDrops) {
        worldDrawables.push({ depth: drop.y + 5, draw: () => {
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#c8c3b6'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(-3, 1, 4, 0, Math.PI * 2); ctx.arc(2, -2, 4, 0, Math.PI * 2); ctx.arc(4, 2, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
        worldDrawables.push({ depth: drop.y + 5, draw: () => {
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.fillStyle = '#9ba4aa'; ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-3, -4); ctx.lineTo(2, -5); ctx.lineTo(6, -1); ctx.lineTo(4, 4); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
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
        worldDrawables.push({ depth: drop.y + 4, draw: () => {
          ctx.save(); ctx.translate(drop.x, drop.y);
          ctx.strokeStyle = '#d9b17a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(8, 3); ctx.moveTo(-8, 4); ctx.lineTo(8, -2); ctx.stroke();
          ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(drop.amount), 0, -8); ctx.restore();
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
      worldDrawables.push({ depth: s.player.y + CONFIG.player.radius * 0.8, draw: () => drawPlayer(ctx, s.player.x, s.player.y, s.weapon, s.classId, s.elapsed, s.swordSwingAngle, s.swordSwingTimer, s.player.moving, s.player.facingX, aimAngle, s.treeChopAngle, s.treeChopTimer, s.rockMineAngle, s.rockMineTimer, s.cottonHarvestAngle, s.cottonHarvestTimer) });
      worldDrawables.sort((a, b) => a.depth - b.depth);
      for (const drawable of worldDrawables) drawable.draw();
      for (const damage of s.floatingDamage) {
        const progress = Math.min(1, damage.age / damage.duration);
        const scale = 0.62 + Math.min(1, progress / 0.28) * 0.42;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.translate(damage.x, damage.y - progress * 34);
        ctx.scale(scale, scale);
        ctx.font = '900 17px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(8, 12, 14, 0.88)';
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
      // Neblina e vinheta são renderizadas em um overlay reutilizado a 12,5% da resolução para testar o custo de renderização.
      if (darkness > 0.01 && octx) {
        const overlayWidth = Math.ceil(w * overlayScale);
        const overlayHeight = Math.ceil(h * overlayScale);
        if (overlay.width !== overlayWidth || overlay.height !== overlayHeight) {
          overlay.width = overlayWidth;
          overlay.height = overlayHeight;
        }
        octx.setTransform(1, 0, 0, 1, 0, 0);

        // Reutiliza a textura da neblina; só a recria se tamanho, escala ou configuração mudarem.
        const fogRadius = CONFIG.dayNight.visibilityRange * 2.2;
        const fogTextureWidth = overlay.width * 2;
        const fogTextureHeight = overlay.height * 2;
        const nextFogTextureKey = `${fogTextureWidth}x${fogTextureHeight}:${scale}:${fogRadius}:${Math.min(0.94, CONFIG.dayNight.nightOverlayStrength)}`;
        if (fogTextureCtx && fogTextureKey !== nextFogTextureKey) {
          fogTexture.width = fogTextureWidth;
          fogTexture.height = fogTextureHeight;
          const fogCenterX = fogTextureWidth / 2;
          const fogCenterY = fogTextureHeight / 2;
          const fog = fogTextureCtx.createRadialGradient(
            fogCenterX, fogCenterY, 0,
            fogCenterX, fogCenterY, fogRadius * scale * overlayScale,
          );
          fog.addColorStop(0, 'rgba(5, 8, 18, 0.24)');
          fog.addColorStop(0.45, 'rgba(5, 8, 18, 0.5)');
          fog.addColorStop(0.78, 'rgba(5, 8, 18, 0.75)');
          fog.addColorStop(1, `rgba(5, 8, 18, ${Math.min(0.94, CONFIG.dayNight.nightOverlayStrength)})`);
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
          vignette.addColorStop(0.35, 'rgba(3, 5, 13, 0.08)');
          vignette.addColorStop(0.6, 'rgba(3, 5, 13, 0.28)');
          vignette.addColorStop(0.82, 'rgba(3, 5, 13, 0.58)');
          vignette.addColorStop(1, 'rgba(3, 5, 13, 0.78)');
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
  const startGame = () => {
    const stage = canvasRef.current?.parentElement;
    if (stage?.requestFullscreen) {
      void stage.requestFullscreen().catch(() => {
        // Alguns navegadores ou modos incorporados não permitem tela cheia.
      });
    }
    beginGame();
  };

  return <main className="game-shell">
    <BackgroundMusic active={!showStart && !state.dead} />
    <header className="topbar">
      <div className="brand-mark">F<span>Í</span>BULA</div>
      <div className="subtitle">ONLINE <i /> SOBREVIVÊNCIA</div>
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
        </div>
        <div className="hud-center-stack">
          <div className="hud-chip timer"><span>TEMPO</span><strong>{fmtTime(state.elapsed)}</strong></div>
          <div className="hud-substats">
            <div className="hud-chip compact"><span>DIA</span><strong>{survivalDay}</strong></div>
            <div className="hud-chip kills-chip"><span>☠ MORTOS</span><strong>{state.kills}</strong></div>
          </div>
          <div className="hud-chip compact"><span>DIA / NOITE</span><strong style={{ fontSize: '8px', whiteSpace: 'normal', textAlign: 'center' }}>{hordeStatus}</strong></div>
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
      {state.dead && <div className="game-over"><div className="skull">✦</div><p className="eyebrow">FIM DE JOGO</p><h2>A névoa venceu.</h2><p>Você resistiu até a onda <b>{state.wave}</b>.</p><div className="summary"><div><span>TEMPO</span><b>{fmtTime(state.elapsed)}</b></div><div><span>NÍVEL</span><b>{state.player.level}</b></div><div><span>SLIMES</span><b>{state.kills}</b></div></div><button className="restart-button" onClick={restart}>↻ Tentar novamente</button></div>}
      {showHelp && <div className="help-backdrop" onClick={() => setShowHelp(false)} />}
      {(flagWheel || flagHotkeyOpen) && <div className="flag-wheel" role="dialog" aria-label="Roda de bandeiras" style={flagWheel ? { left: flagWheel.screenX, top: flagWheel.screenY } : { left: '50%', top: '50%' }}>
        {CONFIG.flags.colors.map(item => <div key={item.id} className={`flag-wheel-option ${item.id} ${flagWheel?.selected === item.id ? 'selected' : ''}`} aria-label={item.label} title={item.label}><span style={{ background: item.color }} /></div>)}
        <div className="flag-wheel-center" aria-hidden="true">×</div>
      </div>}
      {inventoryPanelOpen && !showStart && !state.dead && <div className="inventory-quick-panel" role="dialog" aria-label="Casa, mochila e carrinho">
        <header><strong>INVENTÁRIO</strong><span>B ou Esc fecha</span></header>
        <section className="house-construction-section">
          <h3>Construção da casa <small>{state.house.built ? 'CONCLUÍDA' : `${Math.floor(state.house.woodDelivered / CONFIG.house.buildCost * 100)}% · ${state.house.woodDelivered}/${CONFIG.house.buildCost} madeiras`}</small></h3>
          {!state.house.built && <div className="house-progress-track" role="progressbar" aria-label="Progresso da construção da casa" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(state.house.woodDelivered / CONFIG.house.buildCost * 100)}><span style={{ width: `${Math.floor(state.house.woodDelivered / CONFIG.house.buildCost * 100)}%` }} /></div>}
        </section>
        <section className="house-construction-section refinery-construction-section">
          <h3>Construção da tecelaria <small>{state.tecelaria.built ? `CONCLUÍDA · Algodão ${state.tecelaria.cottonStock}/${CONFIG.tecelaria.cottonCapacity} · Tentativas ${state.tecelaria.cottonProcessed} · Linho ${state.tecelaria.linenProduced}` : `Bronze ${state.tecelaria.bronzeDelivered}/${CONFIG.tecelaria.buildCostBronze} · Madeira ${state.tecelaria.woodDelivered}/${CONFIG.tecelaria.buildCostWood} · Algodão ${state.tecelaria.cottonDelivered}/${CONFIG.tecelaria.buildCostCotton} · Pedra ${state.tecelaria.stoneDelivered}/${CONFIG.tecelaria.buildCostStone}`}</small></h3>
          {!state.tecelaria.built ? <div className="house-progress-track" role="progressbar" aria-label="Progresso da construção da tecelaria" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(Math.min(state.tecelaria.bronzeDelivered / CONFIG.tecelaria.buildCostBronze, state.tecelaria.woodDelivered / CONFIG.tecelaria.buildCostWood, state.tecelaria.cottonDelivered / CONFIG.tecelaria.buildCostCotton, state.tecelaria.stoneDelivered / CONFIG.tecelaria.buildCostStone) * 100)}><span style={{ width: `${Math.floor(Math.min(state.tecelaria.bronzeDelivered / CONFIG.tecelaria.buildCostBronze, state.tecelaria.woodDelivered / CONFIG.tecelaria.buildCostWood, state.tecelaria.cottonDelivered / CONFIG.tecelaria.buildCostCotton, state.tecelaria.stoneDelivered / CONFIG.tecelaria.buildCostStone) * 100)}%` }} /></div> : <p>Processamento automático: 1 algodão a cada {CONFIG.tecelaria.processInterval} segundos · {Math.round(CONFIG.tecelaria.linenChance * 100)}% de chance de linho por tentativa.</p>}
        </section>
        <section className="house-construction-section refinery-construction-section">
          <h3>Construção da refinaria <small>{state.refinery.built ? `CONCLUÍDA · Estoque ${state.refinery.stoneStock}/${CONFIG.refinery.stoneCapacity} pedras · Processadas ${state.refinery.stonesProcessed} · Bronze ${state.refinery.bronzeProduced}` : `Madeira ${state.refinery.woodDelivered}/${CONFIG.refinery.buildCostWood} · Pedra ${state.refinery.stoneDelivered}/${CONFIG.refinery.buildCostStone}`}</small></h3>
          {!state.refinery.built ? <div className="house-progress-track" role="progressbar" aria-label="Progresso da construção da refinaria" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(Math.min(state.refinery.woodDelivered / CONFIG.refinery.buildCostWood, state.refinery.stoneDelivered / CONFIG.refinery.buildCostStone) * 100)}><span style={{ width: `${Math.floor(Math.min(state.refinery.woodDelivered / CONFIG.refinery.buildCostWood, state.refinery.stoneDelivered / CONFIG.refinery.buildCostStone) * 100)}%` }} /></div> : <><div className="quick-slot-grid bag" aria-label="Estoque de pedras da refinaria">{Array.from({ length: 2 }, (_, index) => { const quantity = Math.max(0, Math.min(CONFIG.refinery.stoneSlotCapacity, state.refinery.stoneStock - index * CONFIG.refinery.stoneSlotCapacity)); return <div key={index} className={quantity > 0 ? 'quick-slot filled' : 'quick-slot'} aria-label={`Slot ${index + 1}: ${quantity} de 5 pedras`}><span>{quantity > 0 ? '🪨' : '—'}</span><small>Pedra</small><b>{quantity}/5</b></div>; })}</div><p>Processamento automático: 1 pedra a cada 2 segundos · 2% de chance de bronze por tentativa.</p></>}
        </section>
        <section>
          <h3>Mochila <small>{state.inventory.length}/{CONFIG.inventory.maxSlots}</small></h3>
          <div className="quick-slot-grid bag">
            {Array.from({ length: CONFIG.inventory.maxSlots }, (_, index) => {
              const item = state.inventory[index];
              return <div key={index} className={item ? 'quick-slot filled' : 'quick-slot'} style={{ position: 'relative' }} aria-label={item ? `${item.itemId} x${item.quantity}` : `Espaço ${index + 1} vazio`}>
                {item ? <><span>{itemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b><button type="button" className="bag-discard-button" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, lineHeight: '16px', borderRadius: 999, background: '#632f35', color: '#fff', border: '1px solid #d98b8b', fontSize: 14 }} onClick={(event) => { event.stopPropagation(); discardBagItem(index); }} aria-label={`Descartar ${item.itemId} x${item.quantity} da mochila`} title="Descartar item">×</button></> : <span className="quick-slot-empty">{index + 1}</span>}
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
                {item ? <button type="button" className="inventory-transfer-slot" disabled={!cartAccessible} onClick={(event) => { event.stopPropagation(); transferCartToBag(index); }} aria-label={`Retirar ${item.itemId} x${item.quantity} do carrinho para a mochila`} title="Retirar para a mochila"><span>{itemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b></button> : <span className="quick-slot-empty">{index + 1}</span>}
              </div>;
            })}
          </div>
        </section>
        <section className="house-storage-section">
          <h3>Armazém da casa <small>{state.house.built ? `${state.house.inventory.length} tipos` : 'INDISPONÍVEL ATÉ CONCLUIR'}</small></h3>
          {state.house.inventory.length > 0 ? <div className="quick-slot-grid house-storage">
            {state.house.inventory.map(item => <button key={item.itemId} type="button" className="quick-slot filled inventory-transfer-slot" disabled={!houseAccessible} onClick={(event) => { event.stopPropagation(); transferHouseToBag(item.itemId); }} aria-label={`Retirar ${item.itemId} x${item.quantity} da casa para a mochila`} title={houseAccessible ? "Retirar para a mochila (até 5 por clique)" : "Aproxime-se da casa para retirar"}>
              <span>{itemIcon(item.itemId)}</span><small>{itemLabel(item.itemId)}</small><b>×{item.quantity}</b>
            </button>)}
          </div> : <p className="house-storage-empty">{state.house.built ? 'A casa está vazia. Use “Guardar tudo” quando quiser armazenar seus itens.' : 'Conclua a construção para usar o armazém.'}</p>}
        </section>
      </div>}
      {cartDistance <= CONFIG.cart.interactRadius && !state.cart.repaired && <div className="cart-repair-status" role="status">CARRINHO · {state.cart.repairWood}/{CONFIG.cart.repairCost} MADEIRAS</div>}
      {(cartAccessible || houseAccessible || houseBuildAccessible || refineryBuildAccessible || tecelariaBuildAccessible || cartBuildAccessible) && <div className="desktop-nearby-storage-actions">
        {cartActionVisible && <button className="store-all-button" type="button" onClick={toggleCart}>{state.cart.carried ? 'Soltar carrinho' : 'Pegar carrinho'}</button>}
        {cartAccessible && <button className="store-all-button" type="button" disabled={state.inventory.length === 0} onClick={storeAllBagToCart}>Guardar tudo no carrinho</button>}
        {houseAccessible && <button className="store-all-button" type="button" disabled={state.inventory.length === 0 && !((state.cart.carried || Math.hypot(state.cart.x - state.house.x, state.cart.y - state.house.y) <= CONFIG.house.interactRadius) && state.cart.inventory.length > 0)} onClick={storeAllBagToHouse}>Guardar tudo na casa</button>}
        {houseBuildAccessible && <button className="store-all-button" type="button" onClick={buildHouse}>Construir casa</button>}
        {refineryBuildAccessible && <button className="store-all-button" type="button" onClick={buildRefinery}>Construir refinaria</button>}
        {tecelariaBuildAccessible && <button className="store-all-button" type="button" onClick={() => engineRef.current?.buildTecelaria()}>Construir tecelaria</button>}
        {cartBuildAccessible && <button className="store-all-button" type="button" onClick={buildCart}>Construir carrinho</button>}
      </div>}
            <Controls onInventoryToggle={toggleInventoryPanel} onCartToggle={toggleCart} cartActionVisible={cartActionVisible && !state.dead && !showStart} cartCarried={state.cart.carried} storeToCartVisible={cartAccessible && !state.dead && !showStart} storeToCartDisabled={state.inventory.length === 0} onStoreToCart={storeAllBagToCart} storeToHouseVisible={houseAccessible && !state.dead && !showStart} storeToHouseDisabled={state.inventory.length === 0 && !((state.cart.carried || Math.hypot(state.cart.x - state.house.x, state.cart.y - state.house.y) <= CONFIG.house.interactRadius) && state.cart.inventory.length > 0)} onStoreToHouse={storeAllBagToHouse} buildHouseVisible={houseBuildAccessible && !state.dead && !showStart} buildRefineryVisible={refineryBuildAccessible && !state.dead && !showStart} buildTecelariaVisible={tecelariaBuildAccessible && !state.dead && !showStart} buildCartVisible={cartBuildAccessible && !state.dead && !showStart} onBuildHouse={buildHouse} onBuildRefinery={buildRefinery} onBuildTecelaria={() => engineRef.current?.buildTecelaria()} onBuildCart={buildCart} flagWheelOpen={flagWheel !== null} onLongPress={onJoystickLongPress} onFlagTap={onFlagTap} onWheelMove={onWheelMove} onWheelEnd={onWheelEnd} onMovementStart={closeFlagMenu} onMove={(x, y) => { if (gameStartedRef.current) engineRef.current?.setMove(x, y); }} onRange={toggleRange} onZoom={(delta) => { zoomRef.current = Math.max(0.8, Math.min(1.3, zoomRef.current + delta)); }} onClass={pickClass} classId={state.classId} showRange={state.showRange} weaponLabel={CONFIG.weapons[state.weapon].label} />
    </section>

  </main>;
}

function drawHouse(ctx: CanvasRenderingContext2D, house: GameSnapshot['house']) {
  const { x, y, woodDelivered, built } = house;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, 20, 38, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (built) {
    ctx.fillStyle = '#755038'; ctx.fillRect(-28, -10, 56, 38);
    ctx.strokeStyle = '#38271d'; ctx.lineWidth = 3; ctx.strokeRect(-28, -10, 56, 38);
    ctx.fillStyle = '#503323'; ctx.beginPath(); ctx.moveTo(-36, -10); ctx.lineTo(0, -38); ctx.lineTo(36, -10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2b211b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#38271d'; ctx.fillRect(-7, 7, 14, 21);
    ctx.fillStyle = '#b6d8ce'; ctx.fillRect(-21, 0, 10, 10); ctx.fillRect(11, 0, 10, 10);
    ctx.strokeStyle = '#38271d'; ctx.lineWidth = 2; ctx.strokeRect(-21, 0, 10, 10); ctx.strokeRect(11, 0, 10, 10);
  } else {
    ctx.strokeStyle = '#8d6b48'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-29, 19); ctx.lineTo(-29, -10); ctx.lineTo(0, -27); ctx.lineTo(29, -10); ctx.lineTo(29, 19); ctx.stroke();
    ctx.strokeStyle = '#b28a59'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-24, 15); ctx.lineTo(24, 15); ctx.moveTo(-20, 4); ctx.lineTo(20, 4); ctx.moveTo(-15, -6); ctx.lineTo(15, -6); ctx.stroke();
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-36, -48, 72, 7);
    ctx.fillStyle = '#8fceaa'; ctx.fillRect(-36, -48, 72 * (woodDelivered / CONFIG.house.buildCost), 7);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-36, -48, 72, 7);
  }
  ctx.restore();
}

function drawRefinery(ctx: CanvasRenderingContext2D, refinery: GameSnapshot['refinery']) {
  const { x, y, woodDelivered, stoneDelivered, built } = refinery;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 20, 42, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = built ? '#656d72' : '#4b5559'; ctx.strokeStyle = '#293438'; ctx.lineWidth = 3;
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
  ctx.fillStyle = built ? '#6f624d' : '#51483a'; ctx.strokeStyle = '#292820'; ctx.lineWidth = 3;
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

function drawCart(ctx: CanvasRenderingContext2D, cart: GameSnapshot['cart'], nearby: boolean, time: number) {
  const { x, y, angle, repairWood, repaired, carried } = cart;
  ctx.save();
  ctx.translate(x, y);
  if (nearby) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath(); ctx.ellipse(0, 2, 38 + pulse * 3, 25 + pulse * 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210, 180, 125, ${0.07 + pulse * 0.06})`; ctx.fill();
    ctx.strokeStyle = `rgba(230, 200, 150, ${0.3 + pulse * 0.35})`; ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Orientação lateral binária: espelha o desenho, sem girar na diagonal.
  ctx.scale(angle > Math.PI / 2 ? -1 : 1, 1);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 14, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4a3424'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-27, -5); ctx.lineTo(22, -5); ctx.lineTo(30, 8); ctx.stroke();
  if (repaired) {
    ctx.fillStyle = '#8b6039'; ctx.fillRect(-23, -23, 42, 22);
    ctx.strokeStyle = '#d0a06a'; ctx.lineWidth = 2; ctx.strokeRect(-23, -23, 42, 22);
    ctx.strokeStyle = '#4a3424'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-19, -20); ctx.lineTo(-19, -3); ctx.moveTo(-5, -20); ctx.lineTo(-5, -3); ctx.moveTo(9, -20); ctx.lineTo(9, -3); ctx.stroke();
    for (const wheelX of [-17, 20]) {
      ctx.beginPath(); ctx.arc(wheelX, 8, 7, 0, Math.PI * 2); ctx.fillStyle = '#282a29'; ctx.fill();
      ctx.strokeStyle = '#b6b8b4'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wheelX - 4, 8); ctx.lineTo(wheelX + 4, 8); ctx.moveTo(wheelX, 4); ctx.lineTo(wheelX, 12); ctx.stroke();
    }
  } else {
    ctx.save(); ctx.rotate(-0.18);
    ctx.strokeStyle = '#9b754d'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-22, -18); ctx.lineTo(18, -3); ctx.moveTo(-18, -3); ctx.lineTo(16, -19); ctx.stroke();
    ctx.strokeStyle = '#60432b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-17, 8, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(20, 8, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
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
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, weapon: WeaponId, classId: ClassId, time: number, swordSwingAngle: number, swordSwingTimer: number, moving: boolean, facingX: number, aimAngle: number, treeChopAngle: number, treeChopTimer: number, rockMineAngle: number, rockMineTimer: number, cottonHarvestAngle: number, cottonHarvestTimer: number) {
  const r = CONFIG.player.radius;
  const breath = Math.sin(time * 2.6);
  const bob = moving ? Math.sin(time * 10) * 1.8 : breath * 0.65;
  // Mantém a cabeça sempre para cima: a arte é virada horizontalmente, nunca girada 180°.
  const facingRotation = 0;
  const facingScaleX = facingX < -0.35 ? -1 : 1;
  ctx.save(); ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, r * .8, r * 1.2, r * .46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(facingScaleX, 1);
  if (!moving) ctx.scale(1 + breath * 0.012, 1 - breath * 0.018);
  ctx.strokeStyle = '#a7c8c4'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * .45, r * .48); ctx.lineTo(-r * .65, r * .94); ctx.moveTo(r * .45, r * .48); ctx.lineTo(r * .65, r * .94); ctx.stroke();
  const classColors: Record<ClassId, { body: string; outline: string; hood: string; hoodOutline: string }> = {
    guerreiro: { body: '#d98b76', outline: '#ffd0b9', hood: '#68413d', hoodOutline: '#e5a18d' },
    mago: { body: '#9c8be8', outline: '#ded4ff', hood: '#463b78', hoodOutline: '#b7a7ff' },
    arqueiro: { body: '#d7b66e', outline: '#fff0b7', hood: '#66502c', hoodOutline: '#e8ce8a' },
    druida: { body: '#82df83', outline: '#c9ffc2', hood: '#315e3d', hoodOutline: '#a9ed9e' },
  };
  const appearance = classColors[classId];
  // O corpo também muda de silhueta por classe; não depende da arma equipada.
  ctx.beginPath();
  if (classId === 'guerreiro') {
    ctx.moveTo(-r, r * .2); ctx.lineTo(-r * .9, -r * .5); ctx.lineTo(-r * .35, -r * .95);
    ctx.lineTo(r * .35, -r * .95); ctx.lineTo(r * .9, -r * .5); ctx.lineTo(r, r * .2);
    ctx.quadraticCurveTo(0, r * .95, -r, r * .2);
  } else if (classId === 'mago') {
    ctx.moveTo(-r * .9, r * .25); ctx.quadraticCurveTo(-r * 1.3, -r * .8, 0, -r * .85);
    ctx.quadraticCurveTo(r * 1.3, -r * .8, r * .9, r * .25);
    ctx.quadraticCurveTo(r * .6, r * .95, 0, r * .68); ctx.quadraticCurveTo(-r * .6, r * .95, -r * .9, r * .25);
  } else if (classId === 'arqueiro') {
    ctx.moveTo(-r * .95, r * .3); ctx.quadraticCurveTo(-r * .8, -r * .95, 0, -r * .72);
    ctx.quadraticCurveTo(r * .8, -r * .95, r * .95, r * .3);
    ctx.lineTo(r * .55, r * .75); ctx.lineTo(-r * .55, r * .75); ctx.closePath();
  } else {
    ctx.moveTo(-r, r * .2); ctx.quadraticCurveTo(-r * 1.2, -r * .75, 0, -r);
    ctx.quadraticCurveTo(r * 1.2, -r * .75, r, r * .2); ctx.quadraticCurveTo(r * .8, r * .82, 0, r * .72);
    ctx.quadraticCurveTo(-r * .8, r * .82, -r, r * .2);
  }
  ctx.fillStyle = appearance.body; ctx.fill(); ctx.strokeStyle = appearance.outline; ctx.lineWidth = 2; ctx.stroke();
  // Silhueta própria por classe: trocar de classe muda o personagem, não só a arma.
  ctx.fillStyle = appearance.hood; ctx.strokeStyle = appearance.hoodOutline; ctx.lineWidth = 2;
  ctx.beginPath();
  if (classId === 'guerreiro') {
    ctx.moveTo(-r * .95, -r * .35); ctx.lineTo(-r * .82, -r * .95); ctx.lineTo(-r * .35, -r * 1.2);
    ctx.lineTo(r * .35, -r * 1.2); ctx.lineTo(r * .82, -r * .95); ctx.lineTo(r * .95, -r * .35);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#f2d0a7'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-r * .48, -r * .48); ctx.lineTo(r * .48, -r * .48); ctx.stroke();
  } else if (classId === 'mago') {
    ctx.moveTo(-r * 1.05, -r * .35); ctx.lineTo(-r * .55, -r * 1.05); ctx.lineTo(r * .08, -r * 1.75);
    ctx.lineTo(r * .48, -r * .95); ctx.lineTo(r * 1.05, -r * .35); ctx.quadraticCurveTo(0, -r * .72, -r * 1.05, -r * .35);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (classId === 'arqueiro') {
    ctx.moveTo(-r * 1.12, -r * .35); ctx.lineTo(-r * .72, -r * 1.18); ctx.lineTo(r * .22, -r * 1.32);
    ctx.lineTo(r * 1.08, -r * .38); ctx.quadraticCurveTo(0, -r * .75, -r * 1.12, -r * .35);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e9d39a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r * 1.12); ctx.lineTo(0, -r * .48); ctx.stroke();
  } else {
    // Coroa de folhas exclusiva do Druida.
    ctx.moveTo(-r * 1.05, -r * .35); ctx.lineTo(-r * .78, -r * .92); ctx.lineTo(-r * .42, -r * .62);
    ctx.lineTo(-r * .12, -r * 1.25); ctx.lineTo(r * .18, -r * .65); ctx.lineTo(r * .62, -r * 1.02);
    ctx.lineTo(r * 1.05, -r * .35); ctx.quadraticCurveTo(0, -r * .72, -r * 1.05, -r * .35);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#10232a'; ctx.beginPath(); ctx.ellipse(-r * .3, -r * .03, r * .1, r * .17, 0, 0, Math.PI * 2); ctx.ellipse(r * .3, -r * .03, r * .1, r * .17, 0, 0, Math.PI * 2); ctx.fill();
  // Identificador de classe visível durante o jogo para confirmar imediatamente a troca.
  const classLabels: Record<ClassId, string> = { guerreiro: 'GUERREIRO', mago: 'MAGO', arqueiro: 'ARQUEIRO', druida: 'DRUIDA' };
  ctx.save(); ctx.rotate(-facingRotation);
  ctx.font = '900 7px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = appearance.outline; ctx.fillText(classLabels[classId], 0, -r * 2.45);
  ctx.restore();
  if (weapon === 'espada') {
    const duration = 0.24;
    const progress = swordSwingTimer > 0 ? 1 - swordSwingTimer / duration : 0;
    const angle = swordSwingTimer > 0 ? swordSwingAngle - facingRotation + (progress - 0.5) * 1.55 : aimAngle;
    ctx.save(); ctx.scale(facingScaleX, 1); ctx.rotate(angle);
    ctx.strokeStyle = '#dce8ed'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * .68, r * .1); ctx.lineTo(r * 1.25, -r * .08); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(r * 1.18, -r * .12); ctx.lineTo(r * 2.05, -r * .38); ctx.stroke();
    ctx.restore();
    if (swordSwingTimer > 0) {
      ctx.save();
      ctx.scale(facingScaleX, 1);
      ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.9;
      ctx.strokeStyle = '#d8f5ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, CONFIG.weapons.espada.range, swordSwingAngle - facingRotation - Math.PI * 0.31, swordSwingAngle - facingRotation + Math.PI * 0.31); ctx.stroke();
      ctx.restore();
    }
  } else {
    // Cancela o espelhamento horizontal do personagem antes de aplicar o ângulo mundial da mira.
    ctx.save(); ctx.scale(facingScaleX, 1); ctx.rotate(aimAngle);
    const isDruidStaff = weapon === 'bastao';
    ctx.strokeStyle = isDruidStaff ? '#8b623d' : weapon === 'cajado' ? '#c0a4ff' : '#e8c68e'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(r * .68, r * .1); ctx.lineTo(r * 1.35, -r * .25); ctx.stroke();
    if (weapon === 'cajado' || isDruidStaff) {
      ctx.beginPath(); ctx.arc(r * 1.4, -r * .35, 5, 0, Math.PI * 2); ctx.fillStyle = isDruidStaff ? '#7ee66e' : '#bba0ff'; ctx.fill();
      if (isDruidStaff) {
        ctx.strokeStyle = '#4a9b48'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(r * 1.36, -r * .36); ctx.lineTo(r * 1.15, -r * .65); ctx.moveTo(r * 1.42, -r * .36); ctx.lineTo(r * 1.66, -r * .61); ctx.stroke();
        ctx.fillStyle = '#a5f58d'; ctx.beginPath(); ctx.ellipse(r * 1.13, -r * .67, 3, 5, -.5, 0, Math.PI * 2); ctx.ellipse(r * 1.68, -r * .63, 3, 5, .5, 0, Math.PI * 2); ctx.fill();
      }
    } else { ctx.beginPath(); ctx.arc(r * 1.25, -r * .3, 7, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
    ctx.restore();
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