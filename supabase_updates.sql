-- ИНСТРУКЦИЯ ПО ОБНОВЛЕНИЮ БАЗЫ ДАННЫХ
-- 1. Откройте "SQL Editor" в Supabase
-- 2. Создайте новый запрос (New Query)
-- 3. Вставьте этот код и нажмите "Run" (зеленая кнопка)

-- 1. Добавляем новые колонки в таблицу сообщений
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists is_edited boolean default false;
alter table public.messages add column if not exists invite_chat_id uuid references public.chats(id) on delete cascade;

-- 2. Обновляем политики для сообщений
drop policy if exists "Users can delete their own messages" on public.messages;
drop policy if exists "Users can delete messages" on public.messages;

create policy "Users can delete messages" on public.messages
  for delete using (
    user_id = auth.uid() or
    exists (
      select 1 from public.chat_participants
      where chat_id = messages.chat_id and user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

drop policy if exists "Users can update their own messages" on public.messages;
create policy "Users can update their own messages" on public.messages
  for update using (user_id = auth.uid());

-- 3. Добавляем приватность и политики для чатов
alter table public.chats add column if not exists is_public boolean default false;

drop policy if exists "Owners can delete chats" on public.chats;
create policy "Owners can delete chats" on public.chats
  for delete using (
    exists (
      select 1 from public.chat_participants
      where chat_id = id and user_id = auth.uid() and role = 'owner'
    )
  );

-- 4. Статус "в сети"
alter table public.users add column if not exists last_seen_at timestamp with time zone default timezone('utc'::text, now());
