"use client";

import Link from "next/link";
import { Icon } from "../icons";
import { useExperiment } from "../ExperimentProvider";

const STEPS = [
  { n: 1, label: "입력", href: "/new" },
  { n: 2, label: "확인·수정", href: "/new/review" },
  { n: 3, label: "결과", href: "/new/result" },
];

// 지금 단계는 aria-current="step" 으로 알리고, 아직 가 본 적 없는 단계는 링크가 아니라 글자로만 보여 준다.
export default function Stepper({ step }) {
  const { reached } = useExperiment();
  return (
    <nav aria-label="진행 단계">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {STEPS.map((s, i) => {
          const current = s.n === step;
          const done = s.n < step;
          const reachable = s.n <= reached;
          const body = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  current ? "bg-brand text-brand-ink" : done ? "bg-surface-2 text-ink" : "border border-line-strong text-ink-muted"
                }`}
              >
                {done ? <Icon name="check" size={14} /> : s.n}
              </span>
              <span className={`text-sm ${current ? "font-semibold text-ink" : reachable ? "font-medium text-ink" : "text-ink-muted"}`}>
                {s.label}
                <span className="sr-only">{current ? " (현재 단계)" : done ? " (완료)" : reachable ? " (이동할 수 있어요)" : " (아직 진행 전)"}</span>
              </span>
            </>
          );
          const box = "inline-flex min-h-10 items-center gap-2 rounded-lg px-1 pointer-coarse:min-h-11";
          return (
            <li key={s.n} className="flex items-center gap-2">
              {reachable && !current ? (
                <Link href={s.href} className={`${box} no-underline hover:bg-surface-2`}>
                  {body}
                </Link>
              ) : (
                <span aria-current={current ? "step" : undefined} className={box}>
                  {body}
                </span>
              )}
              {i < STEPS.length - 1 && <span aria-hidden="true" className="h-px w-5 bg-line-strong sm:w-8" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
