export interface User {
  id: string;
  username: string;
  avatar_url?: string;
  avatar_color?: string;
  avatar_char?: string;
  created_at: string;
  last_seen_at?: string;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group' | 'channel';
  name?: string;
  avatar_color?: string;
  avatar_char?: string;
  created_by?: string;
  created_at: string;
  is_public?: boolean;
}

export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  content?: string;
  attachment_url?: string;
  attachment_type?: string;
  created_at: string;
  is_edited?: boolean;
  reply_to_id?: string;
  invite_chat_id?: string;
  user?: User;
  reply_to?: Message;
  invite_chat?: Chat;
}

export interface ChatParticipant {
  chat_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
  last_read_at?: string;
  user?: User;
}

export interface ChatWithDetails extends Chat {
  participants: ChatParticipant[];
  last_message?: Message;
  unread_count?: number;
}
