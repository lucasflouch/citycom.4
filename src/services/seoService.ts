
import { Comercio, Ciudad, Rubro } from '../types';

const DEFAULT_TITLE = 'Guía Comercial Argentina';
const DEFAULT_DESCRIPTION = 'Marketplace de comercios locales';

const getOrCreateMetaTag = (name: 'name' | 'property', value: string): HTMLMetaElement => {
    let element = document.querySelector<HTMLMetaElement>(`meta[${name}="${value}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(name, value);
        document.head.appendChild(element);
    }
    return element;
};

const getOrCreateJsonLdScript = (): HTMLScriptElement => {
    const SCRIPT_ID = 'json-ld-script';
    let element = document.getElementById(SCRIPT_ID) as HTMLScriptElement;
    if (!element) {
        element = document.createElement('script');
        element.type = 'application/ld+json';
        element.id = SCRIPT_ID;
        document.head.appendChild(element);
    }
    return element;
};

export const updateMetaTagsForComercio = (comercio: Comercio, ciudad?: Ciudad, rubro?: Rubro) => {
    if (!comercio) return;

    const title = `${comercio.nombre} en ${ciudad?.nombre || 'Argentina'} | ${DEFAULT_TITLE}`;
    const description = comercio.descripcion 
        ? `${comercio.descripcion.substring(0, 155).trim()}...` 
        : `Encontrá a ${comercio.nombre}, un comercio del rubro ${rubro?.nombre || 'General'} en la Guía Comercial. Contacto directo y ubicación verificada.`;
    const imageUrl = comercio.imagenUrl;
    const pageUrl = window.location.href;

    document.title = title;

    getOrCreateMetaTag('name', 'description').setAttribute('content', description);
    getOrCreateMetaTag('property', 'og:title').setAttribute('content', title);
    getOrCreateMetaTag('property', 'og:description').setAttribute('content', description);
    getOrCreateMetaTag('property', 'og:image').setAttribute('content', imageUrl);
    getOrCreateMetaTag('property', 'og:url').setAttribute('content', pageUrl);
    getOrCreateMetaTag('property', 'og:type').setAttribute('content', 'website');

    const jsonLdScript = getOrCreateJsonLdScript();
    const schema = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": comercio.nombre,
        "image": imageUrl,
        "description": comercio.descripcion,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": comercio.direccion,
            "addressLocality": ciudad?.nombre,
            "addressCountry": "AR"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": comercio.latitude,
            "longitude": comercio.longitude
        },
        "url": pageUrl,
        "telephone": comercio.whatsapp,
        ...(comercio.reviewCount && comercio.reviewCount > 0 && {
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": comercio.rating,
                "reviewCount": comercio.reviewCount
            }
        })
    };
    jsonLdScript.textContent = JSON.stringify(schema, null, 2);
};

export const resetMetaTags = () => {
    document.title = DEFAULT_TITLE;
    getOrCreateMetaTag('name', 'description').setAttribute('content', DEFAULT_DESCRIPTION);

    const jsonLdScript = document.getElementById('json-ld-script');
    if (jsonLdScript) {
        jsonLdScript.remove();
    }
};
