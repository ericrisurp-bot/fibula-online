import { useState } from 'react';
import { CLASSES, type ClassId } from '../game/config';

type Props = {
  primary: ClassId | null;
  secondary: ClassId | null;
  onConfirm: (primary: ClassId, secondary: ClassId) => Promise<{ success: boolean; message?: string }>;
};

const WELCOME_TEXT = 'Obrigado por jogar! Este é o Fíbula. O jogo está em desenvolvimento. A partir deste momento, você pode escolher 2 classes, primária e secundária, para fazer parte da sua jornada. Estamos felizes em ter você aqui.';

export default function ClassChoiceOnboarding({ primary, secondary, onConfirm }: Props) {
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const validChoice = Boolean(primary && secondary && primary !== secondary);
  const submit = async () => {
    if (!primary || !secondary || primary === secondary || busy) return;
    setBusy(true);
    setFeedback('');
    try {
      const result = await onConfirm(primary, secondary);
      if (result.success) setConfirmOpen(false);
      else setFeedback(result.message || 'Não foi possível confirmar suas classes. Tente novamente.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível confirmar suas classes. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    {welcomeOpen && <div className="class-first-backdrop" role="presentation">
      <section className="class-first-dialog class-first-welcome" role="dialog" aria-modal="true" aria-labelledby="class-first-welcome-title">
        <h1 id="class-first-welcome-title">Bem-vindo ao Fíbula</h1>
        <p>{WELCOME_TEXT}</p>
        <button type="button" onClick={() => setWelcomeOpen(false)}>Começar</button>
      </section>
    </div>}

    <div className="class-first-footer">
      <button type="button" disabled={!validChoice || busy} onClick={() => { setFeedback(''); setConfirmOpen(true); }}>Confirmar</button>
    </div>

    {confirmOpen && <div className="class-first-backdrop" role="presentation">
      <section className="class-first-dialog" role="dialog" aria-modal="true" aria-labelledby="class-first-confirm-title">
        <h2 id="class-first-confirm-title">Confirmar escolha</h2>
        <p>Tem certeza? Esta escolha é definitiva para a sua conta. Principal: {primary ? CLASSES[primary].label : '—'}. Secundária: {secondary ? CLASSES[secondary].label : '—'}. Não será possível trocar depois.</p>
        {feedback && <p className="class-first-feedback" role="alert">{feedback}</p>}
        <div className="class-first-actions">
          <button type="button" disabled={busy} onClick={() => setConfirmOpen(false)}>Voltar</button>
          <button type="button" disabled={busy || !validChoice} onClick={() => void submit()}>{busy ? 'Confirmando…' : 'Confirmar definitivamente'}</button>
        </div>
      </section>
    </div>}
  </>;
}
