
import { supabase } from '../supabaseClient';
import { Conversation, Message, Comercio, Profile, AppData } from '../types';

export const findOrCreateConversation = async (clienteId: string, comercio: Comercio): Promise<Conversation | null> => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('conversations')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('comercio_id', comercio.id)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing as Conversation;

    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        cliente_id: clienteId,
        comercio_id: comercio.id,
        participant_ids: [clienteId, comercio.usuarioId],
      })
      .select()
      .single();

    if (createError) throw createError;
    return newConv as Conversation;
  } catch (error) {
    console.error('Error en findOrCreateConversation:', error);
    return null;
  }
};

export const getConversationsForUser = async (userId: string, appData: AppData): Promise<(Conversation & { otherParty: Profile | Comercio })[]> => {
    try {
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('*')
            .contains('participant_ids', [userId])
            .order('updated_at', { ascending: false });

        if (error) throw error;
        if (!conversations || conversations.length === 0) return [];

        const clientIdsToFetch = conversations
            .filter(conv => conv.cliente_id !== userId)
            .map(conv => conv.cliente_id);

        let clientProfiles: Profile[] = [];
        if (clientIdsToFetch.length > 0) {
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, nombre, email')
                .in('id', [...new Set(clientIdsToFetch)]);
            
            if (profilesError) throw profilesError;
            clientProfiles = profilesData as Profile[];
        }
        const profilesMap = new Map<string, Profile>(clientProfiles.map(p => [p.id, p]));

        const conversationIds = conversations.map(c => c.id);
        const { data: unreadMessages, error: unreadError } = await supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', conversationIds)
            .eq('is_read', false)
            .neq('sender_id', userId);

        if (unreadError) throw unreadError;

        const unreadCounts = (unreadMessages || []).reduce((acc, msg) => {
            acc[msg.conversation_id] = (acc[msg.conversation_id] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const enrichedConversations = conversations.map(conv => {
            const isMeClient = conv.cliente_id === userId;
            
            let otherParty: Profile | Comercio | undefined;
            if (isMeClient) {
                otherParty = appData.comercios.find(c => c.id === conv.comercio_id);
            } else {
                otherParty = profilesMap.get(conv.cliente_id);
            }

            return { 
                ...conv, 
                otherParty: otherParty || { id: '?', nombre: 'Usuario no encontrado' },
                unreadCount: unreadCounts[conv.id] || 0
            };
        });

        return enrichedConversations as (Conversation & { otherParty: Profile | Comercio })[];
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return [];
    }
};

export const markConversationAsRead = async (conversationId: string, userId: string): Promise<void> => {
    try {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId);
        
        if (error) throw error;
    } catch (err) {
        console.error("Error marking messages as read:", err);
    }
};


export const getMessagesForConversation = async (conversationId: string): Promise<Message[]> => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data as Message[];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

export const sendMessage = async (conversationId: string, senderId: string, content: string): Promise<Message | null> => {
  try {
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content,
        is_read: false
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Actualizamos conversación
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .update({
        last_message: content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select()
      .single();
    
    if (convError) throw convError;

    // --- TRIGGER NOTIFICACIÓN PUSH ---
    if (convData) {
        const participants = convData.participant_ids as string[];
        const receiverId = participants.find(id => id !== senderId);
        
        if (receiverId) {
            console.log(`📤 Intentando enviar push a ${receiverId}`);
            // Invocamos la Edge Function 'send-push' de forma asíncrona
            supabase.functions.invoke('send-push', {
                body: {
                    title: 'Nuevo Mensaje 💬',
                    body: content.length > 30 ? content.substring(0, 30) + '...' : content,
                    url: '/mensajes', 
                    userIds: [receiverId]
                }
            })
            .then(res => console.log("📬 Push Trigger Response:", res))
            .catch(err => console.error("❌ Error enviando push trigger:", err));
        }
    }

    return messageData as Message;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
};
