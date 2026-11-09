type TailorSceneProps = { children?: import('react').ReactNode };

export default function TailorScene({ children }: TailorSceneProps) {
  return <section className="tailor-scene" aria-label="Ateliê de costura">
    <div className="tailor-wall" aria-hidden="true">
      <div className="tailor-title-plaque"><strong>ALFAIATARIA</strong></div>
      <div className="tailor-shelf"><i className="tailor-fabric-roll roll-cream"/><i className="tailor-fabric-roll roll-olive"/><i className="tailor-fabric-roll roll-wine"/><i className="tailor-fabric-roll roll-linen"/></div>
      <span className="tailor-lamp-cord"/><span className="tailor-lamp-shade"/><span className="tailor-lamp-light"/>
    </div>
    <div className="tailor-mannequin" aria-hidden="true"><span className="tailor-mannequin-neck"/><span className="tailor-mannequin-body"/><span className="tailor-mannequin-seam"/><span className="tailor-mannequin-stand"/><span className="tailor-mannequin-foot"/></div>
    <div className="tailor-table" aria-hidden="true"><span className="tailor-table-top"/><span className="tailor-table-front"/><span className="tailor-table-leg left"/><span className="tailor-table-leg right"/><span className="tailor-spool spool-olive"/><span className="tailor-spool spool-wine"/><span className="tailor-scissors"/><span className="tailor-needle"/><span className="tailor-folded-cloth"/></div>
    <div className="tailor-scene-slots">{children}</div>
  </section>;
}
