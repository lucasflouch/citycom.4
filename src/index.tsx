import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ☢️ NUCLEAR CLEANUP PROTOCOL ☢️
// Esta lógica asegura que los clientes eliminen cualquier versión cacheada obsoleta (PWA/SW)
// y garantiza que se cargue la versión más reciente de la aplicación.
const executeNuclearCleanup = async () => {
  // Cambiar este ID si se necesita forzar una nueva limpieza masiva en el futuro
  const CLEANUP_ID = 'cleanup_v2026_refresh'; 

  // Si ya ejecutamos la limpieza para esta versión, salimos para ser eficientes
  if (localStorage.getItem(CLEANUP_ID)) {
    return;
  }

  console.log('☢️ Iniciando protocolo de limpieza de caché...');

  try {
    // 1. Desregistrar todos los Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        console.log('SW: Desregistrando', registration.scope);
        await registration.unregister();
      }
    }

    // 2. Eliminar todas las Cache Storage (Cache API)
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          console.log('Cache: Eliminando', key);
          return caches.delete(key);
        })
      );
    }

    // 3. Marcar limpieza como completada
    localStorage.setItem(CLEANUP_ID, 'true');
    console.log('✅ Limpieza completada exitosamente.');

  } catch (error) {
    console.error('⚠️ Error durante la limpieza:', error);
  }
};

// Ejecutar limpieza inmediatamente
executeNuclearCleanup();

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}