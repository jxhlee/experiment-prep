import { useCallback, useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "./supabase";

/** Supabase 이메일 로그인 상태. 설정이 없으면 configured=false 이고 나머지는 쓰이지 않는다. */
export function useAuth() {
  const [state, setState] = useState({ ready: !isSupabaseConfigured, user: null });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (active) setState({ ready: true, user: data.session?.user ?? null });
    });
    // 콜백 안에서는 상태만 바꾼다 (다른 Supabase 호출을 기다리면 교착될 수 있다)
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ ready: true, user: session?.user ?? null });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    // 메일 인증을 켜 둔 프로젝트는 이미 가입된 이메일에도 오류 없이 빈 identities 를 돌려준다
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw { code: "user_already_exists", message: "User already registered" };
    }
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  return { configured: isSupabaseConfigured, ready: state.ready, user: state.user, signIn, signUp, signOut };
}
