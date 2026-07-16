import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Send, Paperclip, X, Download, FileText, Image as ImageIcon, Video, Trash2, Users, Search, Plus, Edit2, Reply } from 'lucide-react';
import type { ChatWithDetails, User, Message } from '../types';
import imageCompression from 'browser-image-compression';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { MediaModal } from './MediaModal';

interface ChatAreaProps {
  chat: ChatWithDetails;
  currentUser: User;
  onSelectChat?: (chat: ChatWithDetails) => void;
}

export function ChatArea({ chat, currentUser, onSelectChat }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollHeightPrev, setScrollHeightPrev] = useState<number | null>(null);
  const MESSAGES_PER_PAGE = 30;

  const [inputValue, setInputValue] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // New features
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isPublic, setIsPublic] = useState(chat.is_public || false);
  const [mediaModal, setMediaModal] = useState<{url: string, type: string} | null>(null);
  
  // Group logic
  const [showMembers, setShowMembers] = useState(false);
  const [searchNewMember, setSearchNewMember] = useState('');
  const [newMemberResults, setNewMemberResults] = useState<User[]>([]);

  const isChannel = chat.type === 'channel';
  
  const isParticipant = chat.participants?.some(p => p.user_id === currentUser.id);
  const isOwnerOrAdmin = chat.participants?.some(
    p => p.user_id === currentUser.id && (p.role === 'owner' || p.role === 'admin')
  );
  
  const canSend = isParticipant && (!isChannel || isOwnerOrAdmin);

  useEffect(() => {
    setIsPublic(chat.is_public || false);
    setPage(0);
    setHasMore(true);
    setMessages([]);
    loadMessages(false);
    if (isParticipant) {
      markAsRead();
    }

    const channel = supabase
      .channel(`chat_${chat.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` }, (payload) => {
        loadMessages(false);
        if (payload.new && (payload.new as any).user_id !== currentUser.id && isParticipant) {
          markAsRead();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat.id, isParticipant]);

  useEffect(() => {
    if (page === 0 && !scrollHeightPrev) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, page]);

  useLayoutEffect(() => {
    if (scrollHeightPrev !== null && scrollContainerRef.current) {
      const scrollDiff = scrollContainerRef.current.scrollHeight - scrollHeightPrev;
      scrollContainerRef.current.scrollTop += scrollDiff;
      setScrollHeightPrev(null);
    }
  }, [messages, scrollHeightPrev]);

  const markAsRead = async () => {
    try {
      await supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('chat_id', chat.id)
        .eq('user_id', currentUser.id);
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const loadMessages = async (isLoadMore = false) => {
    if (!chat?.id) return;
    const from = isLoadMore ? (page + 1) * MESSAGES_PER_PAGE : 0;
    const to = isLoadMore ? (page + 2) * MESSAGES_PER_PAGE - 1 : MESSAGES_PER_PAGE - 1;
    
    if (isLoadMore) setIsLoadingMore(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`*, user:user_id(*)`)
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (data) {
        // Manual enrich to avoid PostgREST embed errors
        const replyIds = data.map(m => m.reply_to_id).filter(Boolean);
        const inviteChatIds = data.map(m => m.invite_chat_id).filter(Boolean);
        
        let replies: any[] = [];
        let inviteChats: any[] = [];
        
        if (replyIds.length > 0) {
          const { data: rData } = await supabase.from('messages').select('*, user:user_id(*)').in('id', replyIds);
          if (rData) replies = rData;
        }
        
        if (inviteChatIds.length > 0) {
          const { data: icData } = await supabase.from('chats').select('*').in('id', inviteChatIds);
          if (icData) inviteChats = icData;
        }
        
        data.forEach(m => {
          if (m.reply_to_id) m.reply_to = replies.find(r => r.id === m.reply_to_id);
          if (m.invite_chat_id) m.invite_chat = inviteChats.find(c => c.id === m.invite_chat_id);
        });

        const reversedData = [...data].reverse();
        if (isLoadMore) {
          if (scrollContainerRef.current) {
            setScrollHeightPrev(scrollContainerRef.current.scrollHeight);
          }
          setMessages(prev => {
            const unique = [...reversedData, ...prev].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
            return unique.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });
          setPage(page + 1);
          if (data.length < MESSAGES_PER_PAGE) setHasMore(false);
        } else {
          setMessages(reversedData);
          setPage(0);
          setHasMore(data.length === MESSAGES_PER_PAGE);
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      if (isLoadMore) setIsLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0 && hasMore && !isLoadingMore) {
       loadMessages(true);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Файл слишком большой! Максимальный размер 10 МБ.');
      return;
    }

    setSelectedFile(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentInput = inputValue;
    const currentFile = selectedFile;
    const currentReply = replyingTo;

    if (!currentInput.trim() && !currentFile) return;
    if (!canSend) return;

    if (editingMessageId) {
      // Edit mode
      try {
        const { error } = await supabase.from('messages').update({
          content: currentInput.trim(),
          is_edited: true
        }).eq('id', editingMessageId).eq('user_id', currentUser.id);
        
        if (error) throw error;
        setEditingMessageId(null);
        setInputValue('');
      } catch (err: any) {
        console.error('Error editing message:', err);
        alert(err.message || 'Ошибка редактирования');
      }
      return;
    }

    // New message - optimistic UI
    setIsUploading(true);
    setInputValue('');
    setSelectedFile(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    // Focus input back immediately
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    const tempId = 'temp-' + Date.now();
    const tempMessage: Message = {
      id: tempId,
      chat_id: chat.id,
      user_id: currentUser.id,
      content: currentInput.trim(),
      created_at: new Date().toISOString(),
      user: currentUser,
      reply_to_id: currentReply?.id || undefined,
      reply_to: currentReply || undefined
    };

    if (!currentFile) {
      setMessages(prev => [...prev, tempMessage]);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }

    try {
      let attachment_url = '';
      let attachment_type = '';

      if (currentFile) {
        let fileToUpload = currentFile;
        
        if (currentFile.type.startsWith('image/')) {
          try {
            fileToUpload = await imageCompression(currentFile, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
          } catch (error) {
            console.error('Error compressing image:', error);
          }
        }

        const fileExt = fileToUpload.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${chat.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, fileToUpload);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(filePath);
        attachment_url = publicUrl;
        attachment_type = fileToUpload.type;
        
        tempMessage.attachment_url = attachment_url;
        tempMessage.attachment_type = attachment_type;
        
        setMessages(prev => [...prev, tempMessage]);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }

      const { error, data } = await supabase.from('messages').insert({
        chat_id: chat.id,
        user_id: currentUser.id,
        content: currentInput.trim(),
        attachment_url: attachment_url || null,
        attachment_type: attachment_type || null,
        reply_to_id: currentReply?.id || null
      }).select().single();

      if (error) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        throw error;
      }
      
      // Update temp message with real id to avoid duplicates when channel event comes
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));

      markAsRead();
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert(err.message || 'Ошибка отправки');
      setInputValue(currentInput); // restore input
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (messageId: string, messageUserId: string) => {
    if (messageUserId !== currentUser.id && !isOwnerOrAdmin) return;
    if (!confirm('Удалить сообщение?')) return;

    try {
      await supabase.from('messages').delete().eq('id', messageId);
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setInputValue(msg.content || '');
    setReplyingTo(null);
  };
  
  const handleReply = (msg: Message) => {
    setReplyingTo(msg);
    setEditingMessageId(null);
  };

  const handleJoinChat = async () => {
    setIsJoining(true);
    try {
      const { error } = await supabase.from('chat_participants').insert({
        chat_id: chat.id,
        user_id: currentUser.id,
        role: 'member'
      });
      if (error) throw error;
      // Rely on the sidebar reloading chats
    } catch (err: any) {
      console.error(err);
      alert('Ошибка при вступлении: ' + err.message);
    } finally {
      setIsJoining(false);
    }
  };
  
  const handleDeleteChat = async () => {
    if (!confirm('Вы уверены, что хотите удалить этот чат? Это действие необратимо.')) return;
    try {
      await supabase.from('chats').delete().eq('id', chat.id);
      window.location.reload(); // Quick way to reset state
    } catch (err: any) {
      console.error(err);
      alert('Ошибка удаления: ' + err.message);
    }
  };

  const searchUsersToAdd = async (query: string) => {
    setSearchNewMember(query);
    if (query.trim().length < 2) {
      setNewMemberResults([]);
      return;
    }
    const { data } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .neq('id', currentUser.id)
      .limit(5);
      
    if (data) {
      const existingIds = chat.participants?.map(p => p.user_id) || [];
      setNewMemberResults(data.filter(u => !existingIds.includes(u.id)));
    }
  };

  const inviteMember = async (user: User) => {
    try {
      // 1. Create or get direct chat with this user
      const { data: directChats } = await supabase
        .from('chat_participants')
        .select('chat_id, chats(type)')
        .eq('user_id', currentUser.id);
      
      let targetChatId = null;
      
      if (directChats) {
         for (const dc of directChats) {
           if ((dc.chats as any)?.type === 'direct') {
             const { data: members } = await supabase.from('chat_participants').select('user_id').eq('chat_id', dc.chat_id);
             if (members && members.length === 2 && members.some(m => m.user_id === user.id)) {
               targetChatId = dc.chat_id;
               break;
             }
           }
         }
      }
      
      if (!targetChatId) {
        const { data: newChat, error: chatErr } = await supabase.from('chats').insert({ type: 'direct', created_by: currentUser.id }).select().single();
        if (chatErr) throw chatErr;
        targetChatId = newChat.id;
        await supabase.from('chat_participants').insert([
          { chat_id: targetChatId, user_id: currentUser.id, role: 'owner' },
          { chat_id: targetChatId, user_id: user.id, role: 'member' }
        ]);
      }
      
      // 2. Send invite message
      await supabase.from('messages').insert({
        chat_id: targetChatId,
        user_id: currentUser.id,
        content: `Приглашаю вас в ${chat.type === 'channel' ? 'канал' : 'группу'}: ${chat.name}`,
        invite_chat_id: chat.id
      });
      
      setSearchNewMember('');
      setNewMemberResults([]);
      alert(`Приглашение отправлено пользователю ${user.username}`);
    } catch (err: any) {
      console.error(err);
      alert('Ошибка при отправке приглашения: ' + err.message);
    }
  };

  const getChatTitle = () => {
    if (chat.type !== 'direct') return chat.name;
    // Saved messages
    if (chat.participants?.length === 1 && chat.participants[0].user_id === currentUser.id) return 'Избранное';
    const other = chat.participants?.find(p => p.user_id !== currentUser.id);
    return other?.user?.username || 'Чат';
  };

  const getOtherUser = () => {
    if (chat.type !== 'direct') return null;
    if (chat.participants?.length === 1 && chat.participants[0].user_id === currentUser.id) return null;
    return chat.participants?.find(p => p.user_id !== currentUser.id)?.user;
  };

  const getStatusText = (user: User | null | undefined) => {
    if (!user) return '';
    if (!user.last_seen_at) return 'Был(а) недавно';
    const lastSeen = new Date(user.last_seen_at);
    const now = new Date();
    const diffMins = (now.getTime() - lastSeen.getTime()) / 1000 / 60;
    if (diffMins < 3) return 'В сети';
    if (diffMins < 60) return `Был(а) ${Math.floor(diffMins)} мин. назад`;
    if (diffMins < 1440) return `Был(а) ${Math.floor(diffMins / 60)} ч. назад`;
    return `Был(а) ${format(lastSeen, 'd MMM', { locale: ru })}`;
  };

  const AVATAR_COLORS: Record<string, string> = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
    teal: 'bg-teal-500',
    indigo: 'bg-indigo-500',
  };

  const getChatAvatarData = () => {
    if (chat.type === 'direct') {
      if (chat.participants?.length === 1 && chat.participants[0].user_id === currentUser.id) {
        return { char: '★', color: 'blue' }; // saved messages
      }
      const otherMember = chat.participants?.find(p => p.user_id !== currentUser.id);
      if (otherMember?.user) {
        return { 
          char: otherMember.user.avatar_char || otherMember.user.username.substring(0, 2), 
          color: otherMember.user.avatar_color || 'blue' 
        };
      }
    }
    return {
      char: chat.avatar_char || chat.name?.substring(0, 2) || '?',
      color: chat.avatar_color || 'green'
    };
  };

  const avatar = getChatAvatarData();
  const otherUser = getOtherUser();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#E5DDD5] dark:bg-gray-950 transition-colors relative">
      {/* Header */}
      <div className="h-16 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-between shrink-0 shadow-sm z-10 transition-colors">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => chat.type !== 'direct' && setShowMembers(!showMembers)}>
          <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[avatar.color] || 'bg-blue-500'} flex items-center justify-center text-white font-bold uppercase shrink-0`}>
            {avatar.char}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-gray-900 dark:text-white">
              {getChatTitle()}
              {chat.type !== 'direct' && <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">({isPublic ? 'Открытый' : 'Закрытый'})</span>}
            </span>
            {chat.type !== 'direct' ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">{chat.participants?.length || 0} участник(ов)</span>
            ) : otherUser ? (
              <span className={cn("text-xs", getStatusText(otherUser) === 'В сети' ? "text-blue-500 dark:text-blue-400 font-medium" : "text-gray-500 dark:text-gray-400")}>
                {getStatusText(otherUser)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chat.type === 'direct' && chat.participants?.find(p => p.user_id === currentUser.id)?.role === 'owner' && (
            <button onClick={handleDeleteChat} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors" title="Удалить чат">
              <Trash2 size={20} />
            </button>
          )}
          {chat.type !== 'direct' && isOwnerOrAdmin && (
            <button onClick={() => setShowMembers(!showMembers)} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full dark:text-gray-400">
              <Users size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Messages */}
        <div 
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] dark:opacity-90"
          onScroll={handleScroll}
        >
          {isLoadingMore && <div className="text-center py-2"><span className="text-xs text-gray-500 bg-white/50 dark:bg-black/50 px-3 py-1 rounded-full">Загрузка...</span></div>}
          {messages.map((msg, index) => {
            const isMe = msg.user_id === currentUser.id;
            const showAuthor = !isMe && chat.type !== 'direct' && (index === 0 || messages[index - 1].user_id !== msg.user_id);

            return (
              <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isMe ? "self-end" : "self-start")}>
                <div className={cn(
                  "relative group rounded-2xl px-3 py-2 shadow-sm flex flex-col",
                  isMe ? "bg-[#DCF8C6] dark:bg-blue-600 rounded-tr-none text-gray-900 dark:text-white" : "bg-white dark:bg-gray-800 rounded-tl-none text-gray-900 dark:text-white"
                )}>
                  {showAuthor && msg.user && (
                    <div className="text-xs font-bold text-blue-500 dark:text-blue-300 mb-1">{msg.user.username}</div>
                  )}
                  
                  {msg.reply_to && (
                    <div className="mb-2 p-2 rounded bg-black/5 dark:bg-white/10 border-l-2 border-blue-500 flex flex-col cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                         onClick={() => {
                            // Find element and scroll to it (rough implementation)
                            const els = document.querySelectorAll(`[data-msg-id="${msg.reply_to?.id}"]`);
                            if (els.length) els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                         }}>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-300">{msg.reply_to.user?.username || 'Unknown'}</span>
                      <span className="text-xs truncate text-gray-700 dark:text-gray-300">{msg.reply_to.content || 'Вложение'}</span>
                    </div>
                  )}
                  
                  {msg.invite_chat && (
                    <div className="mb-2 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 flex flex-col items-center gap-2">
                       <span className="text-sm font-medium">{msg.invite_chat.name}</span>
                       <button onClick={() => {
                         if (onSelectChat) {
                           onSelectChat({ ...msg.invite_chat, participants: [] } as ChatWithDetails);
                         }
                       }} className="px-4 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-full hover:bg-blue-600 transition-colors">
                          Посмотреть
                       </button>
                    </div>
                  )}
                  
                  {msg.attachment_url && (
                    <div className="mb-2 rounded overflow-hidden max-w-sm">
                      {msg.attachment_type?.startsWith('image/') ? (
                        <img 
                          src={msg.attachment_url} 
                          alt="Вложение" 
                          className="w-full h-auto object-cover max-h-80 cursor-pointer hover:opacity-90 transition-opacity" 
                          onClick={() => setMediaModal({ url: msg.attachment_url!, type: msg.attachment_type! })}
                        />
                      ) : msg.attachment_type?.startsWith('video/') ? (
                        <div className="relative group cursor-pointer" onClick={() => setMediaModal({ url: msg.attachment_url!, type: msg.attachment_type! })}>
                          <video src={msg.attachment_url} className="w-full max-h-80 object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                            <div className="w-12 h-12 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-100 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600">
                          <FileText size={24} className={isMe ? "text-blue-600 dark:text-white" : "text-blue-500"} />
                          <span className="text-sm truncate max-w-[200px]">Скачать файл</span>
                          <Download size={16} className="text-gray-500 dark:text-gray-300 ml-auto" />
                        </a>
                      )}
                    </div>
                  )}
                  
                  {msg.content && <p className="text-[15px] whitespace-pre-wrap break-words">{msg.content}</p>}
                  
                  <div className="flex justify-end items-center mt-1 gap-1">
                    {msg.is_edited && <span className="text-[10px] text-gray-400 italic mr-1">изменено</span>}
                    <span className={cn("text-[10px] opacity-80", isMe ? "text-gray-500 dark:text-blue-100" : "text-gray-500 dark:text-gray-400")}>
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </span>
                  </div>

                  {/* Actions wrapper */}
                  <div className={cn(
                    "absolute top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                    isMe ? "-left-[84px]" : "-right-[32px]"
                  )}>
                    <button
                      onClick={() => handleReply(msg)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-full"
                      title="Ответить"
                    >
                      <Reply size={14} />
                    </button>
                    {isMe && (
                      <button
                        onClick={() => handleEdit(msg)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-full"
                        title="Редактировать"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    {(isMe || isOwnerOrAdmin) && (
                      <button
                        onClick={() => handleDelete(msg.id, msg.user_id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-full"
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Group Info Sidebar */}
        {showMembers && chat.type !== 'direct' && (
          <div className="w-64 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col absolute right-0 inset-y-0 shadow-xl z-20 md:relative md:shadow-none transition-colors">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
              <h3 className="font-semibold text-sm">Участники ({chat.participants?.length || 0})</h3>
              <button onClick={() => setShowMembers(false)} className="md:hidden p-1 text-gray-500 dark:text-gray-400"><X size={16} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {chat.participants?.map(p => (
                <div key={p.user_id} className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold uppercase text-xs shrink-0">
                    {p.user?.username[0]}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-medium truncate dark:text-white">{p.user?.username}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{p.role}</span>
                  </div>
                </div>
              ))}

              {isOwnerOrAdmin && (
                <div className="p-3 bg-white dark:bg-gray-900 mt-2">
                  <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={chat.is_public || false}
                        onChange={async (e) => {
                          const isPublic = e.target.checked;
                          try {
                            await supabase.from('chats').update({ is_public: isPublic }).eq('id', chat.id);
                            // Optional: Update local state if needed, or rely on sidebar reload
                            chat.is_public = isPublic;
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                        disabled={chat.participants?.find(p => p.user_id === currentUser.id)?.role !== 'owner'}
                      />
                      <span className="text-sm font-medium dark:text-gray-300">Открытый {chat.type === 'channel' ? 'канал' : 'чат'}</span>
                    </label>
                  </div>
                  
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Пригласить</h4>
                  <input
                    type="text"
                    placeholder="Поиск по нику..."
                    className="w-full p-2 bg-gray-100 dark:bg-gray-800 border-transparent rounded text-sm mb-2 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                    value={searchNewMember}
                    onChange={(e) => searchUsersToAdd(e.target.value)}
                  />
                  {newMemberResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => inviteMember(u)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left rounded"
                    >
                      <span className="text-sm flex-1 truncate dark:text-gray-200">{u.username}</span>
                      <Plus size={14} className="text-blue-500" />
                    </button>
                  ))}
                  
                  <div className="mt-8 pt-4 border-t border-red-100 dark:border-red-900/50">
                    {chat.participants?.find(p => p.user_id === currentUser.id)?.role === 'owner' && (
                      <button 
                         onClick={handleDeleteChat}
                         className="w-full py-2 text-sm text-red-600 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        Удалить чат
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input Area or Join Button */}
      {!isParticipant ? (
        <div className="bg-white dark:bg-gray-900 p-4 border-t border-gray-200 dark:border-gray-800 flex justify-center z-10 transition-colors">
           <button
             onClick={handleJoinChat}
             disabled={isJoining}
             className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
           >
             {isJoining ? 'Вступление...' : 'Вступить в группу'}
           </button>
        </div>
      ) : canSend ? (
        <div className="bg-[#f0f2f5] dark:bg-gray-900 p-3 flex flex-col shrink-0 transition-colors relative z-10">
          
          {(replyingTo || editingMessageId) && (
            <div className="flex items-center justify-between mb-2 px-3 py-2 bg-white dark:bg-gray-800 border-l-4 border-blue-500 rounded shadow-sm">
               <div className="flex flex-col truncate pr-4">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {editingMessageId ? 'Редактирование' : `Ответ ${replyingTo?.user?.username || ''}`}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                    {editingMessageId ? messages.find(m => m.id === editingMessageId)?.content : replyingTo?.content || 'Вложение'}
                  </span>
               </div>
               <button onClick={() => { setReplyingTo(null); setEditingMessageId(null); setInputValue(''); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500">
                 <X size={16} />
               </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {!editingMessageId && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <Paperclip size={24} />
                </button>
              </>
            )}

            <form onSubmit={handleSend} className="flex-1 flex flex-col gap-2 relative">
              {selectedFile && !editingMessageId && (
                <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 flex items-center gap-3">
                  {selectedFile.type.startsWith('image/') ? <ImageIcon size={20} className="text-blue-500" /> : selectedFile.type.startsWith('video/') ? <Video size={20} className="text-blue-500" /> : <FileText size={20} className="text-blue-500" />}
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate max-w-[150px]">{selectedFile.name}</span>
                  <span className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button type="button" onClick={() => setSelectedFile(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-red-500">
                    <X size={16} />
                  </button>
                </div>
              )}
              
              <input
                ref={inputRef}
                type="text"
                placeholder={editingMessageId ? "Отредактируйте сообщение..." : "Введите сообщение..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full py-3 px-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-transparent rounded-lg focus:ring-0 focus:outline-none shadow-sm placeholder-gray-500 dark:placeholder-gray-400"
              />
            </form>

            <button
              onClick={handleSend}
              disabled={(!inputValue.trim() && !selectedFile && !editingMessageId)}
              className="p-3 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 transition-colors flex shrink-0"
            >
              {editingMessageId ? <Check size={20} className={isUploading ? "animate-pulse" : ""} /> : <Send size={20} className={isUploading ? "animate-pulse" : ""} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#f0f2f5] dark:bg-gray-900 p-4 text-center text-gray-500 dark:text-gray-400 text-sm transition-colors z-10 border-t border-gray-200 dark:border-gray-800">
          Только администраторы могут писать в этот канал.
        </div>
      )}

      {mediaModal && (
        <MediaModal 
          url={mediaModal.url} 
          type={mediaModal.type} 
          onClose={() => setMediaModal(null)} 
        />
      )}
    </div>
  );
}
