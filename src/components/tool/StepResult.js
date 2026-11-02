"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeRow, formatAmount, mergeResults, namesNeedingLookup, scaleResult } from "../../lib/chem.mjs";
import { buildNarrative, buildTimeline, formatMinutes } from "../../lib/timeline.mjs";
import { ScaleControl, SigFigsControl } from "../controls";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import MwOverride from "../MwOverride";
import SaveCard from "../SaveCard";
import { Card, CardTitle, EmptyState, PageHeader, Segmented, Stat, TabPanel, Tabs, buttonClass } from "../ui";
import { focusSoon } from "./focus";
import Stepper from "./Stepper";
import Timeline from "./Timeline";

function Notes({ notes }) {
  return notes.map((n) => (
    <p key={n} className="mt-1.5 flex gap-1.5 rounded-md bg-warn-soft px-2 py-1 text-sm text-warn-ink">
      <Icon name="info" size={14} className="mt-1" />
      <span>{n}</span>
    </p>
  ));
}

export default function StepResult() {
  const {
    reagents, timeline, mwMap, sigFigs, setSigFigs, scaleFactor, setScaleFactor,
    auth, setMw, prepareResults, isCalculating, markReached, hasWork, hydrated,
  } = useExperiment();
  const [tab, setTab] = useState("table");
  const [mergeMode, setMergeMode] = useState(false);

  useEffect(() => {
    markReached(3);
  }, [markReached]);

  // 주소로 바로 들어왔거나 새로 불러온 경우를 위해, 아직 분자량을 못 찾아 본 시약이 있으면 여기서 조회한다
  const needsLookup = namesNeedingLookup(reagents, mwMap).length > 0;
  useEffect(() => {
    if (needsLookup) prepareResults();
  }, [needsLookup, prepareResults]);

  const baseResults = useMemo(
    () => reagents.map((r) => ({ id: r.id, name: r.name, res: computeRow(r, { mwMap }) })),
    [reagents, mwMap],
  );
  const tl = useMemo(() => buildTimeline(timeline), [timeline]);
  const narrative = useMemo(() => buildNarrative(tl), [tl]);

  const rows = baseResults.map((r) => (r.res.ok ? { ...r, res: scaleResult(r.res, scaleFactor) } : r));
  const mergedRows = mergeResults(baseResults).map((m) => scaleResult(m, scaleFactor));
  const skipped = baseResults.filter((r) => !r.res.ok);
  const scaleText = scaleFactor === 1 ? "" : ` × ${scaleFactor}배`;

  // 분자량을 적용하면 이 줄의 모양이 바뀌어 누르던 버튼이 사라지므로, 같은 줄의 이름 칸으로 포커스를 옮긴다
  const applyMw = (row, mw) => {
    setMw(row.name, mw);
    focusSoon(`result-row-${row.id}`);
  };

  if (hydrated && !hasWork) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="계산 결과" />
        <Card>
          <EmptyState
            icon="flask"
            title="아직 계산할 내용이 없어요"
            action={
              <Link href="/new" className={buttonClass()}>
                새 실험 시작하기
              </Link>
            }
          >
            논문 Methods를 붙여넣거나 시약을 직접 입력하면 이곳에 계량표와 타임라인이 나와요.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const loading = isCalculating && needsLookup;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="계산 결과" description="시약별 계량값과 실행 순서를 확인하세요. 규모와 유효숫자는 오른쪽에서 바로 바꿀 수 있어요." />
      <Stepper step={3} />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["시약", `${reagents.length}개`, "beaker"],
          ["실험 규모", `×${scaleFactor}`, "layers"],
          ["유효숫자", `${sigFigs}자리`, "calculator"],
          ["총 소요 시간", tl.items.length > 0 ? formatMinutes(tl.totalMin) : "—", "clock"],
        ].map(([term, value, icon]) => (
          <li key={term}>
            <Stat label={term} value={value} icon={icon} />
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="min-w-0">
          <Tabs
            label="결과 보기"
            idPrefix="result"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "table", label: "계량 준비표", icon: "table", count: reagents.length },
              { id: "timeline", label: "타임라인", icon: "clock", count: tl.items.length },
            ]}
          />

          <TabPanel idPrefix="result" id="table" value={tab} className="pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="max-w-md text-sm text-ink-muted">
                시약별로 몇 g 혹은 몇 mL를 달아야 하는지 보여 줘요. 「통합」은 같은 시약을 한 줄로 합쳐요.
              </p>
              <Segmented
                legend="표 보기 방식"
                hideLegend
                name="merge-mode"
                value={mergeMode ? "merged" : "each"}
                onChange={(v) => setMergeMode(v === "merged")}
                className="w-full sm:w-48"
                options={[
                  { value: "each", label: "개별" },
                  { value: "merged", label: "통합" },
                ]}
              />
            </div>

            {loading ? (
              <p role="status" className="mt-4 rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">
                시약의 분자량을 조회하는 중이에요…
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    계량 준비표, {mergeMode ? "같은 시약을 합친 보기" : "시약별 보기"}, 실험 규모 {scaleFactor}배
                  </caption>
                  <thead className="bg-surface-2 text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        시약
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        {mergeMode ? "총 필요량" : "계량값"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-ink-muted">
                          시약이 없어요. 이전 단계에서 시약을 추가해 주세요.
                        </td>
                      </tr>
                    )}
                    {mergeMode
                      ? mergedRows.map((m) => (
                          <tr key={`${m.name}-${m.dim}-${m.unitLabel ?? ""}`} className="border-t border-line align-top">
                            <th scope="row" className="px-4 py-3 font-medium text-ink">
                              {m.name}
                              {m.rows > 1 && <span className="ml-1.5 text-sm font-normal text-accent">({m.rows}곳 합산)</span>}
                            </th>
                            <td className="px-4 py-3 text-[15px] font-semibold tabular-nums text-ink">{formatAmount(m, sigFigs)}</td>
                          </tr>
                        ))
                      : rows.map((r) => (
                          <tr key={r.id} className="border-t border-line align-top">
                            <th
                              scope="row"
                              id={`result-row-${r.id}`}
                              tabIndex={-1}
                              className="px-4 py-3 font-medium text-ink focus:outline-none focus-visible:outline-2"
                            >
                              {r.name || "(이름 없음)"}
                            </th>
                            <td className="px-4 py-3">
                              {r.res.ok ? (
                                <>
                                  <span className="block text-[15px] font-semibold tabular-nums text-ink">{formatAmount(r.res, sigFigs)}</span>
                                  <span className="mt-0.5 block text-sm text-ink-muted">
                                    {r.res.basis}
                                    {scaleText}
                                  </span>
                                  <Notes notes={r.res.notes} />
                                  {(r.res.mwSource === "PubChem" || r.res.mwSource === "직접 입력") && (
                                    <MwOverride name={r.name} editing loggedIn={Boolean(auth.user)} onApply={(mw) => applyMw(r, mw)} />
                                  )}
                                </>
                              ) : (
                                <>
                                  <p className="flex gap-1.5 font-medium text-danger">
                                    <Icon name="alert" size={16} className="mt-0.5" />
                                    <span>
                                      <span className="sr-only">계산할 수 없어요: </span>
                                      {r.res.reason}
                                    </span>
                                  </p>
                                  {r.res.code === "not-found" && (
                                    <MwOverride name={r.name} loggedIn={Boolean(auth.user)} onApply={(mw) => applyMw(r, mw)} />
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
            {mergeMode && skipped.length > 0 && (
              <p className="mt-3 flex gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">
                <Icon name="alert" size={16} className="mt-0.5" />
                <span>
                  계산할 수 없어 합산에서 제외됨: {skipped.map((s) => s.name || "(이름 없음)").join(", ")} — 「개별」에서 사유를 확인하세요.
                </span>
              </p>
            )}
          </TabPanel>

          <TabPanel idPrefix="result" id="timeline" value={tab} className="flex flex-col gap-6 pt-4">
            <Timeline tl={tl} />
            <section aria-labelledby="narrative-heading">
              <CardTitle id="narrative-heading" icon="list">
                진행 설명
              </CardTitle>
              <div className="mt-3 flex flex-col gap-2.5 rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-ink">
                {narrative.length === 0 ? (
                  <p>설명할 단계가 없어요. 이전 단계에서 실행 단계를 추가해 주세요.</p>
                ) : (
                  narrative.map((line, i) => (
                    <p key={i} className={i === narrative.length - 1 ? "font-semibold" : undefined}>
                      {line}
                    </p>
                  ))
                )}
              </div>
            </section>
          </TabPanel>
        </Card>

        <div className="flex flex-col gap-5">
          <Card as="section" aria-labelledby="adjust-title">
            <CardTitle id="adjust-title" icon="calculator">
              결과 조정
            </CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">바꾸면 표와 설명이 바로 달라져요.</p>
            <div className="mt-3 flex flex-col gap-5">
              <ScaleControl id="scale-result" value={scaleFactor} onChange={setScaleFactor} />
              <SigFigsControl id="sig-result" value={sigFigs} onChange={setSigFigs} />
            </div>
          </Card>
          <SaveCard />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Link href="/new/review" className={buttonClass({ variant: "secondary" })}>
          <Icon name="arrowLeft" size={16} />
          확인·수정으로
        </Link>
        <Link href="/" className={buttonClass({ variant: "ghost" })}>
          홈으로
        </Link>
      </div>
    </div>
  );
}
