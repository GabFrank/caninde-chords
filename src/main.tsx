import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Buffer } from 'buffer';
import App from './App.tsx';

// Polyfill Buffer for simple-peer compatibility
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}
import { AuthProvider } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
// @ts-ignore - virtual module from vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register';

// Register service worker with a slight delay to avoid conflicts during initial mount
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      registerSW({ immediate: true });
    }, 1000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
