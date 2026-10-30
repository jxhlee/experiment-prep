import { createClient } from "@supabase/supabase-js";

// NEXT_PUBLIC_ 변수는 브라우저 번들에 값이 박혀 들어가므로 아래처럼 이름을 그대로 써야 한다.
// 공개 키(publishable/anon)는 브라우저에 노출돼도 안전하다. 접근 제한은 DB의 RLS가 맡는다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client = null;

/** 설정이 없으면 null. 로그인·저장 기능이 숨겨진 채로 앱의 나머지 기능은 그대로 동작한다. */
export function getSupabase() {
  if (!isSupabaseConfigured) return null;
  client ??= createClient(url, key);
  return client;
}
