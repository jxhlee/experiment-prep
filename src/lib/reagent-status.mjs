// "이 이름이 실제로 있는 시약인가"를 화면에 보여 줄 모양으로 정리한다.
import { findEntry, isMixtureName } from "./chem.mjs";

export const pubchemUrl = (cid) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
export const pubchemSafetyUrl = (cid) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}#section=Safety-and-Hazards`;
export const KOSHA_MSDS_URL = "https://msds.kosha.or.kr";

/**
 * 시약 이름과 PubChem 확인 결과(info)로 존재 여부 표시를 만든다. 이름이 비어 있으면 null.
 * kind: builtin | mixture | found | notfound | checking | error | unchecked
 */
export function existenceOf(name, info) {
  const n = String(name ?? "").trim();
  if (!n) return null;
  if (findEntry(n)) return { kind: "builtin", tone: "ok", text: "분자량 DB에 있는 시약이에요" };
  if (isMixtureName(n)) return { kind: "mixture", tone: "neutral", text: "혼합 용액이라 시약 하나로 확인할 수 없어요" };
  switch (info?.state) {
    case "found":
      return { kind: "found", tone: "ok", text: "PubChem에서 확인했어요", detail: [info.title, info.formula].filter(Boolean).join(" · "), cid: info.cid };
    case "notfound":
      return { kind: "notfound", tone: "danger", text: "PubChem에서 찾지 못했어요 — 이름이 틀렸는지 확인하세요" };
    case "checking":
      return { kind: "checking", tone: "neutral", text: "확인하는 중…" };
    case "error":
      return { kind: "error", tone: "warn", text: "확인하지 못했어요 — 다시 시도해 보세요" };
    default:
      return { kind: "unchecked", tone: "neutral", text: "아직 확인하지 않았어요" };
  }
}

/** 시약 목록의 확인 현황 */
export function summarizeExistence(names, infoByKey, keyOf) {
  const out = { builtin: 0, found: 0, notfound: 0, pending: 0, mixture: 0 };
  const seen = new Set();
  for (const name of names) {
    const key = keyOf(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const e = existenceOf(name, infoByKey[key]);
    if (!e) continue;
    if (e.kind === "builtin") out.builtin += 1;
    else if (e.kind === "found") out.found += 1;
    else if (e.kind === "notfound") out.notfound += 1;
    else if (e.kind === "mixture") out.mixture += 1;
    else out.pending += 1;
  }
  return out;
}

/** PubChem 유해성(GHS) 확인 결과가 비어 있거나 실패했을 때 사람이 읽을 안내. 보여 줄 말이 없으면 빈 문자열 */
export function ghsNote(info) {
  const g = info?.ghs;
  if (info?.ghsState === "error") return "유해성 정보를 가져오지 못했어요.";
  if (info?.state === "checking" || !info || info.ghsState == null) return "";
  if (!g) return "PubChem에 GHS 정보가 없어요.";
  if (g.hazards.length === 0 && g.notHazardousShare != null && g.notHazardousShare >= 0.5) {
    return `신고의 ${Math.round(g.notHazardousShare * 100)}%가 GHS 위험 물질이 아니라고 보고했어요.`;
  }
  if (g.hazards.length === 0) return "합의된 유해 분류가 없어요.";
  return "";
}
