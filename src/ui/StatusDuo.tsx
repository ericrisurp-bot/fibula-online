import { CLASSES, type ClassId } from '../game/config';
import { ClassFace } from './ClassStatBars';
import type { MatchHistoryEntry } from '../game/matchHistory';

type RankInfo = { position: number | null; total: number; previous: number | null; error: boolean };
type Props = {
  preferences: [ClassId | null, ClassId | null];
  powers: Partial<Record<ClassId, number>>;
  powerReady: boolean;
  weaponsLoading: boolean;
  rankings: { power: RankInfo; days: RankInfo };
  lastMatch: MatchHistoryEntry | null;
  history: MatchHistoryEntry[];
  onGoClasses: () => void;
};
function Trend({ rank }: { rank: RankInfo }) {
  if (!rank.position || !rank.previous || rank.position === rank.previous) return null;
  return <span className={rank.position < rank.previous ? 'status-page-trend up' : 'status-page-trend down'} aria-label={rank.position < rank.previous ? 'Subiu no ranking' : 'Desceu no ranking'}>{rank.position < rank.previous ? '▲' : '▼'}</span>;
}
function RankCard({ title, rank }: { title: string; rank: RankInfo }) {
  const hasValue = !!rank.position && rank.total > 0;
  return <article className="status-page-rank-card">
    <span>{title}</span>
    <strong>{hasValue ? `#${rank.position} de ${rank.total}` : '—'} <Trend rank={rank}/></strong>
    <small>{rank.error ? 'sem conexão' : hasValue ? 'posição atual' : 'sem posição ainda'}</small>
  </article>;
}
export default function StatusDuo({ preferences, powers, powerReady, weaponsLoading, rankings, lastMatch, history, onGoClasses }: Props) {
  const selected = preferences.flatMap((classId, index) => classId ? [{ classId, index }] : []);
  if (!selected.length) return <div className="status-page-content"><div className="status-page-empty">
    <strong>Escolha sua classe principal e secundária</strong><button type="button" onClick={onGoClasses}>Ir para Classes</button>
  </div></div>;
  const totalPower = powerReady ? selected.reduce((sum, item) => sum + (powers[item.classId] ?? 0), 0) : null;
  const maxDays = Math.max(1, ...history.map(item => item.days));
  const averageDays = history.length ? history.reduce((sum, item) => sum + item.days, 0) / history.length : 0;
  const bestDays = history.length ? Math.max(...history.map(item => item.days)) : 0;
  return <div className="status-page-content">
    <section className="status-page-power-overview" aria-label="Poder da dupla armada">
      <header><span>PODER DA DUPLA</span><strong>{totalPower === null ? '—' : totalPower}</strong></header>
      <div className="status-page-duo">{selected.map(item => {
        const power = powerReady ? powers[item.classId] : undefined;
        return <article className={`status-page-class class-${item.classId}`} key={item.classId}>
          <div className="status-page-class-head"><ClassFace classId={item.classId} size={34}/><div>
            <div className={`status-page-role ${item.index === 0 ? 'primary' : 'secondary'}`}><span aria-hidden="true">★</span>{item.index === 0 ? 'Principal' : 'Secundária'}</div>
            <div className="status-page-class-name">{CLASSES[item.classId].label}</div>
          </div></div>
          <div className="status-page-power"><span>PD ARMADO</span><strong>{power === undefined ? '—' : power}</strong></div>
        </article>;
      })}</div>
      {!powerReady && <small className="status-page-loading">{weaponsLoading ? 'Carregando armas…' : 'Armas indisponíveis'}</small>}
    </section>
    <section className="status-page-rankings" aria-label="Posição no ranking">
      <RankCard title="PODER" rank={rankings.power}/><RankCard title="DIAS" rank={rankings.days}/>
    </section>
    <section className="status-page-last-match">
      <span>ÚLTIMA PARTIDA</span>
      {lastMatch ? <strong>Sobreviveu {lastMatch.days} dias · {lastMatch.kills} abates</strong> : <small>Jogue uma partida para ver seu histórico</small>}
    </section>
    <section className="status-page-history" aria-label="Histórico das últimas partidas">
      <header><span>HISTÓRICO LOCAL</span><small>ÚLTIMAS {history.length}/10</small></header>
      {history.length ? <>
        <div className="status-page-history-bars">{history.map((match, index) => <div className={index === 0 ? 'latest' : ''} key={match.at + '-' + index} title={`${match.days} dias · ${match.kills} abates`}>
          <i style={{ height: `${Math.max(8, match.days / maxDays * 100)}%` }}/><small>{match.days}</small>
        </div>)}</div>
        <footer><span>MÉDIA <strong>{averageDays.toFixed(1)} dias</strong></span><span>MELHOR <strong>{bestDays} dias</strong></span></footer>
      </> : <small>Jogue uma partida para ver seu histórico</small>}
    </section>
  </div>;
}
