import { useState } from 'react';
import { CLASSES, type ClassId } from '../game/config';
import { CLASS_STORIES, ClassFace } from './ClassStatBars';

type Props = {
  onConfirm: (primary: ClassId, secondary: ClassId) => Promise<{ success: boolean; message?: string }>;
};

const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];

export default function ClassChoiceOnboarding({ onConfirm }: Props) {
  const [primary, setPrimary] = useState<ClassId | null>(null);
  const [secondary, setSecondary] = useState<ClassId | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const choose = (slot: 'primary' | 'secondary', classId: ClassId) => {
    if (busy) return;
    setFeedback('');
    if (slot === 'primary') {
      if (secondary === classId) {
        setPrimary(classId);
        setSecondary(primary);
      } else setPrimary(classId);
    } else if (primary === classId) {
      setSecondary(classId);
      setPrimary(secondary);
    } else setSecondary(classId);
  };

  const submit = async () => {
    if (!primary || !secondary || primary === secondary || busy) return;
    setBusy(true);
    setFeedback('');
    try {
      const result = await onConfirm(primary, secondary);
      if (!result.success) setFeedback(result.message || 'Não foi possível confirmar. Tente novamente.');
    } catch {
      setFeedback('Não foi possível confirmar suas classes. Tente novamente.');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const label = (classId: ClassId | null) => classId ? CLASSES[classId].label : 'Selecione uma classe';

  return <main className="class-choice-screen">
    <div className="class-choice-content">
      <header className="class-choice-welcome">
        <span className="class-choice-kicker">SUA JORNADA COMEÇA AQUI</span>
        <h1>Bem-vindo ao Fíbula</h1>
        <p>Obrigado por jogar! Este é o Fíbula. O jogo está em desenvolvimento. A partir deste momento, você pode escolher 2 classes, primária e secundária, para fazer parte da sua jornada. Estamos felizes em ter você aqui.</p>
      </header>

      <section className="class-choice-slots" aria-label="Escolha suas classes">
        {(['primary', 'secondary'] as const).map(slot => {
          const selected = slot === 'primary' ? primary : secondary;
          return <article className="class-choice-slot" key={slot}>
            <div className="class-choice-slot-heading">
              <span>{slot === 'primary' ? 'Primária' : 'Secundária'}</span>
              <strong>{label(selected)}</strong>
            </div>
            <div className="class-choice-options">
              {CLASS_IDS.map(classId => {
                const active = selected === classId;
                const takenByOther = slot === 'primary' ? secondary === classId : primary === classId;
                return <button
                  type="button"
                  key={classId}
                  className={`class-choice-option class-${classId}${active ? ' is-selected' : ''}${takenByOther ? ' is-other-slot' : ''}`}
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => choose(slot, classId)}
                >
                  <ClassFace classId={classId} size={52} />
                  <span><strong>{CLASSES[classId].label}</strong><small>{takenByOther ? 'Selecionada no outro espaço · tocar para trocar' : CLASSES[classId].description}</small></span>
                  {active && <b className="class-choice-check" aria-hidden="true">✓</b>}
                </button>;
              })}
            </div>
            {selected && <p className="class-choice-story">{CLASS_STORIES[selected]}</p>}
          </article>;
        })}
      </section>

      <div className="class-choice-footer">
        {feedback && <p className="class-choice-feedback" role="alert">{feedback}</p>}
        <button type="button" className="class-choice-confirm" disabled={!primary || !secondary || primary === secondary || busy} onClick={() => setConfirmOpen(true)}>Confirmar</button>
      </div>
    </div>

    {confirmOpen && <div className="class-choice-dialog-backdrop" role="presentation">
      <section className="class-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="class-choice-dialog-title">
        <h2 id="class-choice-dialog-title">Confirmar escolha definitiva</h2>
        <p>Esta escolha é definitiva. Primária: {label(primary)}. Secundária: {label(secondary)}. Não será possível trocar depois.</p>
        <div className="class-choice-dialog-actions">
          <button type="button" disabled={busy} onClick={() => setConfirmOpen(false)}>Voltar</button>
          <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Confirmando…' : 'Confirmar definitivamente'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
