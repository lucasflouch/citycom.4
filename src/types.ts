
export interface Provincia {
  id: string;
  nombre: string;
}

export interface Ciudad {
  id: string;
  nombre: string;
  provinciaId: string;
  lat?: number;
  lng?: number;
}

export interface Rubro {
  id: string;
  nombre: string;
  icon: string;
  slug: string; // Para SEO: /gastronomia
}

export interface SubRubro {
  id: string;
  rubroId: string;
  nombre: string;
  slug: string; // Para SEO: /gastronomia/parrillas
}

export interface SubscriptionPlan {
  id: string;
  nombre: string; // 'Free', 'Destacado', 'Premium'
  precio: number;
  limiteImagenes: number;
  limitePublicaciones: number; // Nuevo límite de publicaciones
  tienePrioridad: boolean;
  tieneChat: boolean;
}

export interface Profile {
  id: string;
  nombre?: string;
  email?: string;
  telefono?: string;
  avatar_url?: string;
  is_admin?: boolean;
  plan_id: string; // Plan de suscripción del usuario/comerciante
  plan_expires_at?: string; // Fecha de vencimiento
}

export interface SubscriptionHistoryEntry {
  id: string;
  user_id: string;
  plan_id: string;
  start_date: string;
  end_date?: string;
  amount: number;
  payment_id?: string;
  status: 'active' | 'expired' | 'manual';
  created_at: string;
}

export interface Comercio {
  id: string;
  nombre: string;
  slug: string; // /mi-comercio-ideal
  imagenUrl: string;
  imagenes: string[];
  rubroId: string;
  subRubroId: string;
  ciudadId: string;
  usuarioId: string;
  whatsapp: string;
  descripcion: string;
  direccion: string;
  latitude?: number;
  longitude?: number;
  
  isVerified: boolean;
  isWaVerified: boolean; 
  planId: string; 
  
  rating: number;
  reviewCount: number;
  reviews?: Review[];
  
  plan?: SubscriptionPlan;
}

export interface Review {
  id: string;
  comercio_id: string;
  usuario_id: string;
  usuario_nombre: string;
  comentario: string;
  rating: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  comercio_id: string;
  cliente_id: string;
  last_message?: string;
  updated_at: string;
  participant_ids: string[]; // [cliente_id, comercio_usuario_id]
  unreadCount?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

export interface AppData {
  provincias: Provincia[];
  ciudades: Ciudad[];
  rubros: Rubro[];
  subRubros: SubRubro[];
  plans: SubscriptionPlan[];
  comercios: Comercio[];
  banners: Banner[];
}

export interface Banner {
  id: string;
  comercioId: string;
  imagenUrl: string;
  venceEl: string;
}

export enum Page {
  Home = 'Home',
  Auth = 'Auth',
  Dashboard = 'Dashboard',
  CreateComercio = 'CreateComercio',
  EditComercio = 'EditComercio',
  ComercioDetail = 'ComercioDetail',
  Messages = 'Messages',
  Pricing = 'Pricing',
  Profile = 'Profile', // Nueva Página
  Admin = 'Admin'     // Nueva Página
}

export type PageValue = Page;

// Fix: Add missing types for apiService.ts
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  password?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  password?: string;
  favorites?: string[];
  history?: any[];
}

export type Opinion = Review;

export interface AnalyticsData {
  [key: string]: any;
}

export interface AdminAnalyticsData {
  [key: string]: any;
}

export type ChatMessage = Message;

// Session interface compatible with Supabase to avoid import errors
export interface Session {
  access_token: string;
  user: {
    id: string;
    email?: string;
    [key: string]: any;
  };
  [key: string]: any;
}
