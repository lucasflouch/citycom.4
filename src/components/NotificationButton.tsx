
import React, { useState } from 'react';
import { subscribeToPushNotifications } from '../services/notificationService';

interface NotificationButtonProps {
    userId: string;
}

const NotificationButton: React.FC<NotificationButtonProps> = ({ userId }) => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'denied'>('idle');

    const handleSubscribe = async () => {
        setStatus('loading');
        const success = await subscribeToPushNotifications(userId);
        setStatus(success ? 'success' : 'denied');
        
        if (success) {
            setTimeout(() => setStatus('idle'), 3000); // Reset visual después de un rato
        }
    };

    if (Notification.permission === 'granted' && status === 'idle') return null; // Ya tiene permiso, no mostramos nada

    return (
        <button
            onClick={handleSubscribe}
            disabled={status === 'loading' || status === 'success'}
            className={`
                fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-full shadow-2xl transition-all duration-300
                ${status === 'success' ? 'bg-green-500 text-white scale-110' : 'bg-slate-900 text-white hover:bg-indigo-600'}
            `}
        >
            <span className="text-xl">
                {status === 'loading' ? '⏳' : status === 'success' ? '🔔' : '🔕'}
            </span>
            <span className="font-bold text-xs uppercase tracking-widest">
                {status === 'loading' ? 'Activando...' : status === 'success' ? '¡Listo!' : 'Activar Avisos'}
            </span>
        </button>
    );
};

export default NotificationButton;
