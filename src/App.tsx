
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
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [notification, setNotification] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // --- ESTADO DE NAVEGACIÓN ---
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // --- REFS ---
  const paymentProcessedRef = useRef(false);

  // 1. CARGA DE PERFIL
  const loadProfile = useCallback(async (userId: string) => {
    try {
      // Intentamos cargar el perfil. Como vimos en tus capturas, RLS está disabled
      // así que esto funcionará directo.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (data) {
          setProfile(data as Profile);
      } else {
         // Si el usuario existe en Auth pero no en profiles (raro, pero posible)
         // Lo dejamos pasar, el header mostrará el email.
         console.warn("Usuario logueado sin perfil en tabla profiles.");
      }
      return data;
    } catch (e) { 
      console.error("Error loading profile:", e); 
      return null;
    }
  }, []);

  // 2. INICIALIZACIÓN DE APP
  useEffect(() => {
    let mounted = true;

    const initApp = async () => {
      try {
        // A. Carga de Datos Estáticos
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        // B. Verificación de Sesión Inicial
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (mounted && currentSession) {
            setSession(currentSession);
            await loadProfile(currentSession.user.id);
        }
      } catch (err) {
        console.error("Error crítico inicio app:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!paymentProcessedRef.current) {
        initApp();
    } else {
        setLoading(false);
    }

    // C. Listener de Auth (LA CLAVE DEL FIX)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        await loadProfile(newSession.user.id);
        
        // FIX CRÍTICO: Si el usuario acaba de loguearse y está en la página de Auth o Home,
        // lo mandamos al Dashboard automáticamente.
        setPage(currentPage => {
            if (currentPage === Page.Auth || currentPage === Page.Home) {
                return Page.Dashboard;
            }
            return currentPage;
        });

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
  }, [loadProfile]);

  // 3. VERIFICACIÓN DE PAGOS
  useEffect(() => {
    const checkPayment = async () => {
      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');

      if (!paymentId && !status) return;
      if (paymentProcessedRef.current) return;

      paymentProcessedRef.current = true;
      window.history.replaceState(null, '', window.location.pathname);

      if (status && status !== 'approved' && status !== 'success') {
         setNotification({ text: 'El pago no fue completado o está pendiente.', type: 'error' });
         return;
      }

      setVerifyingPayment(true);
      try {
        const { data: res, error } = await supabase.functions.invoke('verify-payment-v1', {
            body: { payment_id: paymentId }
        });
        
        if (error || !res?.success) throw new Error(res?.error || 'Error de validación');
        
        setNotification({ text: '¡Plan activado correctamente!', type: 'success' });
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
            await loadProfile(s.user.id);
            setPage(Page.Dashboard);
        }
      } catch (e: any) {
        console.error("Error pago:", e);
        setNotification({ text: 'Hubo un error verificando el pago. Contactá soporte.', type: 'error' });
      } finally {
        setVerifyingPayment(false);
      }
    };

    checkPayment();
  }, [loadProfile]);

  // 4. HANDLERS
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const refreshData = async () => {
    const dbData = await fetchAppData();
    if (dbData) setAppData(dbData);
  };

  // --- RENDER ---
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Cargando Guía Comercial...</p>
    </div>
  );

  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 fixed inset-0 z-[99999]">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6"></div>
      <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">Confirmando Pago</h2>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative flex flex-col">
      {notification && (
        <div onClick={() => setNotification(null)} className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-6 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 cursor-pointer ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
            <p className="text-sm font-bold text-center">{notification.text}</p>
        </div>
      )}

      <Header session={session} profile={profile} onNavigate={handleNavigate} onLogout={handleLogout} />
      
      <main className="container mx-auto max-w-7xl px-4 py-8 flex-grow">
        {page === Page.Home && <HomePage onNavigate={handleNavigate} data={appData} />}
        
        {page === Page.Auth && <AuthPage onNavigate={handleNavigate} />}
        
        {page === Page.Dashboard && (
            session ? 
            <DashboardPage session={session} profile={profile} onNavigate={handleNavigate} data={appData} refreshData={refreshData} /> : 
            <AuthPage onNavigate={() => handleNavigate(Page.Dashboard)} />
        )}

        {(page === Page.CreateComercio || page === Page.EditComercio) && (
            session ? 
            <CreateComercioPage 
                session={session} 
                profile={profile}
                onNavigate={handleNavigate} 
                data={appData} 
                onComercioCreated={refreshData} 
                editingComercio={page === Page.EditComercio ? appData.comercios.find(c => c.id === selectedComercioId) : null} 
            /> : 
            <AuthPage onNavigate={() => handleNavigate(Page.CreateComercio)} />
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

         {page === Page.Messages && (
            (session && profile) ? 
            <MessagesPage 
                session={session} 
                profile={profile} 
                appData={appData}
                onNavigate={handleNavigate}
                initialConversation={selectedConversation}
            /> : 
            <AuthPage onNavigate={() => handleNavigate(Page.Messages)} />
         )}

        {page === Page.Pricing && (
            (session && profile) ? 
            <PricingPage 
                profile={profile}
                plans={appData.plans}
                session={session}
                onNavigate={handleNavigate}
                refreshProfile={() => loadProfile(session.user.id)}
            /> : 
            <AuthPage onNavigate={() => handleNavigate(Page.Pricing)} />
        )}
        
        {page === Page.Profile && (
            (session && profile) ?
            <ProfilePage 
                session={session}
                profile={profile}
                plans={appData.plans}
                onProfileUpdate={() => loadProfile(session.user.id)}
            /> :
            <AuthPage onNavigate={() => handleNavigate(Page.Profile)} />
        )}
        
        {page === Page.Admin && session && profile?.is_admin && (
           <AdminPage session={session} plans={appData.plans} />
        )}
      </main>
    </div>
  );
};

export default App;
