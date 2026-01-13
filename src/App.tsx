
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
import NotificationButton from './components/NotificationButton';

const App = () => {
  // --- ESTADO GLOBAL ---
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [appData, setAppData] = useState<AppData>({
    provincias: [], ciudades: [], rubros: [], subRubros: [],
    plans: [], comercios: [], banners: []
  }); 

  // --- ESTADO UI ---
  const [isInitializing, setIsInitializing] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentStatusText, setPaymentStatusText] = useState("Procesando pago...");
  const [showForceExit, setShowForceExit] = useState(false);
  
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [notification, setNotification] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // --- NAVEGACIÓN ---
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // --- REFS (CONTROL DE BUCLES & STALE CLOSURES) ---
  const hasInitialized = useRef(false);
  const hasProcessedPayment = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null); 
  const verifyingPaymentRef = useRef(false); 
  const isInitializingRef = useRef(true); 

  // Sincronizar State con Ref
  useEffect(() => {
    verifyingPaymentRef.current = verifyingPayment;
  }, [verifyingPayment]);

  // ==================================================================================
  // 1. HELPERS
  // ==================================================================================
  
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) throw error;
      if (data) {
          console.log("👤 Perfil cargado:", data.email, "Plan:", data.plan_id);
          setProfile(data as Profile);
          return data;
      }
      return null;
    } catch (e) { 
      console.error("Error loading profile:", e); 
      return null;
    }
  }, []);

  // --- LOGOUT NUCLEAR ---
  const handleLogout = useCallback(async () => {
    try {
        await supabase.auth.signOut();
    } catch (e) { console.warn("Error signing out supabase", e); }

    setSession(null);
    setProfile(null);
    setPage(Page.Home);
    lastSessionIdRef.current = null;

    localStorage.clear();
    sessionStorage.clear();

    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        } catch (e) { console.warn("Error cleaning cache:", e); }
    }
    
    // Desregistrar SW si existe manualmente
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
            for(let registration of registrations) {
                registration.unregister();
            }
        });
    }

    window.location.reload();
  }, []);

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

  const resolveInitialPage = () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/dashboard')) return Page.Dashboard;
    if (path.includes('/pricing')) return Page.Pricing;
    if (path.includes('/mensajes')) return Page.Messages;
    if (path.includes('/perfil')) return Page.Profile;
    if (path.includes('/admin')) return Page.Admin;
    return Page.Home;
  };

  const refreshData = async () => {
    console.log("🔄 Actualizando datos de la app...");
    const dbData = await fetchAppData();
    if (dbData) setAppData(dbData);
  };

  // ==================================================================================
  // 2. LÓGICA DE RETORNO DE PAGO
  // ==================================================================================
  const processPaymentReturn = async (paymentId: string | null, status: string | null, currentSession: Session | null) => {
    console.log("💳 [Payment] Iniciando procesamiento...", { paymentId, status });
    
    try {
        const url = new URL(window.location.href);
        const paramsToRemove = ['collection_id', 'collection_status', 'payment_id', 'status', 'external_reference', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id'];
        paramsToRemove.forEach(p => url.searchParams.delete(p));
        window.history.replaceState(null, '', url.toString());
    } catch (e) { console.warn("⚠️ URL Cleanup failed:", e); }

    if (status === 'failure' || status === 'rejected' || status === 'null') {
        if (currentSession?.user?.id) await loadProfile(currentSession.user.id);
        setNotification({ text: 'El pago no se completó o fue cancelado.', type: 'error' });
        setPage(Page.Pricing); 
        return;
    }
    
    if (status === 'pending' || status === 'in_process') {
         if (currentSession?.user?.id) await loadProfile(currentSession.user.id);
         setNotification({ text: 'Pago pendiente. Se activará al acreditarse.', type: 'success' });
         setPage(Page.Dashboard);
         return;
    }

    if (paymentId && (status === 'approved' || status === 'success')) {
        setVerifyingPayment(true);
        setPaymentStatusText("Verificando transacción con Mercado Pago...");
        const safetyTimer = setTimeout(() => setShowForceExit(true), 10000);

        try {
            const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
                body: { payment_id: paymentId }
            });

            if (funcError) throw new Error(funcError.message);
            if (!responseData?.success) throw new Error(responseData?.error || 'Validación fallida en servidor.');

            setPaymentStatusText("¡Pago confirmado! Actualizando tu perfil...");

            if (currentSession) await loadProfile(currentSession.user.id);

            setNotification({ text: '¡Plan activado correctamente!', type: 'success' });
            setPage(Page.Dashboard);

        } catch (err: any) {
            console.error("❌ Payment Verification Error:", err);
            if (currentSession) await loadProfile(currentSession.user.id);
            setNotification({ 
                text: `El pago se procesó pero hubo un error verificando: ${err.message}.`, 
                type: 'error' 
            });
            setPage(Page.Dashboard);
        } finally {
            clearTimeout(safetyTimer);
            setVerifyingPayment(false);
            setShowForceExit(false);
        }
    }
  };

  // ==================================================================================
  // 3. EFECTO DE INICIALIZACIÓN
  // ==================================================================================
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    isInitializingRef.current = true;

    const initApp = async () => {
        console.group("🚀 App Initialization");
        
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('payment_id');
        const status = params.get('status') || params.get('collection_status');
        const isPaymentReturn = !!(paymentId || status);

        let sessionRef: Session | null = null;

        try {
            // Carga de datos inicial
            await refreshData();

            const { data: { session: initSession }, error } = await supabase.auth.getSession();
            if (error) console.warn("Error getting session:", error);
            sessionRef = initSession;

            if (initSession) {
                setSession(initSession);
                lastSessionIdRef.current = initSession.user.id;
                if (!isPaymentReturn) await loadProfile(initSession.user.id);
            }

            if (isPaymentReturn) {
                if (!initSession) {
                    setNotification({ 
                        text: 'Tu sesión expiró. Por favor, iniciá sesión.', 
                        type: 'error' 
                    });
                    setPage(Page.Auth);
                    setIsInitializing(false);
                    return; 
                }
                if (!hasProcessedPayment.current) {
                    hasProcessedPayment.current = true;
                    await processPaymentReturn(paymentId, status, initSession);
                }
            } else {
                if (initSession) setPage(resolveInitialPage());
            }

        } catch (err) {
            console.error("Fatal init error:", err);
            if (sessionRef) await loadProfile(sessionRef.user.id);
        } finally {
            if (!isPaymentReturn) setIsInitializing(false);
            isInitializingRef.current = false;
            setIsInitializing(false);
            console.groupEnd();
        }
    };

    initApp();
  }, []);

  // ==================================================================================
  // 4. LISTENER DE SESIÓN
  // ==================================================================================
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        console.log(`🔐 Auth Event: ${event}`);
        
        if (event === 'SIGNED_IN' && newSession) {
             const currentUserId = lastSessionIdRef.current;
             const newUserId = newSession.user.id;

             if (currentUserId !== newUserId) {
                 lastSessionIdRef.current = newUserId;
                 setSession(newSession);
                 if (!verifyingPaymentRef.current && !isInitializingRef.current) {
                     await loadProfile(newUserId);
                 }
             } else {
                 setSession(newSession); 
             }
        } else if (event === 'SIGNED_OUT') {
            lastSessionIdRef.current = null;
            setSession(null);
            setProfile(null);
            setPage(Page.Home);
        } else if (event === 'TOKEN_REFRESHED' && newSession) {
            setSession(newSession); 
        }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]); 


  // ==================================================================================
  // 5. REALTIME DATA LISTENER (NUEVO: SOLUCIÓN PANTALLA EN BLANCO)
  // ==================================================================================
  useEffect(() => {
    // Escuchar cambios globales en la tabla de comercios
    const channel = supabase.channel('global-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comercios' },
        (payload) => {
          console.log('⚡ Cambio detectado en DB (Comercios):', payload.eventType);
          refreshData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  // ==================================================================================
  // UI RENDERING
  // ==================================================================================

  const renderProtectedPage = (Component: React.ReactNode) => {
    if (!session) return <AuthPage onNavigate={handleNavigate} />;
    
    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600 mb-2"></div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cargando perfil...</p>
                <button onClick={() => window.location.reload()} className="mt-8 px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-200">
                    Reintentar
                </button>
            </div>
        );
    }
    return Component;
  };

  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 fixed inset-0 z-[99999]">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center border border-indigo-50 animate-in zoom-in duration-300">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6 mx-auto"></div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Confirmando</h2>
        <p className="text-slate-500 font-medium mb-6 text-sm leading-relaxed">{paymentStatusText}</p>
        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 animate-pulse w-2/3"></div>
        </div>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">No cierres esta ventana</p>
        {showForceExit && (
           <button onClick={() => { setVerifyingPayment(false); setPage(Page.Dashboard); }} className="mt-6 w-full py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black uppercase text-[10px] hover:bg-indigo-100 transition-colors">
             Demora demasiado, continuar en segundo plano
           </button>
        )}
      </div>
    </div>
  );

  if (isInitializing) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600"></div>
          <div className="absolute inset-0 flex items-center justify-center font-black text-indigo-600 text-xs">GC</div>
      </div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest mt-4 animate-pulse">Iniciando App...</p>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      {notification && (
        <div onClick={() => setNotification(null)} className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-6 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 flex items-start gap-4 cursor-pointer border ${notification.type === 'success' ? 'bg-white border-green-500 text-green-700' : 'bg-white border-red-500 text-red-700'}`}>
            <span className={`text-2xl mt-0.5 ${notification.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{notification.type === 'success' ? '✓' : '✕'}</span>
            <div>
                <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-70">{notification.type === 'success' ? 'Éxito' : 'Atención'}</p>
                <p className="text-sm font-bold leading-tight">{notification.text}</p>
            </div>
        </div>
      )}

      {session && <NotificationButton userId={session.user.id} />}

      <Header session={session} profile={profile} onNavigate={handleNavigate} onLogout={handleLogout} />
      
      <main className="container mx-auto max-w-7xl px-4 py-8">
        {page === Page.Home && <HomePage onNavigate={handleNavigate} data={appData} />}
        {page === Page.Auth && (session ? (profile ? <DashboardPage session={session} profile={profile} onNavigate={handleNavigate} data={appData} refreshData={refreshData}/> : renderProtectedPage(null)) : <AuthPage onNavigate={handleNavigate} />)}
        {page === Page.Dashboard && renderProtectedPage(<DashboardPage session={session!} profile={profile!} onNavigate={handleNavigate} data={appData} refreshData={refreshData}/>)}
        {(page === Page.CreateComercio || page === Page.EditComercio) && renderProtectedPage(<CreateComercioPage session={session!} profile={profile} onNavigate={handleNavigate} data={appData} onComercioCreated={refreshData} editingComercio={page === Page.EditComercio ? appData.comercios.find(c => c.id === selectedComercioId) : null} />)}
        {page === Page.ComercioDetail && selectedComercioId && (<ComercioDetailPage comercioId={selectedComercioId} appData={appData} onNavigate={handleNavigate} session={session} profile={profile} onReviewSubmitted={refreshData}/>)}
        {page === Page.Messages && renderProtectedPage(<MessagesPage session={session!} profile={profile!} appData={appData} onNavigate={handleNavigate} initialConversation={selectedConversation}/>)}
        {page === Page.Pricing && renderProtectedPage(<PricingPage profile={profile!} plans={appData.plans} session={session!} onNavigate={handleNavigate} refreshProfile={() => loadProfile(session!.user.id)}/>)}
        {page === Page.Profile && renderProtectedPage(<ProfilePage session={session!} profile={profile!} plans={appData.plans} onProfileUpdate={() => loadProfile(session!.user.id)}/>)}
        {page === Page.Admin && session && profile?.is_admin && renderProtectedPage(<AdminPage session={session!} plans={appData.plans} />)}
      </main>
    </div>
  );
};

export default App;
