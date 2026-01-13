
import React, { useState } from 'react';

type ShareVariant = 'pill' | 'block' | 'icon' | 'outline';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  variant?: ShareVariant;
  className?: string;
  label?: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ 
  title, 
  text, 
  url, 
  variant = 'block', 
  className = '',
  label = 'Compartir'
}) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    // 1. Intentar usar API Nativa (Móviles)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: fullUrl,
        });
        return;
      } catch (err) {
        console.warn('Error sharing:', err);
        // Si el usuario cancela, no hacemos nada. Si falla, fallback a clipboard.
      }
    }

    // 2. Fallback: Copiar al portapapeles (Desktop)
    try {
      await navigator.clipboard.writeText(`${text} ${fullUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const baseClasses = "transition-all active:scale-95 font-black uppercase tracking-widest flex items-center justify-center gap-2";
  
  const variants = {
    pill: `rounded-full px-4 py-2 text-[10px] shadow-sm border ${copied ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`,
    block: `w-full p-4 rounded-2xl text-xs shadow-lg ${copied ? 'bg-green-500 text-white' : 'bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:brightness-110'}`,
    outline: `px-4 py-3 rounded-2xl text-[10px] border ${copied ? 'border-green-500 text-green-600 bg-green-50' : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 bg-white'}`,
    icon: `w-10 h-10 rounded-full flex items-center justify-center ${copied ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600'}`
  };

  return (
    <button 
      onClick={handleShare} 
      className={`${baseClasses} ${variants[variant]} ${className}`}
    >
      {copied ? (
        <>
          <span>✓</span>
          {variant !== 'icon' && <span>¡Copiado!</span>}
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={variant === 'icon' ? "w-5 h-5" : "w-4 h-4"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          {variant !== 'icon' && <span>{label}</span>}
        </>
      )}
    </button>
  );
};

export default ShareButton;
