// Supabase 云数据库客户端
import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://bjnkewdivznfbmcshznj.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqbmtld2RpdnpuZmJtY3Noem5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NTYyMDYsImV4cCI6MjEwMDUzMjIwNn0.cvZ4HTj3ufsViYjrxgJ_HImWUdRh_KcacbRqJ0QNBsk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

/**
 * 构造 Supabase REST 请求头（用于需要直接 fetch 的场景）
 */
export function getSupabaseHeaders() {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json'
  };
}