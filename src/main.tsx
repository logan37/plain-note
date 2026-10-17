import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Tauri Android draws edge-to-edge. Some WebViews report 0 for env(safe-area-*),
// so tag the document and apply a status-bar floor in CSS.
if (/Android/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('is-android');
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
