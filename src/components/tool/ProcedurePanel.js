"use client";

import { USER_ADDED_LABEL } from "../../lib/procedure.mjs";
import { Icon } from "../icons";
import { Alert, Badge, Disclosure } from "../ui";

/**
 * 결과 화면의 「실험 과정」: 단계마다 쓰는 시약과 양, 시작 시점, 조건을 엮어 처음부터 끝까지 보여 준다.
 * 직접 추가한 시약·단계에는 표시가 붙고, 어느 단계에도 연결되지 않은 시약은 따로 알려 준다.
 */
export default function ProcedurePanel({ procedure, scaleFactor }) {
  const { items, unlinked, total, summary, lines } = procedure;

  return (
    <section aria-labelledby="procedure-heading">
      <h2 id="procedure-heading" className="text-[15px] font-semibold text-ink">
        실험 과정
      </h2>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">설명할 단계가 없어요. 이전 단계에서 실행 단계를 추가해 주세요.</p>
      ) : (
        <>
          <p className="mt-0.5 text-sm text-ink-muted">
            단계마다 쓰는 시약과 양을 엮었어요{scaleFactor !== 1 ? ` (실험 규모 ×${scaleFactor} 반영)` : ""}.
            {summary.userReagents + summary.userSteps > 0 && (
              <span> 직접 추가한 시약 {summary.userReagents}개, 단계 {summary.userSteps}개도 함께 들어 있어요.</span>
            )}
          </p>

          <ol className="mt-3 divide-y divide-line">
            {items.map((it) => (
              <li key={it.id ?? it.n} className="flex gap-3 py-3">
                <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                  {it.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium text-ink">
                    <span className="sr-only">{it.n}단계. </span>
                    {it.label}
                    {it.userAdded && <Badge icon="pencil">{USER_ADDED_LABEL}</Badge>}
                    {it.waiting && <Badge>기다리는 단계</Badge>}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {it.start} · {it.timeKnown ? it.duration : "시간 미기재"}
                  </p>
                  {it.reagents.length > 0 && (
                    <ul aria-label={`${it.n}단계에서 쓰는 시약`} className="mt-1.5 flex flex-wrap gap-1.5">
                      {it.reagents.map((r) => (
                        <li key={r.id} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm text-ink">
                          {r.name}
                          {r.amount && <span className="ml-1.5 font-medium tabular-nums">{r.amount}</span>}
                          {!r.amount && r.detail && <span className="ml-1.5 text-ink-muted">{r.detail}</span>}
                          {r.userAdded && (
                            <span className="ml-1.5 text-ink-muted">
                              <span aria-hidden="true">✎</span>
                              <span className="sr-only"> ({USER_ADDED_LABEL})</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {it.details && <p className="mt-1 text-sm text-ink-muted">{it.details}</p>}
                </div>
              </li>
            ))}
          </ol>

          {total && (
            <p className="mt-1 text-sm text-ink">
              전체 약 <span className="font-semibold">{total.text}</span>
              {total.unknownCount > 0 && <span className="text-ink-muted"> (시간이 적혀 있지 않은 {total.unknownCount}단계 제외)</span>}
            </p>
          )}

          {unlinked.length > 0 && (
            <Alert kind="info" className="mt-4">
              <p className="font-medium">어느 단계에서 쓰는지 연결하지 않은 시약 {unlinked.length}개</p>
              <p className="mt-0.5">
                {unlinked.map((u) => u.text).join(", ")}. 「확인·수정」의 「실행 단계」에서 쓰는 단계에 연결하면 이 과정 설명에 들어가요.
              </p>
            </Alert>
          )}

          <Disclosure summary="줄글로 보기" className="mt-3">
            <ol className="flex flex-col gap-2 leading-relaxed">
              {lines.map((line, i) => (
                <li key={i} className={i >= items.length ? "font-medium text-ink" : ""}>
                  {line}
                </li>
              ))}
            </ol>
          </Disclosure>
          <p className="mt-3 flex gap-1.5 text-sm text-ink-muted">
            <Icon name="info" size={16} className="mt-0.5" />
            <span>
              시약 {summary.reagents}개 중 {summary.linked}개가 단계에 연결돼 있어요. AI가 연결한 것은 틀릴 수 있으니 확인·수정에서 고칠 수 있어요.
            </span>
          </p>
        </>
      )}
    </section>
  );
}
