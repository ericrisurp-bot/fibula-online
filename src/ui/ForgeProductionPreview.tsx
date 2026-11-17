import { WEAPON_CORE_POINTS_PER_VALUE, type CraftedWeapon } from '../game/weapons';
import { armorEffectiveValue, armorLiningEffectiveValue, type CraftedArmor } from '../game/armorCrafting';
import { ArmorPieceIcon } from './ArmorArsenal';

type ForgeProductionPreviewProps =
  | { kind: 'weapon'; weapon: CraftedWeapon; materials: string[] }
  | { kind: 'armor'; armor: CraftedArmor };

const rarityLabels: Record<string, string> = {
  normal: 'Normal', common: 'Comum', uncommon: 'Incomum', rare: 'Rara', legendary: 'Lendária',
};
const weaponNames: Record<CraftedWeapon['model'], string> = {
  espada: 'Espada', arco: 'Arco', cajado: 'Cajado', bastao: 'Bastão da Natureza',
};
const weaponAttributeLabels: Record<string, string> = {
  forca: 'Força', inteligencia: 'Inteligência', destreza: 'Destreza',
  velocidadeAtaque: 'Velocidade de ataque', vida: 'Vida', armadura: 'Armadura',
  resistenciaMagica: 'Resistência mágica', velocidadeMovimento: 'Velocidade de movimento',
  esquiva: 'Esquiva',
};
const armorNames: Record<CraftedArmor['piece'], string> = {
  capacete: 'Capacete', peitoral: 'Peitoral', calca: 'Calça', bota: 'Bota', luva: 'Luva',
};
const armorAttributeLabels: Record<string, string> = {
  armadura: 'Armadura', vida: 'Vida', mobilidade: 'Mobilidade', esquiva: 'Esquiva',
};
const liningLabels: Record<CraftedArmor['lining'], string> = {
  algodao: 'Algodão', linho: 'Linho', couro_refinado: 'Couro refinado',
};

export default function ForgeProductionPreview(props: ForgeProductionPreviewProps) {
  const isWeapon = props.kind === 'weapon';
  const name = isWeapon ? weaponNames[props.weapon.model] : armorNames[props.armor.piece];
  const rarity = isWeapon ? props.weapon.rarity : props.armor.rarity;
  const stars = isWeapon ? null : props.armor.stars;
  const surp = isWeapon ? props.weapon.surp : props.armor.surp;
  const attributes = isWeapon ? props.weapon.attributes : props.armor.attributes.map(attribute => ({ ...attribute, value: armorEffectiveValue(props.armor, attribute.key) }));
  const numberLabel = (value: number, maximumFractionDigits = 2) =>
    value.toLocaleString('pt-BR', { maximumFractionDigits });
  const attributeValueLabel = (key: string, value: number) => {
    if (isWeapon) return `+${(value * WEAPON_CORE_POINTS_PER_VALUE).toFixed(1).replace('.', ',')}`;
    if (key === 'esquiva') return `+${numberLabel(value * 100)}%`;
    if (key === 'armadura') return `+${numberLabel(value)} pontos`;
    return `+${numberLabel(value)}`;
  };
  const liningValue = isWeapon ? null : armorLiningEffectiveValue(props.armor);
  const liningValueLabel = isWeapon ? '' : props.armor.lining === 'couro_refinado'
    ? `+${numberLabel(liningValue! * 100)}% XP`
    : props.armor.lining === 'algodao'
      ? `+${numberLabel(liningValue!)} vida`
      : `+${numberLabel(liningValue!)} mobilidade`;

  return <section className="forge-production-result" aria-label="Equipamento recém-fabricado">
    <div className="forge-production-result-main">
      <div className="forge-production-result-art">
        {isWeapon
          ? <img src={`/assets/weapons/${props.weapon.model === 'bastao' ? 'rod-nature' : props.weapon.model === 'espada' ? 'sword-stone' : props.weapon.model === 'arco' ? 'arch-stone' : 'staff-stone'}.png`} alt="" aria-hidden="true" />
          : <ArmorPieceIcon armor={props.armor} />}
      </div>
      <div className="forge-production-result-copy">
        <strong>{name}</strong>
        <span>{isWeapon ? (props.materials.length ? props.materials.join(' · ') : `Nível ${props.weapon.tier}`) : props.armor.type === 'bronze' ? 'Bronze' : 'Couro'} · {rarityLabels[rarity]}</span>
        <small>{stars !== null ? `${'★'.repeat(stars)}` : surp ? 'SURP' : 'Sem SURP'}{surp && stars !== null ? ' · SURP' : ''}</small>
      </div>
    </div>
    <details className="forge-production-details">
      <summary>Detalhes do equipamento</summary>
      <div className="forge-production-details-content">
        <div><span>Nome</span><strong>{name}</strong></div>
        <div><span>Material</span><strong>{isWeapon ? (props.materials.length ? props.materials.join(' · ') : `Nível ${props.weapon.tier}`) : props.armor.type === 'bronze' ? 'Bronze' : 'Couro'}</strong></div>
        <div><span>Raridade</span><strong>{rarityLabels[rarity]}</strong></div>
        {stars !== null && <div><span>Estrelas</span><strong>{'★'.repeat(stars)}</strong></div>}
        {surp && <div><span>SURP</span><strong>Sim</strong></div>}
        {isWeapon && <div><span>Tier</span><strong>{props.weapon.tier}</strong></div>}
        {isWeapon && <div><span>Dano</span><strong>{numberLabel(props.weapon.damage)}</strong></div>}
        {attributes.map(attribute => <div key={attribute.key}>
          <span>{(isWeapon ? weaponAttributeLabels : armorAttributeLabels)[attribute.key] ?? attribute.key}</span>
          <strong>{attributeValueLabel(attribute.key, attribute.value)}</strong>
        </div>)}
        {!isWeapon && <div><span>Forro</span><strong>{liningLabels[props.armor.lining]} · {liningValueLabel}</strong></div>}
      </div>
    </details>
    <p>Equipamento salvo no Arsenal. Feche a Bigorna para acessá-lo.</p>
  </section>;
}
