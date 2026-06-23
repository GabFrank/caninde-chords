import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// @ts-ignore - virtual module from vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register';

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      registerSW({ immediate: true });
    }, 1000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
