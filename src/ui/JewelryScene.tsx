type JewelrySceneProps = {
  revealAnimating: boolean;
  children?: import('react').ReactNode;
};

export default function JewelryScene({ revealAnimating, children }: JewelrySceneProps) {
  return <section className={'jewelry-scene' + (revealAnimating ? ' jewelry-revealing' : '')} aria-label="Bancada de joalheiro">
    <div className="jewelry-scene-wall" aria-hidden="true">
      <span className="jewelry-wall-shelf" />
      <span className="jewelry-lamp-arm" />
      <span className="jewelry-lamp-shade" />
      <span className="jewelry-loupe" />
      <span className="jewelry-decor-gem jewelry-decor-gem-one" />
      <span className="jewelry-decor-gem jewelry-decor-gem-two" />
      <span className="jewelry-light-beam" />
    </div>
    <div className="jewelry-workbench" aria-hidden="true">
      <span className="jewelry-bench-edge" />
      <span className="jewelry-velvet-pad" />
      <span className="jewelry-bench-inlay" />
    </div>
    <div className="jewelry-scene-header"><h2>JOALHERIA</h2></div>
    <div className="jewelry-scene-slots">{children}</div>
    <span className="jewelry-scene-glow" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-one" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-two" aria-hidden="true" />
    <span className="jewelry-scene-spark jewelry-spark-three" aria-hidden="true" />
  </section>;
}
