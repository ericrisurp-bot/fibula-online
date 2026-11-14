import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AuthGate from './auth/AuthGate';
import InstallPrompt from './ui/InstallPrompt';
import { AndroidReleaseProvider } from './ui/AndroidRelease';
import PublicDownloadPage from './ui/PublicDownloadPage';
import WorldBackdropPreview from './ui/WorldBackdropPreview';
import './style.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Não foi possível registrar o service worker do Fíbula Online.', error);
    });
  });
}

const hostname = window.location.hostname;
const isPreviewHost = hostname.endsWith('.fibula.iericris.com.br')
  || hostname.endsWith('.fibula-online.pages.dev');
const isWorldPreview = isPreviewHost && window.location.pathname === '/preview-cenario';
const isPublicDownload = window.location.pathname === '/download';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isWorldPreview ? (
      <WorldBackdropPreview />
    ) : (
      <AndroidReleaseProvider>
        {isPublicDownload ? (
          <PublicDownloadPage />
        ) : (
          <>
            <AuthGate>
              <App />
            </AuthGate>
            <InstallPrompt />
          </>
        )}
      </AndroidReleaseProvider>
    )}
  </React.StrictMode>,
);
