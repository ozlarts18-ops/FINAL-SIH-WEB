import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cuszmxwcvujmlsskiqby.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1c3pteHdjdnVqbWxzc2tpcWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODg0MjYsImV4cCI6MjEwMzc2NDQyNn0.MfYf96SHno-WgOpScgA6DKRAbWSq-RpaS7lIf0x8S5I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
