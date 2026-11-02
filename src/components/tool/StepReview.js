"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import SaveCard from "../SaveCard";
import { Alert, Badge, Button, Card, CardTitle, PageHeader, TabPanel, Tabs, buttonClass, inputClass } from "../ui";
import { focusSoon } from "./focus";
import Stepper from "./Stepper";

const REAGENT_COLS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto] md:items-end md:gap-3";
const labelClass = "mb-1 block text-sm font-medium text-ink md:sr-only";
const miniLabel = "mb-1 block text-sm font-medium text-ink";

export default function StepReview() {
  const router = useRouter();
  const {
    reagents, setReagents, timeline, setTimeline, newRowId, newStepId,
    analysisMeta, analyzeError, isAnalyzing, analyze,
    prepareResults, isCalculating, markReached, notify,
  } = useExperiment();
  const [tab, setTab] = useState("reagents");

  useEffect(() => {
    markReached(2);
  }, [markReached]);

  const updateRow = (id, field, value) => {
    setReagents((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
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

  const updateStep = (id, field, value) => {
    setTimeline((steps) => steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };
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
    <div className="flex flex-col gap-5">
      <PageHeader title="추출 결과 확인·수정" description="AI가 읽어 낸 시약과 실행 단계예요. 틀리거나 빠진 곳은 직접 고쳐 주세요. 모든 칸을 고칠 수 있어요." />
      <Stepper step={2} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="min-w-0">
          <Tabs
            label="확인할 내용"
            idPrefix="review"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "reagents", label: "시약", icon: "beaker", count: reagents.length },
              { id: "steps", label: "실행 단계", icon: "list", count: timeline.length },
            ]}
          />

          <TabPanel idPrefix="review" id="reagents" value={tab} className="pt-4">
            <p className="text-sm text-ink-muted">농도와 부피가 있으면 필요한 양을 계산해요. 농도 칸에 양만 적혀 있어도 괜찮아요.</p>
            <div aria-hidden="true" className={`mt-3 hidden px-3 text-sm text-ink-muted md:grid ${REAGENT_COLS}`}>
              <span>시약 이름</span>
              <span>농도</span>
              <span>부피</span>
              <span className="w-[4.75rem]" />
            </div>
            <ul className="mt-2 flex flex-col gap-2.5">
              {reagents.length === 0 && (
                <li className="rounded-lg border border-dashed border-line-strong p-4 text-center text-sm text-ink-muted">
                  시약이 없어요. 아래 버튼으로 한 줄 추가해 주세요.
                </li>
              )}
              {reagents.map((row, i) => (
                <li key={row.id}>
                  <fieldset className={`grid grid-cols-2 gap-2.5 rounded-lg border border-line p-3 ${REAGENT_COLS}`}>
                    <legend className="px-1 text-sm font-medium text-ink-muted md:sr-only">시약 {i + 1}</legend>
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <label htmlFor={`reagent-name-${row.id}`} className={labelClass}>
                        시약 이름<span className="sr-only"> ({i + 1}번 줄)</span>
                      </label>
                      <input
                        id={`reagent-name-${row.id}`}
                        value={row.name}
                        onChange={(e) => updateRow(row.id, "name", e.target.value)}
                        placeholder="예: NaCl"
                        autoComplete="off"
                        className={inputClass}
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`reagent-conc-${row.id}`} className={labelClass}>
                        농도<span className="sr-only"> ({i + 1}번 줄)</span>
                      </label>
                      <input
                        id={`reagent-conc-${row.id}`}
                        value={row.concentration}
                        onChange={(e) => updateRow(row.id, "concentration", e.target.value)}
                        placeholder="예: 0.9 %"
                        autoComplete="off"
                        className={inputClass}
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`reagent-vol-${row.id}`} className={labelClass}>
                        부피<span className="sr-only"> ({i + 1}번 줄)</span>
                      </label>
                      <input
                        id={`reagent-vol-${row.id}`}
                        value={row.volume}
                        onChange={(e) => updateRow(row.id, "volume", e.target.value)}
                        placeholder="예: 500 mL"
                        autoComplete="off"
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <Button
                        variant="secondary"
                        className="w-full md:w-[4.75rem]"
                        aria-label={`시약 ${i + 1}번 줄 삭제`}
                        onClick={() => removeRow(row.id, i)}
                      >
                        <Icon name="trash" size={16} />
                        삭제
                      </Button>
                    </div>
                  </fieldset>
                </li>
              ))}
            </ul>
            <Button id="add-reagent" variant="secondary" className="mt-3" onClick={addRow}>
              <Icon name="plus" size={16} />
              시약 한 줄 추가
            </Button>
          </TabPanel>

          <TabPanel idPrefix="review" id="steps" value={tab} className="pt-4">
            <p className="text-sm text-ink-muted">시간이 비어 있는 단계는 전체 소요 시간 계산에서 빠져요.</p>
            <ol className="mt-3 flex flex-col gap-2.5">
              {timeline.length === 0 && (
                <li className="rounded-lg border border-dashed border-line-strong p-4 text-center text-sm text-ink-muted">
                  추출된 단계가 없어요. 아래 버튼으로 직접 추가할 수 있어요.
                </li>
              )}
              {timeline.map((s, i) => (
                <li key={s.id}>
                  <fieldset className="rounded-lg border border-line p-3">
                    <legend className="px-1 text-sm font-medium text-ink-muted">단계 {i + 1}</legend>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_6rem]">
                      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                        <label htmlFor={`step-label-${s.id}`} className={miniLabel}>
                          단계 이름
                        </label>
                        <input
                          id={`step-label-${s.id}`}
                          value={s.label}
                          onChange={(e) => updateStep(s.id, "label", e.target.value)}
                          autoComplete="off"
                          className={inputClass}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`step-duration-${s.id}`} className={miniLabel}>
                          걸리는 시간
                        </label>
                        <input
                          id={`step-duration-${s.id}`}
                          value={s.duration}
                          onChange={(e) => updateStep(s.id, "duration", e.target.value)}
                          placeholder="예: 30 min"
                          autoComplete="off"
                          className={inputClass}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`step-repeat-${s.id}`} className={miniLabel}>
                          반복 횟수
                        </label>
                        <input
                          id={`step-repeat-${s.id}`}
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={s.repeat}
                          onChange={(e) => updateStep(s.id, "repeat", e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                        <label htmlFor={`step-details-${s.id}`} className={miniLabel}>
                          조건 <span className="font-normal text-ink-muted">(온도·속도 등, 없으면 비워 두세요)</span>
                        </label>
                        <input
                          id={`step-details-${s.id}`}
                          value={s.details}
                          onChange={(e) => updateStep(s.id, "details", e.target.value)}
                          autoComplete="off"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink pointer-coarse:min-h-11">
                        <input
                          type="checkbox"
                          checked={s.isWaiting}
                          onChange={(e) => updateStep(s.id, "isWaiting", e.target.checked)}
                          className="h-5 w-5 shrink-0 accent-brand"
                        />
                        <span>
                          대기 단계 <span className="text-ink-muted">(지켜보지 않아도 되는 시간)</span>
                        </span>
                      </label>
                      <Button variant="secondary" size="sm" aria-label={`${i + 1}단계 삭제`} onClick={() => removeStep(s.id, i)}>
                        <Icon name="trash" size={16} />
                        삭제
                      </Button>
                    </div>
                  </fieldset>
                </li>
              ))}
            </ol>
            <Button id="add-step" variant="secondary" className="mt-3" onClick={addStep}>
              <Icon name="plus" size={16} />
              단계 추가
            </Button>
          </TabPanel>
        </Card>

        <div className="flex flex-col gap-5">
          <Card as="section" aria-labelledby="meta-title">
            <CardTitle id="meta-title" icon="sparkles">
              분석 정보
            </CardTitle>
            <div className="mt-3 text-sm">
              {analysisMeta ? (
                <>
                  {analysisMeta.fromCache ? (
                    <Badge icon="check">저장된 결과 · AI 호출 없음</Badge>
                  ) : (
                    <p className="text-ink-muted">
                      분석 모델 <span className="font-medium text-ink">{analysisMeta.model || "알 수 없음"}</span>
                    </p>
                  )}
                  <Button variant="secondary" size="sm" className="mt-3 w-full" aria-disabled={isAnalyzing} onClick={() => !isAnalyzing && analyze({ force: true })}>
                    <Icon name="refresh" size={16} />
                    {isAnalyzing ? "분석하는 중…" : "AI로 다시 분석"}
                  </Button>
                  <p className="mt-2 text-ink-muted">다시 분석하면 지금까지 고친 내용은 사라져요.</p>
                </>
              ) : (
                <p className="text-ink-muted">직접 입력한 내용이에요. AI 분석은 거치지 않았어요.</p>
              )}
            </div>
            {analyzeError && (
              <Alert kind="error" className="mt-3">
                {analyzeError.message}
              </Alert>
            )}
          </Card>
          <SaveCard />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Link href="/new" className={buttonClass({ variant: "secondary" })}>
          <Icon name="arrowLeft" size={16} />
          입력으로
        </Link>
        <Button size="lg" aria-disabled={isCalculating} aria-busy={isCalculating} onClick={onCalculate}>
          <Icon name="calculator" size={18} />
          {isCalculating ? "계산하는 중…" : "계산하기"}
        </Button>
      </div>
    </div>
  );
}
