"use client";

import { Icon } from "../icons";
import { Badge, Disclosure } from "../ui";

/** 결과 화면의 「희석 계획」 탭: 같은 시약을 여러 농도로 쓸 때, 원액을 한 번에 만들어 나눠 희석하는 방법 */
export default function DilutionPanel({ groups }) {
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">같은 시약을 서로 다른 농도로 쓰는 곳이 없어서 희석 계획이 필요 없어요.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-sm text-ink-muted">
        <p>
          같은 시약을 농도만 다르게 여러 번 쓴다면, 농도마다 따로 달아 만들지 말고 가장 진한 용액(원액)을 한 번에 넉넉히 만든 뒤 나눠서 희석하면 간편해요.
          계량은 한 번이고, 아주 적은 양을 정확히 달아야 하는 부담도 줄어요.
        </p>
        <Disclosure summary="계산 방식" className="mt-1">
          희석량은 C₁V₁ = C₂V₂ (원액 농도 × 취할 양 = 만들 농도 × 만들 부피)로 구해요. 원액은 필요한 양을 모두 더한 뒤 10%를 더 잡고, 계량하기 쉬운 숫자로 올림했어요(예: 22.3 mL → 25 mL).
          원액에서 100 µL보다 적게 취해야 하면 한 번 희석한 중간 용액을 거치도록 했어요.
        </Disclosure>
      </div>

      {groups.map((g, gi) => (
        <section key={g.key} aria-labelledby={`dilution-${gi}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={`dilution-${gi}`} className="text-[15px] font-semibold text-ink">
              {g.name}
            </h2>
            <Badge tone="neutral">농도 {g.concCount}가지</Badge>
            <span className="text-sm text-ink-muted">따로 만들면 계량 {g.concCount}번 → 원액으로 1번</span>
          </div>

          <ol className="mt-3 flex flex-col gap-5">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                1
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  <span className="sr-only">1단계. </span>원액 준비
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">
                  {g.stock.concText} {g.name} {g.stock.prepText}
                </p>
                <p className="text-sm text-ink-muted">
                  쓸 양 합계 {g.stock.needText}에 여유 {g.stock.marginPct}%를 더해 {g.stock.prepText}로 만들어요.
                </p>
                {g.stock.weighing.ok ? (
                  <p className="mt-1 text-sm text-ink">
                    필요한 시약 <span className="font-semibold tabular-nums">{g.stock.weighing.amount}</span>
                    <span className="text-ink-muted"> · {g.stock.weighing.basis}</span>
                  </p>
                ) : (
                  <p className="mt-1 flex gap-1.5 text-sm text-warn-ink">
                    <Icon name="alert" size={16} className="mt-0.5" />
                    <span>
                      <span className="sr-only">주의: </span>원액에 필요한 시약량은 계산하지 못했어요 — {g.stock.weighing.reason}
                    </span>
                  </p>
                )}
              </div>
            </li>

            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                2
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  <span className="sr-only">2단계. </span>나눠서 쓰기
                </p>
                <ul className="mt-1 divide-y divide-line">
                  {g.uses.map((u) => (
                    <li key={`${u.n}-${u.concText}`} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-medium tabular-nums text-ink">
                          {u.concText} · {u.volText}
                        </span>
                        <Badge tone={u.mode === "direct" ? "neutral" : "accent"}>{u.mode === "direct" ? "원액 그대로" : u.mode === "intermediate" ? "중간 용액" : "희석"}</Badge>
                      </div>
                      <ul className="mt-1 flex flex-col gap-0.5 text-sm leading-relaxed text-ink-muted">
                        {u.how.map((line, i) => (
                          <li key={i}>{u.how.length > 1 ? `${i + 1}) ${line}` : line}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          </ol>

          {g.why.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1">
              {g.why.map((w) => (
                <li key={w} className="flex gap-1.5 text-sm text-ink-muted">
                  <Icon name="info" size={16} className="mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
            {g.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
