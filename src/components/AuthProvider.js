"use client";

import { createContext, useContext } from "react";
import { useAuth } from "../lib/use-auth";

const AuthContext = createContext(null);

// 헤더와 도구 화면이 같은 로그인 상태를 보도록 한 곳에서만 구독한다
export function AuthProvider({ children }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAccount() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAccount 는 AuthProvider 안에서만 쓸 수 있어요.");
  return value;
}
