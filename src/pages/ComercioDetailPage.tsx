
import React, { useState, useMemo, useEffect } from 'react';
import { Comercio, Page, PageValue, Review, Profile, AppData, Conversation, Session, Ciudad } from '../types';
import { supabase } from '../supabaseClient';
import Map from '../components/Map';
import ShareButton from '../components/ShareButton';
import { findOrCreateConversation } from '../services/chatService';
import { updateMetaTagsForComercio, resetMetaTags } from '../services/seoService';

interface ComercioDetailPageProps {
  comercioId: string;
  appData: AppData;
  onNavigate: (page: PageValue, entity?: Comercio | Conversation) => void;
  session: Session | null;
  profile: Profile | null;
  onReviewSubmitted: () => Promise<void>;
}

const ComercioDetailPage: React.FC<ComercioDetailPageProps> = ({ comercioId, appData, onNavigate, session, profile, onReviewSubmitted }) => {
  const comercio = useMemo(() => appData.comercios.find(c => String(c.id) === String(comercioId)), [appData.comercios, comercioId]);
  
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (comercio) {
      // Mock de ciudad para SEO usando la propiedad desnormalizada
      const ciudadMock: Ciudad = {
          id: comercio.ciudadId,
          nombre: comercio.nombreCiudad || 'Argentina',
          provinciaId: comercio.provinciaId
      };
      const rubro = appData.rubros.find(r => String(r.id) === String(comercio.rubroId));
      updateMetaTagsForComercio(comercio, ciudadMock, rubro);
    }
    return () => {
      resetMetaTags();
    };
  }, [comercio, appData.rubros]);


  const showToast = (message: string, duration: number = 3000) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), duration);
  };

  if (!comercio) {
    resetMetaTags();
    return <div className="text-center py-20 font-bold">Publicación no encontrada</div>;
  }

  const whatsappForLink = (comercio.whatsapp || '').replace(/\+/g, '');

  const handleStartChat = async () => {
    if (!session || !profile) {
      showToast("Inicia sesión para chatear.", 2000);
      setTimeout(() => onNavigate(Page.Auth), 1000);
      return;
    }
    
    // Si soy el dueño, no puedo chatear conmigo mismo desde aquí
    if (session.user.id === comercio.usuarioId) {
        showToast("Este es tu propio comercio.", 3000);
        return;
    }

    setChatLoading(true);
    try {
      const conversation = await findOrCreateConversation(session.user.id, comercio);
      if (conversation) {
        onNavigate(Page.Messages, conversation);
      } else {
        showToast("No se pudo iniciar el chat. Intentalo de nuevo.", 4000);
      }
    } catch (e) {
      console.error(e);
      showToast("Error al iniciar el chat.", 4000);
    } finally {
      setChatLoading(false);
    }
  };

  const isOwner = session?.user?.id === comercio.usuarioId;
  const currentImage = activeImage || comercio.imagenUrl;
  const gallery = comercio.imagenes && comercio.imagenes.length > 0 ? comercio.imagenes : [comercio.imagenUrl];
  const reviews = comercio.reviews || [];
  const rubro = appData.rubros.find(r => String(r.id) === String(comercio.rubroId));
  const planAllowsChat = comercio.plan?.tieneChat ?? false;

  const handleRatingSubmit = async () => {
    if (!session) return showToast('Debes iniciar sesión para calificar.');
    if (rating === 0) return showToast('Selecciona una puntuación.');
    if (!comment.trim()) return showToast('Escribe un comentario.');

    setSubmitting(true);
    try {
      const { error } = await supabase.from('reviews').insert([{
        comercio_id: comercio.id,
        usuario_id: session.user.id,
        usuario_nombre: profile?.nombre || session.user.email?.split('@')[0],
        rating: rating,
        comentario: comment,
        created_at: new Date().toISOString()
      }]);
      if (error) throw error;
      await onReviewSubmitted();
      showToast('¡Tu opinión fue enviada!');
      setComment(''); setRating(0);
    } catch (err: any) { 
      showToast(err.message, 4000); 
    } finally { 
      setSubmitting(false); 
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-24 px-4 relative">
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[2000] px-8 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 duration-500 font-black uppercase text-xs tracking-widest bg-indigo-600 text-white">
          {toastMessage}
        </div>
      )}

      <div className="relative h-[300px] md:h-[400px] rounded-b-[4rem] overflow-hidden shadow-lg mb-10 z-10">
        <img src={currentImage} className="w-full h-full object-cover" alt={comercio.nombre} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent"></div>
        
        <button onClick={() => onNavigate(Page.Home)} className="absolute top-6 left-6 bg-white w-12 h-12 flex items-center justify-center rounded-full shadow-xl z-30 hover:scale-110 transition-transform font-bold">
          ←
        </button>

        <div className="absolute bottom-8 left-8 right-8 text-white z-20">
          <span className="bg-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 inline-block">
            {rubro?.icon} {rubro?.nombre}
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none drop-shadow-md">
            {comercio.nombre}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-8 rounded-[3rem] shadow-soft border border-slate-50">
            <h3 className="text-xl font-black uppercase mb-4 text-slate-800 tracking-tighter italic">Detalles</h3>
            <p className="text-slate-500 font-medium leading-relaxed">
              {comercio.descripcion || "¡Vení a conocernos! Brindamos la mejor atención personalizada de la zona con productos de primera calidad."}
            </p>
            {gallery.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-4 mt-8">
                {gallery.map((img, i) => (
                  <img key={i} src={img} onClick={() => setActiveImage(img)} className="w-24 h-24 rounded-2xl object-cover cursor-pointer border-2 border-transparent hover:border-indigo-500 shrink-0 transition-all shadow-sm" />
                ))}
              </div>
            )}
          </section>

          <section className="bg-white p-8 rounded-[3rem] shadow-soft border border-slate-50">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black uppercase text-slate-800 tracking-tighter italic">Ubicación</h3>
                <div className="bg-indigo-50 px-4 py-2 rounded-xl text-indigo-600 font-black text-[10px] uppercase tracking-widest border border-indigo-100">
                  📍 {comercio.direccion || 'Domicilio Verificado'} ({comercio.nombreCiudad})
                </div>
             </div>
             <div className="h-[280px] rounded-[2.5rem] overflow-hidden border border-slate-100 bg-slate-50 relative z-0">
                <Map 
                    comercios={[comercio]} 
                    center={comercio.latitude && comercio.longitude ? [comercio.latitude, comercio.longitude] : undefined}
                    zoom={16} 
                />
             </div>
          </section>

          <section className="bg-white p-8 rounded-[3rem] shadow-soft border border-slate-50">
            <h3 className="text-xl font-black uppercase mb-8 text-slate-800 tracking-tighter italic">Experiencias</h3>
            <div className="space-y-4 mb-10">
              {reviews.length > 0 ? reviews.map((rev) => (
                <div key={rev.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-black text-[10px] uppercase tracking-widest text-slate-400">{rev.usuario_nombre}</span>
                    <span className="text-amber-400 text-sm">{'★'.repeat(rev.rating)}</span>
                  </div>
                  <p className="text-slate-600 font-medium italic">"{rev.comentario}"</p>
                </div>
              )) : (
                <p className="text-center text-slate-400 font-bold text-xs uppercase italic py-4">Sé el primero en calificar esta publicación</p>
              )}
            </div>

            {session && (
              <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                <div className="flex justify-center gap-2 mb-6">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setRating(s)} className={`text-3xl transition-transform hover:scale-125 ${rating >= s ? 'text-amber-400' : 'text-slate-300'}`}>★</button>
                  ))}
                </div>
                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="¿Cómo fue tu visita?" className="w-full p-4 rounded-2xl border-none text-sm mb-4 min-h-[100px] shadow-inner font-medium" />
                <button onClick={handleRatingSubmit} disabled={submitting} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-indigo">
                  {submitting ? 'Enviando...' : 'Publicar mi opinión'}
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white sticky top-28">
            <h3 className="text-lg font-black uppercase mb-8 border-b border-white/10 pb-4 tracking-widest italic">Contacto Directo</h3>
            <div className="space-y-4">
              
              {/* BOTÓN DE CHAT PROMINENTE (ACTUALIZADO) */}
              {!isOwner && planAllowsChat && (
                <button
                  onClick={handleStartChat}
                  disabled={chatLoading}
                  className="w-full flex items-center justify-center gap-4 bg-white text-indigo-600 p-5 rounded-2xl font-black hover:scale-[1.03] transition-all group disabled:opacity-50 shadow-lg border-b-4 border-indigo-100"
                >
                  <span className="text-2xl group-hover:rotate-12 transition-transform">💬</span>
                  <div className="text-left">
                    <p className="text-[9px] uppercase opacity-60 tracking-widest text-indigo-400">Consultas</p>
                    <p className="text-lg leading-tight">{chatLoading ? "Iniciando..." : "Enviar mensaje interno"}</p>
                  </div>
                </button>
              )}

              <a href={`https://wa.me/${whatsappForLink}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-green-500 p-5 rounded-2xl font-black hover:scale-[1.03] transition-all group shadow-lg border-b-4 border-green-600">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white group-hover:scale-110 transition-transform">
                  <path d="M16.75 13.96c.25.13.41.2.46.3.06.11.04.61-.21 1.18-.2.56-1.24 1.1-1.72 1.18-.5.06-1.02.06-1.57-.15-.56-.22-1.33-.48-2.24-1.05-.93-.56-1.8-1.34-2.54-2.21-.73-.86-1.15-1.75-1.29-2.02-.14-.29-.04-.46.09-.61.12-.14.26-.18.38-.18.11 0 .25 0 .38.01.12.01.29.01.44.3.15.29.23.63.26.69.03.06.03.14 0 .2-.03.06-.06.09-.12.15-.06.06-.12.12-.18.18-.06.06-.12.12-.17.17-.05.05-.1.11-.04.22s.27.46.59.83c.32.37.74.83 1.29 1.18.55.35.93.43 1.09.5.16.06.26.04.36-.04.1-.09.43-.51.55-.69.12-.18.23-.17.39-.1.16.06.94.44 1.1.51.17.09.28.12.31.18.04.06.04.12 0 .18zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8-8 8z"></path>
                </svg>
                <div className="text-left">
                  <p className="text-[9px] font-bold uppercase opacity-80 tracking-widest">Externo</p>
                  <p className="text-lg leading-tight">WhatsApp Directo</p>
                </div>
              </a>

              <a href={`tel:${comercio.whatsapp}`} className="flex items-center gap-5 bg-indigo-600 p-5 rounded-2xl font-black hover:scale-[1.03] transition-all group shadow-lg">
                <span className="text-2xl group-hover:rotate-12 transition-transform">📞</span>
                <div className="text-left">
                  <p className="text-[8px] uppercase opacity-60 tracking-widest">Llamada</p>
                  <p>{comercio.whatsapp}</p>
                </div>
              </a>

              {/* BOTÓN COMPARTIR: RECOMENDAR ESTE LUGAR */}
              <ShareButton 
                title={`Mirá ${comercio.nombre}`}
                text={`¡Che, mirá este lugar que encontré en la Guía Comercial! Se llama ${comercio.nombre}.`}
                url={`?comercio=${comercio.id}`}
                variant="block"
                label="Recomendar este lugar"
              />

            </div>
            <p className="mt-8 text-[9px] text-white/40 font-black uppercase text-center tracking-[0.3em]">
              ID PUBLICACIÓN: {comercio.id.slice(0,8)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComercioDetailPage;
