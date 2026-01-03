
import React, { useState } from 'react';
import { Page, PageValue, Profile, Session } from '../types';

interface HeaderProps {
  session: Session | null;
  profile: Profile | null;
  onNavigate: (page: PageValue) => void;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ session, profile, onNavigate, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-soft sticky top-0 z-[9999] w-full border-b border-slate-100">
      <div className="container mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
        <div 
          className="text-2xl font-black text-indigo-600 cursor-pointer flex items-center gap-2 group"
          onClick={() => onNavigate(Page.Home)}
        >
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg shadow-indigo group-hover:rotate-12 transition-transform">🏪</div>
          <span className="tracking-tighter uppercase text-slate-900">Guía<span className="text-indigo-600">Comercial</span></span>
        </div>
        
        <nav className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => onNavigate(Page.Home)} 
            className="hidden sm:block text-slate-400 hover:text-indigo-600 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            Inicio
          </button>
          
          {session ? (
            <>
                <button 
                    onClick={() => onNavigate(Page.Messages)} 
                    className="hidden sm:block bg-slate-50 text-slate-900 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                >
                    Mensajes
                </button>
                <button 
                    onClick={() => onNavigate(Page.Dashboard)} 
                    className="bg-slate-50 text-slate-900 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                >
                    Mi Panel
                </button>
                
                {/* Menú de Usuario con Dropdown Simulado */}
                <div className="relative">
                    <button 
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="bg-indigo-50 text-indigo-700 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-100 transition-all"
                    >
                        <span>{profile?.nombre?.split(' ')[0] || 'Cuenta'}</span>
                        <span className="text-[8px]">▼</span>
                    </button>

                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden animate-fade-up">
                                {profile?.is_admin && (
                                     <button 
                                     onClick={() => { onNavigate(Page.Admin); setMenuOpen(false); }}
                                     className="w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-50"
                                     >
                                     ⚙️ Admin Panel
                                     </button>
                                )}
                                <button 
                                    onClick={() => { onNavigate(Page.Profile); setMenuOpen(false); }}
                                    className="w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                                >
                                    👤 Mi Perfil
                                </button>
                                <button 
                                    onClick={() => { onLogout(); setMenuOpen(false); }}
                                    className="w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 border-t border-slate-50"
                                >
                                    Salir
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </>
          ) : (
            <button 
              onClick={() => onNavigate(Page.Auth)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-indigo hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Ingresar
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
