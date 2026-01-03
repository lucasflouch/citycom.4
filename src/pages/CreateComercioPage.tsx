
import React, { useState, useEffect, useMemo } from 'react';
import { Page, PageValue, AppData, Ciudad, Comercio, SubRubro, Profile, SubscriptionPlan, Session } from '../types';
import { supabase } from '../supabaseClient';
import { fetchArgentinaCiudades } from '../services/argentinaDataService';
import Map from '../components/Map';

interface CreateComercioPageProps {
  session: Session;
  profile: Profile | null;
  onNavigate: (page: PageValue) => void;
  data: AppData;
  onComercioCreated: () => Promise<void>;
  editingComercio?: Comercio | null;
}

const CreateComercioPage: React.FC<CreateComercioPageProps> = ({ session, profile, onNavigate, data, onComercioCreated, editingComercio }) => {
  const [loading, setLoading] = useState(false);
  const [loadingCiudades, setLoadingCiudades] = useState(false);
  
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [direccion, setDireccion] = useState('');
  const [provinciaId, setProvinciaId] = useState('');
  const [ciudadId, setCiudadId] = useState('');
  const [rubroId, setRubroId] = useState('');
  const [subRubroId, setSubRubroId] = useState('');
  const [imagenes, setImagenes] = useState<string[]>([]);
  const [localidades, setLocalidades] = useState<Ciudad[]>([]);
  const [dynamicSubRubros, setDynamicSubRubros] = useState<SubRubro[]>([]);
  const [coords, setCoords] = useState<[number, number]>([-34.6037, -58.3816]);
  
  const userPlan: SubscriptionPlan | undefined = useMemo(() => {
    if (!profile || !data.plans) return undefined;
    const plan = data.plans.find(p => p.id === profile.plan_id) || data.plans.find(p => p.nombre.toLowerCase() === 'gratis');
    return plan;
  }, [profile, data.plans]);

  const maxImagenes = userPlan?.limiteImagenes ?? 1;

  useEffect(() => {
    if (!editingComercio && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setCoords([lat, lng]);
          reverseGeocode(lat, lng);
        },
        null,
        { enableHighAccuracy: true }
      );
    }
  }, [editingComercio]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        const parts = data.display_name.split(',');
        const shortAddr = parts.slice(0, 2).join(',').trim();
        setDireccion(shortAddr);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (editingComercio) {
      setNombre(editingComercio.nombre || '');
      setDescripcion(editingComercio.descripcion || '');
      setWhatsapp((editingComercio.whatsapp || '').replace('+54', ''));
      setDireccion(editingComercio.direccion || '');
      setRubroId(editingComercio.rubroId || '');
      setSubRubroId(editingComercio.subRubroId || '');
      setImagenes(editingComercio.imagenes || []);
      setCiudadId(editingComercio.ciudadId || '');
      if (editingComercio.latitude && editingComercio.longitude) {
        setCoords([editingComercio.latitude, editingComercio.longitude]);
      }
      const city = data.ciudades.find(c => String(c.id) === String(editingComercio.ciudadId));
      if (city) setProvinciaId(city.provinciaId);
    }
  }, [editingComercio, data.ciudades]);

  useEffect(() => {
    const syncLocalidades = async () => {
      if (!provinciaId) return setLocalidades([]);
      setLoadingCiudades(true);
      try {
        const fromApi = await fetchArgentinaCiudades(provinciaId);
        setLocalidades(fromApi);
      } catch (err) { console.error(err); } finally { setLoadingCiudades(false); }
    };
    syncLocalidades();
  }, [provinciaId]);

  useEffect(() => {
    if (rubroId) {
      const filtered = data.subRubros.filter(sr => sr.rubroId === rubroId);
      setDynamicSubRubros(filtered);
    } else {
      setDynamicSubRubros([]);
    }
  }, [rubroId, data.subRubros]);


  const handleLocationSelect = (lat: number, lng: number) => {
    setCoords([lat, lng]);
    reverseGeocode(lat, lng);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const currentImagesCount = imagenes.length;
    const filesToProcess = Array.from(files).slice(0, maxImagenes - currentImagesCount);

    filesToProcess.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagenes(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, '');
    setWhatsapp(numericValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ciudadId || !rubroId || !subRubroId) return alert('Por favor completá Localidad, Rubro y Sub-Rubro.');
    
    setLoading(true);
    try {
      const generatedSlug = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

      const payload = {
        nombre,
        slug: generatedSlug,
        descripcion, 
        whatsapp: `+54${whatsapp}`, 
        direccion,
        imagen_url: imagenes[0] || 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=400',
        imagenes: imagenes,
        rubro_id: rubroId,
        sub_rub_id: subRubroId,
        ciudad_id: ciudadId,
        usuario_id: session.user.id,
        latitude: coords[0],
        longitude: coords[1],
        plan_id: profile?.plan_id
      };

      const { error } = editingComercio 
        ? await supabase.from('comercios').update(payload).eq('id', editingComercio.id)
        : await supabase.from('comercios').insert([payload]);

      if (error) throw error;
      
      await onComercioCreated();
      onNavigate(Page.Dashboard);

    } catch (err: any) {
      console.error("Error al guardar:", err);
      alert('Error al guardar: ' + (err.message || 'Error de conexión'));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-4 px-4">
      <div className="bg-white rounded-[3.5rem] shadow-soft overflow-hidden border border-slate-100">
        <div className="p-8 bg-indigo-600 text-white flex justify-between items-center relative">
          <h2 className="text-2xl font-black uppercase tracking-tight">
            {editingComercio ? 'Editar Publicación' : 'Crear Nueva Publicación'}
          </h2>
          <button 
            type="button" 
            onClick={() => onNavigate(Page.Dashboard)} 
            className="font-black hover:scale-105 transition-transform bg-white/20 px-4 py-2 rounded-xl text-xs uppercase"
          >
            Volver
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Galería de Fotos (Máx {maxImagenes} según tu plan {userPlan?.nombre})</label>
                <div className="flex flex-wrap gap-3">
                  {imagenes.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-100 shadow-sm animate-in zoom-in duration-300">
                      <img src={img} className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setImagenes(prev => prev.filter((_, idx) => idx !== i))} 
                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black shadow-lg"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {imagenes.length < maxImagenes && (
                    <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 text-slate-300 transition-all">
                      <span className="text-3xl">+</span>
                      <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Título de la Publicación</label>
                  <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 font-bold shadow-inner" placeholder="Ej: Pizza de Muzzarella Grande" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Provincia</label>
                    <select required value={provinciaId} onChange={e => setProvinciaId(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm shadow-inner cursor-pointer">
                      <option value="">Provincia...</option>
                      {data.provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Localidad</label>
                    <select required value={ciudadId} onChange={e => setCiudadId(e.target.value)} disabled={!provinciaId} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm shadow-inner disabled:opacity-30 cursor-pointer">
                      <option value="">{loadingCiudades ? '⏳...' : 'Ciudad...'}</option>
                      {localidades.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Rubro</label>
                    <select required value={rubroId} onChange={e => { setRubroId(e.target.value); setSubRubroId(''); }} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm shadow-inner cursor-pointer">
                      <option value="">Rubro...</option>
                      {data.rubros.map(r => <option key={r.id} value={r.id}>{r.icon} {r.nombre}</option>)}
                    </select>
                  </div>
                   <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Sub-Rubro</label>
                    <select required value={subRubroId} onChange={e => setSubRubroId(e.target.value)} disabled={!rubroId || dynamicSubRubros.length === 0} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm shadow-inner disabled:opacity-30 cursor-pointer">
                      <option value="">{rubroId ? 'Elegí...' : '...'}</option>
                      {dynamicSubRubros.map(sr => <option key={sr.id} value={sr.id}>{sr.nombre}</option>)}
                    </select>
                  </div>
                </div>
                 <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">WhatsApp de Contacto</label>
                    <div className="flex items-center bg-slate-50 rounded-2xl shadow-inner focus-within:ring-2 focus-within:ring-indigo-500">
                      <span className="px-4 text-slate-400 font-bold text-sm">+54</span>
                      <input 
                          type="tel" 
                          required 
                          value={whatsapp} 
                          onChange={handleWhatsappChange} 
                          placeholder="91123456789" 
                          className="w-full p-4 bg-transparent border-none font-bold text-sm outline-none" 
                      />
                    </div>
                  </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Ubicación y Dirección en el Mapa</label>
              <div className="h-[300px] rounded-[2.5rem] overflow-hidden shadow-inner border border-slate-100 bg-slate-100">
                <Map comercios={[]} isPicker={true} center={coords} zoom={16} onLocationSelect={handleLocationSelect} />
              </div>
              <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <label className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">Dirección Detectada / Manual</label>
                <input type="text" required placeholder="Calle y número" value={direccion} onChange={e => setDireccion(e.target.value)} className="w-full bg-transparent outline-none font-black text-indigo-900 placeholder:text-indigo-200" />
              </div>
              <p className="text-[10px] text-slate-400 font-bold italic text-center">💡 Mové el pin rojo para ajustar la ubicación exacta.</p>
            </div>
          </div>

          <div className="pt-4">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Descripción Detallada</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Detalles del producto/servicio, horarios, etc..." className="w-full p-6 bg-slate-50 rounded-[2rem] border-none min-h-[120px] font-medium shadow-inner focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] hover:bg-indigo-700 transition-all shadow-indigo active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Guardando...' : editingComercio ? 'Guardar Cambios' : 'Publicar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateComercioPage;
