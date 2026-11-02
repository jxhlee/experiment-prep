"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthPanel from "./AuthPanel";
import { useAccount } from "./AuthProvider";
import { Icon } from "./icons";
import { BrandLink } from "./shell/Navigation";
import { Alert, Card, buttonClass } from "./ui";

// 로그인하러 오기 전에 있던 화면으로 돌아간다. 같은 사이트 안의 주소만 받는다.
function returnPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function LoginScreen() {
  const router = useRouter();
  const auth = useAccount();

  // 로그인이 끝나면(또는 이미 로그인돼 있으면) 원래 화면으로 넘어간다
  useEffect(() => {
    if (auth.ready && auth.user) router.replace(returnPath());
  }, [auth.ready, auth.user, router]);

  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center px-4 py-10 focus:outline-none">
      <BrandLink />
      <div className="mt-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-ink">로그인하고 실험 저장하기</h1>
        <p className="mt-1 text-sm text-ink-muted">저장하고 다시 불러오고 싶을 때만 필요해요. 로그인하지 않아도 분석과 계산은 모두 쓸 수 있어요.</p>

        <Card className="mt-6">
          {!auth.configured ? (
            <Alert kind="warn">
              <p className="font-medium">로그인 기능이 아직 설정되지 않았어요.</p>
              <p className="mt-0.5">저장 없이 분석과 계산은 그대로 쓸 수 있어요.</p>
            </Alert>
          ) : !auth.ready || auth.user ? (
            <p role="status" className="text-sm text-ink-muted">
              확인 중…
            </p>
          ) : (
            <AuthPanel onSignIn={auth.signIn} onSignUp={auth.signUp} onDone={() => router.replace(returnPath())} />
          )}
        </Card>

        <p className="mt-4 text-center">
          <Link href="/" className={buttonClass({ variant: "ghost" })}>
            <Icon name="arrowLeft" size={16} />
            {auth.configured ? "로그인 없이 사용하기" : "처음 화면으로"}
          </Link>
        </p>
      </div>
    </main>
  );
}
