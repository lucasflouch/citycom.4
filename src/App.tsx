
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Profile, Page, Comercio, PageValue, AppData, Conversation, Session } from './types';
import { fetchAppData } from './services/dataService';

import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import CreateComercioPage from './pages/CreateComercioPage';
import ComercioDetailPage from './pages/ComercioDetailPage';
import MessagesPage from './pages/MessagesPage';
import PricingPage from './pages/PricingPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import Header from './components/Header';

const App = () => {
  // --- ESTADO GLOBAL ---
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Flag específico para saber si estamos sincronizando el perfil tras un login
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [appData, setAppData] = useState<AppData>({
    provincias: [], 
    ciudades: [], 
    rubros: [], 
    subRubros: [],
    plans: [],
    comercios: [],
    banners: []
  }); 

  // --- ESTADO UI ---
  const [loading, setLoading] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [showForceExit, setShowForceExit] = useState(false);
  
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [notification, setNotification] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // --- ESTADO DE NAVEGACIÓN ---
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // --- REFS ---
  const paymentProcessedRef = useRef(false);

  // ==================================================================================
  // 1. LOGOUT & PROFILE
  // ==================================================================================
  
  const loadProfile = useCallback(async (userId: string) => {
    setLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) throw error;
      if (data) {
          setProfile(data as Profile);
          return data;
      }
      return null;
    } catch (e) { 
      console.error("Error loading profile:", e); 
      return null;
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const handleLogout = useCallback(async (isAutoLogout: boolean = false) => {
    // 1. Limpieza de estado local (Atomic Reset)
    setSession(null);
    setProfile(null);
    setPage(Page.Home);
    setLoadingProfile(false);
    
    // 2. Limpieza de referencias críticas
    paymentProcessedRef.current = false;
    
    // 3. Limpieza de storage
    localStorage.removeItem('sb-sqmjnynklpwjceyuyemz-auth-token');
    
    if (isAutoLogout) {
      setNotification({ text: "Tu sesión ha expirado. Ingresá nuevamente.", type: 'error' });
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Error secundario al cerrar sesión:", error);
    }
  }, []);

  // ==================================================================================
  // 2. DETECCIÓN Y PROCESAMIENTO DE PAGOS
  // ==================================================================================
  useEffect(() => {
    const checkUrlForPayment = async () => {
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      if (!paymentId && !status) return;

      console.log("💳 [Payment] Retorno detectado:", { paymentId, status });
      
      // Matamos loading global inmediatamente
      setLoading(false);
      paymentProcessedRef.current = true;
      window.history.replaceState(null, '', window.location.pathname);

      if (status === 'failure' || status === 'rejected' || status === 'null') {
         setNotification({ text: 'El proceso de pago no se completó o fue cancelado.', type: 'error' });
         return;
      }

      if (status === 'pending' || status === 'in_process') {
         setNotification({ text: 'Tu pago se está procesando. Te avisaremos cuando se acredite.', type: 'success' });
         return;
      }

      if (paymentId && (status === 'approved' || status === 'success')) {
          setVerifyingPayment(true);
          const safetyTimer = setTimeout(() => setShowForceExit(true), 12000);

          try {
            const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
                body: { payment_id: paymentId }
            });

            if (funcError) throw new Error(`Error conexión: ${funcError.message}`);
            if (!responseData?.success) throw new Error(responseData?.error || 'Validación fallida.');

            setNotification({ text: '¡Excelente! Plan activado correctamente.', type: 'success' });
            
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession) {
                await loadProfile(currentSession.user.id);
                setPage(Page.Dashboard);
            } else {
                setNotification({ text: 'Plan activado. Iniciá sesión.', type: 'success' });
                setPage(Page.Auth);
            }

          } catch (err: any) {
            console.error("❌ [Payment] Error:", err);
            setNotification({ text: `Error confirmando: ${err.message}.`, type: 'error' });
            setPage(Page.Pricing);
          } finally {
            clearTimeout(safetyTimer);
            setVerifyingPayment(false);
            setShowForceExit(false);
          }
      }
    };

    checkUrlForPayment();
  }, [loadProfile]);

  // ==================================================================================
  // 3. INICIALIZACIÓN DE APP Y LISTENER DE AUTH
  // ==================================================================================
  useEffect(() => {
    let mounted = true;

    const initApp = async () => {
      if (!paymentProcessedRef.current) setLoading(true);

      try {
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        const { data: { session: curSession } } = await supabase.auth.getSession();
        
        if (mounted && curSession) {
            setSession(curSession);
            if (!paymentProcessedRef.current) {
                await loadProfile(curSession.user.id);
            }
        }
      } catch (err) {
        console.error("Error inicio app:", err);
      } finally {
        if (mounted && !paymentProcessedRef.current) setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      
      console.log("🔐 Auth Event:", event);

      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        // Aquí es donde ocurre la magia: Cargar perfil Y LUEGO navegar
        if (!verifyingPayment) {
            await loadProfile(newSession.user.id);
            setPage(Page.Dashboard); // Navegación automática centralizada
        }
      } else if (event === 'SIGNED_OUT') {
        // La limpieza ya se hace en handleLogout, pero esto es un respaldo
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      }
    });

    return () => { 
        mounted = false;
        authListener.subscription.unsubscribe();
    };
  }, [loadProfile, verifyingPayment]);

  // ==================================================================================
  // 4. LOGICA DE RENDERIZADO SEGURO
  // ==================================================================================
  const handleNavigate = (newPage: PageValue, entity?: Comercio | Conversation) => {
    if (newPage === Page.ComercioDetail && entity && 'nombre' in entity) {
      setSelectedComercioId(entity.id);
    } else if (newPage === Page.EditComercio && entity && 'nombre' in entity) {
      setSelectedComercioId(entity.id);
    } else if (newPage === Page.Messages && entity && 'cliente_id' in entity) {
      setSelectedConversation(entity);
    } else {
        setSelectedComercioId(null);
    }
    setPage(newPage);
    window.scrollTo(0, 0);
  };

  const refreshData = async () => {
    const dbData = await fetchAppData();
    if (dbData) setAppData(dbData);
  };

  // ------------------------------------------------------------------
  // RENDER CONDITIONAL HELPER
  // Evita el rebote a login si hay sesión pero falta perfil (está cargando)
  // ------------------------------------------------------------------
  const renderProtectedPage = (Component: React.ReactNode) => {
    if (!session) return <AuthPage onNavigate={handleNavigate} />;
    
    // Si hay sesión pero no perfil, mostramos carga en lugar de AuthPage
    if (loadingProfile || !profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600 mb-2"></div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cargando perfil...</p>
            </div>
        );
    }
    
    return Component;
  };

  // UI DE VERIFICACIÓN PAGO
  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 fixed inset-0 z-[99999]">
      <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-indigo-600 mb-8"></div>
      <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 text-center">Confirmando Pago</h2>
      <div className="bg-white p-6 rounded-3xl shadow-xl max-w-sm w-full text-center border border-indigo-50">
        <p className="text-slate-500 font-medium mb-4">Activando tu plan...</p>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse mb-6">No cierres esta ventana</p>
        {showForceExit && (
           <button onClick={() => { setVerifyingPayment(false); setPage(Page.Dashboard); }} className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-black uppercase text-[10px]">Cancelar y volver</button>
        )}
      </div>
    </div>
  );

  // LOADING INICIAL (Solo al refrescar o primera carga)
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Iniciando Guía Comercial...</p>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      {notification && (
        <div 
            onClick={() => setNotification(null)}
            className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-6 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 flex items-start gap-4 cursor-pointer ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}
        >
            <span className="text-2xl mt-0.5">{notification.type === 'success' ? '✓' : '✕'}</span>
            <div>
                <p className="font-black uppercase text-xs tracking-widest mb-1">{notification.type === 'success' ? 'Éxito' : 'Atención'}</p>
                <p className="text-sm font-medium leading-tight">{notification.text}</p>
            </div>
        </div>
      )}

      <Header session={session} profile={profile} onNavigate={handleNavigate} onLogout={() => handleLogout(false)} />
      
      <main className="container mx-auto max-w-7xl px-4 py-8">
        
        {page === Page.Home && <HomePage onNavigate={handleNavigate} data={appData} />}
        
        {page === Page.Auth && (session ? 
            // Si ya hay sesión y entran a Auth, redirigir a Dashboard o mostrar carga
            (profile ? <DashboardPage session={session} profile={profile} onNavigate={handleNavigate} data={appData} refreshData={refreshData}/> : renderProtectedPage(null)) 
            : <AuthPage onNavigate={handleNavigate} />
        )}
        
        {page === Page.Dashboard && renderProtectedPage(
          <DashboardPage session={session!} profile={profile!} onNavigate={handleNavigate} data={appData} refreshData={refreshData}/>
        )}

        {(page === Page.CreateComercio || page === Page.EditComercio) && renderProtectedPage(
          <CreateComercioPage 
            session={session!} 
            profile={profile}
            onNavigate={handleNavigate} 
            data={appData} 
            onComercioCreated={refreshData} 
            editingComercio={page === Page.EditComercio ? appData.comercios.find(c => c.id === selectedComercioId) : null} 
          />
        )}

        {page === Page.ComercioDetail && selectedComercioId && (
          <ComercioDetailPage 
            comercioId={selectedComercioId} 
            appData={appData}
            onNavigate={handleNavigate} 
            session={session} 
            profile={profile} 
            onReviewSubmitted={refreshData}
          />
        )}

         {page === Page.Messages && renderProtectedPage(
          <MessagesPage 
            session={session!} 
            profile={profile!} 
            appData={appData}
            onNavigate={handleNavigate}
            initialConversation={selectedConversation}
          />
        )}

        {page === Page.Pricing && renderProtectedPage(
          <PricingPage 
            profile={profile!}
            plans={appData.plans}
            session={session!}
            onNavigate={handleNavigate}
            refreshProfile={() => loadProfile(session!.user.id)}
          />
        )}
        
        {page === Page.Profile && renderProtectedPage(
          <ProfilePage 
            session={session!}
            profile={profile!}
            plans={appData.plans}
            onProfileUpdate={() => loadProfile(session!.user.id)}
          />
        )}
        
        {page === Page.Admin && session && profile?.is_admin && renderProtectedPage(
           <AdminPage session={session!} plans={appData.plans} />
        )}
      </main>
    </div>
  );
};

export default App;
