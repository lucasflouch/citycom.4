
import { supabase } from '../supabaseClient';
import { AppData, Comercio, Review, SubscriptionPlan, Profile, SubRubro, Rubro, Ciudad, Provincia } from '../types';

const mapReview = (db: any): Review => ({
  id: String(db.id),
  comercio_id: String(db.comercio_id),
  usuario_id: String(db.usuario_id),
  usuario_nombre: db.usuario_nombre || 'Usuario',
  comentario: db.comentario || '',
  rating: Number(db.rating) || 0,
  created_at: db.created_at || new Date().toISOString()
});

const mapComercio = (db: any, reviewsForComercio: Review[] = [], ownerPlan?: SubscriptionPlan): Comercio => {
  const avgRating = reviewsForComercio.length > 0 
    ? reviewsForComercio.reduce((acc, curr) => acc + curr.rating, 0) / reviewsForComercio.length 
    : 0;

  return {
    id: String(db.id),
    nombre: db.nombre || '',
    slug: db.slug || '',
    imagenUrl: db.imagen_url || '',
    imagenes: Array.isArray(db.imagenes) ? db.imagenes : [],
    rubroId: String(db.rubro_id),
    subRubroId: String(db.sub_rub_id),
    ciudadId: String(db.ciudad_id),
    usuarioId: String(db.usuario_id),
    whatsapp: String(db.whatsapp || ''),
    descripcion: db.descripcion || '',
    direccion: db.direccion || '',
    latitude: db.latitude ? Number(db.latitude) : undefined,
    longitude: db.longitude ? Number(db.longitude) : undefined,
    isVerified: !!db.is_verified,
    isWaVerified: !!db.is_wa_verified,
    planId: String(db.plan_id || 'free'),
    rating: Number(avgRating.toFixed(1)),
    reviewCount: reviewsForComercio.length,
    reviews: reviewsForComercio,
    plan: ownerPlan
  };
};

export const fetchAppData = async (): Promise<AppData> => {
  const emptyData: AppData = {
      provincias: [], ciudades: [], rubros: [], subRubros: [], plans: [], comercios: [], banners: []
  };

  try {
    const fetchSafe = async (tableName: string, orderField?: string) => {
      let query = supabase.from(tableName).select('*');
      if (orderField) query = query.order(orderField);
      const { data, error } = await query;
      if (error) {
        console.warn(`DataService: Error fetch tabla ${tableName}:`, error.message);
        return [];
      }
      return data || [];
    };

    // Usamos Promise.allSettled para robustez total
    const results = await Promise.allSettled([
      fetchSafe('provincias', 'nombre'),
      fetchSafe('ciudades', 'nombre'),
      fetchSafe('rubros', 'nombre'),
      fetchSafe('sub_rubros', 'nombre'),
      fetchSafe('subscription_plans', 'precio'),
      fetchSafe('comercios'),
      fetchSafe('reviews'),
      fetchSafe('profiles')
    ]);

    const getResult = (index: number) => {
        const res = results[index];
        return res.status === 'fulfilled' ? res.value : [];
    };

    const provs = getResult(0);
    const ciuds = getResult(1);
    const rubs = getResult(2);
    const subRubs = getResult(3);
    const plans = getResult(4);
    const coms = getResult(5);
    const revs = getResult(6);
    const profiles = getResult(7);
    
    // Mapeos robustos
    const reviewsByComercioId = new Map<string, Review[]>();
    revs.forEach((review: any) => {
      if (!review) return;
      const key = String(review.comercio_id);
      if (!reviewsByComercioId.has(key)) reviewsByComercioId.set(key, []);
      reviewsByComercioId.get(key)!.push(mapReview(review));
    });

    const profilesMap = new Map<string, Profile>(profiles.map((p: any) => [String(p.id), p as Profile]));
    
    // Plans fallback si la DB está vacía
    let finalPlans = plans.map((p: any) => ({
        id: String(p.id),
        nombre: p.nombre,
        precio: Number(p.precio),
        limiteImagenes: Number(p.limite_imagenes || 1),
        limitePublicaciones: Number(p.limite_publicaciones || 1),
        tienePrioridad: !!p.tiene_prioridad,
        tieneChat: !!p.tiene_chat
    }));

    if (finalPlans.length === 0) {
        // Fallback local por si RLS bloquea planes
        finalPlans = [{ id: 'free', nombre: 'Gratis', precio: 0, limiteImagenes: 1, limitePublicaciones: 1, tienePrioridad: false, tieneChat: false }];
    }

    const plansMap = new Map<string, SubscriptionPlan>(finalPlans.map((p:any) => [p.id, p]));
    const defaultPlan = finalPlans.find((p:any) => p.precio === 0) || finalPlans[0];

    return {
      provincias: provs.map((p: any): Provincia => ({ id: String(p.id), nombre: p.nombre })),
      ciudades: ciuds.map((c: any): Ciudad => ({
        id: String(c.id),
        nombre: c.nombre,
        provinciaId: String(c.provincia_id)
      })),
      rubros: rubs.map((r: any): Rubro => ({ 
        id: String(r.id), 
        nombre: r.nombre, 
        icon: r.icon || '📍',
        slug: r.slug || 'general'
      })),
      subRubros: subRubs.map((sr: any): SubRubro => ({
        id: String(sr.id),
        rubroId: String(sr.rubro_id),
        nombre: sr.nombre,
        slug: sr.slug || 'general'
      })),
      plans: finalPlans,
      comercios: coms.map((c: any) => {
        const ownerProfile = profilesMap.get(String(c.usuario_id));
        const ownerPlan = ownerProfile ? plansMap.get(ownerProfile.plan_id) : defaultPlan;
        return mapComercio(c, reviewsByComercioId.get(String(c.id)), ownerPlan);
      }),
      banners: []
    };
  } catch (error) {
    console.error("DataService: Error crítico general:", error);
    return emptyData;
  }
};
