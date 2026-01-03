
import { AppData } from '../types';

/**
 * ARCHIVO DEPURADO - NO USAR EN PRODUCCIÓN.
 * La aplicación ahora consume datos exclusivamente de Supabase.
 */
// Fix: align object with AppData interface in types.ts
export const initialData: AppData = {
  provincias: [],
  ciudades: [],
  rubros: [],
  subRubros: [],
  plans: [],
  comercios: [],
  banners: [],
};
