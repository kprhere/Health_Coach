import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import { calendarSelfTest } from './helpers.js';

if (import.meta.env && import.meta.env.DEV) {
  try { calendarSelfTest(); } catch (e) { console.warn('calendar self-test error', e); }
}

// Keyboard guard for iPhone Home Screen use. While a text field has focus the
// bottom nav is hidden, so it cannot ride up over the fields being filled in.
// When the keyboard closes, iOS can leave the page scrolled sideways and the
// fixed nav stuck mid-screen; scrolling back to x = 0 makes it lay out again.
const typesKeyboard = (el) => !!el && (
  el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
  || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(el.type || ''))
);
document.addEventListener('focusin', (event) => {
  if (typesKeyboard(event.target)) document.documentElement.classList.add('kb-open');
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (typesKeyboard(document.activeElement)) return;
    document.documentElement.classList.remove('kb-open');
    window.scrollTo(0, window.scrollY);
  }, 120);
});

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
