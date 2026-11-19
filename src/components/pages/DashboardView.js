"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SAMPLE_METHODS } from "../../lib/sample.mjs";
import ExperimentsTable from "../ExperimentsTable";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Button, Card, CardTitle, EmptyState, PageHeader, buttonClass } from "../ui";

const STEP_HREF = { 1: "/new", 2: "/new/review", 3: "/new/result" };
const STEP_NAME = { 1: "입력", 2: "확인·수정", 3: "결과" };

export default function DashboardView() {
  const router = useRouter();
  const {
    auth, hasWork, reagents, timeline, reached, resetWork, setMethodText, notify,
    experiments, loadExperiments, openExperiment, currentId,
  } = useExperiment();
  const userId = auth.user?.id;

  useEffect(() => {
    if (userId) loadExperiments();
  }, [userId, loadExperiments]);

  async function onOpen(id) {
    if (await openExperiment(id)) router.push("/new/result");
  }

  const loggedIn = Boolean(auth.configured && auth.user);
  const reagentCount = reagents.filter((r) => r.name.trim()).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="홈" description="논문의 실험 방법을 계량표와 타임라인으로 바꿔 드려요." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card as="section" aria-labelledby="recent-title">
          <div className="flex items-center justify-between gap-3">
            <CardTitle id="recent-title">최근 실험</CardTitle>
            {loggedIn && experiments.items.length > 0 && (
              <Link href="/experiments" className="inline-flex min-h-9 items-center gap-1 text-sm text-accent underline underline-offset-4 hover:no-underline">
                전체 보기
                <Icon name="arrowRight" size={14} />
              </Link>
            )}
          </div>
          <div className="mt-3">
            {loggedIn ? (
              <ExperimentsTable
                items={experiments.items}
                loading={experiments.loading}
                error={experiments.error}
                currentId={currentId}
                onOpen={onOpen}
                limit={5}
                caption="최근에 저장한 실험"
              />
            ) : (
              <EmptyState
                icon="folder"
                title={auth.configured ? "로그인하면 저장한 실험이 보여요" : "저장 기능이 꺼져 있어요"}
                action={
                  auth.configured && (
                    <Link href="/login" className={buttonClass({ variant: "secondary" })}>
                      로그인 / 회원가입
                    </Link>
                  )
                }
              >
                로그인하지 않아도 분석과 계산은 모두 쓸 수 있어요.
              </EmptyState>
            )}
          </div>
        </Card>

        <Card as="section" aria-labelledby="start-title" className="flex flex-col gap-4">
          <CardTitle id="start-title">{hasWork ? "이어서 하기" : "시작하기"}</CardTitle>
          {hasWork ? (
            <>
              <p className="text-sm text-ink-muted">
                시약 {reagentCount}개 · 실행 단계 {timeline.length}개, <span className="font-medium text-ink">{STEP_NAME[reached]}</span> 단계까지 했어요.
              </p>
              <div className="flex flex-col gap-2">
                <Link href={STEP_HREF[reached]} className={buttonClass({ size: "lg" })}>
                  이어서 하기
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetWork();
                    notify("작업을 비웠어요.");
                  }}
                >
                  비우고 새로 시작
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Link href="/new" className={buttonClass({ size: "lg" })}>
                새 실험 시작
                <Icon name="arrowRight" size={16} />
              </Link>
              <Button
                variant="ghost"
                onClick={() => {
                  setMethodText(SAMPLE_METHODS);
                  router.push("/new");
                }}
              >
                <Icon name="sparkles" size={16} />
                예시로 해 보기
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
