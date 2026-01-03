

import React from 'react';
import { Banner, Comercio } from '../types';

interface BannerCardProps {
  banner: Banner;
  comercio: Comercio;
}

const BannerCard: React.FC<BannerCardProps> = ({ banner, comercio }) => {
    const whatsappLink = `https://wa.me/${comercio.whatsapp}?text=Hola!%20Vi%20tu%20comercio%20destacado%20en%20la%20Guía%20y%20quería%20consultar%20por...`;

  return (
    <div className="relative rounded-lg overflow-hidden shadow-2xl group">
      <img src={banner.imagenUrl} alt={`Banner de ${comercio.nombre}`} className="w-full h-auto object-cover" />
      <div className="absolute inset-0 bg-black bg-opacity-40 group-hover:bg-opacity-60 transition-all duration-300 flex flex-col justify-end p-6">
        <h3 className="text-3xl font-extrabold text-white drop-shadow-lg">{comercio.nombre}</h3>
        <p className="text-lg text-white font-medium drop-shadow-md mb-4">¡Comercio Destacado!</p>
        <a 
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-yellow-400 text-gray-900 font-bold py-2 px-5 rounded-lg hover:bg-yellow-300 transition-colors self-start"
        >
          ¡Contactar ahora!
        </a>
      </div>
    </div>
  );
};

export default BannerCard;
