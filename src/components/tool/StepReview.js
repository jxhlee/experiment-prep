"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { analyzeReagent, analyzeStep, countSources } from "../../lib/provenance.mjs";
import { reagentIssues, stepIssues } from "../../lib/row-issues.mjs";
import { normalizeName } from "../../lib/chem.mjs";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import SaveControl from "../SaveControl";
import { Alert, Button, Card, IconButton, IssueList, PageHeader, TabPanel, Tabs, buttonClass, cellInputClass } from "../ui";
import CheckStrip from "./CheckStrip";
import { EvidenceQuote } from "./Provenance";
import { focusSoon } from "./focus";
import Stepper from "./Stepper";
import StepReagents from "./StepReagents";

const COLS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]";
const label = "mb-0.5 block text-sm text-ink-muted";
const aiLine = (ai) => (ai ? "border-accent!" : "");

export default function StepReview() {
  const router = useRouter();
  const {
    reagents, setReagents, timeline, setTimeline, newRowId, newStepId,
    analysisMeta, analyzeError, isAnalyzing, analyze,
    prepareResults, isCalculating, markReached, notify,
    methodText, reagentInfo, inventoryIndex,
  } = useExperiment();
  const [tab, setTab] = useState("reagents");
  const [openEvidence, setOpenEvidence] = useState({});

  // 값이 논문 원문에 적혀 있는지 대조한 결과 (원문이 없으면 null)
  const rowAnalysis = useMemo(() => reagents.map((r) => analyzeReagent(r, methodText)), [reagents, methodText]);
  const stepAnalysis = useMemo(() => timeline.map((st) => analyzeStep(st, methodText)), [timeline, methodText]);
  const counts = countSources([...rowAnalysis, ...stepAnalysis]);
  const toggleEvidence = (key) => setOpenEvidence((o) => ({ ...o, [key]: !o[key] }));

  useEffect(() => {
    markReached(2);
  }, [markReached]);

  // 시약 줄마다 그 시약을 쓰는 단계 번호 (AI 나 내가 연결해 둔 것)
  const usedIn = useMemo(() => {
    const map = new Map();
    timeline.forEach((st, i) => (st.reagentIds ?? []).forEach((rid) => map.set(rid, [...(map.get(rid) ?? []), i + 1])));
    return map;
  }, [timeline]);
  const anyLinks = usedIn.size > 0;

  const updateRow = (id, field, value) => setReagents((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addRow = () => {
    const id = newRowId();
    setReagents((rows) => [...rows, { id, name: "", concentration: "", volume: "", userAdded: true }]);
    focusSoon(`reagent-name-${id}`);
  };
  const removeRow = (id, index) => {
    setReagents((rows) => rows.filter((r) => r.id !== id));
    setTimeline((steps) => steps.map((st) => ({ ...st, reagentIds: (st.reagentIds ?? []).filter((rid) => rid !== id) })));
    notify(`시약 ${index + 1}번 줄을 삭제했어요.`);
    focusSoon("add-reagent");
  };

  const updateStep = (id, field, value) => setTimeline((steps) => steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  const newStep = (id) => ({ id, label: "", duration: "", repeat: 1, details: "", isWaiting: false, reagentIds: [], userAdded: true });
  const addStep = () => {
    const id = newStepId();
    setTimeline((steps) => [...steps, newStep(id)]);
    focusSoon(`step-label-${id}`);
  };
  // 중간에 빠진 단계를 넣을 수 있도록, 이 단계 바로 아래에 새 단계를 끼워 넣는다
  const insertStepAfter = (index) => {
    const id = newStepId();
    setTimeline((steps) => [...steps.slice(0, index + 1), newStep(id), ...steps.slice(index + 1)]);
    notify(`${index + 1}단계 아래에 새 단계를 넣었어요.`);
    focusSoon(`step-label-${id}`);
  };
  const moveStep = (id, index, dir) => {
    const to = index + dir;
    if (to < 0 || to >= timeline.length) return;
    setTimeline((steps) => {
      const next = [...steps];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    notify(`${index + 1}단계를 ${dir < 0 ? "위" : "아래"}로 옮겼어요. 이제 ${to + 1}단계예요.`);
    focusSoon(`step-${dir < 0 ? "up" : "down"}-${id}`);
  };
  const toggleStepReagent = (stepId, reagentId) =>
    setTimeline((steps) =>
      steps.map((st) => {
        if (st.id !== stepId) return st;
        const has = (st.reagentIds ?? []).includes(reagentId);
        return { ...st, reagentIds: has ? st.reagentIds.filter((x) => x !== reagentId) : [...(st.reagentIds ?? []), reagentId] };
      }),
    );
  const removeStep = (id, index) => {
    setTimeline((steps) => steps.filter((s) => s.id !== id));
    notify(`${index + 1}단계를 삭제했어요.`);
    focusSoon("add-step");
  };

  async function onCalculate() {
    if (isCalculating) return;
    await prepareResults();
    markReached(3);
    router.push("/new/result");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="확인·수정" description="AI가 읽은 내용이에요. 틀린 곳은 바로 고쳐 주세요." actions={<SaveControl />} />
      <Stepper step={2} />

      {(analysisMeta || analyzeError) && (
        <div className="flex flex-col gap-2 text-sm text-ink-muted">
          {analysisMeta && (
            <p className="flex flex-wrap items-center gap-x-2">
              {analysisMeta.fromCache ? "저장된 분석 결과를 불러왔어요 (AI 호출 없음)" : `${analysisMeta.model || "AI"}로 분석했어요`}
              <Button variant="link" size="sm" aria-disabled={isAnalyzing} onClick={() => !isAnalyzing && analyze({ force: true })}>
                {isAnalyzing ? "분석하는 중…" : "AI로 다시 분석"}
              </Button>
              <span>(고친 내용은 사라져요)</span>
            </p>
          )}
          {analyzeError && <Alert kind="error">{analyzeError.message}</Alert>}
        </div>
      )}

      <Card flush>
        <CheckStrip names={reagents.map((r) => r.name)} counts={counts} hasText={methodText.trim() !== ""} />

        <div className="p-5">
          <Tabs
            label="확인할 내용"
            idPrefix="review"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "reagents", label: "시약", count: reagents.length },
              { id: "steps", label: "실행 단계", count: timeline.length },
            ]}
          />

          <TabPanel idPrefix="review" id="reagents" value={tab} className="pt-4">
            <div aria-hidden="true" className={`hidden gap-x-4 border-b border-line px-1 pb-2 text-sm text-ink-muted md:grid ${COLS}`}>
              <span>시약 이름</span>
              <span>농도</span>
              <span>부피</span>
              <span className="w-[4.75rem]" />
            </div>
            <ul className="divide-y divide-line">
              {reagents.length === 0 && <li className="py-8 text-center text-sm text-ink-muted">시약이 없어요. 아래 버튼으로 추가해 주세요.</li>}
              {reagents.map((row, i) => {
                const a = rowAnalysis[i];
                const issues = reagentIssues({ name: row.name, analysis: a, info: reagentInfo[normalizeName(row.name).key], inventoryIndex, userAdded: row.userAdded });
                const evId = `evidence-reagent-${row.id}`;
                const stepsUsing = usedIn.get(row.id) ?? [];
                const showUsage = row.name.trim() !== "" && (stepsUsing.length > 0 || anyLinks);
                const open = Boolean(openEvidence[`r${row.id}`]);
                return (
                  <li key={row.id} className="py-3">
                    <div role="group" aria-label={`시약 ${i + 1}`} className={`grid grid-cols-2 gap-x-4 gap-y-2 md:items-center ${COLS}`}>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <label htmlFor={`reagent-name-${row.id}`} className={`${label} md:sr-only`}>
                          시약 이름<span className="sr-only"> ({i + 1}번 줄)</span>
                        </label>
                        <input
                          id={`reagent-name-${row.id}`}
                          value={row.name}
                          onChange={(e) => updateRow(row.id, "name", e.target.value)}
                          placeholder="예: NaCl"
                          autoComplete="off"
                          className={`${cellInputClass} ${aiLine(a?.name === "ai")}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`reagent-conc-${row.id}`} className={`${label} md:sr-only`}>
                          농도<span className="sr-only"> ({i + 1}번 줄)</span>
                        </label>
                        <input
                          id={`reagent-conc-${row.id}`}
                          value={row.concentration}
                          onChange={(e) => updateRow(row.id, "concentration", e.target.value)}
                          placeholder="예: 0.9 %"
                          autoComplete="off"
                          className={`${cellInputClass} ${aiLine(a?.concentration === "ai")}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`reagent-vol-${row.id}`} className={`${label} md:sr-only`}>
                          부피<span className="sr-only"> ({i + 1}번 줄)</span>
                        </label>
                        <input
                          id={`reagent-vol-${row.id}`}
                          value={row.volume}
                          onChange={(e) => updateRow(row.id, "volume", e.target.value)}
                          placeholder="예: 500 mL"
                          autoComplete="off"
                          className={`${cellInputClass} ${aiLine(a?.volume === "ai")}`}
                        />
                      </div>
                      <div className="col-span-2 flex justify-end md:col-span-1">
                        {a ? (
                          <IconButton
                            icon="clipboard"
                            label={`${i + 1}번 줄 원문 근거 ${open ? "닫기" : "보기"}`}
                            aria-expanded={open}
                            aria-controls={evId}
                            onClick={() => toggleEvidence(`r${row.id}`)}
                          />
                        ) : (
                          <span className="hidden h-9 w-9 md:block" aria-hidden="true" />
                        )}
                        <IconButton icon="trash" label={`${i + 1}번 줄 삭제`} onClick={() => removeRow(row.id, i)} />
                      </div>
                    </div>
                    {(issues.length > 0 || showUsage || (a && open)) && (
                      <div className="mt-2 flex flex-col gap-2 px-1">
                        <IssueList issues={issues} />
                        {showUsage && (
                          <p className={`text-sm ${stepsUsing.length > 0 ? "text-ink-muted" : "text-warn-ink"}`}>
                            {stepsUsing.length > 0 ? `쓰는 단계: ${stepsUsing.map((n) => `${n}단계`).join(", ")}` : "어느 단계에서 쓰는지 연결하지 않았어요 (「실행 단계」에서 연결)"}
                          </p>
                        )}
                        {a && open && <EvidenceQuote id={evId} evidence={a.evidence} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button id="add-reagent" variant="secondary" size="sm" className="mt-3" onClick={addRow}>
              <Icon name="plus" size={16} />
              시약 추가
            </Button>
          </TabPanel>

          <TabPanel idPrefix="review" id="steps" value={tab} className="pt-4">
            <p className="text-sm text-ink-muted">
              단계 순서가 곧 실험 과정이에요. 빠진 조작은 「아래에 단계 넣기」로 중간에 끼워 넣고, 「쓰는 시약」에서 그 단계에 쓰는 시약을 연결하면 결과의 과정 설명에 들어가요.
              시간이 비어 있는 단계는 총 소요 시간에서 빠져요.
            </p>
            <ol className="mt-2 divide-y divide-line">
              {timeline.length === 0 && <li className="py-8 text-center text-sm text-ink-muted">단계가 없어요. 아래 버튼으로 추가해 주세요.</li>}
              {timeline.map((s, i) => {
                const a = stepAnalysis[i];
                const evId = `evidence-step-${s.id}`;
                const open = Boolean(openEvidence[`s${s.id}`]);
                const issues = stepIssues({ analysis: a, userAdded: s.userAdded });
                return (
                  <li key={s.id} className="py-3">
                    <div role="group" aria-label={`단계 ${i + 1}`} className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_minmax(0,1.4fr)_auto] md:items-end">
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <label htmlFor={`step-label-${s.id}`} className={label}>
                          {i + 1}. 단계 이름
                        </label>
                        <input id={`step-label-${s.id}`} value={s.label} onChange={(e) => updateStep(s.id, "label", e.target.value)} autoComplete="off" className={cellInputClass} />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`step-duration-${s.id}`} className={label}>
                          걸리는 시간
                        </label>
                        <input
                          id={`step-duration-${s.id}`}
                          value={s.duration}
                          onChange={(e) => updateStep(s.id, "duration", e.target.value)}
                          placeholder="예: 30 min"
                          autoComplete="off"
                          className={`${cellInputClass} ${aiLine(a?.duration === "ai")}`}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`step-repeat-${s.id}`} className={label}>
                          반복
                        </label>
                        <input
                          id={`step-repeat-${s.id}`}
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={s.repeat}
                          onChange={(e) => updateStep(s.id, "repeat", e.target.value)}
                          className={`${cellInputClass} ${aiLine(a?.repeat === "ai")}`}
                        />
                      </div>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <label htmlFor={`step-details-${s.id}`} className={label}>
                          내용·조건
                        </label>
                        <input
                          id={`step-details-${s.id}`}
                          value={s.details}
                          onChange={(e) => updateStep(s.id, "details", e.target.value)}
                          placeholder="온도·속도, 무엇을 어떻게"
                          autoComplete="off"
                          className={`${cellInputClass} ${aiLine(a?.details === "ai")}`}
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end">
                        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink md:hidden pointer-coarse:min-h-11">
                          <input type="checkbox" checked={s.isWaiting} onChange={(e) => updateStep(s.id, "isWaiting", e.target.checked)} className="h-5 w-5 accent-brand" />
                          대기 단계
                        </label>
                        {a && (
                          <IconButton
                            icon="clipboard"
                            label={`${i + 1}단계 원문 근거 ${open ? "닫기" : "보기"}`}
                            aria-expanded={open}
                            aria-controls={evId}
                            onClick={() => toggleEvidence(`s${s.id}`)}
                          />
                        )}
                        <IconButton id={`step-up-${s.id}`} icon="arrowUp" label={`${i + 1}단계를 위로`} aria-disabled={i === 0} onClick={() => i > 0 && moveStep(s.id, i, -1)} />
                        <IconButton id={`step-down-${s.id}`} icon="arrowDown" label={`${i + 1}단계를 아래로`} aria-disabled={i === timeline.length - 1} onClick={() => i < timeline.length - 1 && moveStep(s.id, i, 1)} />
                        <IconButton icon="plus" label={`${i + 1}단계 아래에 단계 넣기`} onClick={() => insertStepAfter(i)} />
                        <IconButton icon="trash" label={`${i + 1}단계 삭제`} onClick={() => removeStep(s.id, i)} />
                      </div>
                    </div>
                    <StepReagents
                      stepId={s.id}
                      stepNumber={i + 1}
                      reagents={reagents}
                      selected={s.reagentIds ?? []}
                      onToggle={(rid) => toggleStepReagent(s.id, rid)}
                    />
                    <label className="mt-2 hidden min-h-9 cursor-pointer items-center gap-2 px-1 text-sm text-ink md:flex">
                      <input type="checkbox" checked={s.isWaiting} onChange={(e) => updateStep(s.id, "isWaiting", e.target.checked)} className="h-4 w-4 accent-brand" />
                      대기 단계 <span className="text-ink-muted">(지켜보지 않아도 되는 시간)</span>
                    </label>
                    {(issues.length > 0 || (a && open)) && (
                      <div className="mt-2 flex flex-col gap-2 px-1">
                        <IssueList issues={issues} />
                        {a && open && <EvidenceQuote id={evId} evidence={a.evidence} missing="이 시간이 적힌 문장을 원문에서 찾지 못했어요. 원문과 직접 대조해 주세요." />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button id="add-step" variant="secondary" size="sm" className="mt-3" onClick={addStep}>
              <Icon name="plus" size={16} />
              단계 추가
            </Button>
          </TabPanel>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/new" className={buttonClass({ variant: "ghost" })}>
          <Icon name="arrowLeft" size={16} />
          입력으로
        </Link>
        <Button size="lg" aria-disabled={isCalculating} aria-busy={isCalculating} onClick={onCalculate}>
          {isCalculating ? "계산하는 중…" : "계산하기"}
          <Icon name="arrowRight" size={18} />
        </Button>
      </div>
    </div>
  );
}
