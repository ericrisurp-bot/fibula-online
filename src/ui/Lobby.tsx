import { useEffect, useRef, useState } from 'react';
import { drawLadino } from '../game/ladino';
import './Lobby.css';

type LobbyObjectId = 'bed' | 'flower' | 'stove' | 'mannequin' | 'anvil' | 'sewing' | 'wardrobe' | 'chest' | 'door' | 'window';
type LobbyObject = { id: LobbyObjectId; label: string; x: number; y: number; radius: number; description: string };
type Player = { x: number; y: number; fx: number; fy: number; phase: number };

const OBJECTS: LobbyObject[] = [
  { id: 'bed', label: 'Cama', x: 145, y: 175, radius: 62, description: 'Um cantinho para descansar. A cama é apenas decoração.' },
  { id: 'flower', label: 'Criado-mudo', x: 252, y: 176, radius: 30, description: 'Uma margarida para deixar a casa mais acolhedora.' },
  { id: 'stove', label: 'Fogão', x: 355, y: 168, radius: 42, description: 'No futuro, você poderá preparar guisados e sopas para receber buffs durante a partida.' },
  { id: 'mannequin', label: 'Manequim', x: 360, y: 330, radius: 34, description: 'Aqui ficarão os dois presets de classe, cada um com seus próprios equipamentos salvos.' },
  { id: 'anvil', label: 'Bigorna', x: 505, y: 330, radius: 36, description: 'Estação planejada para criar e melhorar armas e equipamentos metálicos.' },
  { id: 'sewing', label: 'Máquina de costura', x: 645, y: 330, radius: 42, description: 'Estação planejada para fabricar luvas, botas e equipamentos de couro ou tecido.' },
  { id: 'wardrobe', label: 'Armário', x: 752, y: 430, radius: 40, description: 'A troca de outfit será adicionada em uma etapa futura.' },
  { id: 'chest', label: 'Baú', x: 150, y: 425, radius: 38, description: 'O baú dará acesso aos itens e materiais guardados pelo jogador na casa.' },
  { id: 'door', label: 'Porta', x: 450, y: 92, radius: 48, description: 'Quando estiver pronto, use a porta para iniciar a partida de mineração.' },
  { id: 'window', label: 'Janela', x: 748, y: 130, radius: 38, description: 'A janela será o ponto para convidar um amigo para sua sessão e trazê-lo para esta casa.' },
];

type Props = { ready: boolean; onStart: () => void; onStartFullscreen: () => void };

