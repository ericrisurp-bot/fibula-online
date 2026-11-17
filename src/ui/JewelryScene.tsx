type JewelrySceneProps = {
  revealAnimating: boolean;
};

export default function JewelryScene({ revealAnimating }: JewelrySceneProps) {
  return <section className={'jewelry-scene' + (revealAnimating ? ' jewelry-revealing' : '')} aria-label="Oficina de ourivesaria">
    <svg className="jewelry-scene-svg" viewBox="0 0 360 210" preserveAspectRatio="xMidY slice" role="img" aria-label="Oficina de joalheria com armários, gemas, luminária e bancada de ferramentas">
      <defs>
        <linearGradient id="j-wall" x2="0" y2="1"><stop stopColor="#263c4a"/><stop offset="1" stopColor="#14232d"/></linearGradient>
        <linearGradient id="j-wood" x2="0" y2="1"><stop stopColor="#98613b"/><stop offset="1" stopColor="#4d3027"/></linearGradient>
        <linearGradient id="j-top" x2="0" y2="1"><stop stopColor="#bd8650"/><stop offset="1" stopColor="#68412d"/></linearGradient>
        <linearGradient id="j-velvet" x2="0" y2="1"><stop stopColor="#9865a8"/><stop offset="1" stopColor="#493052"/></linearGradient>
        <radialGradient id="j-beam"><stop stopColor="#f5d99a" stopOpacity=".35"/><stop offset="1" stopColor="#f5d99a" stopOpacity="0"/></radialGradient>
        <linearGradient id="j-gold" x2="0" y2="1"><stop stopColor="#f0d69a"/><stop offset="1" stopColor="#8c6539"/></linearGradient>
        <filter id="j-glow"><feGaussianBlur stdDeviation="4"/></filter>
      </defs>
      <rect width="360" height="210" fill="url(#j-wall)"/>
      <path d="M0 0H360V16H0Z" fill="#344c59" opacity=".65"/>
      <path d="M0 20H360M0 56H360M0 92H360M0 128H360" stroke="#78909a" strokeOpacity=".12" strokeWidth="1"/>
      <path d="M14 0V142M346 0V142" stroke="#0b1820" strokeWidth="5" opacity=".55"/>
      <path d="M18 8L48 0M312 0L342 12M0 111L24 98M336 104L360 116" stroke="#91a4a8" strokeOpacity=".12" strokeWidth="3"/>
      <rect x="5" y="23" width="66" height="104" rx="4" fill="#101d24" stroke="#8b6848" strokeWidth="3"/>
      <rect x="10" y="28" width="56" height="94" rx="2" fill="#34434a" stroke="#b18a5b" strokeWidth="2"/>
      <path d="M12 70H64M12 96H64" stroke="#a77b4d" strokeWidth="4"/>
      <rect x="15" y="36" width="22" height="26" rx="2" fill="#584337" stroke="#c39b67"/>
      <rect x="41" y="36" width="19" height="26" rx="2" fill="#584337" stroke="#c39b67"/>
      <path d="M18 42H34V56H18ZM44 42H57V56H44Z" fill="#b48a5c" opacity=".55"/>
      <rect x="17" y="77" width="42" height="14" rx="2" fill="#76513a" stroke="#c49a67"/>
      <circle cx="38" cy="84" r="2" fill="#e0c18b"/>
      <rect x="289" y="23" width="66" height="104" rx="4" fill="#101d24" stroke="#8b6848" strokeWidth="3"/>
      <rect x="294" y="28" width="56" height="94" rx="2" fill="#34434a" stroke="#b18a5b" strokeWidth="2"/>
      <path d="M296 70H348M296 96H348" stroke="#a77b4d" strokeWidth="4"/>
      <rect x="299" y="36" width="22" height="26" rx="2" fill="#584337" stroke="#c39b67"/>
      <rect x="325" y="36" width="19" height="26" rx="2" fill="#584337" stroke="#c39b67"/>
      <path d="M302 42H318V56H302ZM328 42H341V56H328Z" fill="#b48a5c" opacity=".55"/>
      <rect x="301" y="77" width="42" height="14" rx="2" fill="#76513a" stroke="#c49a67"/>
      <circle cx="322" cy="84" r="2" fill="#e0c18b"/>
      <path d="M78 49H282V55H78Z" fill="#3b2926" stroke="#b58b58" strokeWidth="2"/>
      <path d="M87 55V65M273 55V65" stroke="#a77e52" strokeWidth="4"/>
      <g transform="translate(116 25)">
        <rect width="34" height="23" rx="3" fill="#513b35" stroke="#c49a67" strokeWidth="2"/>
        <rect x="5" y="4" width="24" height="14" rx="2" fill="#2c252b"/>
        <path d="M17 5L23 11L17 17L11 11Z" fill="#c34d68" stroke="#f09a9b"/>
      </g>
      <g transform="translate(163 25)">
        <rect width="34" height="23" rx="3" fill="#513b35" stroke="#c49a67" strokeWidth="2"/>
        <rect x="5" y="4" width="24" height="14" rx="2" fill="#2c252b"/>
        <path d="M17 5L23 11L17 17L11 11Z" fill="#579bd1" stroke="#a7d9f5"/>
      </g>
      <g transform="translate(210 25)">
        <rect width="34" height="23" rx="3" fill="#513b35" stroke="#c49a67" strokeWidth="2"/>
        <rect x="5" y="4" width="24" height="14" rx="2" fill="#2c252b"/>
        <path d="M17 5L23 11L17 17L11 11Z" fill="#55a778" stroke="#a6e0a9"/>
      </g>
      <path d="M180 0V18" stroke="#302c2a" strokeWidth="3"/>
      <path d="M165 18H195L202 30H158Z" fill="#3a3029" stroke="#d0a76c" strokeWidth="2"/>
      <path d="M171 29H189L195 36H165Z" fill="url(#j-gold)"/>
      <ellipse cx="180" cy="65" rx="77" ry="49" fill="url(#j-beam)"/>
      <path d="M0 145H360V210H0Z" fill="#172229"/>
      <path d="M23 153H337L326 190H34Z" fill="#0c171d" opacity=".75"/>
      <path d="M26 145H334L328 157H32Z" fill="url(#j-top)" stroke="#d09b60" strokeWidth="2"/>
      <path d="M36 156H324V191H36Z" fill="url(#j-wood)" stroke="#3d2821" strokeWidth="2"/>
      <path d="M45 162H130V184H45Z M138 162H222V184H138Z M230 162H315V184H230Z" fill="#3c2924" stroke="#b27b49" strokeWidth="2"/>
      <path d="M51 166H124V180H51Z M144 166H216V180H144Z M236 166H309V180H236Z" fill="#795039" stroke="#d0a06b"/>
      <g fill="#e0c18b" fontSize="10" fontFamily="serif" textAnchor="middle">
        <text x="87" y="177">ᚠ ᚢ</text><text x="180" y="177">ᛞ ᚱ</text><text x="273" y="177">ᚷ ᛟ</text>
      </g>
      <path d="M44 190L39 210H53L61 190M299 190L307 210H321L315 190" fill="#503328" stroke="#a6754a" strokeWidth="2"/>
      <path d="M35 146L49 139H311L325 146Z" fill="#d3a06a" stroke="#f0c88e" strokeWidth="2"/>
      <rect x="112" y="128" width="112" height="13" rx="6" fill="url(#j-velvet)" stroke="#d0a0c7" strokeWidth="2"/>
      <path d="M119 134Q168 120 217 134" fill="none" stroke="#d9b3df" strokeOpacity=".55" strokeWidth="2"/>
      <path d="M143 132L154 125L160 129L151 137Z" fill="#c9c9d0" stroke="#f3e7da"/>
      <path d="M152 129L165 121L169 124L157 133" fill="none" stroke="#e7e0d7" strokeWidth="2"/>
      <circle cx="190" cy="128" r="8" fill="none" stroke="#e0c99d" strokeWidth="2"/>
      <path d="M196 134L204 142" stroke="#e0c99d" strokeWidth="3"/>
      <rect x="242" y="132" width="38" height="9" rx="2" fill="#46342b" stroke="#c7a16c"/>
      <path d="M247 134L252 128L257 134L262 128L267 134L272 128" fill="none" stroke="#d7bd91" strokeWidth="2"/>
      <ellipse className="jewelry-svg-glow" cx="180" cy="119" rx="62" ry="40" fill="#fff0bc" opacity="0"/>
      <g className="jewelry-svg-sparks" fill="#fff1bc" filter="url(#j-glow)">
        <path d="M95 105l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
        <path d="M263 92l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>
        <path d="M180 82l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
      </g>
      <g fill="#fff0bc" opacity=".8">
        <circle className="jewelry-svg-spark-dot" cx="112" cy="117" r="1.7"/>
        <circle className="jewelry-svg-spark-dot" cx="246" cy="110" r="1.7"/>
        <circle className="jewelry-svg-spark-dot" cx="180" cy="72" r="1.7"/>
      </g>
    </svg>
    <span className="jewelry-scene-glow" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-one" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-two" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-three" aria-hidden="true" />
  </section>;
}
