import { useCallback, useState } from 'react';
import { DownloadModal } from './DownloadModal';

export default function PublicDownloadPage() {
  const [modalOpen, setModalOpen] = useState(true);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const openModal = useCallback(() => setModalOpen(true), []);

  if (modalOpen) {
    return <DownloadModal onClose={closeModal} />;
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: '#222322',
        color: '#f0f0f0',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <button
        type="button"
        onClick={openModal}
        style={{
          minHeight: 50,
          padding: '12px 22px',
          border: 0,
          borderRadius: 10,
          background: '#e2e4e2',
          color: '#222322',
          fontSize: 14,
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        Abrir download do Fíbula
      </button>
    </main>
  );
}
