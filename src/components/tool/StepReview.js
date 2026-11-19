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

  const updateRow = (id, field, value) => setReagents((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addRow = () => {
    const id = newRowId();
    setReagents((rows) => [...rows, { id, name: "", concentration: "", volume: "" }]);
    focusSoon(`reagent-name-${id}`);
  };
  const removeRow = (id, index) => {
    setReagents((rows) => rows.filter((r) => r.id !== id));
    notify(`시약 ${index + 1}번 줄을 삭제했어요.`);
    focusSoon("add-reagent");
  };

  const updateStep = (id, field, value) => setTimeline((steps) => steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  const addStep = () => {
    const id = newStepId();
    setTimeline((steps) => [...steps, { id, label: "", duration: "", repeat: 1, details: "", isWaiting: false }]);
    focusSoon(`step-label-${id}`);
  };
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
                const issues = reagentIssues({ name: row.name, analysis: a, info: reagentInfo[normalizeName(row.name).key], inventoryIndex });
                const evId = `evidence-reagent-${row.id}`;
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
                    {(issues.length > 0 || (a && open)) && (
                      <div className="mt-2 flex flex-col gap-2 px-1">
                        <IssueList issues={issues} />
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
            <p className="text-sm text-ink-muted">시간이 비어 있는 단계는 총 소요 시간에서 빠져요. 단계 이름은 AI가 한국어로 요약한 말이에요.</p>
            <ol className="mt-2 divide-y divide-line">
              {timeline.length === 0 && <li className="py-8 text-center text-sm text-ink-muted">단계가 없어요. 아래 버튼으로 추가해 주세요.</li>}
              {timeline.map((s, i) => {
                const a = stepAnalysis[i];
                const evId = `evidence-step-${s.id}`;
                const open = Boolean(openEvidence[`s${s.id}`]);
                const issues = stepIssues({ analysis: a });
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
                          조건
                        </label>
                        <input
                          id={`step-details-${s.id}`}
                          value={s.details}
                          onChange={(e) => updateStep(s.id, "details", e.target.value)}
                          placeholder="온도·속도 등"
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
                        <IconButton icon="trash" label={`${i + 1}단계 삭제`} onClick={() => removeStep(s.id, i)} />
                      </div>
                    </div>
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
