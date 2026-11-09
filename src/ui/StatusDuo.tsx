import type { CSSProperties } from 'react';
import { CLASSES, type ClassId } from '../game/config';
import { getClassPower } from '../game/power';
import { CLASS_STAT_ICONS, ClassFace, computeClassStats } from './ClassStatBars';

type Props = { preferences: [ClassId | null, ClassId | null]; accountLevel: number; onGoClasses: () => void };
const METRICS = [
 { key: 'damagePerSecond', label: 'Dano por segundo', icon: CLASS_STAT_ICONS.damagePerSecond, digits: 1 },
 { key: 'enemiesPerSecond', label: 'Inimigos por segundo', icon: CLASS_STAT_ICONS.enemiesPerSecond, digits: 2 },
 { key: 'hitsToSurvive', label: 'Aguenta (golpes)', icon: CLASS_STAT_ICONS.hits, digits: 0 },
 { key: 'powerAt10', label: 'Poder · nível 10', icon: CLASS_STAT_ICONS.damage, digits: 0 },
] as const;
function Star() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14l-5.63 2.96 1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z"/></svg>; }

export default function StatusDuo({ preferences, accountLevel, onGoClasses }: Props) {
 const pointsPerLevel = 1 + accountLevel * 0.05;
 const selected = preferences.map((classId, index) => classId ? {
   classId, index,
   power: Math.round(getClassPower(classId, 0, pointsPerLevel).total),
   powerAt10: getClassPower(classId, 10, pointsPerLevel).total,
   stats: computeClassStats(classId),
 } : null).filter((item): item is NonNullable<typeof item> => item !== null);
 const left = selected[0] ?? null, right = selected[1] ?? null;
 const metrics = left && right ? METRICS.map(metric => {
   const value = (item: typeof left) => metric.key === 'powerAt10' ? item.powerAt10 : item.stats[metric.key];
   const a = value(left), b = value(right), total = a + b;
   const aPercent = total > 0 ? a / total * 100 : 50;
   return { ...metric, a, b, aPercent, bPercent: 100 - aPercent, leftWins: a > b, rightWins: b > a };
 }) : [];
 const style = left && right ? {
   '--duo-left': ({ guerreiro: '#a52d2d', mago: '#7042a8', arqueiro: '#865e05', druida: '#236b3b' }[left.classId]),
   '--duo-right': ({ guerreiro: '#a52d2d', mago: '#7042a8', arqueiro: '#865e05', druida: '#236b3b' }[right.classId]),
 } as CSSProperties : undefined;
 if (!selected.length) return <div className="status-page-content"><div className="status-page-empty">
   <strong>Escolha sua classe principal e secundária</strong><button type="button" onClick={onGoClasses}>Ir para Classes</button>
 </div></div>;
 return <div className="status-page-content">
   <div className="status-page-duo">{selected.map(item => <article className={'status-page-class class-' + item.classId} key={item.classId}>
     <div className="status-page-class-head"><ClassFace classId={item.classId} size={38}/><div>
       <div className={'status-page-role ' + (item.index === 0 ? 'primary' : 'secondary')}><Star/>{item.index === 0 ? 'Principal' : 'Secundária'}</div>
       <div className="status-page-class-name">{CLASSES[item.classId].label}</div>
     </div></div>
     <div className="status-page-power"><span>PODER</span><strong>{item.power}</strong></div><small>Nível 10: {Math.round(item.powerAt10)}</small>
   </article>)}</div>
   <section className="status-page-total" aria-label="Poder da dupla">
     <div><span>PODER DA DUPLA</span><strong>{selected.reduce((sum, item) => sum + item.power, 0)}</strong></div>
     <small>Nível 10: {Math.round(selected.reduce((sum, item) => sum + item.powerAt10, 0))}</small>
   </section>
   {left && right ? <section className="status-page-comparison" style={style}><h3>COMPARATIVO</h3>
     {metrics.map(metric => {
       const aPercentRounded = Math.round(metric.aPercent), bPercentRounded = 100 - aPercentRounded;
       return <article className="status-page-metric" key={metric.key}>
         <div className="status-page-metric-head"><span>{metric.icon} {metric.label}</span><strong>{metric.a.toFixed(metric.digits)} × {metric.b.toFixed(metric.digits)}</strong></div>
         <div className="status-page-split" role="img" aria-label={CLASSES[left.classId].label + ': ' + aPercentRounded + '%; ' + CLASSES[right.classId].label + ': ' + bPercentRounded + '%'}>
           <span className="left" style={{width: metric.aPercent + '%'}}/><span className="right" style={{width: metric.bPercent + '%'}}/><i style={{left: metric.aPercent + '%'}}/>
         </div>
         <div className="status-page-percentages"><strong className={metric.leftWins ? 'winner' : ''}>{CLASSES[left.classId].label} · {aPercentRounded}%</strong><strong className={metric.rightWins ? 'winner' : ''}>{CLASSES[right.classId].label} · {bPercentRounded}%</strong></div>
       </article>;
     })}
   </section> : <div className="status-page-empty">Escolha uma classe secundária para comparar</div>}
 </div>;
}
