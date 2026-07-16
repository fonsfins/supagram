import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, LogOut, Users, Hash, User as UserIcon, Settings, Bookmark } from 'lucide-react';
import type { ChatWithDetails, User } from '../types';
import { cn } from '../lib/utils';
import { SettingsModal } from './SettingsModal';

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

interface SidebarProps {
  currentUser: User;
  onSelectChat: (chat: ChatWithDetails | null) => void;
  selectedChatId?: string;
}

export function Sidebar({ currentUser, onSelectChat, selectedChatId }: SidebarProps) {
  const [chats, setChats] = useState<ChatWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{users: User[], publicChats: ChatWithDetails[]}>({users: [], publicChats: []});
  const [isSearching, setIsSearching] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    loadChats();
    
    // Subscribe to chat participants changes
    const participantsSub = supabase
      .channel('public:chat_participants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${currentUser.id}` }, loadChats)
      .subscribe();

    // Subscribe to new messages across all chats to update the sidebar
    const messagesSub = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        // Find if this message belongs to any of our chats
        setChats(prevChats => {
          const chatIndex = prevChats.findIndex(c => c.id === payload.new.chat_id);
          if (chatIndex > -1) {
            const updatedChats = [...prevChats];
            const chatToUpdate = { ...updatedChats[chatIndex] };
            
            chatToUpdate.last_message = payload.new as any;
            
            // If the chat is not currently selected, increment unread count
            if (selectedChatId !== chatToUpdate.id && payload.new.user_id !== currentUser.id) {
               chatToUpdate.unread_count = (chatToUpdate.unread_count || 0) + 1;
            }
            
            updatedChats.splice(chatIndex, 1);
            updatedChats.unshift(chatToUpdate); // Move to top
            return updatedChats;
          }
          return prevChats;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(participantsSub);
      supabase.removeChannel(messagesSub);
    };
  }, [currentUser.id, selectedChatId]);

  const loadChats = async () => {
    try {
      const { data: participations, error: partError } = await supabase
        .from('chat_participants')
        .select(`
          chat_id,
          last_read_at,
          chats:chat_id (*)
        `)
        .eq('user_id', currentUser.id);

      if (partError) throw partError;

      const chatsData = await Promise.all(
        (participations || []).map(async (p: any) => {
          const chat = p.chats;
          const { data: members } = await supabase
            .from('chat_participants')
            .select('user_id, role, users(*)')
            .eq('chat_id', chat.id);
            
          const { data: lastMessage } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
          // Get unread count
          let unreadCount = 0;
          if (p.last_read_at) {
             const { count } = await supabase
               .from('messages')
               .select('*', { count: 'exact', head: true })
               .eq('chat_id', chat.id)
               .gt('created_at', p.last_read_at)
               .neq('user_id', currentUser.id);
             unreadCount = count || 0;
          } else {
             // If never read, count all messages not from self
             const { count } = await supabase
               .from('messages')
               .select('*', { count: 'exact', head: true })
               .eq('chat_id', chat.id)
               .neq('user_id', currentUser.id);
             unreadCount = count || 0;
          }

          return {
            ...chat,
            participants: members?.map((m: any) => ({ ...m, user: m.users })) || [],
            last_message: lastMessage || undefined,
            unread_count: unreadCount,
          } as ChatWithDetails;
        })
      );

      // Sort by latest message
      chatsData.sort((a, b) => {
        const dateA = a.last_message?.created_at || a.created_at;
        const dateB = b.last_message?.created_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setChats(chatsData);
    } catch (err) {
      console.error('Error loading chats:', err);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults({users: [], publicChats: []});
      return;
    }
    setIsSearching(true);
    try {
      const [usersResponse, chatsResponse] = await Promise.all([
        supabase.from('users').select('*').ilike('username', `%${query}%`).neq('id', currentUser.id).limit(10),
        supabase.from('chats').select('*').ilike('name', `%${query}%`).eq('is_public', true).limit(10)
      ]);
      
      setSearchResults({
        users: usersResponse.data || [],
        publicChats: (chatsResponse.data as any) || []
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const startDirectChat = async (targetUser: User) => {
    // Check if direct chat already exists
    const existingChat = chats.find(c => 
      c.type === 'direct' && c.participants.some(p => p.user_id === targetUser.id)
    );

    if (existingChat) {
      onSelectChat(existingChat);
      setSearchQuery('');
      setSearchResults([]);
      return;
    }

    try {
      // Create new chat
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({ type: 'direct', created_by: currentUser.id })
        .select()
        .single();

      if (chatError) throw chatError;

      // Add participants
      await supabase.from('chat_participants').insert([
        { chat_id: chatData.id, user_id: currentUser.id, role: 'owner' },
        { chat_id: chatData.id, user_id: targetUser.id, role: 'member' }
      ]);

      setSearchQuery('');
      setSearchResults([]);
      await loadChats();
      
      // Auto-select the new chat after reload
      // A small timeout to let the state update
      setTimeout(async () => {
         const { data: newChatMembers } = await supabase
            .from('chat_participants')
            .select('user_id, role, users(*)')
            .eq('chat_id', chatData.id);
            
         onSelectChat({
           ...chatData,
           participants: newChatMembers?.map((m: any) => ({ ...m, user: m.users })) || [],
           unread_count: 0
         } as ChatWithDetails);
      }, 500);
      
    } catch (err) {
      console.error('Error starting chat:', err);
    }
  };

  const getChatAvatarData = (chat: ChatWithDetails) => {
    if (chat.type === 'direct') {
      if (chat.participants.every(p => p.user_id === currentUser.id)) {
        return { char: '★', color: 'blue' }; // saved messages
      }
      const otherMember = chat.participants.find(p => p.user_id !== currentUser.id);
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

  const getChatName = (chat: ChatWithDetails) => {
    if (chat.type !== 'direct') return chat.name;
    if (chat.participants.every(p => p.user_id === currentUser.id)) return 'Избранное';
    const otherMember = chat.participants.find(p => p.user_id !== currentUser.id);
    return otherMember?.user?.username || 'Unknown User';
  };

  const getChatIcon = (chat: ChatWithDetails) => {
    if (chat.type === 'direct' && chat.participants.every(p => p.user_id === currentUser.id)) return <Bookmark size={18} className="text-gray-400 dark:text-gray-500" />;
    if (chat.type === 'channel') return <Hash size={18} className="text-gray-400 dark:text-gray-500" />;
    if (chat.type === 'group') return <Users size={18} className="text-gray-400 dark:text-gray-500" />;
    return <UserIcon size={18} className="text-gray-400 dark:text-gray-500" />;
  };

  const openSavedMessages = async () => {
    const existing = chats.find(c => c.type === 'direct' && c.participants.every(p => p.user_id === currentUser.id));
    if (existing) {
      onSelectChat(existing);
      return;
    }

    try {
      const { data: myChats } = await supabase.from('chat_participants').select('chat_id').eq('user_id', currentUser.id);
      
      if (myChats && myChats.length > 0) {
        const chatIds = myChats.map(c => c.chat_id);
        const { data: directChats } = await supabase.from('chats').select('id, type').eq('type', 'direct').in('id', chatIds);
        
        if (directChats && directChats.length > 0) {
          const directChatIds = directChats.map(c => c.id);
          const { data: allParts } = await supabase.from('chat_participants').select('chat_id, user_id').in('chat_id', directChatIds);
          
          if (allParts) {
            const partsByChat = allParts.reduce((acc: Record<string, string[]>, p) => {
              if (!acc[p.chat_id]) acc[p.chat_id] = [];
              acc[p.chat_id].push(p.user_id);
              return acc;
            }, {});
            
            for (const [chatId, users] of Object.entries(partsByChat)) {
              if (users.every(u => u === currentUser.id)) {
                await loadChats();
                setTimeout(async () => {
                  const { data: members } = await supabase.from('chat_participants').select('user_id, role, users(*)').eq('chat_id', chatId);
                  const { data: chatData } = await supabase.from('chats').select('*').eq('id', chatId).single();
                  if (chatData) {
                    onSelectChat({
                      ...chatData,
                      participants: members?.map((m: any) => ({ ...m, user: m.users })) || [],
                      unread_count: 0
                    } as ChatWithDetails);
                  }
                }, 500);
                return;
              }
            }
          }
        }
      }

      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({ type: 'direct', created_by: currentUser.id })
        .select()
        .single();
      if (chatError) throw chatError;

      await supabase.from('chat_participants').insert([
        { chat_id: chatData.id, user_id: currentUser.id, role: 'owner' }
      ]);
      await loadChats();
      setTimeout(async () => {
        const { data: members } = await supabase.from('chat_participants').select('user_id, role, users(*)').eq('chat_id', chatData.id);
        onSelectChat({
          ...chatData,
          participants: members?.map((m: any) => ({ ...m, user: m.users })) || [],
          unread_count: 0
        } as ChatWithDetails);
      }, 500);
    } catch (err) {
      console.error('Error opening saved messages:', err);
    }
  };

  return (
    <div className="w-full md:w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col h-full transition-colors">
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        currentUser={currentUser}
        onGroupCreated={loadChats}
      />
      
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold uppercase shadow-sm">
            {currentUser.username[0]}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-gray-900 dark:text-white">{currentUser.username}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
            title="Настройки"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
            title="Выйти"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по нику..."
            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-transparent rounded-full text-sm text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-y-auto relative">
        {searchQuery ? (
          <div className="absolute inset-0 bg-white dark:bg-gray-900 z-10 p-2 transition-colors">
            {isSearching ? (
              <div className="text-center text-sm text-gray-500 py-4">Поиск...</div>
            ) : (searchResults.users.length > 0 || searchResults.publicChats.length > 0) ? (
              <>
                {searchResults.users.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 mb-2 uppercase">Пользователи</h3>
                    {searchResults.users.map(user => (
                      <button
                        key={user.id}
                        onClick={() => startDirectChat(user)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                      >
                        <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[user.avatar_color || 'blue'] || 'bg-blue-500'} flex items-center justify-center text-white font-bold uppercase shrink-0`}>
                          {user.avatar_char || user.username.substring(0, 2)}
                        </div>
                        <span className="font-medium dark:text-gray-200">{user.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                
                {searchResults.publicChats.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 mb-2 uppercase">Публичные чаты</h3>
                    {searchResults.publicChats.map(chat => (
                      <button
                        key={chat.id}
                        onClick={() => {
                          onSelectChat({ ...chat, participants: [] } as ChatWithDetails);
                          setSearchQuery('');
                        }}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                      >
                        <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[chat.avatar_color || 'green'] || 'bg-green-500'} flex items-center justify-center text-white font-bold uppercase shrink-0`}>
                          {chat.avatar_char || chat.name?.substring(0, 2) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                           <span className="font-medium dark:text-gray-200 block truncate">{chat.name}</span>
                           <span className="text-xs text-gray-500 dark:text-gray-400">{chat.type === 'channel' ? 'Канал' : 'Группа'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">Ничего не найдено</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            <button
              onClick={openSavedMessages}
              className="w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shrink-0">
                <Bookmark size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Избранное</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Сохраненные сообщения</p>
              </div>
            </button>
            <div className="flex-1">
              {chats.map(chat => {
                const avatar = getChatAvatarData(chat);
                return (
                <button
                  key={chat.id}
                  onClick={() => {
                    onSelectChat(chat);
                    // Clear unread count locally when clicked
                    setChats(chats.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c));
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-gray-100 dark:border-gray-800",
                    selectedChatId === chat.id 
                      ? "bg-blue-50 dark:bg-blue-900/20" 
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  )}
                >
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-full ${AVATAR_COLORS[avatar.color] || 'bg-blue-500'} flex items-center justify-center text-white font-bold text-lg uppercase shrink-0`}>
                      {avatar.char}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-1">
                        {getChatIcon(chat)}
                        <span className="truncate">{getChatName(chat)}</span>
                      </h3>
                      <div className="flex items-center gap-2">
                        {chat.last_message && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {new Date(chat.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate pr-2">
                        {chat.last_message?.content || (chat.last_message?.attachment_url ? '📎 Вложение' : 'Нет сообщений')}
                      </p>
                      {chat.unread_count && chat.unread_count > 0 ? (
                        <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                          {chat.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              )})}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
