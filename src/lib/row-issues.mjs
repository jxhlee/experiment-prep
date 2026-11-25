// 화면을 어지럽히지 않도록, 시약·단계 한 줄에서 사용자가 신경 써야 하는 것만 모은다.
// 정상(원문과 일치, 보유 중, 확인됨)인 것은 돌려주지 않는다 — 요약은 화면 위쪽의 점검 줄이 맡는다.

import { checkInventory } from "./inventory.mjs";
import { existenceOf } from "./reagent-status.mjs";

/** 시약 한 줄의 주의 사항: 구매 요망 > 못 찾음 > 다른 형태 > AI 해석 순서 */
export function reagentIssues({ name, analysis = null, info = undefined, inventoryIndex = null, userAdded = false }) {
  const out = [];
  if (!String(name ?? "").trim()) return out;

  const inv = checkInventory(name, inventoryIndex);
  if (inv?.status === "missing") out.push({ id: "missing", tone: "danger", icon: "alert", text: "구매 요망", hint: "보유 시약 목록에 없어요" });
  if (existenceOf(name, info)?.kind === "notfound") {
    out.push({ id: "notfound", tone: "danger", icon: "alert", text: "PubChem에서 못 찾음", hint: "이름이 틀렸거나 시약이 아닐 수 있어요" });
  }
  if (inv?.status === "variant") {
    out.push({ id: "variant", tone: "warn", icon: "alert", text: "다른 형태 보유", hint: `목록: ${inv.matched.slice(0, 2).join(", ")}. 시약병의 형태를 확인하세요` });
  }
  if (analysis?.overall === "ai") {
    out.push({ id: "ai", tone: "accent", icon: "sparkles", text: `AI 해석 · ${analysis.aiFields.join("·")}`, hint: "원문에서 그대로 찾지 못한 값이에요. 원문과 대조하세요" });
  }
  if (userAdded) out.push({ id: "user", tone: "neutral", icon: "pencil", text: "직접 추가", hint: "내가 추가한 시약이에요" });
  return out;
}

/** 실행 단계 한 줄의 주의 사항: 시간·반복·조건이 원문에서 그대로 찾아지지 않을 때만 */
export function stepIssues({ analysis = null, userAdded = false }) {
  const out = [];
  if (analysis?.overall === "ai") {
    out.push({ id: "ai", tone: "accent", icon: "sparkles", text: `AI 해석 · ${analysis.aiFields.join("·")}`, hint: "원문에서 그대로 찾지 못한 값이에요. 원문과 대조하세요" });
  }
  if (userAdded) out.push({ id: "user", tone: "neutral", icon: "pencil", text: "직접 추가", hint: "내가 추가한 단계예요" });
  return out;
}
