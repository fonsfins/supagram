import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Settings as SettingsIcon, Users, Hash, User as UserIcon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onGroupCreated: () => void;
}

const AVATAR_COLORS = [
  { id: 'blue', class: 'bg-blue-500' },
  { id: 'red', class: 'bg-red-500' },
  { id: 'green', class: 'bg-green-500' },
  { id: 'purple', class: 'bg-purple-500' },
  { id: 'orange', class: 'bg-orange-500' },
  { id: 'pink', class: 'bg-pink-500' },
  { id: 'teal', class: 'bg-teal-500' },
  { id: 'indigo', class: 'bg-indigo-500' },
];

export function SettingsModal({ isOpen, onClose, currentUser, onGroupCreated }: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'create_chat'>('profile');
  
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'group' | 'channel'>('group');
  const [isPublic, setIsPublic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [groupColor, setGroupColor] = useState('blue');
  const [groupChar, setGroupChar] = useState('');

  const [profileColor, setProfileColor] = useState(currentUser.avatar_color || 'blue');
  const [profileChar, setProfileChar] = useState(currentUser.avatar_char || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setProfileColor(currentUser.avatar_color || 'blue');
      setProfileChar(currentUser.avatar_char || '');
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const { error } = await supabase.from('users').update({
        avatar_color: profileColor,
        avatar_char: profileChar.substring(0, 2)
      }).eq('id', currentUser.id);
      
      if (error) throw error;
      
      // Update local object optimistically
      currentUser.avatar_color = profileColor;
      currentUser.avatar_char = profileChar.substring(0, 2);
      
      alert('Профиль сохранен!');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      alert('Ошибка: ' + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setIsCreating(true);
    try {
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({ 
          type: newGroupType, 
          name: newGroupName.trim(), 
          created_by: currentUser.id, 
          is_public: isPublic,
          avatar_color: groupColor,
          avatar_char: groupChar.substring(0, 2)
        })
        .select()
        .single();

      if (chatError) throw chatError;

      const { error: participantError } = await supabase.from('chat_participants').insert({
        chat_id: chatData.id,
        user_id: currentUser.id,
        role: 'owner'
      });
      
      if (participantError) throw participantError;

      setNewGroupName('');
      setGroupChar('');
      setGroupColor('blue');
      onGroupCreated();
      onClose();
    } catch (err: any) {
      console.error('Error creating group:', err);
      alert('Ошибка создания: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2 dark:text-white">
            <SettingsIcon size={20} />
            Настройки
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full dark:text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'profile' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Профиль
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'appearance' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Внешний вид
          </button>
          <button
            onClick={() => setActiveTab('create_chat')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'create_chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Новый чат
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Отображаемый символ (макс. 2)</h3>
                <input
                  type="text"
                  maxLength={2}
                  value={profileChar}
                  onChange={e => setProfileChar(e.target.value)}
                  placeholder={currentUser.username.substring(0, 2).toUpperCase()}
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center text-xl font-bold uppercase"
                />
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Цвет профиля</h3>
                <div className="flex flex-wrap gap-3">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setProfileColor(c.id)}
                      className={`w-10 h-10 rounded-full ${c.class} flex items-center justify-center transition-transform hover:scale-110 ${profileColor === c.id ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-gray-900' : ''}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className={`w-12 h-12 rounded-full ${AVATAR_COLORS.find(c => c.id === profileColor)?.class || 'bg-blue-500'} flex items-center justify-center text-white text-lg font-bold uppercase shrink-0`}>
                  {profileChar || currentUser.username.substring(0, 2)}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{currentUser.username}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Предпросмотр</div>
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 mt-2"
              >
                {isSavingProfile ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Тема оформления</h3>
              <div className="flex gap-4">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                >
                  <Sun size={24} className={theme === 'light' ? 'text-blue-500' : 'text-gray-500'} />
                  <span className={`text-sm font-medium ${theme === 'light' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>Светлая</span>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                >
                  <Moon size={24} className={theme === 'dark' ? 'text-blue-500' : 'text-gray-500'} />
                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>Темная</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'create_chat' && (
            <form onSubmit={handleCreateChat} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
                <input
                  type="text"
                  placeholder="Введите название..."
                  required
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Тип чата</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`cursor-pointer flex flex-col items-center gap-2 p-3 border rounded-lg transition-colors ${newGroupType === 'group' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <input type="radio" className="hidden" checked={newGroupType === 'group'} onChange={() => setNewGroupType('group')} />
                    <Users size={20} />
                    <span className="text-sm font-medium">Группа</span>
                  </label>
                  <label className={`cursor-pointer flex flex-col items-center gap-2 p-3 border rounded-lg transition-colors ${newGroupType === 'channel' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <input type="radio" className="hidden" checked={newGroupType === 'channel'} onChange={() => setNewGroupType('channel')} />
                    <Hash size={20} />
                    <span className="text-sm font-medium">Канал</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Отображаемый символ (опционально)</label>
                <input
                  type="text"
                  maxLength={2}
                  value={groupChar}
                  onChange={e => setGroupChar(e.target.value)}
                  placeholder={newGroupName.substring(0, 2).toUpperCase() || 'GR'}
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Цвет группы</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setGroupColor(c.id)}
                      className={`w-8 h-8 rounded-full ${c.class} flex items-center justify-center transition-transform hover:scale-110 ${groupColor === c.id ? 'ring-2 ring-offset-1 ring-gray-900 dark:ring-white dark:ring-offset-gray-900' : ''}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <input
                  type="checkbox"
                  id="is_public"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
                />
                <div className="flex flex-col">
                  <label htmlFor="is_public" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                    Открытая группа/канал
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Любой сможет найти и вступить в чат</span>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isCreating}
                className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 mt-4"
              >
                {isCreating ? 'Создание...' : 'Создать'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
