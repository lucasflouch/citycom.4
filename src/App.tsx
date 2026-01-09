
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
  
  // --- REFS (Para evitar loops) ---
  const hasInitialized = useRef(false);

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

  const handleLogout = useCallback(async () => {
    setSession(null);
    setProfile(null);
    setPage(Page.Home);
    localStorage.removeItem('sb-sqmjnynklpwjceyuyemz-auth-token');
    await supabase.auth.signOut();
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

  // ==================================================================================
  // 2. LÓGICA DE RETORNO DE PAGO (Dedicada)
  // ==================================================================================
  const processPaymentReturn = async (paymentId: string | null, status: string | null, currentSession: Session | null) => {
    console.log("💳 [Payment] Iniciando procesamiento...", { paymentId, status });
    
    // Limpieza inmediata de URL para evitar re-procesamientos al refrescar
    window.history.replaceState(null, '', window.location.pathname);

    // Si no hay sesión, intentamos recuperar el estado
    if (!currentSession) {
        console.warn("⚠️ [Payment] Retorno de pago sin sesión activa. El backend procesará, pero la UI puede no actualizarse.");
        // Nota: La Edge Function actualizará la DB usando el ID en metadata.
    }

    // A. Casos de Fallo o Pendiente
    if (status === 'failure' || status === 'rejected' || status === 'null') {
        setNotification({ text: 'El pago no se completó o fue cancelado.', type: 'error' });
        setPage(currentSession ? Page.Pricing : Page.Auth);
        return;
    }
    if (status === 'pending' || status === 'in_process') {
        setNotification({ text: 'Pago pendiente. Se activará al acreditarse.', type: 'success' });
        setPage(Page.Dashboard);
        return;
    }

    // B. Caso Éxito (Approved)
    if (paymentId && (status === 'approved' || status === 'success')) {
        setVerifyingPayment(true);
        setPaymentStatusText("Verificando transacción con Mercado Pago...");
        
        // Timer de seguridad por si el backend tarda mucho
        const safetyTimer = setTimeout(() => setShowForceExit(true), 15000);

        try {
            // 1. Llamada a Edge Function
            const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
                body: { payment_id: paymentId }
            });

            if (funcError) throw new Error(funcError.message);
            if (!responseData?.success) throw new Error(responseData?.error || 'Validación fallida en servidor.');

            setPaymentStatusText("¡Pago confirmado! Actualizando tu perfil...");

            // 2. Recarga forzada del perfil para reflejar el nuevo plan
            if (currentSession) {
                await loadProfile(currentSession.user.id);
            }

            setNotification({ text: '¡Plan activado correctamente!', type: 'success' });
            setPage(Page.Dashboard);

        } catch (err: any) {
            console.error("❌ Payment Verification Error:", err);
            setNotification({ 
                text: `Hubo un error verificando el pago: ${err.message}. Si se debitó, contactá a soporte.`, 
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
  // 3. EFECTO DE INICIALIZACIÓN (SECUENCIAL)
  // ==================================================================================
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initApp = async () => {
        console.group("🚀 App Initialization");
        
        // 1. Chequear parámetros de URL (antes de cualquier cosa async)
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('payment_id');
        const status = params.get('status') || params.get('collection_status');
        const isPaymentReturn = !!(paymentId || status);

        if (isPaymentReturn) {
            console.log("Detectado retorno de pago. Modo inicialización especial.");
        }

        try {
            // 2. Cargar Datos Públicos
            const dbData = await fetchAppData();
            if (dbData) setAppData(dbData);

            // 3. Recuperar Sesión
            const { data: { session: initSession }, error } = await supabase.auth.getSession();
            if (error) console.warn("Error getting session:", error);

            let currentProfile = null;
            if (initSession) {
                setSession(initSession);
                // Si NO es un retorno de pago, cargamos el perfil ya.
                // Si ES un retorno, esperamos a la función processPaymentReturn para cargarlo fresco.
                if (!isPaymentReturn) {
                    currentProfile = await loadProfile(initSession.user.id);
                }
            }

            // 4. Decisiones de Navegación Inicial
            if (isPaymentReturn) {
                // Delegamos al procesador de pagos
                await processPaymentReturn(paymentId, status, initSession);
            } else {
                // Flujo normal
                setIsInitializing(false);
                if (initSession && currentProfile) {
                    // Si ya estaba en una página protegida, lo dejamos (o mandamos a dashboard)
                    // Por simplicidad en MVP, si hay sesión vamos a dashboard si estabamos en root
                    if (window.location.pathname === '/' || window.location.pathname === '/auth') {
                         setPage(Page.Dashboard);
                    }
                }
            }

        } catch (err) {
            console.error("Fatal init error:", err);
            setIsInitializing(false);
        } finally {
            // Aseguramos quitar el loading si no estamos verificando pago
            if (!isPaymentReturn) {
                setIsInitializing(false);
            }
            console.groupEnd();
        }
    };

    initApp();
  }, [loadProfile]);

  // ==================================================================================
  // 4. LISTENER DE CAMBIOS DE SESIÓN (Logout/Login manual)
  // ==================================================================================
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (event === 'SIGNED_IN' && newSession) {
             setSession(newSession);
             if (!verifyingPayment) {
                 await loadProfile(newSession.user.id);
             }
        } else if (event === 'SIGNED_OUT') {
            setSession(null);
            setProfile(null);
            setPage(Page.Home);
        } else if (event === 'TOKEN_REFRESHED' && newSession) {
            setSession(newSession); // Mantener token fresco
        }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile, verifyingPayment]);


  const refreshData = async () => {
    const dbData = await fetchAppData();
    if (dbData) setAppData(dbData);
  };

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
                <button onClick={() => handleLogout()} className="mt-4 text-[10px] text-red-400 underline">Reiniciar</button>
            </div>
        );
    }
    return Component;
  };

  // 1. Pantalla de Bloqueo: Verificando Pago
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
           <button 
             onClick={() => { setVerifyingPayment(false); setPage(Page.Dashboard); }} 
             className="mt-6 w-full py-3 bg-red-50 text-red-500 rounded-xl font-black uppercase text-[10px] hover:bg-red-100 transition-colors"
           >
             Demora demasiado, omitir
           </button>
        )}
      </div>
    </div>
  );

  // 2. Pantalla de Carga Inicial
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
      {/* Notificaciones Toast Globales */}
      {notification && (
        <div 
            onClick={() => setNotification(null)}
            className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-6 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 flex items-start gap-4 cursor-pointer border ${notification.type === 'success' ? 'bg-white border-green-500 text-green-700' : 'bg-white border-red-500 text-red-700'}`}
        >
            <span className={`text-2xl mt-0.5 ${notification.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                {notification.type === 'success' ? '✓' : '✕'}
            </span>
            <div>
                <p className="font-black uppercase text-[10px] tracking-widest mb-1 opacity-70">{notification.type === 'success' ? 'Éxito' : 'Atención'}</p>
                <p className="text-sm font-bold leading-tight">{notification.text}</p>
            </div>
        </div>
      )}

      <Header session={session} profile={profile} onNavigate={handleNavigate} onLogout={handleLogout} />
      
      <main className="container mx-auto max-w-7xl px-4 py-8">
        
        {page === Page.Home && <HomePage onNavigate={handleNavigate} data={appData} />}
        
        {page === Page.Auth && (session ? 
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
