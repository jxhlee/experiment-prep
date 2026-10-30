"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearDraft, loadDraft, saveDraft, sessionStore } from "../lib/draft.mjs";
import {
  computeRow,
  formatAmount,
  mergeResults,
  namesNeedingLookup,
  normalizeName,
  scaleResult,
} from "../lib/chem.mjs";
import { useAuth } from "../lib/use-auth";
import { getSupabase } from "../lib/supabase";
import { defaultTitle, fromRecord, toRecord } from "../lib/experiments.mjs";
import {
  deleteExperiment,
  friendlyDbError,
  libraryToMwMap,
  listExperiments,
  listUserReagents,
  loadExperiment,
  mergeLibrary,
  saveExperiment,
  saveUserReagents,
} from "../lib/db.mjs";
import AccountBar from "../components/AccountBar";
import ExperimentList from "../components/ExperimentList";
import MwOverride from "../components/MwOverride";
import SaveBar from "../components/SaveBar";
import { buildNarrative, buildTimeline, formatMinutes, formatStart } from "../lib/timeline.mjs";
import { ExtractError, MAX_CHARS_OWN_KEY, MAX_CHARS_SERVER } from "../lib/gemini.mjs";
import {
  extractViaOwnKey,
  extractViaServer,
  hashText,
  loadCachedExtraction,
  saveCachedExtraction,
} from "../lib/extract-client.mjs";
import { useSessionPref } from "../lib/use-session-pref";

const SERVICE_NAME = "실험 프렙 (가제)";

// 서비스 API가 한도·혼잡으로 막혔을 때 "내 API 키"로 바꿔 보라고 안내할 오류 종류
const SUGGEST_OWN_KEY = new Set(["quota", "rate", "busy", "timeout", "too-long"]);

let nextRowId = 3;
let nextStepId = 6;

const INITIAL_REAGENTS = [
  { id: 1, name: "NaCl", concentration: "0.9 % (w/v)", volume: "500 mL" },
  { id: 2, name: "Tris-HCl", concentration: "50 mM", volume: "100 mL" },
];

const DUMMY_TIMELINE = [
  { id: 1, label: "시약 계량", duration: "10분", repeat: 1, details: "", isWaiting: false },
  { id: 2, label: "용액 혼합", duration: "5분", repeat: 1, details: "", isWaiting: false },
  { id: 3, label: "가열", duration: "15분", repeat: 1, details: "95 °C", isWaiting: false },
  { id: 4, label: "실온 냉각", duration: "20분", repeat: 1, details: "", isWaiting: true },
  { id: 5, label: "원심분리", duration: "10분", repeat: 1, details: "", isWaiting: true },
];

function describeDuration(item) {
  if (item.totalMin == null) return "시간 미정";
  const rep = item.repeat > 1 ? ` (${formatMinutes(item.perMin)} × ${item.repeat}회)` : "";
  return `${item.approx ? "약 " : ""}${formatMinutes(item.totalMin)}${rep}`;
}

