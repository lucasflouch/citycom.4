
import { Provincia, Ciudad } from '../types';

const GEOREF_API = 'https://apis.datos.gob.ar/georef/api';

const cacheCiudades: Record<string, Ciudad[]> = {};

async function fetchWithTimeout(resource: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export const fetchArgentinaProvincias = async (): Promise<Provincia[]> => {
  try {
    const res = await fetchWithTimeout(`${GEOREF_API}/provincias?campos=id,nombre&orden=nombre`);
    if (!res.ok) throw new Error('API Provincias offline');
    const data = await res.json();
    return data.provincias.map((p: any) => ({
      id: String(p.id).padStart(2, '0'),
      nombre: p.nombre
    }));
  } catch (error) {
    console.warn("Usando provincias de respaldo (API Georef falló)");
    return [
      { id: '02', nombre: 'CABA' }, 
      { id: '06', nombre: 'Buenos Aires' },
      { id: '14', nombre: 'Córdoba' },
      { id: '82', nombre: 'Santa Fe' },
      { id: '50', nombre: 'Mendoza' },
      { id: '90', nombre: 'Tucumán' }
    ];
  }
};

export const fetchArgentinaCiudades = async (provinciaId: string): Promise<Ciudad[]> => {
  if (!provinciaId) return [];
  const cleanId = String(provinciaId).padStart(2, '0');
  
  if (cacheCiudades[cleanId]) return cacheCiudades[cleanId];

  try {
    const res = await fetchWithTimeout(`${GEOREF_API}/localidades?provincia=${cleanId}&max=1000&campos=id,nombre,centroide&orden=nombre`, { timeout: 6000 });
    if (!res.ok) throw new Error('API Localidades offline');
    
    const data = await res.json();
    const mapped = (data.localidades || []).map((item: any) => ({
      id: String(item.id),
      nombre: item.nombre,
      provinciaId: cleanId,
      lat: item.centroide?.lat,
      lng: item.centroide?.lon
    }));
    
    cacheCiudades[cleanId] = mapped;
    return mapped;
  } catch (error) {
    console.warn(`Error al cargar ciudades para provincia ${cleanId}. Retornando lista vacía.`);
    return [];
  }
};
