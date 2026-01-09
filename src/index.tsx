
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// --- KILL SWITCH NUCLEAR: LIMPIEZA DE CACHÉ Y SERVICE WORKERS ---
// Esto garantiza que los usuarios siempre carguen la última versión del deploy
// eliminando cualquier versión "Zombie" cacheada por instalaciones anteriores de PWA.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      console.log('☢️ Service Worker Kill Switch: Desregistrando', registration);
      registration.unregister();
    }
  }).catch(function(err) {
    console.error('Error al desregistrar SW:', err);
  });
}

if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach((name) => {
      console.log('☢️ Cache Kill Switch: Eliminando caché', name);
      caches.delete(name);
    });
  });
}
// ---------------------------------------------------------

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
