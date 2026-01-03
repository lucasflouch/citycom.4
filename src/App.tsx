
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
  
  // ESTADO CRÍTICO: Si esto es true, la app NO debe renderizar nada más que el loader de pago.
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [showForceExit, setShowForceExit] = useState(false); // Nuevo: Botón de escape
  
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [notification, setNotification] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // --- ESTADO DE NAVEGACIÓN ---
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // --- REFS (Anti-Loop) ---
  const paymentProcessedRef = useRef(false);

  // ==================================================================================
  // 1. LOGOUT OPTIMISTA
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

  // ==================================================================================
  // 2. LOAD PROFILE
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
  // 3. DETECCIÓN Y PROCESAMIENTO DE PAGOS (BLINDAJE ANTI-ZOMBIE)
  // ==================================================================================
  useEffect(() => {
    const checkUrlForPayment = async () => {
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      // Si no hay indicios de pago, salimos
      if (!paymentId && !status) return;

      // 1. LIMPIEZA INMEDIATA DE URL (Previene loops al refrescar)
      window.history.replaceState(null, '', window.location.pathname);
      paymentProcessedRef.current = true;

      console.log("💳 Retorno de Mercado Pago detectado.", { paymentId, status });

      // 2. FILTRADO TEMPRANO DE ERRORES (Evita entrar en modo bloqueo si falló)
      if (status && status !== 'approved' && status !== 'success') {
         console.warn("Pago no aprobado o cancelado por usuario.");
         setNotification({ 
             text: status === 'pending' || status === 'in_process' 
                 ? 'El pago está pendiente. Se actualizará en breve.' 
                 : 'El proceso de pago fue cancelado o rechazado.', 
             type: status === 'pending' ? 'success' : 'error' 
         });
         // No bloqueamos la UI, dejamos que la app cargue normalmente hacia Pricing
         setPage(Page.Pricing);
         return;
      }

      if (!paymentId) {
          setNotification({ text: 'Error: Retorno de pago sin ID de transacción.', type: 'error' });
          return;
      }

      // 3. INICIO MODO BLOQUEANTE (Solo si parece exitoso)
      setVerifyingPayment(true);
      
      // Timeout de seguridad: Si en 10s no se resuelve, mostrar botón de salida
      const safetyTimer = setTimeout(() => setShowForceExit(true), 10000);

      try {
        // Invocamos la Edge Function
        const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
            body: { payment_id: paymentId }
        });

        if (funcError) throw new Error(`Conexión: ${funcError.message}`);
        if (!responseData?.success) throw new Error(responseData?.error || 'Validación fallida');

        console.log("✅ PAGO VERIFICADO CORRECTAMENTE");
        setNotification({ text: '¡Excelente! Tu plan ha sido activado exitosamente.', type: 'success' });
        
        // Recuperar sesión y perfil actualizado
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
            await loadProfile(currentSession.user.id);
            setPage(Page.Dashboard);
        } else {
            // Si se perdió la sesión, vamos al login
            setNotification({ text: 'Plan activado. Iniciá sesión para ver los cambios.', type: 'success' });
            setPage(Page.Auth);
        }

      } catch (err: any) {
        console.error("ERROR EN VERIFICACIÓN:", err);
        setNotification({ 
            text: `Hubo un problema verificando el pago (${err.message}). Si se debitó, contactanos.`, 
            type: 'error' 
        });
        setPage(Page.Pricing);
      } finally {
        clearTimeout(safetyTimer);
        setVerifyingPayment(false);
        setShowForceExit(false);
      }
    };

    checkUrlForPayment();
  }, [loadProfile]);

  // ==================================================================================
  // 4. INICIALIZACIÓN DE APP
  // ==================================================================================
  useEffect(() => {
    let mounted = true;
    let safetyTimeout: any = null;

    const initApp = async () => {
      // Si estamos verificando pago, no mostramos el loader inicial superpuesto
      if (!paymentProcessedRef.current) {
          setLoading(true);
      }

      safetyTimeout = setTimeout(() => {
        if (mounted && loading && !verifyingPayment) {
             console.warn("⚠️ initApp excedió el tiempo límite.");
             setLoading(false);
        }
      }, 7000);

      try {
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        const { data: { session: curSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (mounted && curSession) {
            const { data: userProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', curSession.user.id)
                .maybeSingle();

            if (userProfile) {
                setSession(curSession);
                setProfile(userProfile as Profile);
            }
        }
      } catch (err) {
        console.error("Error inicio app:", err);
      } finally {
        clearTimeout(safetyTimeout);
        if (mounted) setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      } else if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        if (!verifyingPayment) {
            await loadProfile(newSession.user.id);
        }
      }
    });

    return () => { 
        mounted = false;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        authListener.subscription.unsubscribe();
    };
  }, [handleLogout, loadProfile]);

  // ==================================================================================
  // 5. RENDER
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

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 8000); 
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // --- UI BLOQUEANTE DE PAGO ---
  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 fixed inset-0 z-[99999]">
      <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-indigo-600 mb-8"></div>
      <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4">Confirmando Pago</h2>
      <div className="bg-white p-6 rounded-3xl shadow-xl max-w-sm w-full text-center border border-indigo-50">
        <p className="text-slate-500 font-medium mb-4">
          Estamos conectando con Mercado Pago para activar tu plan. 
        </p>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse mb-4">
          Un momento por favor...
        </p>
        
        {showForceExit && (
           <button 
             onClick={() => setVerifyingPayment(false)}
             className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors animate-in fade-in zoom-in"
           >
             ¿Tarda demasiado? Cancelar
           </button>
        )}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Iniciando App...</p>
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-6 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 flex items-start gap-4 ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
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
            editingComercio={page === Page.EditComercio ? currentComercio : null} 
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
           <AdminPage 
             session={session} 
             plans={appData.plans}
           />
        )}
      </main>
    </div>
  );
};

export default App;
