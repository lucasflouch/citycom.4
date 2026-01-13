
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Comercio, Banner, Page, PageValue, AppData } from '../types';
import FilterBar from '../components/FilterBar';
import BusinessCard from '../components/BusinessCard';
import BannerCard from '../components/BannerCard';
import Map from '../components/Map';
import { fetchArgentinaCiudades } from '../services/argentinaDataService';

interface HomePageProps {
  onNavigate: (page: PageValue, comercio?: Comercio) => void;
  data: AppData;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate, data }) => {
  const [filters, setFilters] = useState({ provinciaId: '', ciudadId: '', rubroId: '', subRubroId: '' });
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [currentCityCoords, setCurrentCityCoords] = useState<[number, number] | null>(null);

  const handleFilterChange = useCallback((newFilters: { provinciaId: string; ciudadId: string; rubroId: string; subRubroId: string }) => {
    setFilters(newFilters);
  }, []);

  useEffect(() => {
    if (filters.ciudadId && filters.provinciaId) {
      const fetchCoords = async () => {
        try {
          const ciudades = await fetchArgentinaCiudades(filters.provinciaId);
          const ciudadActual = ciudades.find(c => String(c.id) === String(filters.ciudadId));
          if (ciudadActual?.lat && ciudadActual?.lng) {
            setCurrentCityCoords([ciudadActual.lat, ciudadActual.lng]);
          }
        } catch (err) {
          console.warn("Error buscando coords ciudad");
        }
      };
      fetchCoords();
    } else {
      setCurrentCityCoords(null);
    }
  }, [filters.ciudadId, filters.provinciaId]);

  const filteredAndSortedComercios = useMemo(() => {
    const filtered = (data.comercios || []).filter(comercio => {
      // FILTRADO OPTIMIZADO (Sin dependencia de tabla ciudades)
      // Ahora usamos los datos desnormalizados en el objeto comercio.
      
      // 1. Filtro Provincia
      const provinciaMatch = !filters.provinciaId || String(comercio.provinciaId) === String(filters.provinciaId);
      
      // 2. Filtro Ciudad (Usamos ciudadId que sigue siendo referencia)
      const ciudadMatch = !filters.ciudadId || String(comercio.ciudadId) === String(filters.ciudadId);
      
      // 3. Filtros Rubro
      const rubroMatch = !filters.rubroId || String(comercio.rubroId) === String(filters.rubroId);
      const subRubroMatch = !filters.subRubroId || String(comercio.subRubroId) === String(filters.subRubroId);

      return provinciaMatch && ciudadMatch && rubroMatch && subRubroMatch;
    });

    return filtered.sort((a, b) => (b.plan?.precio || 0) - (a.plan?.precio || 0));

  }, [data.comercios, filters]);

  const featuredComercios = useMemo(() => {
    return (data.comercios || []).filter(c => c.plan?.nombre?.toLowerCase() === 'premium');
  }, [data.comercios]);


  return (
    <div className="space-y-16 pb-32">
      <section className="relative text-center pt-10 pb-4">
        <h1 className="text-5xl md:text-7xl font-[900] text-slate-900 tracking-tighter leading-none mb-4">
          Comprá Local, <br/>
          <span className="text-indigo-600 italic">Viví Argentina.</span>
        </h1>
        <p className="text-slate-400 font-semibold text-lg max-w-lg mx-auto mb-10">
          La guía definitiva para encontrar comercios de barrio con ubicación verificada y contacto directo.
        </p>
        
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1.5 rounded-[2rem] shadow-indigo border border-slate-50 flex gap-2">
            <button 
              onClick={() => setViewMode('grid')} 
              className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Vista Lista
            </button>
            <button 
              onClick={() => setViewMode('map')} 
              className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'map' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Explorar Mapa 🗺️
            </button>
          </div>
        </div>
      </section>

      {featuredComercios.length > 0 && (
        <section className="container mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-6 italic border-l-4 border-amber-400 pl-4">Publicaciones Premium</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {featuredComercios.slice(0, 2).map(comercio => (
                    <div key={comercio.id} onClick={() => onNavigate(Page.ComercioDetail, comercio)} className="cursor-pointer">
                        <BannerCard 
                            comercio={comercio} 
                            banner={{ id: comercio.id, comercioId: comercio.id, imagenUrl: comercio.imagenes?.[1] || comercio.imagenUrl, venceEl: '' }} 
                        />
                    </div>
                ))}
            </div>
        </section>
      )}

      <section className="container mx-auto max-w-6xl px-4">
        <FilterBar 
          provincias={data.provincias || []} 
          ciudades={data.ciudades || []} 
          rubros={data.rubros || []}
          subRubros={data.subRubros || []}
          onFilterChange={handleFilterChange}
        />

        {viewMode === 'map' ? (
          <div className="w-full h-[650px] relative mt-10 rounded-5xl overflow-hidden border-8 border-white shadow-indigo animate-fade-up">
            <Map 
              key={`home-map-${filters.ciudadId}`}
              comercios={filteredAndSortedComercios} 
              center={currentCityCoords || [-34.6037, -58.3816]} 
              zoom={filters.ciudadId ? 14 : 5} 
            />
          </div>
        ) : (
          <div className="mt-12">
            {filteredAndSortedComercios.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredAndSortedComercios.map((comercio, idx) => {
                  const rubro = data.rubros.find(r => String(r.id) === String(comercio.rubroId));
                  return (
                    <div 
                      key={comercio.id} 
                      onClick={() => onNavigate(Page.ComercioDetail, comercio)} 
                      className="cursor-pointer animate-fade-up"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <BusinessCard 
                        comercio={comercio} 
                        rubro={rubro || { id: '', nombre: '', icon: '🏪', slug: '' }} 
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-100">
                <div className="text-7xl mb-6">🔍</div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Sin resultados</h3>
                <p className="text-slate-400 mt-2 font-medium">Ajustá los filtros para encontrar lo que buscás.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default HomePage;
