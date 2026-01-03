
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Profile, SubscriptionPlan, Session, SubscriptionHistoryEntry } from '../types';

interface ProfilePageProps {
  session: Session;
  profile: Profile;
  plans: SubscriptionPlan[];
  onProfileUpdate: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ session, profile, plans, onProfileUpdate }) => {
  const [nombre, setNombre] = useState(profile.nombre || '');
  const [telefono, setTelefono] = useState(profile.telefono || '');
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [history, setHistory] = useState<SubscriptionHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoadingHistory(true);
      const { data, error } = await supabase
        .from('subscription_history')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (error) console.error("Error fetching history:", error);
      else setHistory(data as SubscriptionHistoryEntry[]);
      setLoadingHistory(false);
    };
    fetchHistory();
  }, [session.user.id]);

  const currentPlan = plans.find(p => p.id === profile.plan_id) || plans.find(p => p.precio === 0);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nombre, telefono })
        .eq('id', session.user.id);
      
      if (error) throw error;
      setMsg({ type: 'success', text: 'Datos actualizados correctamente.' });
      onProfileUpdate();
    } catch (error) {
      setMsg({ type: 'error', text: 'Error al actualizar datos.' });
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '∞';
    return new Date(dateString).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Columna Izquierda: Datos Personales */}
      <div className="bg-white rounded-[3rem] p-8 shadow-soft border border-slate-50 h-fit">
        <h2 className="text-xl font-black uppercase text-slate-800 tracking-tighter mb-6">Mis Datos</h2>
        
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Email</label>
            <input 
              type="text" 
              disabled 
              value={session.user.email} 
              className="w-full p-4 bg-slate-100 rounded-2xl border-none font-bold text-slate-500 opacity-70 cursor-not-allowed" 
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nombre Completo</label>
            <input 
              type="text" 
              required
              value={nombre} 
              onChange={e => setNombre(e.target.value)}
              className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
           <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Teléfono</label>
            <input 
              type="tel" 
              required
              value={telefono} 
              onChange={e => setTelefono(e.target.value)}
              className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>

          {msg && (
            <div className={`p-4 rounded-2xl text-xs font-bold ${msg.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {msg.text}
            </div>
          )}

          <button 
            disabled={updating}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-indigo hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {updating ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>

      {/* Columna Derecha: Suscripción e Historial */}
      <div className="md:col-span-2 space-y-8">
        {/* Tarjeta de Suscripción Actual */}
        <div className="bg-slate-900 text-white rounded-[3rem] p-8 shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Plan Actual</p>
              <h3 className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-2">{currentPlan?.nombre}</h3>
              <p className="font-medium text-slate-300">
                {profile.plan_expires_at 
                  ? `Vence el ${formatDate(profile.plan_expires_at)}` 
                  : 'Suscripción sin vencimiento definido'}
              </p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${profile.plan_id === 'free' ? 'bg-slate-700 text-slate-300' : 'bg-green-500 text-white'}`}>
                {profile.plan_id === 'free' ? 'Básico' : 'Activo'}
              </span>
            </div>
          </div>
          {/* Decorative element */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600 rounded-full blur-[80px] opacity-30"></div>
        </div>

        {/* Tabla de Historial */}
        <div className="bg-white rounded-[3rem] p-8 shadow-soft border border-slate-50">
          <h3 className="text-xl font-black uppercase text-slate-800 tracking-tighter mb-6">Historial de Pagos</h3>
          
          {loadingHistory ? (
             <p className="text-center text-slate-400 font-bold text-xs">Cargando historial...</p>
          ) : history.length === 0 ? (
             <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <p className="text-slate-400 font-bold text-sm">No hay registros de pagos anteriores.</p>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-4 text-[9px] font-black uppercase text-slate-400 tracking-widest pl-4">Fecha</th>
                    <th className="pb-4 text-[9px] font-black uppercase text-slate-400 tracking-widest">Plan</th>
                    <th className="pb-4 text-[9px] font-black uppercase text-slate-400 tracking-widest">Monto</th>
                    <th className="pb-4 text-[9px] font-black uppercase text-slate-400 tracking-widest">ID Pago</th>
                    <th className="pb-4 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right pr-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-slate-600">
                  {history.map((entry) => {
                    const planName = plans.find(p => p.id === entry.plan_id)?.nombre || 'Desconocido';
                    return (
                      <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-4 pl-4">{new Date(entry.created_at).toLocaleDateString()}</td>
                        <td className="py-4 text-indigo-600">{planName}</td>
                        <td className="py-4">${entry.amount}</td>
                        <td className="py-4 text-xs font-mono text-slate-400">{entry.payment_id || '-'}</td>
                        <td className="py-4 text-right pr-4">
                            <span className={`text-[9px] px-2 py-1 rounded-lg uppercase tracking-widest ${entry.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                {entry.status}
                            </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
