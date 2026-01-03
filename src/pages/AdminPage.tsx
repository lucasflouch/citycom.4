
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Profile, Session, SubscriptionPlan } from '../types';

interface AdminPageProps {
  session: Session;
  plans: SubscriptionPlan[];
}

const AdminPage: React.FC<AdminPageProps> = ({ session, plans }) => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Estado para el modal de edición
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [newPlanId, setNewPlanId] = useState('');
  const [newExpireDate, setNewExpireDate] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    
    if (search) {
      query = query.or(`email.ilike.%${search}%,nombre.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) console.error(error);
    else setUsers(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("¿ESTÁS SEGURO? Esto borrará el usuario y sus comercios permanentemente.")) return;
    
    // En Supabase, borrar el usuario de Auth requiere Service Role, 
    // aquí borramos el profile y los comercios asociados por cascade o políticas.
    // Para borrar de auth.users se necesitaría una Edge Function administrativa.
    // Por ahora borramos el perfil que inhabilita el acceso en la app.
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) alert("Error al borrar: " + error.message);
    else fetchUsers();
  };

  const openEditModal = (user: Profile) => {
    setEditingUser(user);
    setNewPlanId(user.plan_id);
    // Formatear fecha para input date (YYYY-MM-DD)
    const dateStr = user.plan_expires_at ? new Date(user.plan_expires_at).toISOString().split('T')[0] : '';
    setNewExpireDate(dateStr);
  };

  const handleSaveSubscription = async () => {
    if (!editingUser) return;
    setProcessing(true);
    try {
      // 1. Actualizar Perfil
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
            plan_id: newPlanId, 
            plan_expires_at: newExpireDate ? new Date(newExpireDate).toISOString() : null 
        })
        .eq('id', editingUser.id);

      if (updateError) throw updateError;

      // 2. Registrar en Historial (Manual)
      const selectedPlan = plans.find(p => p.id === newPlanId);
      await supabase.from('subscription_history').insert({
        user_id: editingUser.id,
        plan_id: newPlanId,
        amount: selectedPlan?.precio || 0,
        status: 'manual',
        payment_id: `admin-${session.user.email}-${Date.now()}`
      });

      alert("Suscripción actualizada correctamente.");
      setEditingUser(null);
      fetchUsers();

    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter">Panel Administrador</h1>
          <p className="text-slate-400 font-medium mt-2">Gestión de usuarios y suscripciones</p>
        </div>
        <div className="w-full md:w-auto flex gap-4">
             <input 
                type="text" 
                placeholder="Buscar por email o nombre..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full md:w-80 p-4 rounded-2xl bg-slate-800 border border-slate-700 text-white font-bold placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
             />
        </div>
      </div>

      <div className="bg-white rounded-[3rem] p-8 shadow-soft border border-slate-50 overflow-hidden">
        {loading ? (
            <div className="text-center py-20 animate-pulse text-slate-400 font-bold">Cargando base de datos...</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-100">
                            <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Usuario</th>
                            <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Contacto</th>
                            <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Plan Actual</th>
                            <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Vencimiento</th>
                            <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm font-bold text-slate-700">
                        {users.map(user => {
                            const planName = plans.find(p => p.id === user.plan_id)?.nombre || 'Gratis';
                            const isExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
                            
                            return (
                                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                                                {user.email?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-slate-900">{user.nombre || 'Sin nombre'}</div>
                                                <div className="text-[10px] text-slate-400 uppercase">{user.is_admin ? '🛡️ Admin' : 'Usuario'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-xs">
                                        <div>{user.email}</div>
                                        <div className="text-slate-400">{user.telefono || '-'}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest ${planName === 'Premium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {planName}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {user.plan_expires_at ? (
                                            <span className={isExpired ? 'text-red-500' : 'text-green-600'}>
                                                {new Date(user.plan_expires_at).toLocaleDateString()}
                                            </span>
                                        ) : <span className="text-slate-400">∞</span>}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => openEditModal(user)}
                                            className="text-indigo-600 hover:text-indigo-800 mr-4 text-[10px] uppercase font-black tracking-widest"
                                        >
                                            Editar Plan
                                        </button>
                                        {!user.is_admin && (
                                            <button 
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="text-red-400 hover:text-red-600 text-[10px] uppercase font-black tracking-widest"
                                            >
                                                Borrar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Modal de Edición */}
      {editingUser && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-fade-up">
                <h3 className="text-2xl font-black text-slate-900 mb-1">Editar Suscripción</h3>
                <p className="text-sm text-slate-400 mb-6">Usuario: {editingUser.email}</p>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nuevo Plan</label>
                        <select 
                            value={newPlanId} 
                            onChange={e => setNewPlanId(e.target.value)}
                            className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none"
                        >
                            {plans.map(p => <option key={p.id} value={p.id}>{p.nombre} (${p.precio})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nueva Fecha de Vencimiento</label>
                        <input 
                            type="date" 
                            value={newExpireDate}
                            onChange={e => setNewExpireDate(e.target.value)}
                            className="w-full p-4 mt-1 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none"
                        />
                        <p className="text-[9px] mt-2 text-slate-400 italic">Dejar vacío para indefinido (o plan gratuito).</p>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button 
                        onClick={() => setEditingUser(null)}
                        className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSaveSubscription}
                        disabled={processing}
                        className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-indigo hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {processing ? 'Guardando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default AdminPage;
