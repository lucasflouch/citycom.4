
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
  const handleLogout = useCallback(async (isAutoLogout: boolean = false) => {
    setSession(null);
    setProfile(null);
    setPage(Page.Home);
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

  const loadProfile = useCallback(async (userId: string) => {
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
    }
  }, []);

  // ==================================================================================
  // 2. DETECCIÓN Y PROCESAMIENTO DE PAGOS (LÓGICA BLINDADA)
  // ==================================================================================
  useEffect(() => {
    const checkUrlForPayment = async () => {
      // Si ya procesamos el pago en esta carga de página, no hacemos nada.
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      // Si no hay parámetros de pago, salimos inmediatamente.
      if (!paymentId && !status) return;

      console.log("💳 [Payment] Detectado retorno de Mercado Pago:", { paymentId, status });
      
      // Marcamos como procesado y limpiamos la URL para evitar loops si el usuario recarga
      paymentProcessedRef.current = true;
      window.history.replaceState(null, '', window.location.pathname);

      // CASO 1: Pago no aprobado (rejected, cancelled, pending)
      if (status && status !== 'approved' && status !== 'success') {
         console.warn(`⚠️ [Payment] Estado no aprobado: ${status}`);
         setNotification({ 
             text: status === 'pending' || status === 'in_process' 
                 ? 'El pago está pendiente de procesamiento.' 
                 : 'El proceso de pago fue cancelado.', 
             type: status === 'pending' ? 'success' : 'error' 
         });
         // Redirigimos a Pricing para que intente de nuevo si quiere
         setPage(Page.Pricing);
         return;
      }

      // CASO 2: Error estructural (status aprobado pero sin ID)
      if (!paymentId) {
          console.error("❌ [Payment] Error: Status aprobado pero falta payment_id");
          setNotification({ text: 'Error en la comunicación con el medio de pago.', type: 'error' });
          return;
      }

      // CASO 3: PAGO APROBADO -> VERIFICACIÓN EN BACKEND
      setVerifyingPayment(true);
      // Timer de seguridad por si la Edge Function tarda demasiado
      const safetyTimer = setTimeout(() => setShowForceExit(true), 12000);

      try {
        console.log("🔄 [Payment] Invocando Edge Function verify-payment-v1...");
        
        // Llamamos a la función. NO dependemos de la sesión del frontend para esto.
        const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
            body: { payment_id: paymentId }
        });

        if (funcError) throw new Error(`Error de conexión con servidor: ${funcError.message}`);
        
        console.log("📩 [Payment] Respuesta Edge Function:", responseData);

        if (!responseData?.success) {
            throw new Error(responseData?.error || 'La validación del pago falló en el servidor.');
        }

        // --- ÉXITO TOTAL ---
        console.log("✅ [Payment] Pago validado y DB actualizada.");
        setNotification({ text: '¡Excelente! Tu plan ha sido activado correctamente.', type: 'success' });
        
        // --- REDIRECCIÓN INTELIGENTE ---
        // Verificamos si tenemos sesión ACTIVA en este momento
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
            // Usuario logueado: Actualizamos perfil y vamos al Dashboard
            await loadProfile(currentSession.user.id);
            setPage(Page.Dashboard);
        } else {
            // Sesión perdida durante el pago: Vamos al Login con mensaje claro
            console.log("ℹ️ [Payment] Sesión no detectada tras pago. Redirigiendo a Auth.");
            setNotification({ 
                text: 'Plan activado exitosamente. Por favor, iniciá sesión para ver los cambios.', 
                type: 'success' 
            });
            setPage(Page.Auth);
        }

      } catch (err: any) {
        console.error("❌ [Payment] CRITICAL ERROR:", err);
        setNotification({ 
            text: `Hubo un problema confirmando tu plan (${err.message}). Si el dinero se debitó, contactanos.`, 
            type: 'error' 
        });
        setPage(Page.Pricing); // Volvemos a Pricing en caso de error
      } finally {
        clearTimeout(safetyTimer);
        setVerifyingPayment(false);
        setShowForceExit(false);
      }
    };

    checkUrlForPayment();
  }, [loadProfile]);

  // ==================================================================================
  // 3. INICIALIZACIÓN DE APP
  // ==================================================================================
  useEffect(() => {
    let mounted = true;

    const initApp = async () => {
      // Solo mostramos loader inicial si NO estamos en medio de una verificación de pago
      if (!paymentProcessedRef.current) {
          setLoading(true);
      }

      try {
        // 1. Cargar datos públicos
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        // 2. Verificar sesión
        const { data: { session: curSession } } = await supabase.auth.getSession();
        
        if (mounted && curSession) {
            setSession(curSession);
            await loadProfile(curSession.user.id);
        }
      } catch (err) {
        console.error("Error inicio app:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initApp();

    // Listener de Auth
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        // Si estamos verificando pago, NO interrumpimos con loadProfile aquí, ya lo hace el checkUrlForPayment
        if (!verifyingPayment) {
            await loadProfile(newSession.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      }
    });

    return () => { 
        mounted = false;
        authListener.subscription.unsubscribe();
    };
  }, [loadProfile, verifyingPayment]); // Dependencia verifyingPayment agregada para evitar conflictos

  // ==================================================================================
  // 4. RENDER
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

  // --- UI BLOQUEANTE DE PAGO ---
  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 fixed inset-0 z-[99999]">
      <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-indigo-600 mb-8"></div>
      <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 text-center">Confirmando Pago</h2>
      <div className="bg-white p-6 rounded-3xl shadow-xl max-w-sm w-full text-center border border-indigo-50">
        <p className="text-slate-500 font-medium mb-4">
          Estamos activando tu plan en nuestra base de datos...
        </p>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse mb-6">
          No cierres esta ventana
        </p>
        
        {showForceExit && (
           <button 
             onClick={() => { setVerifyingPayment(false); setPage(Page.Dashboard); }}
             className="w-full py-3 bg-red-50 text-red-500 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-red-100 transition-colors animate-in fade-in"
           >
             Cancelar y volver al sitio
           </button>
        )}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Cargando...</p>
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
        
        {page === Page.Auth && <AuthPage onNavigate={handleNavigate} />}
        
        {page === Page.Dashboard && (session ? (
          <DashboardPage 
            session={session} 
            profile={profile} 
            onNavigate={handleNavigate} 
            data={appData} 
            refreshData={refreshData}
          />
        ) : <AuthPage onNavigate={handleNavigate} />)}

        {(page === Page.CreateComercio || page === Page.EditComercio) && (session ? 
          <CreateComercioPage 
            session={session} 
            profile={profile}
            onNavigate={handleNavigate} 
            data={appData} 
            onComercioCreated={refreshData} 
            editingComercio={page === Page.EditComercio ? appData.comercios.find(c => c.id === selectedComercioId) : null} 
          /> : <AuthPage onNavigate={handleNavigate} />
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

         {page === Page.Messages && (session && profile ? (
          <MessagesPage 
            session={session} 
            profile={profile} 
            appData={appData}
            onNavigate={handleNavigate}
            initialConversation={selectedConversation}
          />
        ) : <AuthPage onNavigate={handleNavigate} />)}

        {page === Page.Pricing && (session && profile ? (
          <PricingPage 
            profile={profile}
            plans={appData.plans}
            session={session}
            onNavigate={handleNavigate}
            refreshProfile={() => loadProfile(session.user.id)}
          />
        ) : <AuthPage onNavigate={handleNavigate} />)}
        
        {page === Page.Profile && session && profile && (
          <ProfilePage 
            session={session}
            profile={profile}
            plans={appData.plans}
            onProfileUpdate={() => loadProfile(session.user.id)}
          />
        )}
        
        {page === Page.Admin && session && profile?.is_admin && (
           <AdminPage session={session} plans={appData.plans} />
        )}
      </main>
    </div>
  );
};

export default App;
