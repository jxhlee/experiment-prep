"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExperiment } from "./ExperimentProvider";
import { Card, EmptyState, buttonClass } from "./ui";

/** 로그인해야 볼 수 있는 화면을 감싼다. 로그인 전·설정 없음·확인 중일 때의 모습을 한곳에서 정한다. */
export default function RequireLogin({ what, children }) {
  const { auth } = useExperiment();
  const pathname = usePathname();

  if (!auth.configured) {
    return (
      <Card>
        <EmptyState icon="alert" title="로그인 기능이 아직 설정되지 않았어요">
          저장과 불러오기는 로그인 기능을 켠 뒤에 쓸 수 있어요. 분석과 계산은 로그인 없이 그대로 쓸 수 있어요.
        </EmptyState>
      </Card>
    );
  }
  if (!auth.ready) {
    return (
      <Card>
        <p role="status" className="py-8 text-center text-sm text-ink-muted">
          계정을 확인하는 중…
        </p>
      </Card>
    );
  }
  if (!auth.user) {
    return (
      <Card>
        <EmptyState
          icon="logIn"
          title="로그인이 필요해요"
          action={
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonClass()}>
              로그인 / 회원가입
            </Link>
          }
        >
          {what}
        </EmptyState>
      </Card>
    );
  }
  return children;
}
