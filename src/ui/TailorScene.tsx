type TailorSceneProps = { children?: import('react').ReactNode };

export default function TailorScene({ children }: TailorSceneProps) {
  return <section className="tailor-scene" aria-label="Ateliê de costura">
    <svg
      className="tailor-scene-backdrop"
      viewBox="0 0 360 210"
      preserveAspectRatio="xMidY slice"
      role="img"
      aria-label="Ateliê com prateleira de tecidos, manequim e mesa de costura"
    >
      <defs>
        <linearGradient id="tailor-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8dfc9" />
          <stop offset=".78" stopColor="#cfc4a8" />
          <stop offset="1" stopColor="#b9ad8e" />
        </linearGradient>
        <linearGradient id="tailor-plaque" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34372a" />
          <stop offset="1" stopColor="#242a22" />
        </linearGradient>
        <linearGradient id="tailor-shelf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a8056" />
          <stop offset="1" stopColor="#594a34" />
        </linearGradient>
        <linearGradient id="tailor-mannequin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a58f6d" />
          <stop offset=".24" stopColor="#e4d5b7" />
          <stop offset=".49" stopColor="#f0e4ca" />
          <stop offset=".77" stopColor="#c7b693" />
          <stop offset="1" stopColor="#8e7e60" />
        </linearGradient>
        <linearGradient id="tailor-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a58a5e" />
          <stop offset=".65" stopColor="#6c5a3c" />
          <stop offset="1" stopColor="#4d422f" />
        </linearGradient>
        <linearGradient id="tailor-lamp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2dfaa" />
          <stop offset="1" stopColor="#a58b58" />
        </linearGradient>
        <linearGradient id="tailor-roll-cream" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d8c8a8" />
          <stop offset=".5" stopColor="#f0e5cc" />
          <stop offset="1" stopColor="#b9a783" />
        </linearGradient>
        <linearGradient id="tailor-roll-olive" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#626747" />
          <stop offset=".5" stopColor="#9a9b6a" />
          <stop offset="1" stopColor="#4e5739" />
        </linearGradient>
        <linearGradient id="tailor-roll-wine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#713e3d" />
          <stop offset=".5" stopColor="#a35d57" />
          <stop offset="1" stopColor="#593334" />
        </linearGradient>
      </defs>

      <rect width="360" height="210" fill="url(#tailor-wall)" />
      <path d="M0 24H360M0 67H360M0 110H360M0 153H360" stroke="#81775d" strokeWidth="1" opacity=".12" />
      <path d="M58 0V154M178 0V154M298 0V154" stroke="#81775d" strokeWidth="1" opacity=".09" />
      <rect y="150" width="360" height="5" fill="#85795d" />

      <g>
        <rect x="14" y="12" width="118" height="29" rx="4" fill="#3b3326" opacity=".25" />
        <rect x="12" y="9" width="118" height="29" rx="4" fill="url(#tailor-plaque)" stroke="#a99b7b" />
        <path d="M18 14H124" stroke="#ffffff" opacity=".12" />
        <text x="71" y="27.5" fill="#e8d9b8" fontSize="10" fontWeight="900" letterSpacing="1.2" textAnchor="middle">ALFAIATARIA</text>
      </g>

      <g>
        <rect x="122" y="77" width="215" height="8" rx="2" fill="url(#tailor-shelf)" stroke="#65583e" />
        <path d="M126 79H333" stroke="#d8bd8e" opacity=".45" />
        <rect x="139" y="48" width="27" height="29" rx="4" fill="url(#tailor-roll-cream)" stroke="#76684f" strokeWidth="2" />
        <ellipse cx="152.5" cy="48" rx="13.5" ry="4" fill="#eee2c8" stroke="#76684f" strokeWidth="1.5" />
        <rect x="177" y="43" width="29" height="34" rx="4" fill="url(#tailor-roll-olive)" stroke="#76684f" strokeWidth="2" />
        <ellipse cx="191.5" cy="43" rx="14.5" ry="4" fill="#a5a777" stroke="#76684f" strokeWidth="1.5" />
        <rect x="217" y="49" width="27" height="28" rx="4" fill="url(#tailor-roll-wine)" stroke="#76684f" strokeWidth="2" />
        <ellipse cx="230.5" cy="49" rx="13.5" ry="4" fill="#b66d65" stroke="#76684f" strokeWidth="1.5" />
        <rect x="255" y="46" width="27" height="31" rx="4" fill="#c8b99a" stroke="#76684f" strokeWidth="2" />
        <ellipse cx="268.5" cy="46" rx="13.5" ry="4" fill="#e7dcc4" stroke="#76684f" strokeWidth="1.5" />
      </g>

      <g>
        <path d="M324 0V42" stroke="#4e4a3b" strokeWidth="3" />
        <path d="M305 42H343L337 57H311Z" fill="url(#tailor-lamp)" stroke="#756341" />
        <path d="M315 57L333 57L359 145H286Z" fill="#f8e7b4" opacity=".12" />
        <path d="M315 57L333 57L359 145H286Z" fill="#f8e7b4" opacity=".08" />
      </g>

      <g filter="drop-shadow(0px 4px 3px #4a403044)">
        <path d="M175 42H185V49Q185 52 180 52Q175 52 175 49Z" fill="#c8b693" stroke="#776c55" strokeWidth="1.5" />
        <path d="M173 52H187L190 59L205 64Q211 66 209 73L201 94Q198 101 199 110L207 124Q210 130 203 134Q180 140 157 134Q150 130 153 124L161 110Q162 101 159 94L151 73Q149 66 155 64L170 59Z"
          fill="url(#tailor-mannequin)" stroke="#7e7259" strokeWidth="2" strokeLinejoin="round" />
        <path d="M155 68L169 63L180 67L191 63L205 68M161 110Q180 116 199 110M157 128Q180 135 203 128"
          fill="none" stroke="#a99672" strokeWidth="1.3" opacity=".8" />
        <path d="M180 66V130" stroke="#8b4f45" strokeWidth="1.6" strokeDasharray="3 2" opacity=".9" />
        <path d="M180 138V177" stroke="#8b795b" strokeWidth="4" />
        <path d="M180 175L161 190M180 175L199 190M180 175V193" fill="none" stroke="#776448" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="180" cy="194" rx="24" ry="4" fill="#a28a5e" stroke="#584a36" strokeWidth="1.5" />
      </g>

      <g>
        <path d="M27 158H333L327 171H33Z" fill="url(#tailor-wood)" stroke="#594b35" />
        <rect x="33" y="169" width="294" height="28" fill="#8a7451" stroke="#665438" />
        <path d="M57 169V197M88 169V197M119 169V197M150 169V197M181 169V197M212 169V197M243 169V197M274 169V197M305 169V197" stroke="#7b684a" strokeWidth="2" />
        <path d="M43 197H55V210H43ZM305 197H317V210H305Z" fill="#a1875b" stroke="#594b35" />
        <path d="M43 198H55M305 198H317" stroke="#d0b486" opacity=".45" />

        <g>
          <rect x="77" y="143" width="12" height="18" rx="3" fill="#77764d" stroke="#6c573e" strokeWidth="2" />
          <path d="M79 147H87M79 151H87M79 155H87" stroke="#c0bd8a" opacity=".65" />
          <rect x="98" y="145" width="12" height="16" rx="3" fill="#914f4a" stroke="#6c573e" strokeWidth="2" />
          <path d="M100 149H108M100 153H108" stroke="#d69a8e" opacity=".65" />
        </g>
        <g transform="translate(192 148) rotate(-12)">
          <path d="M0 8H36" stroke="#69716a" strokeWidth="3" />
          <circle cx="4" cy="5" r="5" fill="none" stroke="#73796e" strokeWidth="2" />
          <circle cx="16" cy="5" r="5" fill="none" stroke="#73796e" strokeWidth="2" />
          <path d="M20 7L35 0" stroke="#69716a" strokeWidth="1.5" />
        </g>
        <ellipse cx="258" cy="151" rx="14" ry="8" fill="#814b43" stroke="#754943" />
        <path d="M258 143V131" stroke="#e5e1ce" strokeWidth="2" transform="rotate(24 258 143)" />
        <path d="M279 146L321 146L319 158L278 158Z" fill="#74764e" stroke="#666444" />
        <path d="M279 150H320M279 154H320" stroke="#a4a575" strokeWidth="2" />
      </g>
    </svg>
    <div className="tailor-scene-slots">{children}</div>
  </section>;
}
