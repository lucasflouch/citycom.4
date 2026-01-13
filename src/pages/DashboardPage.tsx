
import React, { useMemo, useState } from 'react';
import { Profile, Page, PageValue, AppData, Comercio, SubscriptionPlan, Session } from '../types';
import BusinessCard from '../components/BusinessCard';
import ShareButton from '../components/ShareButton';
import { supabase } from '../supabaseClient';

interface DashboardPageProps {
  session: Session;
  profile: Profile | null;
  onNavigate: (page: PageValue, comercio?: Comercio) => void;
  data: AppData;
  refreshData: () => Promise<void>;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ session, profile, onNavigate, data, refreshData }) => {
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const myPublicaciones = useMemo(() => {
    return (data.comercios || []).filter(c => String(c.usuarioId) === String(session.user.id));
  }, [data.comercios, session.user.id]);

  const userPlan: SubscriptionPlan | undefined = useMemo(() => {
    if (!profile || !data.plans || data.plans.length === 0) return undefined;
    const plan = data.plans.find(p => p.id === profile.plan_id);
    if (plan) return plan;
    return data.plans.find(p => p.precio === 0);
  }, [profile, data.plans]);

  const canPublishMore = useMemo(() => {
    if (!userPlan) {
      return true;
    }
    return myPublicaciones.length < userPlan.limitePublicaciones;
  }, [userPlan, myPublicaciones.length]);
  
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 4000);
      return;
    }

    setIsDeletingId(id);
    setConfirmDeleteId(null);
    
    try {
      const { error } = await supabase
        .from('comercios')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      await refreshData();
      setStatusMsg({ text: '¡Publicación eliminada!', type: 'success' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      console.error("Error al borrar:", err);
      setStatusMsg({ text: 'Error al borrar: ' + (err.message || 'Sin conexión'), type: 'error' });
      setTimeout(() => setStatusMsg(null), 5000);
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleEdit = (e: React.MouseEvent, comercio: Comercio) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate(Page.EditComercio, comercio);
  };

  return (
    <div className="max-w-6xl mx-auto py-4 px-4 relative">
      {statusMsg && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[2000] px-8 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 duration-500 font-black uppercase text-xs tracking-widest ${statusMsg.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {statusMsg.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-white p-8 rounded-4xl shadow-soft border border-indigo-50">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-1 uppercase italic leading-none">Mi Panel</h1>
          <p className="text-slate-400 font-medium">
            Hola, <span className="text-indigo-600 font-bold">{profile?.nombre || session.user.email?.split('@')[0]}</span>. Gestioná tus publicaciones.
          </p>
          {userPlan && (
            <div className="mt-4 bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl inline-flex gap-4 items-center">
                <span className="font-black text-[10px] uppercase tracking-widest text-slate-400">Plan Actual: <span className="text-indigo-600">{userPlan.nombre}</span></span>
                <span className="w-1 h-5 bg-slate-200 rounded-full"></span>
                <span className="font-black text-[10px] uppercase tracking-widest text-slate-400">Publicaciones: <span className="text-indigo-600">{myPublicaciones.length} / {userPlan.limitePublicaciones}</span></span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center mt-6 md:mt-0">
          <div className="flex flex-col md:flex-row gap-3">
             <button 
                onClick={() => onNavigate(Page.Pricing)}
                className="bg-amber-400 text-amber-900 px-8 py-4 rounded-3xl font-black uppercase tracking-widest text-xs shadow-md hover:bg-amber-500 active:scale-95 transition-all"
              >
                Mejorar Plan
              </button>
            <button 
              onClick={() => onNavigate(Page.CreateComercio)}
              disabled={!canPublishMore}
              className="bg-indigo-600 text-white px-8 py-4 rounded-3xl font-black uppercase tracking-widest text-xs shadow-indigo hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              + Nueva Publicación
            </button>
          </div>
          {!canPublishMore && (
              <p className="mt-3 text-center text-red-500 font-black text-[10px] uppercase tracking-wider cursor-pointer" onClick={() => onNavigate(Page.Pricing)}>
                Límite de publicaciones alcanzado.
              </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {myPublicaciones.length === 0 ? (
          <div className="col-span-full bg-white p-20 rounded-5xl shadow-soft border-2 border-dashed border-slate-100 text-center">
            <div className="text-6xl mb-6">🏜️</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-tighter">Sin publicaciones aún</h3>
            <button onClick={() => onNavigate(Page.CreateComercio)} className="mt-4 text-indigo-600 font-black uppercase text-xs tracking-widest hover:underline">Crear primera publicación &rarr;</button>
          </div>
        ) : (
          myPublicaciones.map(comercio => {
            const rubro = data.rubros?.find(r => String(r.id) === String(comercio.rubroId)) || { id: '', nombre: 'General', icon: '📍', slug: '' };

            return (
              <div key={comercio.id} className="relative group bg-white p-2 rounded-4xl border border-transparent hover:border-indigo-100 transition-all shadow-sm">
                <div onClick={() => onNavigate(Page.ComercioDetail, comercio)} className="cursor-pointer">
                  <BusinessCard comercio={comercio} rubro={rubro} />
                </div>
                
                <div className="px-2 pt-2">
                    <ShareButton 
                        title={comercio.nombre}
                        text={`¡Hola! Encontranos en Guía Comercial. Somos ${comercio.nombre}. Visitá nuestro perfil:`}
                        url={`?comercio=${comercio.id}`}
                        variant="outline"
                        label="Promocionar"
                        className="w-full mb-2 border-dashed !border-indigo-200 !text-indigo-500 hover:!bg-indigo-50"
                    />
                </div>

                <div className="flex gap-2 p-2 pt-0 relative z-20">
                  <button 
                    onClick={(e) => handleEdit(e, comercio)}
                    className="flex-1 bg-slate-50 text-slate-900 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-95 border border-slate-100"
                  >
                    Editar
                  </button>
                  <button 
                    disabled={isDeletingId === comercio.id}
                    onClick={(e) => handleDelete(e, comercio.id)}
                    className={`min-w-[120px] px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 border ${
                      confirmDeleteId === comercio.id 
                      ? 'bg-red-600 text-white border-red-600 animate-pulse' 
                      : 'bg-red-50 text-red-500 border-red-100 hover:bg-red-600 hover:text-white'
                    } ${isDeletingId === comercio.id ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    {isDeletingId === comercio.id 
                      ? 'Borrando...' 
                      : (confirmDeleteId === comercio.id ? '¿Confirmar?' : 'Borrar')}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
