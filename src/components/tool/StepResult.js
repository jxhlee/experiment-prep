"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeRow, formatAmount, mergeResults, namesNeedingLookup, normalizeName, scaleResult } from "../../lib/chem.mjs";
import { analyzeReagent, analyzeStep } from "../../lib/provenance.mjs";
import { buildDilutionPlan } from "../../lib/dilution.mjs";
import { reagentIssues } from "../../lib/row-issues.mjs";
import { buildProcedure } from "../../lib/procedure.mjs";
import { buildTimeline, formatMinutes } from "../../lib/timeline.mjs";
import { ScaleControl, SigFigsControl } from "../controls";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import MwPicker from "../MwPicker";
import SaveControl from "../SaveControl";
import { Card, Disclosure, EmptyState, IssueList, PageHeader, Segmented, TabPanel, Tabs, buttonClass } from "../ui";
import DilutionPanel from "./DilutionPanel";
import DisposalPanel from "./DisposalPanel";
import ProcedurePanel from "./ProcedurePanel";
import { EvidenceQuote } from "./Provenance";
import { focusSoon } from "./focus";
import Stepper from "./Stepper";
import Timeline from "./Timeline";

export default function StepResult() {
  const {
    reagents, timeline, mwMap, sigFigs, setSigFigs, scaleFactor, setScaleFactor,
    auth, setMw, prepareResults, isCalculating, markReached, hasWork, hydrated,
    methodText, reagentInfo, checkReagents, inventoryIndex,
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

  // 시약이 실제로 있는 물질인지 PubChem 에서 확인한다 (화면은 기다리지 않고, 확인되는 대로 표시한다)
  const namesSig = reagents.map((r) => r.name.trim()).filter(Boolean).join("|");
  useEffect(() => {
    if (hydrated) checkReagents();
  }, [hydrated, namesSig, checkReagents]);

  const rowAnalysis = useMemo(() => reagents.map((r) => analyzeReagent(r, methodText)), [reagents, methodText]);
  const stepProv = useMemo(() => {
    const out = {};
    for (const st of timeline) {
      const a = analyzeStep(st, methodText);
      if (a) out[st.id] = a;
    }
    return out;
  }, [timeline, methodText]);

  const baseResults = useMemo(
    () => reagents.map((r) => ({ id: r.id, name: r.name, res: computeRow(r, { mwMap }) })),
    [reagents, mwMap],
  );
  const dilution = useMemo(() => buildDilutionPlan({ reagents, mwMap, scaleFactor, sigFigs }), [reagents, mwMap, scaleFactor, sigFigs]);
  const tl = useMemo(() => buildTimeline(timeline), [timeline]);
  const procedure = useMemo(() => buildProcedure({ reagents, steps: timeline, mwMap, scaleFactor, sigFigs }), [reagents, timeline, mwMap, scaleFactor, sigFigs]);

  const rows = baseResults.map((r) => (r.res.ok ? { ...r, res: scaleResult(r.res, scaleFactor) } : r));
  const mergedRows = mergeResults(baseResults).map((m) => scaleResult(m, scaleFactor));
  const skipped = baseResults.filter((r) => !r.res.ok);
  const scaleText = scaleFactor === 1 ? "" : ` × ${scaleFactor}배`;
  const hasDilution = dilution.groups.length > 0;
  const dilutionNames = dilution.groups.map((g) => g.name).join(", ");
  // 희석 계획이 없어졌는데 그 탭을 보고 있었다면 계량표로 돌아간다
  const activeTab = tab === "dilution" && !hasDilution ? "table" : tab;

  // 분자량을 적용하면 이 줄의 모양이 바뀌어 누르던 버튼이 사라지므로, 같은 줄의 이름 칸으로 포커스를 옮긴다
  const applyMw = (row, mw, form = "") => {
    setMw(row.name, mw, form);
    focusSoon(`result-row-${row.id}`);
  };

  if (hydrated && !hasWork) {
    return (
      <div className="flex flex-col gap-6">
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
  const summary = [`시약 ${reagents.length}개`, `실험 규모 ×${scaleFactor}`, tl.items.length > 0 ? `총 소요 시간 ${formatMinutes(tl.totalMin)}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="계산 결과"
        description={summary}
        actions={
          <>
            <Link href="/new/result/report" className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Icon name="download" size={16} />
              PDF로 저장
            </Link>
            <SaveControl />
          </>
        }
      />
      <Stepper step={3} />

      <Card flush>
        <div className="p-5">
          <Tabs
            label="결과 보기"
            idPrefix="result"
            value={activeTab}
            onChange={setTab}
            tabs={[
              { id: "table", label: "계량 준비표", count: reagents.length },
              ...(hasDilution ? [{ id: "dilution", label: "희석 계획", count: dilution.groups.length }] : []),
              { id: "timeline", label: "실험 과정", count: tl.items.length },
              { id: "disposal", label: "폐기·안전" },
            ]}
          />

          <TabPanel idPrefix="result" id="table" value={activeTab} className="pt-5">
            <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
              <div className="w-full sm:w-64">
                <ScaleControl id="scale-result" value={scaleFactor} onChange={setScaleFactor} />
              </div>
              <SigFigsControl id="sig-result" value={sigFigs} onChange={setSigFigs} />
              <Segmented
                legend="표 보기 방식"
                hideLegend
                name="merge-mode"
                value={mergeMode ? "merged" : "each"}
                onChange={(v) => setMergeMode(v === "merged")}
                className="w-full sm:ml-auto sm:w-40"
                options={[
                  { value: "each", label: "개별" },
                  { value: "merged", label: "통합" },
                ]}
              />
            </div>

            {hasDilution && !loading && (
              <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                <Icon name="beaker" size={16} />
                <span>{dilutionNames}은(는) 농도가 여러 가지예요. 원액을 한 번에 만들어 나눠 희석하면 간편해요.</span>
                <button
                  type="button"
                  className={buttonClass({ variant: "link", size: "sm" })}
                  onClick={() => {
                    setTab("dilution");
                    focusSoon("result-tab-dilution");
                  }}
                >
                  희석 계획 보기
                </button>
              </p>
            )}

            {loading ? (
              <p role="status" className="mt-5 py-8 text-center text-sm text-ink-muted">
                시약의 분자량을 조회하는 중이에요…
              </p>
            ) : (
              <table className="mt-5 w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  계량 준비표, {mergeMode ? "같은 시약을 합친 보기" : "시약별 보기"}, 실험 규모 {scaleFactor}배
                </caption>
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th scope="col" className="w-2/5 py-2 pr-4 font-normal sm:w-1/3">
                      시약
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      {mergeMode ? "총 필요량" : "계량값"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-ink-muted">
                        시약이 없어요. 이전 단계에서 시약을 추가해 주세요.
                      </td>
                    </tr>
                  )}
                  {mergeMode
                    ? mergedRows.map((m) => (
                        <tr key={`${m.name}-${m.dim}-${m.unitLabel ?? ""}`} className="align-top">
                          <th scope="row" className="py-3 pr-4 font-medium text-ink">
                            {m.name}
                            {m.rows > 1 && <span className="ml-1.5 text-sm font-normal text-ink-muted">({m.rows}곳 합산)</span>}
                          </th>
                          <td className="py-3 text-[17px] font-semibold tabular-nums text-ink">{formatAmount(m, sigFigs)}</td>
                        </tr>
                      ))
                    : rows.map((r, idx) => {
                        const a = rowAnalysis[idx];
                        const issues = reagentIssues({ name: r.name, analysis: a, info: reagentInfo[normalizeName(r.name).key], inventoryIndex, userAdded: reagents[idx]?.userAdded });
                        const needsDetail = r.res.ok && (r.res.notes.length > 0 || a?.overall === "ai");
                        return (
                          <tr key={r.id} className="align-top">
                            <th
                              scope="row"
                              id={`result-row-${r.id}`}
                              tabIndex={-1}
                              className="py-3 pr-4 font-medium text-ink focus:outline-none focus-visible:outline-2"
                            >
                              {r.name || "(이름 없음)"}
                            </th>
                            <td className="py-3">
                              {r.res.ok ? (
                                <>
                                  <span className="block text-[17px] font-semibold tabular-nums text-ink">{formatAmount(r.res, sigFigs)}</span>
                                  <span className="mt-0.5 block text-sm text-ink-muted">
                                    {r.res.basis}
                                    {scaleText}
                                  </span>
                                </>
                              ) : (
                                <p className="flex gap-1.5 font-medium text-danger">
                                  <Icon name="alert" size={16} className="mt-0.5" />
                                  <span>
                                    <span className="sr-only">계산할 수 없어요: </span>
                                    {r.res.reason}
                                  </span>
                                </p>
                              )}
                              <IssueList issues={issues} className="mt-1.5" />
                              {r.res.ok && r.res.mw != null && (
                                <MwPicker name={r.name} currentMw={r.res.mw} loggedIn={Boolean(auth.user)} onApply={(mw, form) => applyMw(r, mw, form)} />
                              )}
                              {!r.res.ok && r.res.code === "not-found" && (
                                <MwPicker name={r.name} notFound loggedIn={Boolean(auth.user)} onApply={(mw, form) => applyMw(r, mw, form)} />
                              )}
                              {needsDetail && (
                                <Disclosure summary={r.res.notes.length > 0 && a ? "참고 · 원문 근거" : r.res.notes.length > 0 ? "참고" : "원문 근거"}>
                                  <div className="flex flex-col gap-2">
                                    {r.res.notes.map((n) => (
                                      <p key={n}>· {n}</p>
                                    ))}
                                    {a && <EvidenceQuote evidence={a.evidence} />}
                                  </div>
                                </Disclosure>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            )}
            {mergeMode && skipped.length > 0 && (
              <p className="mt-3 text-sm text-ink-muted">
                계산할 수 없어 합산에서 제외됨: {skipped.map((s) => s.name || "(이름 없음)").join(", ")} — 「개별」에서 사유를 확인하세요.
              </p>
            )}
          </TabPanel>

          <TabPanel idPrefix="result" id="dilution" value={activeTab} className="pt-5">
            {hasDilution && <DilutionPanel groups={dilution.groups} />}
          </TabPanel>

          <TabPanel idPrefix="result" id="timeline" value={activeTab} className="flex flex-col gap-8 pt-5">
            <Timeline tl={tl} prov={stepProv} />
            <ProcedurePanel procedure={procedure} scaleFactor={scaleFactor} />
          </TabPanel>

          <TabPanel idPrefix="result" id="disposal" value={activeTab} className="pt-5">
            {activeTab === "disposal" && <DisposalPanel />}
          </TabPanel>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Link href="/new/review" className={buttonClass({ variant: "ghost" })}>
          <Icon name="arrowLeft" size={16} />
          확인·수정으로
        </Link>
        <p className="max-w-md text-sm text-ink-muted">AI가 읽은 값은 틀릴 수 있어요. 실험 전에 논문 원문과 꼭 대조해 주세요.</p>
      </div>
    </div>
  );
}
