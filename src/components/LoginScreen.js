"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthPanel from "./AuthPanel";
import { useAuth } from "../lib/use-auth";

export default function LoginScreen() {
  const router = useRouter();
  const auth = useAuth();

  // 로그인이 끝나면(또는 이미 로그인돼 있으면) 실제 화면으로 넘어간다
  useEffect(() => {
    if (auth.ready && auth.user) router.replace("/");
  }, [auth.ready, auth.user, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12">
      <h1 className="text-center text-2xl font-bold text-slate-800">실험 프렙 (가제)</h1>
      <p className="mt-2 max-w-sm text-center text-sm text-slate-500">
        논문의 실험 방법을 읽고, 시약 계량값과 실행 순서를 계산해 드려요.
      </p>

      <div className="mt-6 w-full max-w-md">
        {!auth.configured ? (
          <div className="rounded-lg bg-slate-800 p-4 text-sm text-white">
            <p className="font-semibold">로그인 기능이 아직 설정되지 않았어요.</p>
            <p className="mt-1 text-slate-300">저장 없이 분석과 계산은 그대로 쓸 수 있어요.</p>
          </div>
        ) : !auth.ready || auth.user ? (
          <p className="text-center text-sm text-slate-500">확인 중…</p>
        ) : (
          <AuthPanel
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
            onClose={() => router.replace("/")}
            closeLabel={null}
          />
        )}
      </div>

      <Link href="/" className="mt-6 text-sm text-slate-600 underline hover:text-slate-800">
        {auth.configured ? "로그인 없이 사용하기 →" : "분석 화면으로 가기 →"}
      </Link>
    </main>
  );
}
