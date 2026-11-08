type ForgeSceneProps = {
  intensity: 0 | 1 | 2 | 3;
  hammering: boolean;
};

export default function ForgeScene({ intensity, hammering }: ForgeSceneProps) {
  return <section className={`forge-scene forge-intensity-${intensity}${hammering ? ' forge-hammering' : ''}`} aria-label="Cena ilustrada da forja">
    <svg className="forge-backdrop" viewBox="0 0 720 390" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Parede de pedra, pequena forja acesa, bigorna de aço sobre toco de madeira e martelo">
      <defs>
        <linearGradient id="forge-wall-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#77736b"/><stop offset=".48" stopColor="#595851"/><stop offset="1" stopColor="#373936"/>
        </linearGradient>
        <linearGradient id="forge-stone" x1="0" y1="0" x2=".18" y2="1">
          <stop offset="0" stopColor="#a19a8d"/><stop offset=".35" stopColor="#77756d"/><stop offset="1" stopColor="#494b47"/>
        </linearGradient>
        <linearGradient id="forge-stone-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b4aa99"/><stop offset=".5" stopColor="#858176"/><stop offset="1" stopColor="#555650"/>
        </linearGradient>
        <linearGradient id="forge-iron" x1="0" y1="0" x2=".2" y2="1">
          <stop offset="0" stopColor="#e0e6e6"/><stop offset=".18" stopColor="#aeb9bd"/><stop offset=".43" stopColor="#68777e"/><stop offset=".72" stopColor="#3e4b52"/><stop offset="1" stopColor="#252f35"/>
        </linearGradient>
        <linearGradient id="forge-iron-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0f3ee"/><stop offset=".22" stopColor="#c2ccce"/><stop offset=".62" stopColor="#849197"/><stop offset="1" stopColor="#56636a"/>
        </linearGradient>
        <linearGradient id="forge-wood" x1="0" y1="0" x2="1" y2=".2">
          <stop offset="0" stopColor="#4c2e1d"/><stop offset=".22" stopColor="#98613a"/><stop offset=".5" stopColor="#bd8450"/><stop offset=".78" stopColor="#80502f"/><stop offset="1" stopColor="#42291d"/>
        </linearGradient>
        <linearGradient id="forge-handle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#54331f"/><stop offset=".35" stopColor="#b27b49"/><stop offset=".62" stopColor="#d09a62"/><stop offset="1" stopColor="#55331f"/>
        </linearGradient>
        <radialGradient id="forge-firelight">
          <stop offset="0" stopColor="#ffbd55" stopOpacity=".9"/><stop offset=".45" stopColor="#ed762e" stopOpacity=".42"/><stop offset="1" stopColor="#d34c20" stopOpacity="0"/>
        </radialGradient>
        <filter id="forge-shadow" x="-40%" y="-40%" width="180%" height="190%">
          <feGaussianBlur stdDeviation="8"/>
        </filter>
        <filter id="forge-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="13"/>
        </filter>
      </defs>
      <rect width="720" height="390" fill="url(#forge-wall-base)"/>
      <path d="M0 0H720V48Q650 58 590 45T460 48T330 45T190 51T0 42Z" fill="#8a8377" opacity=".42"/>
      <g stroke="#393b38" strokeWidth="7" strokeLinejoin="round">
        <path d="M-20 66Q28 48 104 60L142 106Q132 133 53 137L-18 119Z" fill="url(#forge-stone-light)"/>
        <path d="M150 57Q216 43 287 61L312 105Q291 133 207 129L151 109Z" fill="url(#forge-stone)"/>
        <path d="M322 57Q397 42 463 58L491 105Q469 131 386 130L319 108Z" fill="url(#forge-stone-light)"/>
        <path d="M502 57Q583 42 650 58L677 104Q660 131 578 132L505 108Z" fill="url(#forge-stone)"/>
        <path d="M674 60Q715 54 742 65V135L690 133 669 105Z" fill="url(#forge-stone-light)"/>
        <path d="M-28 151Q45 130 116 148L143 194Q126 222 49 220L-22 199Z" fill="url(#forge-stone)"/>
        <path d="M150 145Q228 128 302 148L326 194Q307 220 226 219L151 198Z" fill="url(#forge-stone-light)"/>
        <path d="M335 145Q410 128 483 147L507 193Q488 221 408 218L336 198Z" fill="url(#forge-stone)"/>
        <path d="M516 146Q589 130 664 148L689 193Q669 220 589 220L516 198Z" fill="url(#forge-stone-light)"/>
        <path d="M-20 235Q53 218 125 236L148 282Q129 307 50 307L-20 287Z" fill="url(#forge-stone-light)"/>
        <path d="M155 232Q229 215 300 235L326 281Q305 307 227 307L155 286Z" fill="url(#forge-stone)"/>
        <path d="M337 232Q410 216 484 235L509 281Q489 308 410 306L337 285Z" fill="url(#forge-stone-light)"/>
        <path d="M520 232Q591 216 665 235L690 281Q669 307 590 307L520 286Z" fill="url(#forge-stone)"/>
      </g>
      <g fill="none" stroke="#d0c5b3" strokeWidth="3" opacity=".22" strokeLinecap="round">
        <path d="m18 72 74-8 27 8M173 65l66-5 45 9M347 66l72-8 48 9M531 66l76-7 42 8"/>
        <path d="m17 158 60-9 48 10M171 154l68-9 61 9M351 154l72-9 61 10M533 154l68-9 62 10"/>
        <path d="m16 246 65-8 51 9M172 244l72-8 52 10M352 243l66-8 61 10M534 244l73-8 61 10"/>
      </g>
      <path d="M0 314Q150 292 280 316T540 313T720 306V390H0Z" fill="#292b28"/>
      <path d="M0 333Q170 314 330 335T720 327V390H0Z" fill="#1d211f"/>
      <ellipse cx="154" cy="267" rx="144" ry="103" fill="url(#forge-firelight)" className="forge-fire-glow" filter="url(#forge-soft-glow)"/>
      <g className="forge-hearth">
        <ellipse cx="148" cy="300" rx="102" ry="18" fill="#111512" opacity=".55" filter="url(#forge-shadow)"/>
        <path d="M45 287 52 207Q56 181 82 170L199 170Q226 182 232 207L241 287Q226 309 202 314H81Q55 308 45 287Z" fill="url(#forge-stone)" stroke="#343633" strokeWidth="9"/>
        <path d="M54 211Q63 183 87 179H194Q216 186 225 211L199 225H80Z" fill="url(#forge-stone-light)" stroke="#b0a796" strokeWidth="3"/>
        <path d="M64 225Q89 237 111 228L105 296H78Q64 282 64 225Z" fill="#4c4d47" opacity=".72"/>
        <path d="M207 225 225 211 234 285 215 300 193 296Z" fill="#424640" opacity=".8"/>
        <path d="M89 290V233Q91 211 111 205H174Q197 211 200 233V290Q177 303 145 303Q111 303 89 290Z" fill="#151817" stroke="#333a35" strokeWidth="7"/>
        <path d="M98 286Q111 258 128 269Q137 241 150 255Q164 221 179 257Q189 266 194 286Z" fill="#dc5426" className="forge-flame forge-flame-back"/>
        <path d="M111 289Q125 259 139 273Q151 239 164 267Q178 251 189 289Z" fill="#ff8a2e" className="forge-flame forge-flame-mid"/>
        <path d="M133 290Q142 263 151 272Q162 256 170 290Z" fill="#ffd36d" className="forge-flame forge-flame-core"/>
        <path d="M75 176Q83 154 103 149H181Q204 155 211 177L194 190H92Z" fill="url(#forge-stone-light)" stroke="#343633" strokeWidth="7"/>
        <path d="M94 157Q112 142 137 145L178 148 195 163 167 171H105Z" fill="#c0b5a2" opacity=".55"/>
      </g>
      <g className="forge-wood-stump">
        <ellipse cx="430" cy="350" rx="151" ry="23" fill="#111512" opacity=".65" filter="url(#forge-shadow)"/>
        <path d="M337 258Q359 244 395 251L505 250Q541 247 559 267L549 346Q528 366 450 368Q370 367 344 347Z" fill="url(#forge-wood)" stroke="#402b1d" strokeWidth="8"/>
        <path d="M351 271Q388 281 414 268L406 350Q377 360 352 341Z" fill="#d49a5e" opacity=".3"/>
        <path d="M477 262Q517 258 541 274L533 343Q515 355 489 357Z" fill="#34251c" opacity=".42"/>
        <path d="M359 291Q390 304 414 293M356 318Q386 329 408 319M497 287Q520 296 536 287M493 327Q515 336 532 326" fill="none" stroke="#40291b" strokeWidth="5" strokeLinecap="round" opacity=".65"/>
        <path d="M375 255Q444 239 521 255" fill="none" stroke="#e2b47a" strokeWidth="5" strokeLinecap="round" opacity=".52"/>
        <ellipse cx="449" cy="256" rx="104" ry="17" fill="#c38c59" stroke="#513622" strokeWidth="5"/>
      </g>
      <g className="forge-anvil">
        <ellipse cx="439" cy="282" rx="152" ry="24" fill="#101513" opacity=".5" filter="url(#forge-shadow)"/>
        <path d="M345 228Q360 210 389 211H501Q528 213 546 230L530 248Q507 258 475 256H382Q351 253 339 241Z" fill="url(#forge-iron)" stroke="#273239" strokeWidth="7"/>
        <path d="M354 224Q375 205 409 207H505Q527 211 540 227Q523 238 496 239H379Q360 237 354 224Z" fill="url(#forge-iron-top)" stroke="#354149" strokeWidth="5"/>
        <path d="M374 217Q407 202 470 207Q500 208 519 216" fill="none" stroke="#f2f5ed" strokeWidth="5" strokeLinecap="round" opacity=".8"/>
        <path d="M388 244Q418 253 460 250L489 249 480 278Q465 292 435 293Q405 291 393 278Z" fill="url(#forge-iron)" stroke="#28343a" strokeWidth="6"/>
        <path d="M407 286Q438 293 472 284L489 314Q481 326 450 328H417Q393 322 393 310Z" fill="url(#forge-iron)" stroke="#273238" strokeWidth="6"/>
        <path d="M396 311Q438 322 486 311L495 328Q487 340 444 341Q405 339 389 328Z" fill="url(#forge-iron-top)" stroke="#303a40" strokeWidth="5"/>
        <path d="M348 229Q356 239 379 239H504" fill="none" stroke="#e8efee" strokeWidth="3" strokeLinecap="round" opacity=".52"/>
        <path d="M397 252Q426 263 477 256" fill="none" stroke="#d9e1df" strokeWidth="3" strokeLinecap="round" opacity=".28"/>
      </g>
      <g className="forge-hammer-art">
        <path d="M572 139Q567 133 574 126L596 109Q602 104 608 112L676 202Q682 210 674 216L652 233Q644 238 639 229Z" fill="url(#forge-handle)" stroke="#432b1d" strokeWidth="7"/>
        <path d="M588 124 601 113 664 204 650 217Z" fill="#e3b47a" opacity=".42"/>
        <path d="M540 110Q533 96 547 88L625 61Q641 55 648 70L662 107Q667 122 652 128L574 154Q557 160 551 143Z" fill="url(#forge-iron)" stroke="#263239" strokeWidth="8"/>
        <path d="M546 99Q550 87 566 83L624 63Q640 60 645 74L648 83 567 112Q554 116 546 107Z" fill="#e0e6e4" opacity=".76"/>
        <path d="M647 78Q662 100 657 119L649 125 635 87Z" fill="#344149" opacity=".8"/>
        <path d="M560 132 641 104" stroke="#f1f3ec" strokeWidth="3" opacity=".35"/>
      </g>
      <g className="forge-sparks" fill="#ffd16b" stroke="#ff9a35" strokeWidth="2" strokeLinecap="round">
        <path d="m354 218 6-23 5 22Z"/><path d="m524 215 7-22 4 23Z"/><path d="m385 194 4-17 5 17Z"/><path d="m499 190 6-18 4 19Z"/><circle cx="374" cy="207" r="3"/><circle cx="514" cy="204" r="3"/>
      </g>
    </svg>
  </section>;
}
