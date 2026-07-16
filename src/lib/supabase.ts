import { createClient } from '@supabase/supabase-js';

// Используем предоставленные вами ключи напрямую
// Это безопасно для Supabase, так как ключ является публичным (anon), а данные защищены правилами RLS, которые мы создали в SQL
const supabaseUrl = 'https://ibkcyixmyxlmnnwaybkh.supabase.co';
const supabaseAnonKey = 'sb_publishable_T9ETqCa_3iHYvPsXoD2lMg_NvM7CuU8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
