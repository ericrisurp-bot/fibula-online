type ForgeSceneProps = {
  intensity: 0 | 1 | 2 | 3;
  hammering: boolean;
  onBack: () => void;
  children?: import('react').ReactNode;
};

export default function ForgeScene({ intensity: _intensity, hammering, onBack, children }: ForgeSceneProps) {
  return <section className={'forge-scene' + (hammering ? ' forge-sparking' : '')} aria-label="Bigorna de fabricação">
    <svg className="forge-backdrop" viewBox="0 0 360 210" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Bigorna de ferro em uma parede de pedra">
      <defs>
        <linearGradient id="anvil-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#77736b"/><stop offset="1" stopColor="#4b4944"/>
        </linearGradient>
        <linearGradient id="anvil-block-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#aeb8bb"/><stop offset="1" stopColor="#68757b"/>
        </linearGradient>
        <linearGradient id="anvil-block-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#59676d"/><stop offset="1" stopColor="#303b40"/>
        </linearGradient>
        <linearGradient id="anvil-block-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#758188"/><stop offset="1" stopColor="#343e43"/>
        </linearGradient>
      </defs>
      <rect width="360" height="210" fill="url(#anvil-wall)"/>
      <g fill="none" stroke="#d0c7b7" strokeWidth=".8" opacity=".2">
        <path d="M0 37H360M0 78H360M0 119H360M0 160H360M0 201H360"/>
        <path d="M70 0V37M235 0V37M28 37V78M166 37V78M306 37V78M112 78V119M270 78V119M62 119V160M220 119V160M330 119V160M145 160V201M286 160V201"/>
      </g>
      <rect width="360" height="210" fill="#201e1a" opacity=".12"/>
      <ellipse cx="181" cy="184" rx="112" ry="9" fill="#171a1b" opacity=".35"/>
      <g>
        <path d="M99 151H261V177H99Z" fill="url(#anvil-block-base)"/>
        <path d="M99 151H261L250 160H110Z" fill="#899499" opacity=".65"/>
        <path d="M133 119H227L216 151H144Z" fill="url(#anvil-block-front)"/>
        <path d="M144 119H216L207 145H153Z" fill="#879398" opacity=".25"/>
        <path d="M49 91L102 82H286L311 94L298 119H238L227 126H133L122 119H67Z" fill="url(#anvil-block-front)"/>
        <path d="M49 91L102 82H286L311 94L298 105H75Z" fill="url(#anvil-block-top)"/>
        <path d="M62 92L105 86H283" fill="none" stroke="#d6dfe0" strokeWidth="1.6" opacity=".56"/>
        <path d="M76 106H293" fill="none" stroke="#b4c0c3" strokeWidth="1" opacity=".3"/>
        <path d="M109 160H251M145 126H215" fill="none" stroke="#b8c3c6" strokeWidth="1" opacity=".24"/>
      </g>
      <g className="forge-sparks" fill="#ffd47a" stroke="#e88a43" strokeWidth="1" strokeLinecap="round">
        <path d="M143 103l-10-20 4 23Z"/><path d="M163 98l-2-24 7 22Z"/><path d="M185 98l7-23 1 25Z"/>
        <path d="M207 101l17-18-10 23Z"/><path d="M229 105l16-12-9 19Z"/>
        <circle cx="126" cy="100" r="2.2"/><circle cx="253" cy="106" r="2"/>
      </g>
      <ellipse className="forge-flash" cx="181" cy="105" rx="108" ry="43" fill="#fff0c2" opacity="0"/>
    </svg>
    <div className="forge-scene-header">
      <h2>BIGORNA</h2>
      <button type="button" className="forge-back-button" onClick={onBack}>← Lobby</button>
    </div>
    <div className="forge-scene-slots">{children}</div>
  </section>;
}
