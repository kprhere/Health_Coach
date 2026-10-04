import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import './ui/tokens.css';
import './styles.css';
import App from './App.jsx';
import { calendarSelfTest } from './helpers.js';

if (import.meta.env && import.meta.env.DEV) {
  try { calendarSelfTest(); } catch (e) { console.warn('calendar self-test error', e); }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      // A finished download of new code is announced to the app, which offers
      // an Update button rather than reloading on its own.
      const announce = () => window.dispatchEvent(new CustomEvent('recomp-sw-update', { detail: registration }));
      if (registration.waiting && navigator.serviceWorker.controller) announce();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce();
        });
      });
    }).catch((error) => {
      console.warn('Recomp OS: offline support could not be enabled.', error);
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
