
import React from 'react';
import { Comercio, Rubro } from '../types';

interface BusinessCardProps {
  comercio: Comercio;
  rubro: Rubro;
}

const BusinessCard: React.FC<BusinessCardProps> = ({ comercio, rubro }) => {
  const rating = comercio.rating || 4.5;

  return (
    <div className="group bg-white rounded-4xl p-4 shadow-soft border border-gray-50 hover:shadow-indigo hover:-translate-y-1 transition-all duration-500 flex items-center gap-5">
      <div className="w-28 h-28 flex-shrink-0 relative overflow-hidden rounded-3xl">
        <img 
          src={comercio.imagenUrl} 
          alt={comercio.nombre} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
        />
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-md text-[8px] font-black px-2 py-0.5 rounded-full text-indigo-600 uppercase tracking-tighter">
          {rubro.nombre}
        </div>
      </div>
      
      <div className="flex-1 min-w-0 py-1">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-lg font-[800] text-gray-900 truncate tracking-tight">{comercio.nombre}</h3>
          <span className="text-amber-500 font-bold text-xs flex items-center gap-1">
            ★ {rating}
          </span>
        </div>
        
        <p className="text-gray-400 text-[11px] font-semibold flex items-center gap-1.5 mb-3 uppercase tracking-wider">
          {/* Se usa el nombre de ciudad almacenado en el comercio */}
          <span className="text-indigo-500">📍</span> {comercio.nombreCiudad || 'Localidad'}
        </p>
        
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {[1,2,3].map(i => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[8px] font-bold">👤</div>
            ))}
          </div>
          <span className="text-[10px] text-gray-400 font-medium">+150 clientes</span>
        </div>
      </div>

      <div className="pr-2">
         <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
           &rarr;
         </div>
      </div>
    </div>
  );
};

export default BusinessCard;
