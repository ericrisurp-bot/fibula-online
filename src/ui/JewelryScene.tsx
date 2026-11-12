type JewelrySceneProps = {
  revealAnimating: boolean;
};

export default function JewelryScene({ revealAnimating }: JewelrySceneProps) {
  return <section className={'jewelry-scene' + (revealAnimating ? ' jewelry-revealing' : '')} aria-label="Oficina de ourivesaria">
    <div className="jewelry-scene-wall" aria-hidden="true">
      <span className="jewelry-wall-stone-detail" />
      <span className="jewelry-wall-inlay" />
      <div className="jewelry-wall-cabinet jewelry-wall-cabinet-left">
        <span className="jewelry-cabinet-shelf" />
        <span className="jewelry-cabinet-box jewelry-cabinet-box-one" />
        <span className="jewelry-cabinet-box jewelry-cabinet-box-two" />
        <span className="jewelry-cabinet-drawer" />
      </div>
      <div className="jewelry-wall-cabinet jewelry-wall-cabinet-right">
        <span className="jewelry-cabinet-shelf" />
        <span className="jewelry-cabinet-box jewelry-cabinet-box-three" />
        <span className="jewelry-cabinet-box jewelry-cabinet-box-four" />
        <span className="jewelry-cabinet-drawer" />
      </div>
      <div className="jewelry-wall-shelf">
        <span className="jewelry-shelf-support jewelry-shelf-support-left" />
        <span className="jewelry-shelf-support jewelry-shelf-support-right" />
        <span className="jewelry-shelf-box jewelry-shelf-box-ruby" />
        <span className="jewelry-shelf-box jewelry-shelf-box-sapphire" />
        <span className="jewelry-shelf-box jewelry-shelf-box-emerald" />
      </div>
      <span className="jewelry-lamp-cord" />
      <span className="jewelry-lamp-shade" />
      <span className="jewelry-light-beam" />
    </div>
    <div className="jewelry-workbench" aria-hidden="true">
      <span className="jewelry-bench-leg jewelry-bench-leg-left" />
      <span className="jewelry-bench-leg jewelry-bench-leg-right" />
      <div className="jewelry-bench-front">
        <span className="jewelry-bench-drawer jewelry-bench-drawer-left" />
        <span className="jewelry-bench-drawer jewelry-bench-drawer-center" />
        <span className="jewelry-bench-drawer jewelry-bench-drawer-right" />
      </div>
      <div className="jewelry-bench-top">
        <span className="jewelry-tool-tray" />
        <span className="jewelry-tweezers" />
        <span className="jewelry-bench-loupe" />
        <span className="jewelry-cutting-stand"><i /></span>
        <span className="jewelry-gem-box jewelry-gem-box-left"><i /></span>
        <span className="jewelry-gem-box jewelry-gem-box-right"><i /></span>
        <span className="jewelry-raw-gem jewelry-raw-gem-ruby" />
        <span className="jewelry-raw-gem jewelry-raw-gem-teal" />
      </div>
    </div>
    <span className="jewelry-scene-glow" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-one" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-two" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-three" aria-hidden="true" />
  </section>;
}
