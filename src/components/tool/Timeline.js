"use client";

import { useState } from "react";
import { formatMinutes, formatStart } from "../../lib/timeline.mjs";
import { Icon } from "../icons";
import { Alert, Badge, Button, CardTitle, Segmented } from "../ui";

function describeDuration(item) {
  if (item.totalMin == null) return "시간 미정";
  const rep = item.repeat > 1 ? ` (${formatMinutes(item.perMin)} × ${item.repeat}회)` : "";
  return `${item.approx ? "약 " : ""}${formatMinutes(item.totalMin)}${rep}`;
}

function StepCard({ step, index, large = false }) {
  return (
    <div className={`flex h-full flex-col gap-1 rounded-xl border border-line bg-surface p-4 ${large ? "items-center text-center" : ""}`}>
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
        {index + 1}
      </span>
      <span className="sr-only">{index + 1}단계</span>
      <p className={`mt-1 font-semibold text-ink ${large ? "text-base" : "text-[15px]"}`}>{step.label || "(이름 없음)"}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
        <Icon name="clock" size={14} />
        {describeDuration(step)}
      </p>
      <p className="text-sm text-ink-muted">{formatStart(step)}</p>
      {step.details && <p className="text-sm text-ink">{step.details}</p>}
      {step.isWaiting && (
        <p className="mt-auto pt-2">
          <Badge tone="warn" icon="hourglass">
            대기 단계
          </Badge>
        </p>
      )}
    </div>
  );
}

export default function Timeline({ tl }) {
  const [mode, setMode] = useState("scroll");
  const [index, setIndex] = useState(0);

  const lastIndex = tl.items.length - 1;
  const safeIndex = Math.min(index, Math.max(0, lastIndex));
  const current = tl.items[safeIndex];
  const atStart = safeIndex <= 0;
  const atEnd = safeIndex >= lastIndex;

  return (
    <section aria-labelledby="timeline-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle id="timeline-heading" icon="clock">
            실험 타임라인
          </CardTitle>
          {tl.items.length > 0 && (
            <p className="mt-0.5 text-sm text-ink-muted">
              총 <span className="font-semibold text-ink">{formatMinutes(tl.totalMin)}</span>
              {tl.unknownCount > 0 && ` (시간 미정 ${tl.unknownCount}단계는 제외)`}
            </p>
          )}
        </div>
        <Segmented
          legend="타임라인 보기 방식"
          hideLegend
          name="timeline-mode"
          value={mode}
          onChange={setMode}
          className="w-full sm:w-64"
          options={[
            { value: "scroll", label: "좌우 스크롤" },
            { value: "carousel", label: "카드 넘기기" },
          ]}
        />
      </div>

      {tl.items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">
          표시할 타임라인이 없어요. 이전 단계에서 실행 단계를 추가해 주세요.
        </p>
      ) : mode === "scroll" ? (
        <div
          role="region"
          aria-label="실험 타임라인 (좌우로 스크롤할 수 있어요)"
          tabIndex={0}
          className="relative mt-4 overflow-x-auto rounded-xl bg-surface-2 p-3"
        >
          <ol className="flex w-max gap-3">
            {tl.items.map((step, i) => (
              <li key={step.id ?? i} className="w-52 shrink-0">
                <StepCard step={step} index={i} />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 sm:p-4">
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
            <div
              role="group"
              aria-roledescription="슬라이드"
              aria-label={`${safeIndex + 1} / ${tl.items.length}`}
              aria-live="polite"
              className="min-w-0 flex-1"
            >
              <StepCard step={current} index={safeIndex} large />
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
        <Alert kind="warn" className="mt-4">
          시간이 비어 있는 단계가 있어요. 이전 단계에서 시간을 적으면 총 소요 시간에 포함돼요.
        </Alert>
      )}
    </section>
  );
}
