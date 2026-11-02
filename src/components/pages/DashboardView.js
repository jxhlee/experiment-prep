"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listUserReagents } from "../../lib/db.mjs";
import { SAMPLE_METHODS } from "../../lib/sample.mjs";
import { getSupabase } from "../../lib/supabase";
import ExperimentsTable from "../ExperimentsTable";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Button, Card, CardTitle, EmptyState, IconChip, PageHeader, Stat, buttonClass } from "../ui";

const STEP_HREF = { 1: "/new", 2: "/new/review", 3: "/new/result" };
const STEP_NAME = { 1: "입력", 2: "확인·수정", 3: "결과" };

const GUIDE = [
  { icon: "clipboard", title: "Methods 붙여넣기", body: "논문의 실험 방법 문단을 붙여넣고, 실험 규모(몇 배로 할지)를 정해요." },
  { icon: "table", title: "추출 결과 확인", body: "AI가 시약·농도·부피와 실행 단계를 표로 정리해요. 틀린 곳은 직접 고칠 수 있어요." },
  { icon: "calculator", title: "계량표와 타임라인", body: "시약별로 몇 g, 몇 mL를 달아야 하는지, 어떤 순서로 얼마나 걸리는지 바로 보여 줘요." },
];

const shortDate = (iso) => new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

export default function DashboardView() {
  const router = useRouter();
  const {
    auth, hasWork, reagents, timeline, reached, resetWork, setMethodText, notify,
    experiments, loadExperiments, openExperiment, removeExperiment, currentId,
  } = useExperiment();
  const userId = auth.user?.id;
  const [libraryCount, setLibraryCount] = useState(null);

  useEffect(() => {
    if (!userId) return;
    loadExperiments();
    let active = true;
    listUserReagents(getSupabase())
      .then((rows) => active && setLibraryCount(rows.length))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, loadExperiments]);

  async function onOpen(id) {
    if (await openExperiment(id)) router.push("/new/result");
  }

  const loggedIn = Boolean(auth.configured && auth.user);
  const reagentCount = reagents.filter((r) => r.name.trim()).length;
  const latest = experiments.items[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="홈" description="논문 Methods에서 시약 계량값과 실행 타임라인까지 한 번에 정리해요." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon="folder"
          label="저장한 실험"
          value={loggedIn ? (experiments.loaded ? `${experiments.items.length}개` : "…") : "—"}
          hint={loggedIn ? "내 실험에서 볼 수 있어요" : "로그인하면 저장돼요"}
        />
        <Stat
          icon="beaker"
          label="내 시약"
          value={loggedIn ? (libraryCount == null ? "…" : `${libraryCount}개`) : "—"}
          hint={loggedIn ? "분자량을 기억해 둔 시약" : "로그인하면 기억해요"}
        />
        <Stat
          icon="clock"
          label="최근 저장"
          value={loggedIn && latest ? shortDate(latest.updated_at) : "—"}
          hint={loggedIn && latest ? latest.title || "(이름 없음)" : "저장한 실험이 없어요"}
        />
        <Stat
          icon="flask"
          label="진행 중인 작업"
          tone={hasWork ? "accent" : undefined}
          value={hasWork ? STEP_NAME[reached] : "없음"}
          hint={hasWork ? `시약 ${reagentCount}개 · 단계 ${timeline.length}개` : "새 실험을 시작해 보세요"}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card as="section" aria-labelledby="recent-title">
          <div className="flex items-center justify-between gap-3">
            <CardTitle id="recent-title" icon="folder">
              최근 실험
            </CardTitle>
            {loggedIn && experiments.items.length > 0 && (
              <Link href="/experiments" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent underline underline-offset-4 hover:no-underline">
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
                title={auth.configured ? "로그인하면 저장한 실험이 보여요" : "저장 기능이 아직 꺼져 있어요"}
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

        <Card as="section" aria-labelledby="start-title">
          <CardTitle id="start-title" icon={hasWork ? "refresh" : "sparkles"}>
            {hasWork ? "이어서 하기" : "시작하기"}
          </CardTitle>
          {hasWork ? (
            <>
              <p className="mt-2 text-sm text-ink-muted">
                하던 작업이 있어요. 시약 {reagentCount}개, 실행 단계 {timeline.length}개 · <span className="font-medium text-ink">{STEP_NAME[reached]}</span> 단계까지 했어요.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href={STEP_HREF[reached]} className={buttonClass({ size: "lg" })}>
                  이어서 하기
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Button
                  variant="secondary"
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
            <>
              <p className="mt-2 text-sm text-ink-muted">논문의 Methods 문단만 있으면 돼요. 예시로 먼저 써 봐도 좋아요.</p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/new" className={buttonClass({ size: "lg" })}>
                  <Icon name="plus" size={16} />새 실험 시작
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMethodText(SAMPLE_METHODS);
                    router.push("/new");
                  }}
                >
                  <Icon name="sparkles" size={16} />
                  예시로 해 보기
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card as="section" aria-labelledby="guide-title">
        <CardTitle id="guide-title" icon="help">
          이렇게 쓰세요
        </CardTitle>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {GUIDE.map((g, i) => (
            <li key={g.title} className="flex gap-3">
              <IconChip name={g.icon} />
              <div>
                <p className="text-[15px] font-semibold text-ink">
                  <span className="sr-only">{i + 1}단계. </span>
                  {g.title}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{g.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
