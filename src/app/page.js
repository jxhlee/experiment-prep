"use client";

import { useState } from "react";

const SERVICE_NAME = "실험 프렙 (가제)";
const PRESET_SCALES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SIG_FIGS = [1, 2, 3, 4, 5, 6];

let nextRowId = 3;

const INITIAL_REAGENTS = [
  { id: 1, name: "NaCl", concentration: "0.9 % (w/v)", volume: "500 mL" },
  { id: 2, name: "Tris-HCl", concentration: "50 mM", volume: "100 mL" },
];

const DUMMY_TIMELINE = [
  { label: "시약 계량", duration: "10분" },
  { label: "용액 혼합", duration: "5분" },
  { label: "가열 (95°C)", duration: "15분" },
  { label: "대기 (실온 냉각)", duration: "20분" },
  { label: "원심분리", duration: "10분" },
];

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

function StepOneInput({ methodText, setMethodText, scale, setScale, customScale, setCustomScale, onAnalyze }) {
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

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <div className="flex-1 rounded-lg bg-slate-800 p-4">
          <p className="mb-3 text-center text-sm text-white">
            실험 규모 – 숫자 선택 (1~10 선택지 + 직접 입력 칸 1개)
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {PRESET_SCALES.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setScale(n);
                  setCustomScale("");
                }}
                className={`h-9 w-9 rounded-md text-sm font-medium transition-colors ${
                  scale === n
                    ? "bg-white text-slate-800"
                    : "bg-slate-700 text-white hover:bg-slate-600"
                }`}
              >
                {n}
              </button>
            ))}
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
              className="h-9 w-24 rounded-md bg-slate-700 px-2 text-sm text-white placeholder-slate-300 outline-none focus:bg-slate-600"
            />
          </div>
        </div>

        <button
          onClick={onAnalyze}
          disabled={!methodText.trim()}
          className="rounded-lg bg-slate-800 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          분석하기
        </button>
      </div>
    </div>
  );
}

function StepTwoReview({ reagents, setReagents, sigFigs, setSigFigs, onBack, onCalculate }) {
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <h1 className="text-2xl font-bold text-slate-800">{SERVICE_NAME}</h1>

      <div className="mt-6 flex flex-col gap-4 md:flex-row">
        <div className="flex-1 rounded-lg bg-orange-600 p-4">
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
                        className="w-full rounded px-2 py-1 outline-none focus:bg-orange-50"
                        placeholder="예: NaCl"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={row.concentration}
                        onChange={(e) => updateRow(row.id, "concentration", e.target.value)}
                        className="w-full rounded px-2 py-1 outline-none focus:bg-orange-50"
                        placeholder="예: 0.9 %"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={row.volume}
                        onChange={(e) => updateRow(row.id, "volume", e.target.value)}
                        className="w-full rounded px-2 py-1 outline-none focus:bg-orange-50"
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

        <div className="flex w-full flex-col gap-3 md:w-56">
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="mb-2 text-center text-xs text-white">유효숫자 설정 (버튼식)</p>
            <div className="flex flex-wrap justify-center gap-1">
              {SIG_FIGS.map((n) => (
                <button
                  key={n}
                  onClick={() => setSigFigs(n)}
                  className={`h-7 w-7 rounded text-xs font-medium ${
                    sigFigs === n
                      ? "bg-white text-slate-800"
                      : "bg-slate-700 text-white hover:bg-slate-600"
                  }`}
                >
                  {n}
                </button>
              ))}
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
            className="rounded-lg bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            계산하기
          </button>

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

function StepThreeResult({ reagents, sigFigs, setSigFigs, scaleFactor, setScaleFactor, onBack }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <h1 className="text-2xl font-bold text-slate-800">{SERVICE_NAME}</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-orange-600 p-4">
          <p className="mb-3 text-sm text-white">
            계량 준비표 – 시약별로 몇 g 혹은 몇 mL 달아야 하는지에 대한 표
          </p>
          <div className="overflow-x-auto rounded-md bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-orange-100 text-orange-900">
                <tr>
                  <th className="px-3 py-2">시약</th>
                  <th className="px-3 py-2">계량값</th>
                </tr>
              </thead>
              <tbody>
                {reagents.map((r) => (
                  <tr key={r.id} className="border-t border-orange-100">
                    <td className="px-3 py-2">{r.name || "(이름 없음)"}</td>
                    <td className="px-3 py-2 text-slate-400">— (계산 결과 예정)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-orange-600 p-4">
            <p className="mb-3 text-sm text-white">실험 타임라인 (좌우 스크롤 가능하게)</p>
            <div className="flex gap-3 overflow-x-auto rounded-md bg-white p-3">
              {DUMMY_TIMELINE.map((step, i) => (
                <div
                  key={i}
                  className="flex min-w-[110px] flex-col items-center rounded-md border border-orange-200 p-3 text-center"
                >
                  <span className="text-sm font-medium text-slate-700">{step.label}</span>
                  <span className="mt-1 text-xs text-slate-400">{step.duration}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-orange-600 p-4">
            <p className="text-sm text-white">
              실험 타임라인에 대한 설명 (각각의 항목에 대해서 줄글로) — 추후 각 단계별 상세 설명이
              여기에 표시됩니다.
            </p>
          </div>
        </div>
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

  const [reagents, setReagents] = useState(INITIAL_REAGENTS);
  const [sigFigs, setSigFigs] = useState(3);
  const [scaleFactor, setScaleFactor] = useState(1);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 py-10">
      <StepIndicator step={step} onJump={setStep} />

      {step === 1 && (
        <StepOneInput
          methodText={methodText}
          setMethodText={setMethodText}
          scale={scale}
          setScale={setScale}
          customScale={customScale}
          setCustomScale={setCustomScale}
          onAnalyze={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepTwoReview
          reagents={reagents}
          setReagents={setReagents}
          sigFigs={sigFigs}
          setSigFigs={setSigFigs}
          onBack={() => setStep(1)}
          onCalculate={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepThreeResult
          reagents={reagents}
          sigFigs={sigFigs}
          setSigFigs={setSigFigs}
          scaleFactor={scaleFactor}
          setScaleFactor={setScaleFactor}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}
