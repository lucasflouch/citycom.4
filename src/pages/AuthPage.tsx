
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Page, PageValue } from '../types';

interface AuthPageProps {
  onNavigate: (page: PageValue) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isLogin && password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // NOTA IMPORTANTE:
        // No llamamos a onNavigate(Page.Dashboard) aquí manualmente.
        // App.tsx escuchará el evento SIGNED_IN, cargará el perfil y redirigirá automáticamente.
        // Esto previene condiciones de carrera donde navegamos antes de tener el perfil.
      } else {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { telefono, nombre: email.split('@')[0] }
          }
        });
        if (error) throw error;
        
        if (data.session) {
          // Si hay sesión (login automático tras registro), App.tsx lo manejará.
        } else {
          alert('¡Cuenta creada! Verifica tu correo electrónico para activarla.');
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      setErrorMsg(error.message || 'Error en la autenticación');
      setLoading(false); // Solo bajamos el loading si hubo error
    } 
    // Si no hubo error, dejamos loading en true hasta que App.tsx desmonte este componente
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-12">
      <div className="max-w-md w-full bg-white p-10 rounded-[3.5rem] shadow-indigo border border-indigo-50">
        <div className="text-center mb-12">
          <div className="text-7xl mb-6 transform hover:scale-110 transition-transform cursor-default inline-block">🇦🇷</div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">
            {isLogin ? '¡Hola de nuevo!' : 'Unite a la Guía'}
          </h2>
          <p className="text-slate-400 font-medium tracking-tight">Gestioná tu comercio en segundos</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              required
              className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-bold text-slate-700"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            {!isLogin && (
              <input
                type="tel"
                placeholder="WhatsApp (Ej: 1123456789)"
                required
                className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-bold text-slate-700"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            )}

            <input
              type="password"
              placeholder="Contraseña"
              required
              className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-bold text-slate-700"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {!isLogin && (
              <input
                type="password"
                placeholder="Confirmar contraseña"
                required
                className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-bold text-slate-700"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100">
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-indigo hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 mt-4 uppercase tracking-widest"
          >
            {loading ? 'Ingresando...' : isLogin ? 'Ingresar' : 'Registrarme'}
          </button>
        </form>

        <div className="relative my-10">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black"><span className="px-4 bg-white text-slate-300">O también</span></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          type="button"
          className="w-full py-5 border-2 border-slate-100 rounded-3xl font-black flex items-center justify-center gap-4 hover:bg-slate-50 hover:border-indigo-200 transition-all text-slate-700 active:scale-[0.98] shadow-sm group"
        >
          <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-sm tracking-tighter uppercase">Continuar con Google</span>
        </button>

        <p className="mt-10 text-center text-sm text-slate-400 font-medium">
          {isLogin ? '¿No tenés cuenta todavía?' : '¿Ya tenés cuenta?'}
          <button onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }} className="ml-2 text-indigo-600 font-black hover:underline decoration-2 underline-offset-4">
            {isLogin ? 'Registrate ahora' : 'Iniciá sesión'}
          </button>
        </p>

        <div className="text-center mt-6">
            <button onClick={() => onNavigate(Page.Home)} className="text-[10px] text-gray-300 uppercase tracking-[0.3em] font-black hover:text-indigo-600 transition-colors">
                &larr; Volver al Inicio
            </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
