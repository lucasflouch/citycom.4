
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
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        // FORZAMOS LA NAVEGACIÓN
        // Si el listener global en App.tsx falla en detectar el cambio rápido,
        // esta llamada asegura que la UI cambie.
        if (data.session) {
            onNavigate(Page.Dashboard);
        }
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
           onNavigate(Page.Dashboard);
        } else {
          alert('¡Cuenta creada! Verifica tu correo electrónico para activarla.');
          setIsLogin(true);
          setLoading(false); // Detenemos carga si hay que verificar email
        }
      }
    } catch (error: any) {
      setErrorMsg(error.message || 'Error en la autenticación');
      setLoading(false); 
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-8 animate-in fade-in zoom-in duration-300">
      <div className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-soft border border-indigo-50">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">
            {isLogin ? 'Bienvenido' : 'Crear Cuenta'}
          </h2>
          <p className="text-slate-400 font-medium tracking-tight">Accedé a tu panel de control</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              required
              disabled={loading}
              className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            {!isLogin && (
              <input
                type="tel"
                placeholder="WhatsApp (Ej: 1123456789)"
                required
                disabled={loading}
                className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            )}

            <input
              type="password"
              placeholder="Contraseña"
              required
              disabled={loading}
              className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {!isLogin && (
              <input
                type="password"
                placeholder="Confirmar contraseña"
                required
                disabled={loading}
                className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 animate-pulse">
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-indigo hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-70 mt-4 uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
            {loading ? 'Procesando...' : isLogin ? 'Ingresar' : 'Registrarme'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-400 font-medium">
          {isLogin ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}
          <button onClick={() => setIsLogin(!isLogin)} className="ml-2 text-indigo-600 font-black hover:underline decoration-2 underline-offset-4">
            {isLogin ? 'Registrate' : 'Iniciá sesión'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
