import type { CSSProperties } from 'react';
import { ClassFace, computeClassStats } from './ClassStatBars';
import { getClassPower } from '../game/power';
import { CLASSES, type ClassId } from '../game/config';

type StatusDuoProps = {
  preferences: [ClassId | null, ClassId | null];
  accountLevel: number;
  onChooseClasses: () => void;
};


function PreferenceStar() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14l-5.63 2.96 1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z" /></svg>;
}

function formatPower(value: number) {
  return Math.round(value).toLocaleString('pt-BR');
}

function Comparison({ title, leftClass, rightClass, leftValue, rightValue }: {
  title: string;
  leftClass: ClassId;
  rightClass: ClassId;
  leftValue: number;
  rightValue: number;
}) {
  const total = leftValue + rightValue;
  const leftShare = total > 0 ? leftValue / total * 100 : 50;
  const rightShare = 100 - leftShare;
  const leftWins = leftValue > rightValue;
  const rightWins = rightValue > leftValue;
  return <div className="status-page-comparison" style={{
    '--status-left': `var(--status-color-${leftClass})`,
    '--status-right': `var(--status-color-${rightClass})`,
  } as CSSProperties}>
    <strong className="status-page-comparison-title">{title}</strong>
    <div className="status-page-comparison-names">
      <strong className={leftWins ? 'is-winner' : ''}>{CLASSES[leftClass].label}</strong>
      <strong className={rightWins ? 'is-winner' : ''}>{CLASSES[rightClass].label}</strong>
    </div>
    <div className="status-page-bar" role="img" aria-label={`${title}: ${CLASSES[leftClass].label} ${Math.round(leftShare)}%, ${CLASSES[rightClass].label} ${Math.round(rightShare)}%`}>
      <div className="status-page-bar-left" style={{ width: `calc(${leftShare}% - 1px)` }} />
      <div className="status-page-bar-divider" />
      <div className="status-page-bar-right" style={{ width: `calc(${rightShare}% - 1px)` }} />
    </div>
    <div className="status-page-comparison-percentages"><span>{Math.round(leftShare)}%</span><span>{Math.round(rightShare)}%</span></div>
  </div>;
}

export default function StatusDuo({ preferences, accountLevel, onChooseClasses }: StatusDuoProps) {
  const selected = preferences.map((classId, index) => classId ? {
    classId,
    kind: index === 0 ? 'primary' as const : 'secondary' as const,
    power: getClassPower(classId, 0, 1 + accountLevel * 0.05).total,
    powerAt10: getClassPower(classId, 10, 1 + accountLevel * 0.05).total,
    stats: computeClassStats(classId),
  } : null).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (selected.length === 0) return <section className="status-page-panel status-page-empty">
    <strong>Escolha sua classe principal e secundária</strong>
    <button type="button" className="status-page-action" onClick={onChooseClasses}>Escolher classes</button>
  </section>;

  const primary = selected[0]!;
  const secondary = selected[1];
  const totalPower = selected.reduce((sum, entry) => sum + entry.power, 0);
  const totalPowerAt10 = selected.reduce((sum, entry) => sum + entry.powerAt10, 0);
  return <section className="status-page-panel">
    <div className="status-page-duo-cards">
      {selected.map(entry => <article className={`status-page-class-card status-page-${entry.classId}`} key={entry.classId}>
        <ClassFace classId={entry.classId} size={48} />
        <strong className="status-page-class-name">{CLASSES[entry.classId].label}</strong>
        <span className={`status-page-role ${entry.kind}`}><PreferenceStar />{entry.role}</span>
        <span className="status-page-power-label">Poder</span>
        <strong className="status-page-power-value">{formatPower(entry.power)}</strong>
        <small className="status-page-level10">Nível 10: {formatPower(entry.powerAt10)}</small>
      </article>)}
    </div>
    <div className="status-page-total">
      <div><span className="status-page-total-label">{secondary ? "PODER DA DUPLA" : "PODER DA CLASSE"}</span><small>Nível 10: {formatPower(totalPowerAt10)}</small></div>
      <strong className="status-page-total-value">{formatPower(totalPower)}</strong>
    </div>
    {secondary ? <div className="status-page-comparisons" aria-label="Comparativo entre as classes">
      <Comparison title="Dano por segundo" leftClass={primary.classId} rightClass={secondary.classId} leftValue={primary.stats.damagePerSecond} rightValue={secondary.stats.damagePerSecond} />
      <Comparison title="Inimigos por segundo" leftClass={primary.classId} rightClass={secondary.classId} leftValue={primary.stats.enemiesPerSecond} rightValue={secondary.stats.enemiesPerSecond} />
      <Comparison title="Aguenta (golpes)" leftClass={primary.classId} rightClass={secondary.classId} leftValue={primary.stats.hitsToSurvive} rightValue={secondary.stats.hitsToSurvive} />
      <Comparison title="Poder no nível 10" leftClass={primary.classId} rightClass={secondary.classId} leftValue={primary.powerAt10} rightValue={secondary.powerAt10} />
    </div> : <p className="status-page-single-note">Escolha uma classe secundária para comparar</p>}
  </section>;
}
