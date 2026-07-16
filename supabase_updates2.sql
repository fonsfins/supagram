-- ИНСТРУКЦИЯ ПО ОБНОВЛЕНИЮ БАЗЫ ДАННЫХ (Аватары и удаление)
-- 1. Откройте "SQL Editor" в Supabase
-- 2. Создайте новый запрос (New Query)
-- 3. Вставьте этот код и нажмите "Run" (зеленая кнопка)

-- 1. Добавляем поля для кастомизации аватарок
alter table public.users add column if not exists avatar_color varchar(20) default 'blue';
alter table public.users add column if not exists avatar_char varchar(2);

alter table public.chats add column if not exists avatar_color varchar(20);
alter table public.chats add column if not exists avatar_char varchar(2);

-- 2. Обновляем политику для изменения своего профиля
drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile" on public.users
  for update using (id = auth.uid());

-- 3. Разрешаем удалять обычные чаты (direct) всем участникам
drop policy if exists "Owners can delete chats" on public.chats;
create policy "Users can delete chats" on public.chats
  for delete using (
    (type = 'direct' and exists (
      select 1 from public.chat_participants where chat_id = id and user_id = auth.uid()
    ))
    or
    (type != 'direct' and exists (
      select 1 from public.chat_participants where chat_id = id and user_id = auth.uid() and role = 'owner'
    ))
  );

-- 4. Уточняем правила удаления сообщений (чтобы можно было удалять свои везде)
drop policy if exists "Users can delete messages" on public.messages;
create policy "Users can delete messages" on public.messages
  for delete using (
    user_id = auth.uid() or
    exists (
      select 1 from public.chat_participants
      where chat_id = messages.chat_id and user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
