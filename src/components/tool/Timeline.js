"use client";

import { useState } from "react";
import { stepIssues } from "../../lib/row-issues.mjs";
import { describeDuration, formatMinutes, formatStart } from "../../lib/timeline.mjs";
import { Icon } from "../icons";
import { Alert, Button, IssueList, Segmented } from "../ui";

function StepCard({ step, index, large = false, prov = null }) {
  const issues = stepIssues({ analysis: prov, userAdded: step.userAdded });
  return (
    <div className={`flex h-full flex-col gap-1 rounded-xl border border-line bg-surface p-4 ${large ? "items-center text-center" : ""}`}>
      <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
        {index + 1}
      </span>
      <span className="sr-only">{index + 1}단계</span>
      <p className="mt-1 text-[15px] font-semibold text-ink">{step.label || "(이름 없음)"}</p>
      <p className="text-sm font-medium text-ink">{describeDuration(step)}</p>
      <p className="text-sm text-ink-muted">{formatStart(step)}</p>
      {step.details && <p className="text-sm text-ink-muted">{step.details}</p>}
      {step.isWaiting && <p className="text-sm text-ink-muted">⏳ 대기 단계</p>}
      <IssueList issues={issues} className={`mt-1 ${large ? "justify-center" : ""}`} />
    </div>
  );
}

export default function Timeline({ tl, prov = {} }) {
  const [mode, setMode] = useState("scroll");
  const [index, setIndex] = useState(0);

  const lastIndex = tl.items.length - 1;
  const safeIndex = Math.min(index, Math.max(0, lastIndex));
  const current = tl.items[safeIndex];
  const atStart = safeIndex <= 0;
  const atEnd = safeIndex >= lastIndex;

  return (
    <section aria-labelledby="timeline-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="timeline-heading" className="text-[15px] font-semibold text-ink">
            실험 타임라인
          </h2>
          {tl.items.length > 0 && (
            <p className="mt-0.5 text-sm text-ink-muted">
              총 <span className="font-semibold text-ink">{formatMinutes(tl.totalMin)}</span>
              {tl.unknownCount > 0 && ` (시간 미정 ${tl.unknownCount}단계 제외)`}
            </p>
          )}
        </div>
        <Segmented
          legend="타임라인 보기 방식"
          hideLegend
          name="timeline-mode"
          value={mode}
          onChange={setMode}
          className="w-full sm:w-60"
          options={[
            { value: "scroll", label: "좌우 스크롤" },
            { value: "carousel", label: "카드 넘기기" },
          ]}
        />
      </div>

      {tl.items.length === 0 ? (
        <p className="mt-4 py-8 text-center text-sm text-ink-muted">표시할 타임라인이 없어요. 이전 단계에서 실행 단계를 추가해 주세요.</p>
      ) : mode === "scroll" ? (
        <div role="region" aria-label="실험 타임라인 (좌우로 스크롤할 수 있어요)" tabIndex={0} className="relative mt-4 overflow-x-auto pb-2">
          <ol className="flex w-max gap-3">
            {tl.items.map((step, i) => (
              <li key={step.id ?? i} className="w-52 shrink-0">
                <StepCard step={step} index={i} prov={prov[step.id]} />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-stretch gap-2 sm:gap-3">
            <Button
              variant="secondary"
              className="w-10 shrink-0 self-center px-0"
              aria-label="이전 단계"
              aria-disabled={atStart}
              onClick={() => !atStart && setIndex(safeIndex - 1)}
            >
              <Icon name="chevronLeft" size={18} />
            </Button>
            <div role="group" aria-roledescription="슬라이드" aria-label={`${safeIndex + 1} / ${tl.items.length}`} aria-live="polite" className="min-w-0 flex-1">
              <StepCard step={current} index={safeIndex} large prov={prov[current.id]} />
            </div>
            <Button
              variant="secondary"
              className="w-10 shrink-0 self-center px-0"
              aria-label="다음 단계"
              aria-disabled={atEnd}
              onClick={() => !atEnd && setIndex(safeIndex + 1)}
            >
              <Icon name="chevronRight" size={18} />
            </Button>
          </div>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {safeIndex + 1} / {tl.items.length}
          </p>
        </div>
      )}
      {tl.items.some((s) => s.totalMin == null) && (
        <Alert kind="info" className="mt-4">
          시간이 적혀 있지 않은 단계는 총 소요 시간에서 빠졌어요. 실제로는 이보다 더 걸려요. 이전 단계에서 시간을 적으면 포함돼요.
        </Alert>
      )}
    </section>
  );
}
