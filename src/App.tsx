
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
  const appInitializedRef = useRef(false); // NUEVO: Control estricto de inicialización única

  // ==================================================================================
  // 1. HELPERS & CALLBACKS
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
    setSession(null);
    setProfile(null);
    setPage(Page.Home);
    setLoadingProfile(false);
    
    // NOTA: NO reseteamos appInitializedRef ni paymentProcessedRef aquí.
    // La App no necesita recargar datos públicos al desloguearse.
    
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
  // 2. EFECTO ÚNICO DE INICIALIZACIÓN (MOUNT ONLY)
  // ==================================================================================
  useEffect(() => {
    // Si ya inicializamos, no hacemos nada (protección contra StrictMode y re-renders)
    if (appInitializedRef.current) return;

    let mounted = true;

    const initApp = async () => {
      appInitializedRef.current = true;
      
      // Chequeo de Pagos en URL antes de cargar nada
      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      const isPaymentReturn = !!(paymentId || status);

      // Si es retorno de pago, NO mostramos el spinner de carga general para no tapar la lógica de pago
      if (!isPaymentReturn) {
         setLoading(true);
      } else {
         // Si hay pago, marcamos que vamos a procesarlo para que el otro useEffect lo tome
         paymentProcessedRef.current = false; 
      }

      try {
        // 1. Carga de Datos Públicos
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        // 2. Recuperación de Sesión Inicial
        const { data: { session: curSession } } = await supabase.auth.getSession();
        
        if (mounted && curSession) {
            setSession(curSession);
            // Solo cargamos perfil si no estamos en medio de un proceso de pago crítico
            if (!isPaymentReturn) {
                await loadProfile(curSession.user.id);
            }
        }
      } catch (err) {
        console.error("Error inicio app:", err);
      } finally {
        // Solo quitamos el loading si NO es un retorno de pago (el pago maneja su propio UI)
        if (mounted && !isPaymentReturn) {
            setLoading(false);
        }
      }
    };

    initApp();

    return () => { mounted = false; };
  }, [loadProfile]); // loadProfile es estable, esto corre una vez.

  // ==================================================================================
  // 3. EFECTO DE LISTENER DE AUTH (SEPARADO)
  // ==================================================================================
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log("🔐 Auth Event:", event);

      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        // Si no estamos verificando un pago, procedemos al dashboard
        if (!verifyingPayment) {
            await loadProfile(newSession.user.id);
            setPage(Page.Dashboard);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      }
    });

    return () => { 
        authListener.subscription.unsubscribe();
    };
  }, [loadProfile, verifyingPayment]);

  // ==================================================================================
  // 4. EFECTO DE PROCESAMIENTO DE PAGOS (SEPARADO)
  // ==================================================================================
  useEffect(() => {
    const checkPayment = async () => {
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      if (!paymentId && !status) return;

      console.log("💳 [Payment] Procesando...", { paymentId, status });
      paymentProcessedRef.current = true;
      setLoading(false); // Aseguramos que el spinner global se vaya

      // Limpiamos URL inmediatamente para evitar reprocesamientos al refrescar
      window.history.replaceState(null, '', window.location.pathname);

      // Obtenemos sesión actual para poder recargar el perfil
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      // Función auxiliar para restaurar el estado normal de la app
      const restoreAppState = async () => {
        if (currentSession) {
          await loadProfile(currentSession.user.id);
          setPage(Page.Dashboard);
        } else {
          setPage(Page.Auth);
        }
      };

      // --- CASO 1: FALLO O CANCELACIÓN ---
      if (status === 'failure' || status === 'rejected' || status === 'null') {
         setNotification({ text: 'Pago cancelado o no completado.', type: 'error' });
         await restoreAppState(); // CRÍTICO: Recargar perfil aunque falle el pago
         return;
      }

      // --- CASO 2: PENDIENTE ---
      if (status === 'pending' || status === 'in_process') {
         setNotification({ text: 'Pago pendiente de acreditación.', type: 'success' });
         await restoreAppState(); // CRÍTICO: Recargar perfil
         return;
      }

      // --- CASO 3: ÉXITO (Requiere validación backend) ---
      if (paymentId && (status === 'approved' || status === 'success')) {
          setVerifyingPayment(true);
          const safetyTimer = setTimeout(() => setShowForceExit(true), 12000);

          try {
            const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
                body: { payment_id: paymentId }
            });

            if (funcError) throw new Error(funcError.message);
            if (!responseData?.success) throw new Error(responseData?.error || 'Falló validación.');

            setNotification({ text: '¡Pago exitoso! Plan activado.', type: 'success' });
            // El perfil se recarga en el finally o al terminar el try

          } catch (err: any) {
            console.error("Payment Error:", err);
            setNotification({ text: `Error activando plan: ${err.message}`, type: 'error' });
            // Aunque falle la activación técnica, queremos que el usuario entre a la app
          } finally {
            clearTimeout(safetyTimer);
            setVerifyingPayment(false);
            setShowForceExit(false);
            await restoreAppState(); // CRÍTICO: Siempre restaurar estado al final
          }
      }
    };

    checkPayment();
  }, [loadProfile]);

  // ==================================================================================
  // UI RENDER
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

  const renderProtectedPage = (Component: React.ReactNode) => {
    if (!session) return <AuthPage onNavigate={handleNavigate} />;
    
    // Si estamos cargando perfil o el perfil es null, mostramos loading
    // PERO si ya pasó mucho tiempo y sigue null (zombie), ofrecemos salir
    if (loadingProfile || !profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600 mb-2"></div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cargando perfil...</p>
                {/* Botón de escape por si se queda pegado */}
                {!loadingProfile && !profile && (
                  <button onClick={() => handleLogout()} className="mt-4 text-[10px] text-red-400 underline cursor-pointer hover:text-red-600">
                    Reiniciar sesión
                  </button>
                )}
            </div>
        );
    }
    return Component;
  };

  // 1. UI Verificación Pago (Prioridad Máxima)
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

  // 2. UI Loading Inicial (Solo primera carga real)
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