export default function Lobby({ ready, onStart, onStartFullscreen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const playerRef = useRef<Player>({ x: 455, y: 480, fx: 0, fy: -1, phase: 0 });
  const [nearbyId, setNearbyId] = useState<LobbyObjectId | null>(null);
  const [openObjectId, setOpenObjectId] = useState<LobbyObjectId | null>(null);
  const [mobileDirection, setMobileDirection] = useState({ x: 0, y: 0 });
  const nearbyRef = useRef<LobbyObjectId | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let previous = performance.now();
    let lastPaint = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const drawBox = (x: number, y: number, w: number, h: number, fill: string, stroke = '#3e2a1c') => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    };
    const text = (value: string, x: number, y: number, color = '#f3e3c4', size = 13) => {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(31,24,17,.75)';
      ctx.strokeText(value, x, y);
      ctx.fillStyle = color;
      ctx.fillText(value, x, y);
    };
    const drawRoom = (time: number) => {
      const scaleX = canvas.width / 900;
      const scaleY = canvas.height / 600;
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      ctx.clearRect(0, 0, 900, 600);

      // Floor and hand-drawn wooden planks.
      ctx.fillStyle = '#795638'; ctx.fillRect(30, 45, 840, 510);
      for (let y = 48; y < 555; y += 34) {
        ctx.strokeStyle = 'rgba(43,27,17,.34)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(868, y); ctx.stroke();
        for (let x = 55 + ((Math.floor(y / 34) % 2) * 62); x < 850; x += 124) {
          ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 31); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(226,184,124,.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(35, y + 5); ctx.lineTo(865, y + 5); ctx.stroke();
      }
      // Outer walls, left open at the door so the room reads as a top-down cutaway.
      ctx.fillStyle = '#4a3020'; ctx.fillRect(20, 22, 860, 27); ctx.fillRect(20, 22, 25, 540); ctx.fillRect(855, 22, 25, 540);
      ctx.fillStyle = '#b1814f'; ctx.fillRect(22, 24, 856, 8);
      for (let x = 35; x < 870; x += 54) {
        ctx.strokeStyle = 'rgba(53,34,21,.65)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, 46); ctx.stroke();
      }
      ctx.fillStyle = '#4a3020'; ctx.fillRect(20, 545, 340, 22); ctx.fillRect(540, 545, 340, 22);
      ctx.fillStyle = '#b1814f'; ctx.fillRect(22, 545, 338, 5); ctx.fillRect(540, 545, 338, 5);
      // Doorway and doorstep.
      ctx.fillStyle = '#c4a071'; ctx.fillRect(360, 535, 180, 28);
      ctx.fillStyle = '#654229'; ctx.fillRect(393, 535, 114, 18);
      ctx.fillStyle = '#a97542'; ctx.fillRect(400, 536, 100, 14);
      ctx.fillStyle = '#e5c47c'; ctx.beginPath(); ctx.arc(488, 543, 3, 0, Math.PI * 2); ctx.fill();
      // Window.
      drawBox(713, 33, 70, 14, '#8cbdc0', '#4a3020');
      ctx.strokeStyle = '#e3d1a7'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(748, 34); ctx.lineTo(748, 46); ctx.stroke();
      ctx.fillStyle = 'rgba(230,246,238,.25)'; ctx.fillRect(718, 36, 23, 4);
      // Bed with quilt.
      ctx.fillStyle = 'rgba(20,13,9,.25)'; ctx.fillRect(88, 120, 116, 110);
      drawBox(82, 112, 118, 112, '#5b3924');
      ctx.fillStyle = '#d5c5a5'; ctx.fillRect(91, 120, 100, 96);
      ctx.fillStyle = '#a6c1b3'; ctx.fillRect(95, 151, 92, 58);
      ctx.fillStyle = '#dce6d8'; ctx.fillRect(98, 123, 40, 24); ctx.fillRect(143, 123, 40, 24);
      ctx.strokeStyle = '#6b5035'; ctx.lineWidth = 2; ctx.strokeRect(95, 151, 92, 58);
      for (let x = 105; x < 183; x += 19) { ctx.beginPath(); ctx.moveTo(x, 156); ctx.lineTo(x, 204); ctx.stroke(); }
      // Bedside table and daisy.
      drawBox(226, 145, 52, 56, '#9a673d');
      ctx.fillStyle = '#c58f54'; ctx.fillRect(231, 151, 42, 5);
      ctx.fillStyle = '#5b3924'; ctx.fillRect(237, 164, 30, 25);
      ctx.fillStyle = '#d8c49b'; ctx.fillRect(241, 166, 22, 18);
      ctx.fillStyle = '#b58c57'; ctx.fillRect(239, 188, 26, 5);
      // Daisy pot and petals.
      ctx.fillStyle = '#a95f3f'; ctx.fillRect(244, 135, 17, 11);
      ctx.fillStyle = '#6c9a55'; ctx.fillRect(251, 124, 3, 14);
      ctx.strokeStyle = '#4b7a40'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(252, 132); ctx.lineTo(244, 128); ctx.stroke();
      ctx.fillStyle = '#fff4d9';
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.ellipse(252 + Math.cos(a) * 6, 120 + Math.sin(a) * 6, 4, 2.5, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#d6a83f'; ctx.beginPath(); ctx.arc(252, 120, 3.4, 0, Math.PI * 2); ctx.fill();
      // Stove.
      ctx.fillStyle = 'rgba(20,13,9,.28)'; ctx.fillRect(318, 129, 75, 62);
      drawBox(318, 122, 74, 58, '#515553', '#252c2a');
      ctx.fillStyle = '#303635'; ctx.fillRect(327, 130, 56, 25);
      for (const x of [337, 373]) { ctx.fillStyle = '#252927'; ctx.beginPath(); ctx.arc(x, 142, 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#888c82'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = '#9b6240'; ctx.fillRect(329, 158, 52, 15); ctx.fillStyle = '#e58b42'; ctx.fillRect(336, 161, 38, 8);
      ctx.fillStyle = '#f4c76d'; ctx.fillRect(343, 163, 20, 4);
      // Chest.
      ctx.fillStyle = 'rgba(20,13,9,.3)'; ctx.fillRect(111, 414, 78, 52);
      drawBox(108, 404, 82, 48, '#9a663b');
      ctx.fillStyle = '#c28b4f'; ctx.fillRect(111, 407, 76, 12);
      ctx.fillStyle = '#d8b16a'; ctx.fillRect(145, 420, 9, 16);
      ctx.fillStyle = '#4b3020'; ctx.fillRect(146, 423, 7, 6);
      // Training mannequin.
      ctx.fillStyle = 'rgba(20,13,9,.3)'; ctx.beginPath(); ctx.ellipse(360, 350, 31, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b452b'; ctx.fillRect(354, 338, 12, 18);
      ctx.fillStyle = '#b88b5a'; ctx.beginPath(); ctx.arc(360, 312, 13, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#52351f'; ctx.lineWidth = 3; ctx.stroke();
      drawBox(344, 325, 32, 26, '#b88b5a');
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(346, 330); ctx.lineTo(374, 347); ctx.moveTo(374, 330); ctx.lineTo(346, 347); ctx.stroke();
      ctx.fillStyle = '#8a623d'; ctx.fillRect(331, 355, 58, 7);
      // Anvil.
      ctx.fillStyle = 'rgba(20,13,9,.3)'; ctx.fillRect(474, 346, 67, 16);
      drawBox(490, 333, 32, 22, '#69767a', '#31393b');
      ctx.fillStyle = '#8d9a9d'; ctx.beginPath(); ctx.moveTo(475, 323); ctx.lineTo(485, 313); ctx.lineTo(520, 313); ctx.lineTo(535, 322); ctx.lineTo(520, 329); ctx.lineTo(491, 329); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#31393b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#b9c2c2'; ctx.fillRect(488, 315, 31, 4);
      // Sewing machine on a table.
      drawBox(608, 321, 76, 31, '#8b5d38');
      ctx.fillStyle = '#b6804e'; ctx.fillRect(605, 318, 82, 7);
      ctx.fillStyle = '#3c4847'; ctx.fillRect(622, 294, 42, 24);
      ctx.fillStyle = '#7d9290'; ctx.fillRect(622, 294, 39, 5);
      ctx.fillStyle = '#aeb8b2'; ctx.fillRect(627, 299, 26, 5);
      ctx.fillStyle = '#2c3534'; ctx.fillRect(640, 300, 5, 17);
      ctx.strokeStyle = '#d5c7a4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(644, 304); ctx.lineTo(644, 315); ctx.stroke();
      ctx.fillStyle = '#d7bd8b'; ctx.fillRect(628, 313, 23, 4);
      // Wardrobe.
      ctx.fillStyle = 'rgba(20,13,9,.3)'; ctx.fillRect(715, 409, 76, 76);
      drawBox(710, 401, 82, 78, '#69452d');
      ctx.fillStyle = '#95653d'; ctx.fillRect(716, 407, 70, 66);
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2; ctx.strokeRect(719, 410, 30, 60); ctx.strokeRect(753, 410, 30, 60);
      ctx.fillStyle = '#d9b36c'; ctx.fillRect(742, 438, 3, 7); ctx.fillRect(767, 438, 3, 7);
      // Player with the game's existing class sprite.
      const p = playerRef.current;
      const moving = Math.abs(p.fx) + Math.abs(p.fy) > 0;
      const direction = Math.abs(p.fx) > Math.abs(p.fy) * 1.15 ? (p.fx < 0 ? 'left' : 'right')
        : p.fy < 0 ? (Math.abs(p.fx) > Math.abs(p.fy) * 0.45 ? (p.fx < 0 ? 'up-left' : 'up-right') : 'back')
        : Math.abs(p.fx) > Math.abs(p.fy) * 0.45 ? (p.fx < 0 ? 'down-left' : 'down-right') : 'front';
      ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = 'rgba(18,12,8,.35)'; ctx.beginPath(); ctx.ellipse(0, 12, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      drawLadino(ctx, 'guerreiro', 13, { walking: moving, phase: p.phase, breath: Math.sin(time / 400), carry: false, direction });
      ctx.restore();
      // Room title and subtle light.
      const glow = ctx.createRadialGradient(440, 260, 60, 440, 260, 450);
      glow.addColorStop(0, 'rgba(255,223,157,.06)'); glow.addColorStop(1, 'rgba(15,12,9,.23)');
      ctx.fillStyle = glow; ctx.fillRect(30, 45, 840, 510);
      text('SUA CASA', 450, 79, '#f2d6a0', 14);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000 || 0);
      previous = now;
      const p = playerRef.current;
      const keys = keysRef.current;
      const x = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a')) + mobileDirection.x;
      const y = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w')) + mobileDirection.y;
      const length = Math.hypot(x, y);
      const dx = length > 0 ? x / length : 0;
      const dy = length > 0 ? y / length : 0;
      if (length > 0) {
        p.fx = dx; p.fy = dy; p.phase += dt * 11;
        const speed = 175;
        const nx = Math.max(60, Math.min(840, p.x + dx * speed * dt));
        const ny = Math.max(72, Math.min(520, p.y + dy * speed * dt));
        const blocked = (tx: number, ty: number) => [
          { x: 145, y: 170, w: 65, h: 60 }, { x: 252, y: 168, w: 32, h: 34 },
          { x: 355, y: 151, w: 48, h: 42 }, { x: 150, y: 425, w: 55, h: 38 },
          { x: 360, y: 333, w: 30, h: 34 }, { x: 505, y: 330, w: 42, h: 34 },
          { x: 645, y: 331, w: 48, h: 34 }, { x: 752, y: 430, w: 50, h: 48 },
        ].some(o => tx > o.x - o.w / 2 - 12 && tx < o.x + o.w / 2 + 12 && ty > o.y - o.h / 2 - 12 && ty < o.y + o.h / 2 + 12);
        if (!blocked(nx, p.y)) p.x = nx;
        if (!blocked(p.x, ny)) p.y = ny;
      }
      if (now - lastPaint > 100) {
        lastPaint = now;
        const next = OBJECTS.find(o => Math.hypot(p.x - o.x, p.y - o.y) <= o.radius)?.id ?? null;
        if (nearbyRef.current !== next) {
          nearbyRef.current = next;
          setNearbyId(next);
        }
      }
      drawRoom(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, [mobileDirection]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) keysRef.current.add(key);
      if (key === 'Escape') setOpenObjectId(null);
      if ((key === 'e' || key === 'Enter') && nearbyRef.current) setOpenObjectId(nearbyRef.current);
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keysRef.current.delete(key);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const nearby = OBJECTS.find(object => object.id === nearbyId) ?? null;
  const openObject = OBJECTS.find(object => object.id === openObjectId) ?? null;
  const interact = (id: LobbyObjectId) => {
    if (id === 'door') {
      setOpenObjectId('door');
      return;
    }
    setOpenObjectId(id);
  };
  const closeModal = () => setOpenObjectId(null);
  const isDecor = openObject?.id === 'bed' || openObject?.id === 'flower';

  return <main className="lobby-screen">
    <header className="lobby-topbar">
      <div className="lobby-brand">FÍBULA <span>ONLINE</span></div>
      <div className="lobby-hint">SUA CASA · LOBBY JOGÁVEL</div>
      <div className="lobby-ready"><i /> {ready ? 'PRONTO' : 'CARREGANDO PARTIDA'}</div>
    </header>
    <section className="lobby-stage" aria-label="Casa do jogador">
      <canvas ref={canvasRef} className="lobby-canvas" aria-label="Interior da casa em visão de cima" />
      {nearby && !openObject && <button className="lobby-interact" type="button" onClick={() => interact(nearby.id)}>
        <span> E </span> Interagir · {nearby.label}
      </button>}
      {!nearby && <div className="lobby-movement-hint">WASD / setas para andar · E para interagir</div>}
      <div className="lobby-mobile-controls" aria-label="Controles de movimento">
        <button type="button" aria-label="Mover para cima" onPointerDown={() => setMobileDirection(v => ({ ...v, y: -1 }))} onPointerUp={() => setMobileDirection(v => ({ ...v, y: 0 }))} onPointerLeave={() => setMobileDirection({ x: 0, y: 0 })} onPointerCancel={() => setMobileDirection({ x: 0, y: 0 })}>▲</button>
        <div>
          <button type="button" aria-label="Mover para esquerda" onPointerDown={() => setMobileDirection(v => ({ ...v, x: -1 }))} onPointerUp={() => setMobileDirection(v => ({ ...v, x: 0 }))} onPointerLeave={() => setMobileDirection({ x: 0, y: 0 })} onPointerCancel={() => setMobileDirection({ x: 0, y: 0 })}>◀</button>
          <button type="button" aria-label="Mover para baixo" onPointerDown={() => setMobileDirection(v => ({ ...v, y: 1 }))} onPointerUp={() => setMobileDirection(v => ({ ...v, y: 0 }))} onPointerLeave={() => setMobileDirection({ x: 0, y: 0 })} onPointerCancel={() => setMobileDirection({ x: 0, y: 0 })}>▼</button>
          <button type="button" aria-label="Mover para direita" onPointerDown={() => setMobileDirection(v => ({ ...v, x: 1 }))} onPointerUp={() => setMobileDirection(v => ({ ...v, x: 0 }))} onPointerLeave={() => setMobileDirection({ x: 0, y: 0 })} onPointerCancel={() => setMobileDirection({ x: 0, y: 0 })}>▶</button>
        </div>
      </div>
    </section>
    <footer className="lobby-footer"><span>INTERAJA COM OS OBJETOS DA CASA</span><span>PC + CELULAR</span></footer>
    {openObject && <div className="lobby-modal-backdrop" role="presentation" onClick={closeModal}>
      <section className="lobby-modal" role="dialog" aria-modal="true" aria-label={openObject.label} onClick={event => event.stopPropagation()}>
        <button className="lobby-modal-close" type="button" onClick={closeModal} aria-label="Fechar">×</button>
        <div className="lobby-modal-kicker">CASA DO JOGADOR</div>
        <h2>{openObject.label}</h2>
        <p>{openObject.description}</p>
        {openObject.id === 'door' ? <>
          <div className="lobby-modal-note">{ready ? 'A casa está pronta para a primeira sessão.' : 'Aguarde o carregamento do mundo antes de iniciar.'}</div>
          <button className="lobby-primary" type="button" disabled={!ready} onClick={onStartFullscreen}>Iniciar partida em tela cheia</button>
          <button className="lobby-secondary" type="button" disabled={!ready} onClick={onStart}>Iniciar partida</button>
        </> : <div className="lobby-modal-note">{isDecor ? 'Objeto decorativo · sem função de jogo' : 'Protótipo visual · sistema funcional será implementado em uma etapa própria'}</div>}
      </section>
    </div>}
  </main>;
}
