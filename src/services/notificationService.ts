
import { supabase } from '../supabaseClient';
import { VAPID_PUBLIC_KEY } from '../constants';

// Función auxiliar para convertir VAPID Key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const subscribeToPushNotifications = async (userId: string): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications no soportadas en este navegador.');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // 1. Pedir permiso al usuario
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Permiso de notificaciones denegado.');
      return false;
    }

    // 2. Suscribirse al PushManager del navegador
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    // 3. Serializar y guardar en Supabase
    const subJson = subscription.toJSON();
    
    if (!subJson.keys?.p256dh || !subJson.keys?.auth || !subJson.endpoint) {
        throw new Error("No se pudieron generar las llaves de suscripción.");
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    }, { onConflict: 'user_id, endpoint' });

    if (error) throw error;

    console.log('✅ Suscripción Push guardada en DB.');
    return true;

  } catch (error) {
    console.error('Error suscribiendo a push:', error);
    return false;
  }
};
