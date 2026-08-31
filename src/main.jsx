import React from 'react';
import { createRoot } from 'react-dom/client';
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
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Recomp OS: offline support could not be enabled.', error);
    });
  });
}
