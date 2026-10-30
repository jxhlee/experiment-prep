import { computeRow, formatAmount, mergeResults, scaleResult } from "./chem.mjs";
import { buildTimeline } from "./timeline.mjs";

const str = (v) => (typeof v === "string" ? v : "");
const repeatOf = (v) => Math.max(1, Math.floor(Number(v)) || 1);

export function defaultTitle(date = new Date()) {
  return `새 실험 ${date.toISOString().slice(0, 10)}`;
}

/** 저장 시점의 계량 준비표·통합 리스트·타임라인 요약 (불러올 때는 입력값으로 다시 계산한다) */
export function buildResultsSnapshot({ reagents, steps, mwMap = {}, scaleFactor = 1, sigFigs = 3 }) {
  const base = reagents.map((r) => ({ name: r.name, res: computeRow(r, { mwMap }) }));

  const weighing = base.map(({ name, res }) => {
    if (!res.ok) return { name, ok: false, reason: res.reason };
    const scaled = scaleResult(res, scaleFactor);
    return {
      name,
      ok: true,
      dim: res.dim,
      value: scaled.value,
      unitLabel: res.unitLabel ?? null,
      text: formatAmount(scaled, sigFigs),
      basis: res.basis,
      notes: res.notes,
    };
  });

  const merged = mergeResults(base).map((m) => {
    const scaled = scaleResult(m, scaleFactor);
    return { name: m.name, dim: m.dim, value: scaled.value, text: formatAmount(scaled, sigFigs), rows: m.rows };
  });

  const tl = buildTimeline(steps);
  return {
    version: 1,
    scaleFactor,
    sigFigs,
    weighing,
    merged,
    timeline: {
      totalMin: tl.totalMin,
      unknownCount: tl.unknownCount,
      items: tl.items.map(({ label, startMin, totalMin, approx, isWaiting }) => ({ label, startMin, totalMin, approx, isWaiting })),
    },
  };
}

/** 화면 상태 → experiments 테이블 한 줄 (DB의 크기·범위 제한에 맞게 다듬는다) */
export function toRecord({ title, methodText, reagents, steps, scaleFactor, sigFigs, mwMap }) {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? Math.min(scaleFactor, 1000) : 1;
  const sig = Math.min(6, Math.max(1, Math.round(Number(sigFigs)) || 3));
  const cleanReagents = reagents.map((r) => ({
    name: str(r.name),
    concentration: str(r.concentration),
    volume: str(r.volume),
  }));
  const cleanSteps = steps.map((s) => ({
    label: str(s.label),
    duration: str(s.duration),
    repeat: repeatOf(s.repeat),
    details: str(s.details),
    isWaiting: Boolean(s.isWaiting),
  }));
  return {
    title: str(title).trim().slice(0, 120),
    method_text: str(methodText).slice(0, 60000),
    scale_factor: scale,
    sig_figs: sig,
    reagents: cleanReagents,
    steps: cleanSteps,
    results: buildResultsSnapshot({ reagents: cleanReagents, steps: cleanSteps, mwMap, scaleFactor: scale, sigFigs: sig }),
  };
}

/** experiments 테이블 한 줄 → 화면 상태 (표 편집용 id 를 새로 매긴다) */
export function fromRecord(row) {
  return {
    id: row.id,
    title: str(row.title),
    methodText: str(row.method_text),
    scaleFactor: Number(row.scale_factor) > 0 ? Number(row.scale_factor) : 1,
    sigFigs: Math.min(6, Math.max(1, Number(row.sig_figs) || 3)),
    reagents: (Array.isArray(row.reagents) ? row.reagents : []).map((r, i) => ({
      id: i + 1,
      name: str(r?.name),
      concentration: str(r?.concentration),
      volume: str(r?.volume),
    })),
    steps: (Array.isArray(row.steps) ? row.steps : []).map((s, i) => ({
      id: i + 1,
      label: str(s?.label),
      duration: str(s?.duration),
      repeat: repeatOf(s?.repeat),
      details: str(s?.details),
      isWaiting: Boolean(s?.isWaiting),
    })),
  };
}
