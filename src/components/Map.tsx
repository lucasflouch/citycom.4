
import React, { useEffect, useRef } from 'react';
import { Comercio } from '../types';

declare const L: any;

interface MapProps {
  comercios: Comercio[];
  center?: [number, number];
  zoom?: number;
  onLocationSelect?: (lat: number, lng: number) => void;
  isPicker?: boolean;
}

const Map: React.FC<MapProps> = ({ 
  comercios, 
  center = [-34.6037, -58.3816], 
  zoom = 12, 
  onLocationSelect, 
  isPicker = false 
}) => {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersGroup = useRef<any>(null);
  const pickerMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Usamos un pequeño delay para asegurar que el DOM esté listo
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: !isPicker,
        attributionControl: false
      }).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      markersGroup.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(containerRef.current);

      if (isPicker) {
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          if (onLocationSelect) onLocationSelect(lat, lng);
        });
      }

      return () => observer.disconnect();
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (isPicker) {
      if (pickerMarkerRef.current) mapRef.current.removeLayer(pickerMarkerRef.current);
      
      pickerMarkerRef.current = L.marker(center, {
        draggable: true,
        icon: L.divIcon({
          className: 'custom-picker',
          html: '<div style="font-size: 35px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3))">📍</div>',
          iconSize: [35, 40],
          iconAnchor: [17, 40]
        })
      }).addTo(mapRef.current);

      pickerMarkerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        if (onLocationSelect) onLocationSelect(lat, lng);
      });

      mapRef.current.panTo(center);
    } else {
      markersGroup.current.clearLayers();
      comercios.forEach(c => {
        if (c.latitude && c.longitude) {
          L.marker([c.latitude, c.longitude])
            .addTo(markersGroup.current)
            .bindPopup(`<b>${c.nombre}</b><br>${c.direccion || ''}`);
        }
      });
      if (center) mapRef.current.setView(center, zoom);
    }
  }, [comercios, center, zoom, isPicker, onLocationSelect]);

  return <div ref={containerRef} className="w-full h-full" style={{ zIndex: 1 }} />;
};

export default Map;
