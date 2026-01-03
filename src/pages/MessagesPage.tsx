
import React, { useState, useEffect, useRef } from 'react';
import { Profile, Page, PageValue, AppData, Conversation, Message, Comercio, Session } from '../types';
import { getConversationsForUser, getMessagesForConversation, sendMessage, markConversationAsRead } from '../services/chatService';
import { supabase } from '../supabaseClient';

interface MessagesPageProps {
  session: Session;
  profile: Profile;
  appData: AppData;
  onNavigate: (page: PageValue) => void;
  initialConversation: Conversation | null;
}

type EnrichedConversation = Conversation & { otherParty: Profile | Comercio };

const MessagesPage: React.FC<MessagesPageProps> = ({ session, profile, appData, initialConversation }) => {
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<EnrichedConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationRef = useRef(activeConversation);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      const convos = await getConversationsForUser(session.user.id, appData);
      setConversations(convos);
      
      let initialConvoToSet = null;
      if (initialConversation) {
        initialConvoToSet = convos.find(c => c.id === initialConversation.id) || null;
      } else if (convos.length > 0) {
        initialConvoToSet = convos[0];
      }

      if (initialConvoToSet) {
        handleSelectConversation(initialConvoToSet);
      }
      setLoading(false);
    };

    fetchConversations();
  }, [session.user.id, appData, initialConversation]);

  useEffect(() => {
    if (!activeConversation) return;

    const fetchMessages = async () => {
      const msgs = await getMessagesForConversation(activeConversation.id);
      setMessages(msgs);
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages`)
      .on('postgres_changes', { 
          event: '*',
          schema: 'public', 
          table: 'messages' 
      },
        (payload: any) => {
          const activeConv = activeConversationRef.current;

          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;
            
            if (newMsg.sender_id === session.user.id) return;
            
            if (newMsg.conversation_id === activeConv?.id) {
              setMessages((prev) => [...prev, newMsg]);
              markConversationAsRead(newMsg.conversation_id, session.user.id);
            } else {
              getConversationsForUser(session.user.id, appData).then(setConversations);
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as Message;
            if (updatedMsg.conversation_id === activeConv?.id) {
              setMessages(prev => 
                prev.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg)
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversation?.id, session.user.id, appData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = async (convo: EnrichedConversation) => {
    setActiveConversation(convo);
    if ((convo.unreadCount || 0) > 0) {
      await markConversationAsRead(convo.id, session.user.id);
      setConversations(prev => prev.map(c => 
        c.id === convo.id ? { ...c, unreadCount: 0 } : c
      ));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConversation) return;

    const sentMessage = await sendMessage(activeConversation.id, session.user.id, newMessage.trim());
    
    if (sentMessage) {
        setMessages(prev => [...prev, sentMessage]);
        setNewMessage('');
        
        setConversations(prev => {
            const currentConvo = prev.find(c => c.id === activeConversation.id);
            if (!currentConvo) return prev;
            
            const updatedConvo = {
                ...currentConvo,
                last_message: sentMessage.content,
                updated_at: sentMessage.created_at
            };
            const rest = prev.filter(c => c.id !== activeConversation.id);
            return [updatedConvo, ...rest];
        });
    }
  };

  const getOtherPartyName = (convo: EnrichedConversation) => {
     if (!convo.otherParty) return 'Usuario';
     if (convo.otherParty.id === session.user.id) return 'Error: Self-chat';
     return convo.otherParty.nombre || 'Usuario';
  }

  return (
    <div className="flex h-[calc(100vh-150px)] bg-white rounded-5xl shadow-soft border border-slate-100 overflow-hidden">
      <div className="w-1/3 border-r border-slate-100 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Mensajes</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando...</p> : conversations.map(convo => (
            <div
              key={convo.id}
              onClick={() => handleSelectConversation(convo)}
              className={`p-4 cursor-pointer border-l-4 flex flex-col gap-1 ${activeConversation?.id === convo.id ? 'bg-indigo-50 border-indigo-500' : 'border-transparent hover:bg-slate-50'}`}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800">{getOtherPartyName(convo)}</h3>
                {convo.unreadCount && convo.unreadCount > 0 && (
                   <span className="bg-indigo-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md">
                     {convo.unreadCount}
                   </span>
                )}
              </div>
              <p className={`text-sm truncate ${convo.unreadCount && convo.unreadCount > 0 ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                {convo.last_message || 'Inicia la conversación...'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="w-2/3 flex flex-col">
        {activeConversation ? (
          <>
            <div className="p-6 border-b border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center font-bold text-indigo-600">
                    {getOtherPartyName(activeConversation)?.charAt(0)}
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-900">{getOtherPartyName(activeConversation)}</h3>
                    <p className="text-xs text-green-500 font-bold flex items-center gap-1.5"><span className="w-2 h-2 bg-green-400 rounded-full"></span>Online</p>
                </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
              <div className="space-y-2">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.sender_id === session.user.id ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-md p-4 rounded-3xl ${msg.sender_id === session.user.id ? 'bg-indigo-600 text-white rounded-br-lg' : 'bg-slate-200 text-slate-800 rounded-bl-lg'}`}>
                      <p>{msg.content}</p>
                    </div>
                    <div className="px-2 mt-1 flex items-center gap-2">
                       <span className="text-[10px] text-slate-400 font-medium">
                           {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </span>
                       {msg.sender_id === session.user.id && (
                           <span className={`font-bold text-base leading-none ${msg.is_read ? 'text-indigo-400' : 'text-slate-300'}`}>
                               {msg.is_read ? '✓✓' : '✓'}
                           </span>
                       )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <form onSubmit={handleSendMessage} className="p-6 border-t border-slate-100 bg-white">
              <div className="flex gap-4">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  className="w-full p-4 bg-slate-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button type="submit" className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-indigo hover:bg-indigo-700 transition-all">
                  Enviar
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-slate-400">
            <div>
              <div className="text-5xl mb-4">💬</div>
              <h3 className="font-bold">Seleccioná una conversación</h3>
              <p>O iniciá una nueva desde la página de un comercio.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