function StepIndicator({ step, onJump }) {
  const labels = ["입력", "AI 추출 결과 확인", "결과"];
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        return (
          <button
            key={label}
            onClick={() => onJump(n)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                active ? "bg-white text-slate-800" : "bg-slate-300 text-white"
              }`}
            >
              {n}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StepOneInput({
  methodText,
  setMethodText,
  scale,
  setScale,
  customScale,
  setCustomScale,
  onAnalyze,
  isAnalyzing,
  analyzeError,
  apiMode,
  setApiMode,
  apiKey,
  setApiKey,
}) {
  const limit = apiMode === "own" ? MAX_CHARS_OWN_KEY : MAX_CHARS_SERVER;
  const length = methodText.trim().length;
  const overLimit = length > limit;
  const keyMissing = apiMode === "own" && apiKey.trim().length < 20;

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="text-center text-2xl font-bold text-slate-800">{SERVICE_NAME}</h1>
      <p className="mt-2 text-center text-slate-500 underline decoration-slate-300">
        어서오세요, 무엇을 도와드릴까요?
      </p>

      <div className="mt-8 rounded-lg bg-slate-800 p-1">
        <textarea
          value={methodText}
          onChange={(e) => setMethodText(e.target.value)}
          placeholder="입력 창 (논문의 Method 부분을 붙여넣어 주세요)"
          rows={10}
          className="w-full resize-y rounded-md bg-slate-800 p-4 text-white placeholder-slate-300 outline-none"
        />
      </div>
      <p className={`mt-1 text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-500"}`}>
        {length.toLocaleString("ko-KR")} / {limit.toLocaleString("ko-KR")}자
        {overLimit && " — 한도를 넘었어요. 합성·준비 부분만 붙여넣어 주세요."}
      </p>

      <div className="mt-3 rounded-lg bg-slate-800 p-4 text-white">
        <p className="mb-2 text-center text-sm">AI 호출 방식</p>
        <div className="flex overflow-hidden rounded-md border border-white/40 text-sm font-medium">
          {[
            ["server", "서비스 API 사용"],
            ["own", "내 Gemini API 키 사용"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setApiMode(mode)}
              className={`flex-1 px-3 py-2 transition-colors ${
                apiMode === mode ? "bg-white text-slate-800" : "text-white hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {apiMode === "server" ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            서비스 운영자의 API를 씁니다. 하루 호출 한도가 있어 한 번에 {MAX_CHARS_SERVER.toLocaleString("ko-KR")}자까지
            분석하고, 느리거나 막히면 다른 모델로 자동 전환합니다. 같은 텍스트는 저장된 결과를 다시 씁니다.
          </p>
        ) : (
          <div className="mt-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Gemini API 키 붙여넣기"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-md bg-slate-700 px-3 text-sm text-white placeholder-slate-300 outline-none focus:bg-slate-600"
            />
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              키는 이 브라우저에서 Google(Gemini)로만 보내고 우리 서버에는 보내지 않습니다. 이 탭을 닫으면 지워집니다.
              내 키의 한도를 쓰므로 {MAX_CHARS_OWN_KEY.toLocaleString("ko-KR")}자까지 분석할 수 있고, 같은 텍스트는 저장된
              결과를 다시 씁니다.
            </p>
          </div>
        )}
      </div>

      {analyzeError && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          <p>{analyzeError.message}</p>
          {apiMode === "server" && SUGGEST_OWN_KEY.has(analyzeError.kind) && (
            <button onClick={() => setApiMode("own")} className="mt-1 font-semibold underline">
              내 Gemini API 키로 분석하기
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <div className="flex-1 rounded-lg bg-slate-800 p-4">
          <p className="mb-3 text-center text-sm text-white">
            실험 규모: ×{customScale || scale || 1}
          </p>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={customScale ? Number(customScale) : scale ?? 1}
            onChange={(e) => {
              setScale(Number(e.target.value));
              setCustomScale("");
            }}
            className="w-full accent-white"
          />
          <div className="mt-3 flex justify-center">
            <input
              type="number"
              min="0"
              step="0.1"
              value={customScale}
              onChange={(e) => {
                setCustomScale(e.target.value);
                setScale(null);
              }}
              placeholder="직접 입력"
              className="h-9 w-32 rounded-md bg-slate-700 px-2 text-sm text-white placeholder-slate-300 outline-none focus:bg-slate-600"
            />
          </div>
        </div>

        <button
          onClick={() => onAnalyze()}
          disabled={!methodText.trim() || isAnalyzing || overLimit || keyMissing}
          title={keyMissing ? "Gemini API 키를 입력해 주세요" : undefined}
          className="rounded-lg bg-slate-800 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isAnalyzing ? "분석 중..." : "분석하기"}
        </button>
      </div>
    </div>
  );
}

function StepTwoReview({
  reagents,
  setReagents,
  timeline,
  setTimeline,
  sigFigs,
  setSigFigs,
  onBack,
  onCalculate,
  isCalculating,
  analysisMeta,
  analyzeError,
  isAnalyzing,
  onReanalyze,
  save,
}) {
  const updateRow = (id, field, value) => {
    setReagents((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    nextRowId += 1;
    setReagents((rows) => [...rows, { id: nextRowId, name: "", concentration: "", volume: "" }]);
  };

  const removeRow = (id) => {
    setReagents((rows) => rows.filter((r) => r.id !== id));
  };

  const updateStep = (id, field, value) => {
    setTimeline((steps) => steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const addStep = () => {
    nextStepId += 1;
    setTimeline((steps) => [
      ...steps,
      { id: nextStepId, label: "", duration: "", repeat: 1, details: "", isWaiting: false },
    ]);
  };

  const removeStep = (id) => {
    setTimeline((steps) => steps.filter((s) => s.id !== id));
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <h1 className="text-2xl font-bold text-slate-800">{SERVICE_NAME}</h1>

      {analysisMeta && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
          <span>
            {analysisMeta.fromCache
              ? "저장된 분석 결과를 불러왔어요 (AI 호출 없음)"
              : `분석 모델: ${analysisMeta.model || "알 수 없음"}`}
          </span>
          <button
            onClick={onReanalyze}
            disabled={isAnalyzing}
            className="font-semibold text-orange-700 underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isAnalyzing ? "분석 중..." : "AI로 다시 분석"}
          </button>
          <span className="text-slate-500">(수정한 내용은 사라져요)</span>
        </div>
      )}
      {analyzeError && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{analyzeError.message}</p>
      )}

      <div className="mt-6 flex flex-col gap-4 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="rounded-lg bg-orange-600 p-4">
          <p className="mb-3 text-sm text-white">
            AI가 분석한 시약이 나오는 부분 (표로 나옴 – 각 표는 시약 이름 / 농도 / 부피 칸으로 되어
            있고, 각각이 전부 수정 가능한 입력칸)
          </p>
          <div className="overflow-x-auto rounded-md bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-orange-100 text-orange-900">
                <tr>
                  <th className="px-3 py-2">시약 이름</th>
                  <th className="px-3 py-2">농도</th>
                  <th className="px-3 py-2">부피</th>
                  <th className="px-3 py-2 text-center">삭제</th>
                </tr>
              </thead>
              <tbody>
                {reagents.map((row) => (
                  <tr key={row.id} className="border-t border-orange-100">
                    <td className="px-2 py-1">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(row.id, "name", e.target.value)}
                        className="w-full rounded px-2 py-1 text-slate-900 outline-none focus:bg-orange-50"
                        placeholder="예: NaCl"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={row.concentration}
                        onChange={(e) => updateRow(row.id, "concentration", e.target.value)}
                        className="w-full rounded px-2 py-1 text-slate-900 outline-none focus:bg-orange-50"
                        placeholder="예: 0.9 %"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={row.volume}
                        onChange={(e) => updateRow(row.id, "volume", e.target.value)}
                        className="w-full rounded px-2 py-1 text-slate-900 outline-none focus:bg-orange-50"
                        placeholder="예: 500 mL"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-orange-400 hover:text-orange-700"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg bg-orange-600 p-4">
          <p className="mb-3 text-sm text-white">
            AI가 분석한 실행 단계 — 시간·반복 횟수·조건·대기 여부를 확인하고 고쳐 주세요. 시간이
            비어 있는 단계는 전체 시간 계산에서 빠집니다.
          </p>
          <div className="flex flex-col gap-2 rounded-md bg-white p-2">
            {timeline.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-slate-500">
                추출된 단계가 없습니다. 아래 버튼으로 직접 추가할 수 있어요.
              </p>
            )}
            {timeline.map((s, i) => (
              <div key={s.id} className="rounded-md border border-orange-100 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-center text-xs font-bold text-orange-700">{i + 1}</span>
                  <input
                    value={s.label}
                    onChange={(e) => updateStep(s.id, "label", e.target.value)}
                    className="min-w-[8rem] flex-1 rounded px-2 py-1 text-sm text-slate-900 outline-none focus:bg-orange-50"
                    placeholder="단계 이름"
                  />
                  <input
                    value={s.duration}
                    onChange={(e) => updateStep(s.id, "duration", e.target.value)}
                    className="w-28 rounded px-2 py-1 text-sm text-slate-900 outline-none focus:bg-orange-50"
                    placeholder="예: 30 min"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    ×
                    <input
                      type="number"
                      min="1"
                      value={s.repeat}
                      onChange={(e) => updateStep(s.id, "repeat", e.target.value)}
                      className="w-12 rounded border border-orange-200 px-1 py-1 text-sm text-slate-900 outline-none focus:bg-orange-50"
                    />
                    회
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={s.isWaiting}
                      onChange={(e) => updateStep(s.id, "isWaiting", e.target.checked)}
                      className="accent-orange-600"
                    />
                    대기
                  </label>
                  <button
                    onClick={() => removeStep(s.id)}
                    className="text-orange-400 hover:text-orange-700"
                    aria-label={`${i + 1}단계 삭제`}
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={s.details}
                  onChange={(e) => updateStep(s.id, "details", e.target.value)}
                  className="mt-1 w-full rounded px-2 py-1 text-xs text-slate-700 outline-none focus:bg-orange-50"
                  placeholder="조건 (온도·속도 등, 없으면 비워 두세요)"
                />
              </div>
            ))}
          </div>
          <button
            onClick={addStep}
            className="mt-3 rounded-md bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30"
          >
            + 단계 추가
          </button>
        </div>
        </div>

        <div className="flex w-full flex-col gap-3 md:w-56">
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="mb-2 text-center text-xs text-white">유효숫자 설정 (좌우 버튼 형식)</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setSigFigs((v) => Math.max(1, v - 1))}
                className="h-8 w-8 rounded bg-slate-700 text-white hover:bg-slate-600"
              >
                −
              </button>
              <span className="w-6 text-center text-white">{sigFigs}</span>
              <button
                onClick={() => setSigFigs((v) => Math.min(6, v + 1))}
                className="h-8 w-8 rounded bg-slate-700 text-white hover:bg-slate-600"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={addRow}
            className="rounded-lg bg-slate-800 py-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            줄 추가 (빠진 시약 직접 넣기)
          </button>

          <button
            onClick={onCalculate}
            disabled={isCalculating}
            className="rounded-lg bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isCalculating ? "계산 중..." : "계산하기"}
          </button>

          {save.configured && <SaveBar save={save} />}

          <button
            onClick={onBack}
            className="rounded-lg border border-slate-300 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            ← 이전으로
          </button>
        </div>
      </div>
    </div>
  );
}

function StepThreeResult({
  reagents,
  timeline,
  mwMap,
  sigFigs,
  setSigFigs,
  scaleFactor,
  setScaleFactor,
  onBack,
  save,
  onSetMw,
}) {
  const [timelineMode, setTimelineMode] = useState("scroll");
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [mergeMode, setMergeMode] = useState(false);

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

  const lastIndex = tl.items.length - 1;
  const current = tl.items[Math.min(timelineIndex, Math.max(0, lastIndex))];
  const goPrev = () => setTimelineIndex((i) => Math.max(0, i - 1));
  const goNext = () => setTimelineIndex((i) => Math.min(lastIndex, i + 1));

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <h1 className="text-2xl font-bold text-slate-800">{SERVICE_NAME}</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-orange-600 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm text-white">
              계량 준비표 – 시약별로 몇 g 혹은 몇 mL 달아야 하는지에 대한 표
              <span className="ml-1 whitespace-nowrap font-semibold">(×{scaleFactor})</span>
            </p>
            <div className="flex overflow-hidden rounded-md border border-white/50 text-xs font-medium">
              <button
                onClick={() => setMergeMode(false)}
                className={`px-2.5 py-1 transition-colors ${
                  !mergeMode ? "bg-white text-orange-700" : "text-white hover:bg-white/10"
                }`}
              >
                개별
              </button>
              <button
                onClick={() => setMergeMode(true)}
                className={`px-2.5 py-1 transition-colors ${
                  mergeMode ? "bg-white text-orange-700" : "text-white hover:bg-white/10"
                }`}
              >
                통합
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-orange-100 text-orange-900">
                <tr>
                  <th className="px-3 py-2">시약</th>
                  <th className="px-3 py-2">{mergeMode ? "총 필요량" : "계량값"}</th>
                </tr>
              </thead>
              <tbody>
                {mergeMode
                  ? mergedRows.map((m) => (
                      <tr key={`${m.name}-${m.dim}-${m.unitLabel ?? ""}`} className="border-t border-orange-100 align-top">
                        <td className="px-3 py-2 text-slate-900">
                          {m.name}
                          {m.rows > 1 && <span className="ml-1 text-xs text-orange-700">({m.rows}곳 합산)</span>}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{formatAmount(m, sigFigs)}</td>
                      </tr>
                    ))
                  : rows.map((r) => (
                      <tr key={r.id} className="border-t border-orange-100 align-top">
                        <td className="px-3 py-2 text-slate-900">{r.name || "(이름 없음)"}</td>
                        <td className="px-3 py-2">
                          {r.res.ok ? (
                            <>
                              <span className="font-semibold text-slate-900">{formatAmount(r.res, sigFigs)}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {r.res.basis}
                                {scaleText}
                              </span>
                              {r.res.notes.map((n) => (
                                <span key={n} className="block text-xs text-amber-700">
                                  ※ {n}
                                </span>
                              ))}
                              {(r.res.mwSource === "PubChem" || r.res.mwSource === "직접 입력") && (
                                <MwOverride editing loggedIn={Boolean(save.user)} onApply={(mw) => onSetMw(r.name, mw)} />
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-red-700">⚠ {r.res.reason}</span>
                              {r.res.code === "not-found" && (
                                <MwOverride loggedIn={Boolean(save.user)} onApply={(mw) => onSetMw(r.name, mw)} />
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {mergeMode && skipped.length > 0 && (
            <p className="mt-2 rounded-md bg-white/15 px-3 py-2 text-xs text-white">
              계산할 수 없어 합산에서 제외됨: {skipped.map((s) => s.name || "(이름 없음)").join(", ")} — 「개별」에서 사유를
              확인하세요.
            </p>
          )}
        </div>

        <div className="rounded-lg bg-orange-600 p-4">
          <p className="mb-2 text-sm font-semibold text-white">실험 타임라인 설명</p>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-white">
            {narrative.length === 0 ? (
              <p>설명할 단계가 없습니다. 2단계에서 실행 단계를 추가해 주세요.</p>
            ) : (
              narrative.map((line, i) => (
                <p key={i} className={i === narrative.length - 1 ? "font-semibold" : undefined}>
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 p-5 shadow-lg ring-2 ring-indigo-300">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
            <span aria-hidden>⏱</span> 실험 타임라인
            {tl.items.length > 0 && (
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
                총 {formatMinutes(tl.totalMin)}
                {tl.unknownCount > 0 && ` (시간 미정 ${tl.unknownCount}단계 제외)`}
              </span>
            )}
          </p>
          <div className="flex overflow-hidden rounded-md border border-white/40 text-xs font-medium">
            <button
              onClick={() => setTimelineMode("scroll")}
              className={`px-3 py-1.5 transition-colors ${
                timelineMode === "scroll"
                  ? "bg-white text-indigo-700"
                  : "bg-transparent text-white hover:bg-white/10"
              }`}
            >
              좌우 스크롤
            </button>
            <button
              onClick={() => setTimelineMode("carousel")}
              className={`px-3 py-1.5 transition-colors ${
                timelineMode === "carousel"
                  ? "bg-white text-indigo-700"
                  : "bg-transparent text-white hover:bg-white/10"
              }`}
            >
              카드 넘기기
            </button>
          </div>
        </div>

        {tl.items.length === 0 ? (
          <p className="rounded-md bg-white p-6 text-center text-sm text-slate-500">
            표시할 타임라인이 없습니다.
          </p>
        ) : timelineMode === "scroll" ? (
          <div className="flex gap-3 overflow-x-auto rounded-md bg-white p-3">
            {tl.items.map((step, i) => (
              <div
                key={step.id ?? i}
                className="flex min-w-[140px] flex-col items-center gap-1 rounded-lg border border-indigo-200 p-3 text-center shadow-sm"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-slate-800">{step.label || "(이름 없음)"}</span>
                <span className="text-xs font-medium text-indigo-700">{describeDuration(step)}</span>
                <span className="text-[11px] text-slate-500">{formatStart(step)}</span>
                {step.isWaiting && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    ⏳ 대기
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-center gap-4 rounded-md bg-white p-6">
              <button
                onClick={goPrev}
                disabled={timelineIndex === 0}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ◀
              </button>

              <div className="flex w-56 flex-col items-center gap-2 rounded-lg border border-indigo-200 p-6 text-center shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {Math.min(timelineIndex, lastIndex) + 1}
                </span>
                <span className="text-base font-semibold text-slate-800">{current.label || "(이름 없음)"}</span>
                <span className="text-sm font-medium text-indigo-700">{describeDuration(current)}</span>
                <span className="text-xs text-slate-500">{formatStart(current)}</span>
                {current.details && <span className="text-xs text-slate-600">{current.details}</span>}
                {current.isWaiting && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    ⏳ 대기
                  </span>
                )}
              </div>

              <button
                onClick={goNext}
                disabled={timelineIndex >= lastIndex}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ▶
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-white/80">
              {Math.min(timelineIndex, lastIndex) + 1} / {tl.items.length}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <div className="flex-1 rounded-lg bg-slate-800 p-3">
          <p className="mb-2 text-center text-xs text-white">계량 준비표 유효숫자 설정 (좌우 버튼 형식)</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setSigFigs((v) => Math.max(1, v - 1))}
              className="h-8 w-8 rounded bg-slate-700 text-white hover:bg-slate-600"
            >
              −
            </button>
            <span className="w-6 text-center text-white">{sigFigs}</span>
            <button
              onClick={() => setSigFigs((v) => Math.min(6, v + 1))}
              className="h-8 w-8 rounded bg-slate-700 text-white hover:bg-slate-600"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 rounded-lg bg-slate-800 p-3">
          <p className="mb-2 text-center text-xs text-white">배수 조절 (슬라이더): ×{scaleFactor}</p>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={scaleFactor}
            onChange={(e) => setScaleFactor(Number(e.target.value))}
            className="w-full accent-white"
          />
        </div>
      </div>

      {save.configured && (
        <div className="mt-4">
          <SaveBar save={save} />
        </div>
      )}

      <button
        onClick={onBack}
        className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
      >
        ← 이전으로
      </button>
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);

  const [methodText, setMethodText] = useState("");
  const [scale, setScale] = useState(1);
  const [customScale, setCustomScale] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [analysisMeta, setAnalysisMeta] = useState(null);
  const [apiMode, setApiMode] = useSessionPref("ep:api-mode", "server");
  const [apiKey, setApiKey] = useSessionPref("ep:api-key", "");

  const [reagents, setReagents] = useState(INITIAL_REAGENTS);
  const [timeline, setTimeline] = useState(DUMMY_TIMELINE);
  const [mwMap, setMwMap] = useState({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [sigFigs, setSigFigs] = useState(3);
  const [scaleFactor, setScaleFactor] = useState(1);

  const router = useRouter();
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [showList, setShowList] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [experiments, setExperiments] = useState({ items: [], loading: false, error: "" });

  // 로그인하면 내 시약 목록(저장해 둔 분자량)을 불러와, 이후 계산에서 PubChem 조회 없이 재사용한다
  useEffect(() => {
    if (!userId) return;
    let active = true;
    listUserReagents(getSupabase())
      .then((rows) => {
        if (active) setMwMap((prev) => mergeLibrary(prev, libraryToMwMap(rows)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  // 로그인은 별도 화면(/login)에서 한다. 하던 작업이 사라지지 않게 이동 직전에 보관하고, 돌아오면 복원한다.
  function goToLogin() {
    saveDraft(sessionStore(), {
      step,
      methodText,
      scale,
      customScale,
      scaleFactor,
      sigFigs,
      saveTitle,
      reagents,
      timeline,
      mwMap,
      analysisMeta,
    });
    router.push("/login");
  }

  useEffect(() => {
    const store = sessionStore();
    const draft = loadDraft(store);
    if (!draft) return;
    Promise.resolve().then(() => {
      setMethodText(draft.methodText);
      setScale(draft.scale);
      setCustomScale(draft.customScale);
      nextRowId = Math.max(1, ...draft.reagents.map((r) => r.id));
      setReagents(draft.reagents.length > 0 ? draft.reagents : [{ id: 1, name: "", concentration: "", volume: "" }]);
      nextStepId = Math.max(0, ...draft.timeline.map((s) => s.id));
      setTimeline(draft.timeline);
      setSigFigs(draft.sigFigs);
      setScaleFactor(draft.scaleFactor);
      setSaveTitle(draft.saveTitle);
      setMwMap(draft.mwMap);
      setAnalysisMeta(draft.analysisMeta);
      setStep(draft.step);
      setRestoredNotice(true);
      clearDraft(store);
    });
  }, []);

  async function loadList() {
    setExperiments((s) => ({ ...s, loading: true, error: "" }));
    try {
      setExperiments({ items: await listExperiments(getSupabase()), loading: false, error: "" });
    } catch (err) {
      setExperiments({ items: [], loading: false, error: friendlyDbError(err) });
    }
  }

  function toggleList() {
    const next = !showList;
    setShowList(next);
    if (next) loadList();
  }

  async function handleSave(asNew = false) {
    if (!auth.user) {
      goToLogin();
      return;
    }
    setSaveStatus({ kind: "saving" });
    try {
      const title = saveTitle.trim() || defaultTitle();
      const record = toRecord({ title, methodText, reagents, steps: timeline, scaleFactor, sigFigs, mwMap });
      const saved = await saveExperiment(getSupabase(), auth.user.id, record, asNew ? null : currentId);
      setCurrentId(saved.id);
      setSaveTitle(title);
      const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      setSaveStatus({ kind: "saved", message: `저장했어요 · ${time}` });
      if (showList) loadList();
    } catch (err) {
      setSaveStatus({ kind: "error", message: friendlyDbError(err) });
    }
  }

  async function handleOpenExperiment(id) {
    setExperiments((s) => ({ ...s, error: "" }));
    try {
      const exp = fromRecord(await loadExperiment(getSupabase(), id));
      setMethodText(exp.methodText);
      nextRowId = Math.max(1, exp.reagents.length);
      setReagents(exp.reagents.length > 0 ? exp.reagents : [{ id: 1, name: "", concentration: "", volume: "" }]);
      nextStepId = exp.steps.length;
      setTimeline(exp.steps);
      setScaleFactor(exp.scaleFactor);
      setSigFigs(exp.sigFigs);
      setSaveTitle(exp.title);
      setCurrentId(exp.id);
      setSaveStatus(null);
      setAnalysisMeta(null);
      setAnalyzeError(null);
      setShowList(false);
      await goToResults(exp.reagents);
    } catch (err) {
      setExperiments((s) => ({ ...s, error: friendlyDbError(err) }));
    }
  }

  async function handleDeleteExperiment(id) {
    try {
      await deleteExperiment(getSupabase(), id);
      if (id === currentId) setCurrentId(null);
      await loadList();
    } catch (err) {
      setExperiments((s) => ({ ...s, error: friendlyDbError(err) }));
    }
  }

  async function handleSignOut() {
    try {
      await auth.signOut();
    } catch {}
    setMwMap({});
    setExperiments({ items: [], loading: false, error: "" });
    setCurrentId(null);
    setSaveStatus(null);
    setShowList(false);
  }

  // 사용자가 분자량을 직접 입력한다. 로그인 상태면 내 시약 목록에도 저장한다.
  function handleSetMw(name, mw) {
    const { key, clean } = normalizeName(name);
    if (!key) return;
    setMwMap((prev) => ({ ...prev, [key]: { mw, source: "user" } }));
    if (userId) {
      saveUserReagents(getSupabase(), userId, [{ key, name: clean || name, mw, source: "user" }], { overwrite: true }).catch(() => {});
    }
  }

  const save = {
    configured: auth.configured,
    user: auth.user,
    title: saveTitle,
    setTitle: setSaveTitle,
    currentId,
    status: saveStatus,
    onSave: handleSave,
    onLogin: goToLogin,
  };

  async function handleAnalyze({ force = false } = {}) {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const text = methodText.trim();
      const hash = await hashText(text);
      let data = force ? null : loadCachedExtraction(hash);
      const fromCache = Boolean(data);

      if (!data) {
        const limit = apiMode === "own" ? MAX_CHARS_OWN_KEY : MAX_CHARS_SERVER;
        if (text.length > limit) {
          throw new ExtractError("too-long", {
            message: `한 번에 ${limit.toLocaleString("ko-KR")}자까지 분석할 수 있어요 (현재 ${text.length.toLocaleString("ko-KR")}자).`,
          });
        }
        if (apiMode === "own") {
          const key = apiKey.trim();
          if (key.length < 20 || /\s/.test(key)) throw new ExtractError("auth", { message: "Gemini API 키를 입력해 주세요." });
          data = await extractViaOwnKey(key, text);
        } else {
          data = await extractViaServer(text);
        }
        saveCachedExtraction(hash, data);
      }

      const extractedReagents = (data.reagents || []).map((r, i) => ({
        id: i + 1,
        name: r.name || "",
        concentration: r.concentration || "",
        volume: r.volume || "",
      }));
      nextRowId = extractedReagents.length;
      setReagents(
        extractedReagents.length > 0
          ? extractedReagents
          : [{ id: 1, name: "", concentration: "", volume: "" }]
      );

      const extractedSteps = (data.steps || []).map((s, i) => ({
        id: i + 1,
        label: s.label || "",
        duration: s.duration || "",
        repeat: s.repeat || 1,
        details: s.details || "",
        isWaiting: Boolean(s.isWaiting),
      }));
      nextStepId = extractedSteps.length;
      setTimeline(extractedSteps);

      setAnalysisMeta({ fromCache, model: data.model || "" });
      setScaleFactor(customScale ? Number(customScale) : scale ?? 1);
      if (!force) {
        // 새로 분석하면 새 실험이다. 불러왔던 실험을 덮어쓰지 않도록 연결을 끊는다.
        setCurrentId(null);
        setSaveStatus(null);
        setSaveTitle("");
      }
      setStep(2);
    } catch (err) {
      setAnalyzeError({ message: err.message || "분석 중 오류가 발생했습니다.", kind: err.kind });
    } finally {
      setIsAnalyzing(false);
    }
  }

  // 분자량이 필요한 시약만 조회해(내 시약 목록에 있으면 조회하지 않는다) 결과 화면으로 간다
  async function goToResults(list) {
    setIsCalculating(true);
    try {
      const targets = namesNeedingLookup(list, mwMap);
      if (targets.length > 0) {
        const found = await Promise.all(
          targets.map(async ({ key, name }) => {
            try {
              const res = await fetch(`/api/mw?name=${encodeURIComponent(name)}`);
              const data = await res.json();
              return { key, name, entry: res.ok ? { mw: data.mw, formula: data.formula, source: "pubchem" } : { notFound: true } };
            } catch {
              return { key, name, entry: { notFound: true } };
            }
          }),
        );
        setMwMap((prev) => ({ ...prev, ...Object.fromEntries(found.map((f) => [f.key, f.entry])) }));
        if (userId) {
          const hits = found
            .filter((f) => f.entry.mw)
            .map((f) => ({ key: f.key, name: f.name, mw: f.entry.mw, formula: f.entry.formula, source: "pubchem" }));
          saveUserReagents(getSupabase(), userId, hits).catch(() => {});
        }
      }
      setStep(3);
    } finally {
      setIsCalculating(false);
    }
  }

  const handleCalculate = () => goToResults(reagents);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 py-10">
      {auth.configured && (
        <AccountBar
          ready={auth.ready}
          user={auth.user}
          listOpen={showList}
          onLogin={goToLogin}
          onToggleList={toggleList}
          onSignOut={handleSignOut}
        />
      )}
      {restoredNotice && (
        <div className="mx-auto w-full max-w-4xl px-4 pb-2">
          <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            <span>하던 작업을 그대로 이어서 보여 드려요.</span>
            <button onClick={() => setRestoredNotice(false)} className="font-semibold text-slate-700 underline">
              닫기
            </button>
          </div>
        </div>
      )}
      {auth.configured && showList && auth.user && (
        <ExperimentList
          items={experiments.items}
          loading={experiments.loading}
          error={experiments.error}
          currentId={currentId}
          onOpen={handleOpenExperiment}
          onDelete={handleDeleteExperiment}
          onClose={() => setShowList(false)}
        />
      )}

      <StepIndicator step={step} onJump={setStep} />

      {step === 1 && (
        <StepOneInput
          methodText={methodText}
          setMethodText={setMethodText}
          scale={scale}
          setScale={setScale}
          customScale={customScale}
          setCustomScale={setCustomScale}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
          analyzeError={analyzeError}
          apiMode={apiMode}
          setApiMode={setApiMode}
          apiKey={apiKey}
          setApiKey={setApiKey}
        />
      )}

      {step === 2 && (
        <StepTwoReview
          reagents={reagents}
          setReagents={setReagents}
          timeline={timeline}
          setTimeline={setTimeline}
          sigFigs={sigFigs}
          setSigFigs={setSigFigs}
          onBack={() => setStep(1)}
          onCalculate={handleCalculate}
          isCalculating={isCalculating}
          analysisMeta={analysisMeta}
          analyzeError={analyzeError}
          isAnalyzing={isAnalyzing}
          onReanalyze={() => handleAnalyze({ force: true })}
          save={save}
        />
      )}

      {step === 3 && (
        <StepThreeResult
          reagents={reagents}
          timeline={timeline}
          mwMap={mwMap}
          sigFigs={sigFigs}
          setSigFigs={setSigFigs}
          scaleFactor={scaleFactor}
          setScaleFactor={setScaleFactor}
          onBack={() => setStep(2)}
          save={save}
          onSetMw={handleSetMw}
        />
      )}
    </div>
  );
}
