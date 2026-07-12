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
