import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { CONFIG, type ClassId, type WeaponId } from './game/config';
import { GameEngine, type GameSnapshot } from './game/engine';
import Controls from './ui/Controls';

const initial: GameSnapshot = {
  player: { x: 1200, y: 1200, hp: 100, maxHp: 100, level: 0, xp: 0, nextXp: 4, moving: false, facingX: 0, facingY: 1 },
  house: { x: 600, y: 600, woodDelivered: 0, built: false },
  cart: { x: 1800, y: 600, angle: 0, repairWood: 0, repaired: false, carried: false, inventory: [] },
  enemies: [], trees: [], woodDrops: [], inventory: [], xpOrbs: [], healingOrbs: [], shots: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, dayNight: 'day', phaseElapsed: 0, nightNumber: 0, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0, showRange: false, cameraFull: false, dead: false, kills: 0,
};
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
  const zoomRef = useRef(1.6);
  const cameraTransformRef = useRef({ scale: 1, left: 0, top: 0 });
  const flagsRef = useRef<Array<{ colorId: string; color: string; x: number; y: number; attachedToCart?: boolean }>>([]);
  const flagHoldRef = useRef<{ pointerId: number; clientX: number; clientY: number; timer: number | null } | null>(null);
  const [, setFlags] = useState<Array<{ colorId: string; color: string; x: number; y: number; attachedToCart?: boolean }>>([]);
  const [flagWheel, setFlagWheel] = useState<{ pointerId: number; screenX: number; screenY: number; originX: number; originY: number; selected: string | null } | null>(null);
  const flagWheelRef = useRef<{ pointerId: number; screenX: number; screenY: number; originX: number; originY: number; selected: string | null } | null>(null);
  const hordeStatus = `${state.dayNight === 'night' ? 'Noite' : 'Dia'} · ${Math.ceil(CONFIG.dayNight.dayDuration - state.phaseElapsed)}s`;
  const cartDistance = Math.hypot(state.player.x - state.cart.x, state.player.y - state.cart.y);
  const cartAccessible = state.cart.repaired && (state.cart.carried || cartDistance <= CONFIG.cart.interactRadius);
  const cartActionVisible = state.cart.repaired && (state.cart.carried || cartDistance <= CONFIG.cart.interactRadius);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const engine = new GameEngine((next) => setState(next)); engineRef.current = engine;
    engine.start();
    let frame = 0;
    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      ctx.fillStyle = '#18262a'; ctx.fillRect(0, 0, engine.world, engine.world);
      ctx.strokeStyle = 'rgba(160,190,176,0.075)'; ctx.lineWidth = 1;
      for (let x = 0; x <= engine.world; x += CONFIG.map.grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, engine.world); ctx.stroke(); }
      for (let y = 0; y <= engine.world; y += CONFIG.map.grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(engine.world, y); ctx.stroke(); }
      ctx.strokeStyle = '#91a99a'; ctx.lineWidth = CONFIG.map.wall; ctx.strokeRect(CONFIG.map.wall / 2, CONFIG.map.wall / 2, engine.world - CONFIG.map.wall, engine.world - CONFIG.map.wall);
      if (s.showRange && !s.cameraFull) {
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y, CONFIG.weapons[s.weapon].range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(135,205,179,0.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(135,205,179,0.24)'; ctx.lineWidth = 2; ctx.stroke();
      }
      for (const flag of flagsRef.current) {
        if (!flag.attachedToCart) drawFlag(ctx, flag.x, flag.y, flag.color);
      }
      drawHouse(ctx, s.house);
      drawCart(ctx, s.cart, Math.hypot(s.player.x - s.cart.x, s.player.y - s.cart.y) <= CONFIG.cart.interactRadius, s.elapsed);
      for (const flag of flagsRef.current) {
        if (flag.attachedToCart) drawFlag(ctx, s.cart.x, s.cart.y - 34, flag.color);
      }
      for (const tree of s.trees) {
        ctx.save(); ctx.translate(tree.x, tree.y);
        const scale = tree.size === 'small' ? 1.5 : tree.size === 'medium' ? 2.2 : 3;
        ctx.scale(scale, scale);
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
      }
      for (const drop of s.woodDrops) {
        ctx.save(); ctx.translate(drop.x, drop.y);
        ctx.strokeStyle = '#d9b17a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(8, 3); ctx.moveTo(-8, 4); ctx.lineTo(8, -2); ctx.stroke();
        ctx.fillStyle = '#f3dfb5'; ctx.font = '900 10px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(String(drop.amount), 0, -8); ctx.restore();
      }
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
      for (const shot of s.shots) {
        ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
        if (shot.kind === 'arrow') { ctx.strokeStyle = '#f3d59b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(6, -4); ctx.moveTo(12, 0); ctx.lineTo(6, 4); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = s.classId === 'druida' ? '#65e65d' : '#a98cff'; ctx.fill(); if (s.classId === 'druida') { ctx.strokeStyle = '#c6ffad'; ctx.lineWidth = 2; ctx.stroke(); } }
        ctx.restore();
      }
      for (const e of s.enemies) drawSlime(ctx, e.x, e.y, CONFIG.enemy.radius, '#70d78d', '#397e58', e.wobble);
      for (const e of s.dyingEnemies) {
        const progress = Math.min(1, e.deathAge / 0.48);
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.translate(e.x, e.y + progress * CONFIG.enemy.radius * 0.65);
        ctx.scale(1 + progress * 0.38, Math.max(0.06, 1 - progress * 0.92));
        drawSlime(ctx, 0, 0, CONFIG.enemy.radius, '#70d78d', '#397e58', e.wobble);
        ctx.restore();
      }
      const aimTarget = s.enemies
        .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - s.player.x, enemy.y - s.player.y) }))
        .filter(({ distance }) => distance <= CONFIG.weapons[s.weapon].range)
        .sort((a, b) => a.distance - b.distance)[0]?.enemy;
      const aimAngle = aimTarget
        ? Math.atan2(aimTarget.y - s.player.y, aimTarget.x - s.player.x)
        : s.player.facingX < -0.35 ? Math.PI : 0;
      drawPlayer(ctx, s.player.x, s.player.y, s.weapon, s.classId, s.elapsed, s.swordSwingAngle, s.swordSwingTimer, s.player.moving, s.player.facingX, aimAngle, s.treeChopAngle, s.treeChopTimer);
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
      if (s.dayNight === 'night') {
        // Névoa noturna suave: o centro permanece legível e o cenário distante escurece gradualmente.
        const fogRadius = CONFIG.dayNight.visibilityRange * 2.2;
        const fog = ctx.createRadialGradient(s.player.x, s.player.y, 0, s.player.x, s.player.y, fogRadius);
        fog.addColorStop(0, 'rgba(5, 8, 18, 0.025)');
        fog.addColorStop(0.45, 'rgba(5, 8, 18, 0.14)');
        fog.addColorStop(0.78, 'rgba(5, 8, 18, 0.25)');
        fog.addColorStop(1, `rgba(5, 8, 18, ${CONFIG.dayNight.nightOverlayStrength})`);
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, engine.world, engine.world);
      }
      ctx.restore();
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
    return () => { cancelAnimationFrame(frame); engine.stop(); window.removeEventListener('resize', resize); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const engine = engineRef.current; if (!engine) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) closeFlagWheel();
      engine.setKey(k, true);
      if (k === 'c') engine.toggleCamera();
      if (k === '1') engine.setClass('guerreiro');
      if (k === '2') engine.setClass('mago');
      if (k === '3') engine.setClass('arqueiro');
      if (k === '4') engine.setClass('druida');
      if (k === 'r') engine.toggleRange();
      if (k === 'e' && !e.repeat) engine.toggleCart();
    };
    const up = (e: KeyboardEvent) => engine.setKey(e.key, false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const pickClass = (id: ClassId) => engineRef.current?.setClass(id);
  const toggleRange = () => engineRef.current?.toggleRange();
  const toggleCart = () => engineRef.current?.toggleCart();
  const transferBagToCart = (index: number) => engineRef.current?.transferBagToCart(index);
  const transferCartToBag = (index: number) => engineRef.current?.transferCartToBag(index);
  const setWheel = (next: { pointerId: number; screenX: number; screenY: number; originX: number; originY: number; selected: string | null } | null) => {
    flagWheelRef.current = next;
    setFlagWheel(next);
  };
  const closeFlagWheel = () => { if (flagWheelRef.current) setWheel(null); };
  const restart = () => { flagsRef.current = []; setFlags([]); setWheel(null); engineRef.current?.restart(); };
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
    // Sorteia novamente ao iniciar de verdade, não enquanto a tela inicial fica aberta.
    flagsRef.current = []; setFlags([]); setWheel(null);
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
            <div className="hud-meter health-meter"><span>HP</span><div className="bar"><i style={{ width: Math.max(0, state.player.hp / state.player.maxHp * 100) + '%' }} /></div><b>{Math.ceil(state.player.hp)}/{state.player.maxHp}</b></div>
            <div className="hud-meter xp-meter"><span>XP</span><div className="bar xp-bar"><i style={{ width: state.player.xp / state.player.nextXp * 100 + '%' }} /></div><b>{state.player.xp}/{state.player.nextXp}</b></div>
          </div>
        </div>
        <div className="hud-center-stack">
          <div className="hud-chip timer"><span>TEMPO</span><strong>{fmtTime(state.elapsed)}</strong></div>
          <div className="hud-substats">
            <div className="hud-chip compact"><span>ONDA</span><strong>{state.wave}</strong></div>
            <div className="hud-chip kills-chip"><span>☠ MORTOS</span><strong>{state.kills}</strong></div>
          </div>
          <div className="hud-chip compact"><span>DIA / NOITE</span><strong style={{ fontSize: '8px', whiteSpace: 'normal', textAlign: 'center' }}>{hordeStatus}</strong></div>
        </div>
      </div>
      {showStart && <div className="start-overlay" role="dialog" aria-label="Iniciar Fíbula Online">
        <div className="start-panel">
          <div className="start-eyebrow">FÍBULA ONLINE</div>
          <h1>Pronto para sobreviver?</h1>
          <p>Sobreviva às noites, aproveite o dia e prepare-se para hordas cada vez maiores.</p>
          <button className="start-fullscreen" type="button" onClick={startGame}><span aria-hidden="true">⛶</span> INICIAR EM TELA CHEIA</button>
          <button className="start-normal" type="button" onClick={beginGame}>Jogar sem tela cheia</button>
        </div>
      </div>}
      {showHelp && <div className="help-card"><button className="close-help" onClick={() => setShowHelp(false)}>×</button><h3>Como sobreviver</h3><p><b>WASD / setas</b> movem o personagem. <b>1 Guerreiro, 2 Mago, 3 Arqueiro e 4 Druida</b> selecionam a classe, sua aparência, habilidades e arma correspondente. <b>C</b> alterna a câmera, <b>R</b> liga/desliga o alcance e, no celular, <b>Zoom + / Zoom −</b> aproximam ou afastam a visão. O Druida regenera vida ao acertar ataques e guarda até 7 orbes, que são consumidos automaticamente quando a vida cai abaixo de 40%. <b>E</b> pega/solta o carrinho reparado quando estiver perto.</p></div>}
      {state.dead && <div className="game-over"><div className="skull">✦</div><p className="eyebrow">FIM DE JOGO</p><h2>A névoa venceu.</h2><p>Você resistiu até a onda <b>{state.wave}</b>.</p><div className="summary"><div><span>TEMPO</span><b>{fmtTime(state.elapsed)}</b></div><div><span>NÍVEL</span><b>{state.player.level}</b></div><div><span>SLIMES</span><b>{state.kills}</b></div></div><button className="restart-button" onClick={restart}>↻ Tentar novamente</button></div>}
      {showHelp && <div className="help-backdrop" onClick={() => setShowHelp(false)} />}
      {flagWheel && <div className="flag-wheel" role="dialog" aria-label="Roda de bandeiras" style={{ left: flagWheel.screenX, top: flagWheel.screenY }}>
        {CONFIG.flags.colors.map(item => <div key={item.id} className={`flag-wheel-option ${item.id} ${flagWheel.selected === item.id ? 'selected' : ''}`} aria-label={item.label} title={item.label}><span style={{ background: item.color }} /></div>)}
        <div className="flag-wheel-center" aria-hidden="true">×</div>
      </div>}
      {cartDistance <= CONFIG.cart.interactRadius && !state.cart.repaired && <div className="cart-repair-status" role="status">CARRINHO · {state.cart.repairWood}/{CONFIG.cart.repairCost} MADEIRAS</div>}
      {cartAccessible && !state.dead && !showStart && <div className="cart-nearby-inventory" role="group" aria-label="Enviar itens da mochila para o carrinho">
        {Array.from({ length: CONFIG.inventory.maxSlots }, (_, index) => {
          const item = state.inventory[index];
          const itemName = item ? (item.itemId === 'wood' ? 'Madeira' : item.itemId) : 'vazio';
          return <button key={index} type="button" className={item ? 'cart-nearby-slot filled' : 'cart-nearby-slot'} disabled={!item} onClick={() => transferBagToCart(index)} aria-label={item ? `Enviar ${itemName} x${item.quantity} para o carrinho` : `Espaço ${index + 1} vazio`} title={item ? `Enviar ${itemName} x${item.quantity}` : 'Espaço vazio'}>
            {item ? <><span aria-hidden="true">{item.itemId === 'wood' ? '🪵' : '📦'}</span><strong>×{item.quantity}</strong></> : <span className="cart-nearby-slot-number">{index + 1}</span>}
          </button>;
        })}
      </div>}
      {cartActionVisible && <button className="cart-action-button" type="button" onClick={toggleCart}>{state.cart.carried ? 'Soltar carrinho' : 'Pegar carrinho'}</button>}
      <Controls flagWheelOpen={flagWheel !== null} onLongPress={onJoystickLongPress} onFlagTap={onFlagTap} onWheelMove={onWheelMove} onWheelEnd={onWheelEnd} onMovementStart={closeFlagWheel} onMove={(x, y) => engineRef.current?.setMove(x, y)} onRange={toggleRange} onZoom={(delta) => { zoomRef.current = Math.max(0.65, Math.min(1.75, zoomRef.current + delta)); }} onClass={pickClass} classId={state.classId} showRange={state.showRange} weaponLabel={CONFIG.weapons[state.weapon].label} inventory={state.inventory} cart={state.cart} cartAccessible={cartAccessible} onCartToggle={toggleCart} onTransferBagToCart={transferBagToCart} onTransferCartToBag={transferCartToBag} />
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
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, weapon: WeaponId, classId: ClassId, time: number, swordSwingAngle: number, swordSwingTimer: number, moving: boolean, facingX: number, aimAngle: number, treeChopAngle: number, treeChopTimer: number) {
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
    ctx.fillStyle = '#c5d0d3'; ctx.strokeStyle = '#64747a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r * 1.18, -r * 0.48); ctx.lineTo(r * 1.62, -r * 0.62); ctx.lineTo(r * 1.72, -r * 0.27); ctx.lineTo(r * 1.32, -r * 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}