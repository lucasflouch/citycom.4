
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// --- KILL SWITCH: LIMPIEZA DE CACHÉ Y SERVICE WORKERS ---
// Este bloque asegura que si el usuario tiene una versión "Zombie", se autodestruya.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      console.log('Desregistrando Service Worker:', registration);
      registration.unregister();
    }
  }).catch(function(err) {
    console.error('Error al desregistrar SW:', err);
  });
}

if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach((name) => {
      caches.delete(name);
    });
    console.log('Cachés eliminados.');
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
