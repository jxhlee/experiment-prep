// 「전체 실험 과정」: 실행 단계마다 어떤 시약을 얼마나 쓰는지를 엮어서 처음부터 끝까지 설명한다.
// 사용자가 확인·수정 단계에서 직접 넣은 시약·단계도 똑같이 반영하고, 어느 단계에도 연결되지 않은 시약은 따로 모아 빠뜨리지 않는다.
// 글자만 돌려주는 순수 함수라서 브라우저 없이 테스트할 수 있다. AI 가 정하는 값은 없다.

import { computeRow, formatAmount, parseQuantity, scaleResult } from "./chem.mjs";
import { formatVolume } from "./dilution.mjs";
import { buildTimeline, describeDuration, formatMinutes, startPhrase } from "./timeline.mjs";

const USER_TAG = "직접 추가";

/**
 * 시약 한 줄 → 과정 설명에 쓸 말.
 * 계산할 수 있으면 "NaOH 3.20 g (2 M, 40 mL 용액)", 계산할 수 없으면 적힌 농도·부피를 그대로 "primary antibody (1:1000)".
 */
export function reagentPhrase(raw, { mwMap = {}, scaleFactor = 1, sigFigs = 3 } = {}) {
  const name = String(raw?.name ?? "").trim() || "(이름 없음)";
  const conc = String(raw?.concentration ?? "").trim();
  const volText = String(raw?.volume ?? "").trim();
  const userAdded = Boolean(raw?.userAdded);
  const res = computeRow(raw, { mwMap });

  let amount = "";
  let detail = "";
  if (res.ok) {
    amount = formatAmount(scaleResult(res, scaleFactor), sigFigs);
    const vol = parseQuantity(volText);
    const scaledVol = vol?.type === "volume" ? formatVolume(vol.mL * scaleFactor, sigFigs) : "";
    const concParsed = conc ? parseQuantity(conc) : null;
    if (conc && scaledVol && concParsed) {
      detail = concParsed.type === "mole" || concParsed.type === "mass" ? `${conc}, ${scaledVol}에 녹임` : `${conc}, ${scaledVol} 용액`;
    } else if (conc) detail = conc;
  } else {
    detail = [conc, volText].filter(Boolean).join(", ");
  }

  const body = amount ? `${name} ${amount}${detail ? ` (${detail})` : ""}` : detail ? `${name} (${detail})` : name;
  return { id: raw?.id, name, amount, detail, ok: res.ok, userAdded, text: userAdded ? `${body} [${USER_TAG}]` : body };
}

/**
 * 시약·단계 → 전체 실험 과정.
 * 반환: {
 *   items: [{ n, id, label, userAdded, start, duration, repeat, details, waiting, timeKnown, reagents: [phrase], sentence }],
 *   unlinked: [phrase],      // 이름은 있지만 어느 단계에도 연결되지 않은 시약
 *   total: { text, unknownCount } | null,
 *   summary: { reagents, linked, userReagents, userSteps },
 *   lines: [string]           // items 의 문장 + 마무리 문장들(화면·문서 어디서든 그대로 읽을 수 있는 글)
 * }
 */
export function buildProcedure({ reagents = [], steps = [], mwMap = {}, scaleFactor = 1, sigFigs = 3 } = {}) {
  const opts = { mwMap, scaleFactor, sigFigs };
  const phrases = new Map(reagents.map((r) => [r.id, reagentPhrase(r, opts)]));
  const tl = buildTimeline(steps);
  const used = new Set();

  const items = tl.items.map((it, i) => {
    const linked = [...new Set(Array.isArray(it.reagentIds) ? it.reagentIds : [])].map((id) => phrases.get(id)).filter(Boolean);
    linked.forEach((p) => used.add(p.id));
    const label = it.label || "(이름 없음)";
    const userAdded = Boolean(it.userAdded);
    const timeKnown = it.totalMin != null;
    const start = startPhrase(it);

    let sentence = `${i + 1}단계 「${label}」${userAdded ? ` [${USER_TAG}]` : ""}: `;
    if (timeKnown) {
      const rep = it.repeat > 1 ? ` (${formatMinutes(it.perMin)} × ${it.repeat}회)` : "";
      sentence += `${start} 진행하며 ${it.approx ? "약 " : ""}${formatMinutes(it.totalMin)}${rep} 걸립니다${it.approx ? "(추정값)" : ""}.`;
    } else {
      sentence += `${start} 진행합니다(소요 시간이 적혀 있지 않아 전체 시간에서 제외).`;
    }
    if (linked.length > 0) sentence += ` 쓰는 시약은 ${linked.map((p) => p.text).join(", ")}입니다.`;
    if (it.details) sentence += ` 내용: ${it.details}.`;
    const next = tl.items[i + 1];
    if (it.isWaiting && next) {
      const nextNames = [...new Set((next.reagentIds ?? []).map((id) => phrases.get(id)?.name).filter(Boolean))];
      sentence += ` 이 단계는 기다리는 시간이므로, 그 사이에 다음 단계 「${next.label || "(이름 없음)"}」에 쓸 ${nextNames.length > 0 ? `시약(${nextNames.join(", ")})과 기구` : "기구와 시약"}를 미리 준비해 두세요.`;
    }

    return {
      n: i + 1,
      id: it.id,
      label,
      userAdded,
      start,
      duration: describeDuration(it),
      repeat: it.repeat,
      details: it.details || "",
      waiting: Boolean(it.isWaiting),
      timeKnown,
      reagents: linked,
      sentence,
    };
  });

  const named = reagents.filter((r) => String(r?.name ?? "").trim() !== "");
  const unlinked = named.filter((r) => !used.has(r.id)).map((r) => phrases.get(r.id));
  const total = tl.items.length > 0 ? { text: formatMinutes(tl.totalMin), unknownCount: tl.unknownCount } : null;

  const lines = items.map((x) => x.sentence);
  if (total) {
    const rest = total.unknownCount ? ` (시간이 적혀 있지 않은 ${total.unknownCount}개 단계는 제외)` : "";
    lines.push(`전체 실험은 약 ${total.text} 걸립니다${rest}.`);
  }
  if (unlinked.length > 0) {
    lines.push(`어느 단계에서 쓰는지 연결하지 않은 시약: ${unlinked.map((p) => p.text).join(", ")}. 「확인·수정」에서 단계에 연결하면 과정 설명에 들어가요.`);
  }

  return {
    items,
    unlinked,
    total,
    summary: {
      reagents: named.length,
      linked: named.length - unlinked.length,
      userReagents: named.filter((r) => r.userAdded).length,
      userSteps: steps.filter((s) => s.userAdded).length,
    },
    lines,
  };
}

/** 화면에서 "직접 추가" 표시에 같은 글을 쓰도록 내보낸다 */
export const USER_ADDED_LABEL = USER_TAG;
