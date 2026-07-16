import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ThemeProvider } from './lib/ThemeContext';
import type { User, ChatWithDetails } from './types';
import { MessageSquare } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedChat, setSelectedChat] = useState<ChatWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUser(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadUser(session.user.id);
      } else {
        setCurrentUser(null);
        setSelectedChat(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUser = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user, retrying...', error);
        // Retry logic might be needed if trigger hasn't finished yet
        setTimeout(() => loadUser(userId), 1000);
        return;
      }
      
      setCurrentUser(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    const updatePresence = async () => {
      await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUser.id);
    };

    updatePresence();
    const interval = setInterval(updatePresence, 60000); // once a minute

    return () => clearInterval(interval);
  }, [currentUser?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session || !currentUser) {
    return <Auth onLogin={() => {}} />;
  }

  return (
    <ThemeProvider>
      <div className="flex h-screen w-full bg-white dark:bg-gray-900 overflow-hidden text-gray-900 dark:text-gray-100 font-sans transition-colors">
        {/* Sidebar - hidden on mobile if chat is selected */}
        <div className={`h-full md:block ${selectedChat ? 'hidden' : 'block w-full md:w-80'}`}>
          <Sidebar 
            currentUser={currentUser} 
            onSelectChat={setSelectedChat}
            selectedChatId={selectedChat?.id}
          />
        </div>

        {/* Main Chat Area */}
        <div className={`flex-1 h-full flex flex-col ${selectedChat ? 'block' : 'hidden md:flex'}`}>
          {selectedChat ? (
            <>
              {/* Mobile back button header */}
              <div className="md:hidden bg-gray-50 dark:bg-gray-900 p-2 border-b border-gray-200 dark:border-gray-800 flex items-center transition-colors">
                 <button onClick={() => setSelectedChat(null)} className="text-blue-600 dark:text-blue-400 font-medium px-2 py-1">
                   &larr; Назад
                 </button>
              </div>
              <ChatArea chat={selectedChat} currentUser={currentUser} onSelectChat={setSelectedChat} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-gray-900/50 transition-colors">
              <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                <MessageSquare size={48} className="text-blue-500 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-medium text-gray-900 dark:text-white mb-2">Добро пожаловать</h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm text-center">
                Выберите чат из списка слева или найдите пользователя по нику, чтобы начать общение.
              </p>
            </div>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}

