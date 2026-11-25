// 결과 화면의 내용(계량표·타임라인·폐기 안내)을 한 장의 문서로 묶는다. 화면과 같은 계산을 쓰되, 글자만 돌려주는 순수 함수라서
// 브라우저 없이 테스트할 수 있다. PDF 로 저장하는 일은 화면(ReportView)이 브라우저 인쇄 기능으로 한다.

import { computeRow, formatAmount, mergeResults, normalizeName, scaleResult } from "./chem.mjs";
import { buildDilutionPlan } from "./dilution.mjs";
import { buildProcedure } from "./procedure.mjs";
import { disposalItems, findIncompatibilities } from "./hazard.mjs";
import { analyzeReagent, analyzeStep } from "./provenance.mjs";
import { existenceOf, ghsNote } from "./reagent-status.mjs";
import { reagentIssues, stepIssues } from "./row-issues.mjs";
import { buildTimeline, describeDuration, formatMinutes, formatStart } from "./timeline.mjs";

export const REPORT_TITLE = "실험 준비서";

const pad = (n) => String(n).padStart(2, "0");

/** 2026년 11월 19일 (이 기기의 날짜 기준) */
export function formatDateKo(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** 2026-11-19 */
export function formatDateIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 브라우저가 "PDF로 저장" 할 때 파일 이름으로 쓰는 제목.
 * 파일 이름에 못 쓰는 글자(\ / : * ? " < > |)는 뺀다.
 */
export function reportFileTitle(title, date = new Date()) {
  const clean = String(title ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${clean || REPORT_TITLE} ${formatDateIso(date)}`;
}

const TONE_ORDER = { danger: 0, warn: 1, accent: 2 };

/**
 * 문서에 들어갈 내용을 만든다.
 * input: { title, date, reagents, timeline(실행 단계), mwMap, scaleFactor, sigFigs, methodText, reagentInfo, inventoryIndex }
 */
export function buildReport({
  title = "",
  date = new Date(),
  reagents = [],
  timeline = [],
  mwMap = {},
  scaleFactor = 1,
  sigFigs = 3,
  methodText = "",
  reagentInfo = {},
  inventoryIndex = null,
} = {}) {
  const checks = [];
  const scaleText = scaleFactor === 1 ? "" : ` × ${scaleFactor}배`;

  // 1. 계량 준비표
  const base = [];
  const rows = reagents.map((raw) => {
    const name = String(raw.name ?? "").trim();
    const res = computeRow(raw, { mwMap });
    base.push({ name: raw.name, res });
    const issues = reagentIssues({ name, analysis: analyzeReagent(raw, methodText), info: reagentInfo[normalizeName(name).key], inventoryIndex, userAdded: raw.userAdded });
    const subject = name || "(이름 없음)";
    // "직접 추가" 표시는 확인할 일이 아니라 표의 그 줄에만 붙인다
    for (const issue of issues) if (issue.id !== "user") checks.push({ subject, tone: issue.tone, text: issue.text, hint: issue.hint });

    if (!res.ok) {
      checks.push({ subject, tone: "danger", text: "계량값을 계산하지 못했어요", hint: res.reason });
      return { id: raw.id, name: subject, ok: false, reason: res.reason, issues };
    }
    if (res.mwSource === "PubChem") {
      checks.push({ subject, tone: "warn", text: "분자량을 PubChem에서 조회했어요", hint: "맞는 물질·형태(무수물/수화물)인지 확인하세요" });
    }
    const scaled = scaleResult(res, scaleFactor);
    return {
      id: raw.id,
      name: subject,
      ok: true,
      amount: formatAmount(scaled, sigFigs),
      basis: `${res.basis}${scaleText}`,
      mw: res.mw ?? null,
      mwSource: res.mwSource ?? null,
      notes: res.notes ?? [],
      issues,
    };
  });

  const mergedAll = mergeResults(base).map((m) => ({ name: m.name, amount: formatAmount(scaleResult(m, scaleFactor), sigFigs), rows: m.rows }));
  // 같은 시약이 여러 줄에 나올 때만 합산표가 의미 있다
  const merged = mergedAll.some((m) => m.rows > 1) ? mergedAll : [];

  // 같은 시약을 여러 농도로 쓰면 원액을 만들어 나눠 희석하는 계획
  const dilutions = buildDilutionPlan({ reagents, mwMap, scaleFactor, sigFigs }).groups;

  // 2. 타임라인
  const tl = buildTimeline(timeline);
  // 단계마다 쓰는 시약과 양을 엮은 전체 실험 과정 (직접 추가한 시약·단계 포함)
  const proc = buildProcedure({ reagents, steps: timeline, mwMap, scaleFactor, sigFigs });
  const steps = tl.items.map((item, i) => {
    const issues = stepIssues({ analysis: analyzeStep(item, methodText), userAdded: item.userAdded });
    const label = item.label || "(이름 없음)";
    for (const issue of issues) if (issue.id !== "user") checks.push({ subject: `${i + 1}단계 ${label}`, tone: issue.tone, text: issue.text, hint: issue.hint });
    if (item.totalMin == null) checks.push({ subject: `${i + 1}단계 ${label}`, tone: "warn", text: "소요 시간이 비어 있어요", hint: "총 소요 시간에 포함되지 않았어요" });
    const reagentsUsed = proc.items[i].reagents.map((r) => ({ id: r.id, name: r.name, amount: r.amount, detail: r.detail, userAdded: r.userAdded }));
    return {
      n: i + 1,
      label,
      duration: describeDuration(item),
      start: formatStart(item),
      details: item.details || "",
      waiting: Boolean(item.isWaiting),
      userAdded: Boolean(item.userAdded),
      reagents: reagentsUsed,
      issues,
    };
  });
  const unlinked = proc.unlinked.map((u) => ({ id: u.id, name: u.name, text: u.text }));
  const total = tl.items.length ? { text: formatMinutes(tl.totalMin), unknownCount: tl.unknownCount } : null;

  // 3. 폐기·안전
  const items = disposalItems(reagents, reagentInfo);
  const disposal = {
    items: items.map((i) => ({
      key: i.key,
      name: i.name,
      streamLabel: i.streamLabel,
      tone: i.tone,
      signal: i.signal,
      tip: i.tips[0] ?? "",
      moreTips: i.tips.slice(1),
      hazards: i.hazards,
      note: ghsNote(i.info),
      basis: i.certain ? "정리된 분류표" : `자동 추정 · ${i.basis}`,
      notFound: existenceOf(i.name, i.info)?.kind === "notfound",
    })),
    warnings: findIncompatibilities(items),
    // 유해성(GHS) 정보를 아직 가져오는 중이면 문서가 덜 채워진 것이다
    pending: items.some((i) => i.info?.state === "checking" || (i.info?.state === "found" && i.info.ghsState == null)),
  };

  // 같은 시약이 여러 줄에 나와 똑같은 안내가 반복되면 한 번만 보여 준다
  const seenChecks = new Set();
  for (let i = checks.length - 1; i >= 0; i--) {
    const id = `${checks[i].subject}|${checks[i].text}|${checks[i].hint}`;
    if (seenChecks.has(id)) checks.splice(i, 1);
    else seenChecks.add(id);
  }
  checks.sort((a, b) => (TONE_ORDER[a.tone] ?? 3) - (TONE_ORDER[b.tone] ?? 3));
  // "AI 해석" 표시는 표의 각 줄에 이미 붙어 있으므로, 위쪽 목록에는 행동이 필요한 것만 두고 개수만 알린다
  const aiCount = checks.filter((c) => c.tone === "accent").length;
  const actionable = checks.filter((c) => c.tone !== "accent");

  const summary = [`시약 ${reagents.length}개`, `실험 규모 ×${scaleFactor}`, total ? `총 소요 시간 ${total.text}` : null].filter(Boolean);
  return {
    title: String(title ?? "").trim() || REPORT_TITLE,
    dateText: formatDateKo(date),
    fileTitle: reportFileTitle(title, date),
    scaleFactor,
    summary,
    rows,
    merged,
    dilutions,
    steps,
    unlinked,
    total,
    disposal,
    checks: actionable,
    aiCount,
    isEmpty: reagents.length === 0 && timeline.length === 0,
  };
}
