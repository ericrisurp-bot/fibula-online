import type { ReactNode } from 'react';

type ForgeSceneProps = {
  intensity: 0 | 1 | 2 | 3;
  hammering: boolean;
  coreLabel: string;
  onCoreSlotClick: () => void;
};

export default function ForgeScene({ intensity, hammering, coreLabel, onCoreSlotClick }: ForgeSceneProps) {
  return <section className={`forge-scene forge-intensity-${intensity}${hammering ? ' forge-hammering' : ''}`} aria-label="Cena da forja">
    <svg className="forge-backdrop" viewBox="0 0 720 390" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Parede de pedra, forja acesa e bigorna">
      <defs>
        <linearGradient id="forge-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#343b40"/><stop offset="1" stopColor="#1b2024"/></linearGradient>
        <linearGradient id="forge-iron" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#aab4b9"/><stop offset=".5" stopColor="#68747b"/><stop offset="1" stopColor="#343d43"/></linearGradient>
        <radialGradient id="forge-glow"><stop offset="0" stopColor="#ffb04b" stopOpacity=".85"/><stop offset="1" stopColor="#f05a1b" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="720" height="390" fill="url(#forge-wall)"/>
      <path d="M0 0H720V48L650 63 580 48 505 68 430 51 350 70 275 49 190 68 110 48 0 65Z" fill="#465057"/>
      <g stroke="#141a1e" strokeWidth="4">
        <path d="M0 92 120 75 206 99 300 78 392 100 485 78 585 100 720 80V170L620 188 530 165 430 190 325 169 220 188 120 165 0 184Z" fill="#30383e"/>
        <path d="M0 190 110 172 205 198 310 176 410 202 515 178 620 202 720 180V290H0Z" fill="#252d32"/>
        <path d="M0 300 115 280 210 307 320 282 420 310 530 285 625 310 720 290V390H0Z" fill="#20272c"/>
      </g>
      <g fill="#59646b" opacity=".72">
        <path d="m22 92 76-12 26 26-68 17Z"/><path d="m151 91 49 8 21 31-70-6Z"/><path d="m260 88 40-8 35 24-68 15Z"/><path d="m391 91 56 2 25 28-76 1Z"/><path d="m536 91 56 9 18 30-77-5Z"/>
        <path d="m40 209 66-14 32 27-74 14Z"/><path d="m190 210 65-12 26 28-76 11Z"/><path d="m345 210 61-10 22 28-71 9Z"/><path d="m500 209 66-14 30 26-77 13Z"/>
      </g>
      <path d="M0 326 130 311 245 330 365 310 490 332 605 310 720 329V390H0Z" fill="#171d21"/>
      <ellipse cx="150" cy="260" rx="150" ry="110" fill="url(#forge-glow)" className="forge-fire-glow"/>
      <g className="forge-hearth">
        <path d="M34 280 50 176 90 146 206 146 246 180 260 280 231 307H61Z" fill="#626d74" stroke="#171d21" strokeWidth="8"/>
        <path d="m50 176 40-30 116 0 40 34-66 18-65-5Z" fill="#87939a"/>
        <path d="m50 176 66 17-9 83H61Z" fill="#465159"/>
        <path d="m206 180 40 0 14 100h-70Z" fill="#3d484f"/>
        <path d="M96 276V220l31-30h58l31 30v56Z" fill="#111619" stroke="#222a2f" strokeWidth="7"/>
        <path d="m105 274 22-35 27 18 20-31 32 48Z" fill="#e45b21" className="forge-flame forge-flame-back"/>
        <path d="m123 275 24-47 20 33 20-24 19 38Z" fill="#ff9b35" className="forge-flame forge-flame-mid"/>
        <path d="m146 276 14-36 16 36Z" fill="#ffd16a" className="forge-flame forge-flame-core"/>
        <path d="M82 151 92 94 119 73 181 73 210 97 220 151Z" fill="#4b555c" stroke="#20272b" strokeWidth="7"/>
        <path d="m92 94 27-21 62 0 29 24-63 13Z" fill="#7b878e"/>
        <path d="m119 73 21-40 42 0 20 40Z" fill="#313a40"/>
      </g>
      <g className="forge-anvil">
        <ellipse cx="482" cy="315" rx="164" ry="24" fill="#090d10" opacity=".65"/>
        <path d="m365 272 26-35 78-16 95 18 38 32-21 35-177 0Z" fill="#39444b" stroke="#151b20" strokeWidth="7"/>
        <path d="m391 237 78-30 95 16-100 30Z" fill="#9ba6ac" stroke="#20282e" strokeWidth="6"/>
        <path d="m469 253 95-30 38 32-21 35-111-3Z" fill="#647179"/>
        <path d="m397 270 177 0-12 43-154 0Z" fill="#4e5b63" stroke="#161c20" strokeWidth="6"/>
        <path d="m413 313 145 0-10 37-128 0Z" fill="#303a40" stroke="#151b20" strokeWidth="6"/>
        <path d="m425 350 122 0 15 15-152 0Z" fill="#69757b"/>
        <path d="m391 237 78-30 95 16-100 30Z" fill="#c0c9cb" opacity=".34"/>
      </g>
      <g className="forge-hammer-art">
        <path d="M489 184 510 171 553 235 532 250Z" fill="#79553b" stroke="#241d19" strokeWidth="5"/>
        <path d="m475 166 59-30 36 42-59 30Z" fill="#65727a" stroke="#1b2328" strokeWidth="7"/>
        <path d="m475 166 22-28 59-2-22 30Z" fill="#aeb9be"/>
        <path d="m534 176 36-4-21 42-38-8Z" fill="#3b464d"/>
      </g>
      <g className="forge-sparks" fill="#ffb34b">
        <path d="m452 218 7-19 5 20Z"/><path d="m574 221 5-16 6 18Z"/><path d="m548 194 4-13 5 15Z"/><path d="m431 241 4-12 5 13Z"/>
      </g>
      <path d="M0 366 720 366" stroke="#4b555b" strokeWidth="4" opacity=".7"/>
    </svg>
    <button type="button" className={coreLabel ? 'forge-core-socket filled' : 'forge-core-socket'} onClick={onCoreSlotClick} aria-label={coreLabel ? 'Devolver núcleo à grade' : 'Slot vazio do núcleo'}>
      <span className="forge-socket-rim"><i /></span>
      <strong>{coreLabel || 'NÚCLEO'}</strong>
      {coreLabel && <small>Tocar para devolver</small>}
    </button>
    <div className="forge-scene-caption" aria-hidden="true"><span>FORJA DE PEDRA</span><i /></div>
  </section>;
}
