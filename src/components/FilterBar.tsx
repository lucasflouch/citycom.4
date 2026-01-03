
import React, { useState, useEffect, useCallback } from 'react';
import { Provincia, Ciudad, Rubro, SubRubro } from '../types';
import { fetchArgentinaCiudades } from '../services/argentinaDataService';

interface FilterBarProps {
  provincias: Provincia[];
  ciudades: Ciudad[];
  rubros: Rubro[];
  subRubros: SubRubro[];
  onFilterChange: (filters: { provinciaId: string; ciudadId: string; rubroId: string; subRubroId: string }) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ provincias, ciudades, rubros, subRubros, onFilterChange }) => {
  const [selectedProvincia, setSelectedProvincia] = useState('');
  const [selectedCiudad, setSelectedCiudad] = useState('');
  const [selectedRubro, setSelectedRubro] = useState('');
  const [selectedSubRubro, setSelectedSubRubro] = useState('');
  
  const [dynamicCiudades, setDynamicCiudades] = useState<Ciudad[]>([]);
  const [loadingCiudades, setLoadingCiudades] = useState(false);
  const [dynamicSubRubros, setDynamicSubRubros] = useState<SubRubro[]>([]);

  useEffect(() => {
    const loadCiudades = async () => {
      if (!selectedProvincia) {
        setDynamicCiudades([]);
        return;
      }
      setLoadingCiudades(true);
      try {
        const fromApi = await fetchArgentinaCiudades(selectedProvincia);
        const fromDb = ciudades.filter(c => String(c.provinciaId) === String(selectedProvincia));
        const combined = [...fromApi];
        fromDb.forEach(dbCity => {
            if (!combined.find(c => c.nombre.toLowerCase() === dbCity.nombre.toLowerCase())) {
                combined.push(dbCity);
            }
        });
        setDynamicCiudades(combined.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      } catch (err) {
        console.error("Error al poblar localidades:", err);
      } finally {
        setLoadingCiudades(false);
      }
    };
    loadCiudades();
    setSelectedCiudad('');
  }, [selectedProvincia, ciudades]);

  useEffect(() => {
    if (selectedRubro) {
      setDynamicSubRubros(subRubros.filter(sr => sr.rubroId === selectedRubro));
    } else {
      setDynamicSubRubros([]);
    }
    setSelectedSubRubro('');
  }, [selectedRubro, subRubros]);

  useEffect(() => {
    onFilterChange({
      provinciaId: selectedProvincia,
      ciudadId: selectedCiudad,
      rubroId: selectedRubro,
      subRubroId: selectedSubRubro,
    });
  }, [selectedProvincia, selectedCiudad, selectedRubro, selectedSubRubro, onFilterChange]);
  
  const handleReset = () => {
    setSelectedProvincia('');
    setSelectedCiudad('');
    setSelectedRubro('');
    setSelectedSubRubro('');
  };

  return (
    <div className="bg-white p-6 rounded-4xl shadow-soft mb-8 border border-slate-50">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">1. Provincia</label>
          <select 
            value={selectedProvincia}
            onChange={(e) => setSelectedProvincia(e.target.value)}
            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="">Toda la Argentina</option>
            {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">2. Localidad</label>
          <select 
            value={selectedCiudad}
            onChange={(e) => setSelectedCiudad(e.target.value)}
            disabled={!selectedProvincia || loadingCiudades}
            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-30 appearance-none cursor-pointer"
          >
            <option value="">{loadingCiudades ? '⏳ Cargando...' : 'Todas'}</option>
            {dynamicCiudades.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">3. Rubro</label>
          <select 
            value={selectedRubro}
            onChange={(e) => setSelectedRubro(e.target.value)}
            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="">Todos los rubros</option>
            {rubros.map(r => <option key={r.id} value={r.id}>{r.icon} {r.nombre}</option>)}
          </select>
        </div>
        
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">4. Específico</label>
          <select 
            value={selectedSubRubro}
            onChange={(e) => setSelectedSubRubro(e.target.value)}
            disabled={!selectedRubro}
            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-30 appearance-none cursor-pointer"
          >
            <option value="">Cualquiera</option>
            {dynamicSubRubros.map(sr => <option key={sr.id} value={sr.id}>{sr.nombre}</option>)}
          </select>
        </div>

        <button
          onClick={handleReset}
          className="w-full h-[56px] bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-600 transition-all shadow-lg active:scale-95"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
};

export default FilterBar;
