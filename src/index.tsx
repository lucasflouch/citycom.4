
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// @ts-ignore - El módulo virtual es provisto por vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register';

// Registramos el Service Worker
// immediate: true fuerza el registro lo antes posible.
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('Nueva versión disponible. Actualizando...');
  },
  onOfflineReady() {
    console.log('App lista para uso offline.');
  },
  immediate: true 
});

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
