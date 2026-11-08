type ForgeSceneProps = {
  intensity: 0 | 1 | 2 | 3;
  hammering: boolean;
  onBack: () => void;
  children?: import('react').ReactNode;
};

export default function ForgeScene({ intensity, hammering, onBack, children }: ForgeSceneProps) {
  return <section className={'forge-scene forge-intensity-' + intensity + (hammering ? ' forge-sparking' : '')} aria-label="Bigorna de fabricação">
    <svg className="forge-backdrop" viewBox="0 0 360 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Bigorna de aço diante de uma parede de pedra">
      <defs>
        <linearGradient id="anvil-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#77736b"/><stop offset="1" stopColor="#4b4a45"/>
        </linearGradient>
        <linearGradient id="anvil-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0e6e6"/><stop offset=".2" stopColor="#aeb9bd"/><stop offset=".55" stopColor="#68777e"/><stop offset="1" stopColor="#303b41"/>
        </linearGradient>
        <linearGradient id="anvil-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0f3ef"/><stop offset=".45" stopColor="#c0c9ca"/><stop offset="1" stopColor="#7b898e"/>
        </linearGradient>
        <filter id="anvil-soft-shadow" x="-30%" y="-50%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="7"/>
        </filter>
      </defs>
      <rect width="360" height="300" fill="url(#anvil-wall)"/>
      <g fill="none" stroke="#d0c7b7" strokeWidth="1.2" opacity=".18">
        <path d="M0 48H360M0 103H360M0 158H360M0 213H360M0 268H360"/>
        <path d="M78 0V48M248 0V48M24 48V103M180 48V103M318 48V103M100 103V158M278 103V158M54 158V213M218 158V213M330 158V213M132 213V268M286 213V268"/>
      </g>
      <rect width="360" height="300" fill="#1b1a17" opacity=".13"/>
      <ellipse cx="181" cy="257" rx="126" ry="15" fill="#171a1b" opacity=".48" filter="url(#anvil-soft-shadow)"/>
      <path d="M48 143Q56 132 79 132H124Q139 132 151 119L165 105Q171 99 184 99H278Q297 99 310 113L324 128Q330 135 320 141L304 150Q290 155 270 155H222L213 190Q210 202 198 210L196 220H235Q249 220 254 231L259 242Q260 250 248 250H113Q102 250 105 240L110 229Q114 220 128 220H158L153 207Q142 196 140 181L136 155H83Q62 155 48 149Q43 147 48 143Z" fill="url(#anvil-steel)"/>
      <path d="M49 142Q59 132 80 132H124Q140 132 153 118L166 105Q172 100 184 100H278Q297 100 310 114L323 129Q326 133 320 137Q303 147 282 147H83Q62 147 49 143Z" fill="url(#anvil-face)"/>
      <path d="M60 139Q84 141 116 140H270Q298 140 316 132" fill="none" stroke="#f4f5ef" strokeWidth="2.2" strokeLinecap="round" opacity=".72"/>
      <path d="M156 205Q174 216 196 218" fill="none" stroke="#e3e9e8" strokeWidth="2" strokeLinecap="round" opacity=".22"/>
      <g className="forge-sparks" fill="#ffd47a" stroke="#f28a39" strokeWidth="1.5" strokeLinecap="round">
        <path d="M145 125l-10-19 4 22Z"/><path d="M169 112l-2-23 8 20Z"/><path d="M198 115l8-21 1 24Z"/>
        <path d="M222 121l17-17-10 22Z"/><path d="M253 124l15-12-8 18Z"/><circle cx="128" cy="121" r="2.5"/><circle cx="280" cy="124" r="2.2"/>
      </g>
      <ellipse className="forge-flash" cx="183" cy="132" rx="100" ry="45" fill="#fff0c2" opacity="0"/>
    </svg>
    <div className="forge-scene-header">
      <h2>BIGORNA</h2>
      <button type="button" className="forge-back-button" onClick={onBack}>← Lobby</button>
    </div>
    <div className="forge-scene-slots">{children}</div>
  </section>;
}
