import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import InstallPrompt from './ui/InstallPrompt';
import './style.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Não foi possível registrar o service worker do Fíbula Online.', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <InstallPrompt />
  </React.StrictMode>,
);
