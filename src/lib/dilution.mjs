// 같은 시약을 서로 다른 농도로 쓸 때의 희석 계획.
// 농도마다 따로 달아서 만들지 않고, 가장 진한 용액(원액)을 여유 있게 한 번 만든 뒤 C1·V1 = C2·V2 로 나눠 희석하면
// 작은 양을 정확히 달아야 하는 어려움이 줄고 시간도 아낀다. 이 파일은 그 계획을 숫자와 글자로만 만들어 주는 순수 함수라서
// 브라우저 없이 테스트할 수 있다. AI 가 정하는 값은 없다.

import { canonicalKey, computeRow, displayName, findEntry, formatAmount, parseQuantity } from "./chem.mjs";
import { classifyReagent } from "./hazard.mjs";

/** 원액은 필요한 합계보다 이만큼 더 만든다(피펫에 묻는 양·실수 대비) */
export const STOCK_MARGIN = 0.1;
/** 이보다 적은 부피는 피펫으로 정확히 취하기 어렵다(100 µL) */
export const MIN_PIPETTE_ML = 0.1;
/** 이보다 적은 질량을 달아야 하면 오차가 크다(10 mg) */
export const SMALL_WEIGH_G = 0.01;

const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/**
 * 필요한 양에 여유(10%)를 더한 뒤, 계량하기 쉬운 숫자로 올림한 만들 양(mL).
 * 1 mL 이하는 1 mL, 10 mL 이하는 0.5 mL 단위, 100 mL 이하는 5 mL, 500 mL 이하는 10 mL, 2 L 이하는 50 mL, 그 위는 500 mL 단위.
 * 예: 20.25 → 22.3 → 25 mL, 137 → 150.7 → 160 mL.
 */
export function recommendVolume(needMl, margin = STOCK_MARGIN) {
  const want = needMl * (1 + margin);
  if (want <= 1) return 1;
  const step = want <= 10 ? 0.5 : want <= 100 ? 5 : want <= 500 ? 10 : want <= 2000 ? 50 : 500;
  return Math.round(Math.ceil(want / step - 1e-9) * step * 1000) / 1000;
}

const trimNum = (x, sig = 3) => String(Number(x.toPrecision(sig)));

/** 농도 값(내부 단위) → 보여 줄 글자 */
export function formatConc(kind, value, sig = 3) {
  if (kind === "molar") {
    if (value >= 1) return `${trimNum(value, sig)} M`;
    if (value >= 1e-3) return `${trimNum(value * 1e3, sig)} mM`;
    if (value >= 1e-6) return `${trimNum(value * 1e6, sig)} µM`;
    return `${trimNum(value * 1e9, sig)} nM`;
  }
  if (kind === "wv") return `${trimNum(value, sig)} % (w/v)`;
  if (kind === "vv") return `${trimNum(value, sig)} % (v/v)`;
  if (kind === "mass") {
    if (value >= 1) return `${trimNum(value, sig)} g/mL`;
    if (value >= 1e-3) return `${trimNum(value * 1e3, sig)} mg/mL`;
    return `${trimNum(value * 1e6, sig)} µg/mL`;
  }
  return `${trimNum(value, sig)} units/mL`;
}

/** 해석한 농도 → { kind, value } (같은 kind 끼리만 희석할 수 있다). 희석 계산에 쓸 수 없으면 null */
function concentrationOf(parsed, entry) {
  if (!parsed) return null;
  if (parsed.type === "molar") return { kind: "molar", value: parsed.molPerL };
  if (parsed.type === "percent") {
    // chem.mjs 의 계량 계산과 같은 규칙: 기준이 없으면 액체는 v/v, 고체는 w/v
    const basis = parsed.basis ?? (entry?.state === "liquid" ? "vv" : "wv");
    if (basis === "ww") return null;
    return { kind: basis, value: parsed.percent };
  }
  if (parsed.type === "perVolume") return { kind: parsed.dim === "count" ? "units" : "mass", value: parsed.perMl };
  return null;
}

/** 부피 → "25 mL", "250 µL". 플라스크·피펫 크기로 읽으므로 끝의 0 은 붙이지 않는다 */
export function formatVolume(ml, sig = 3) {
  const [v, unit] = ml >= 1000 ? [ml / 1000, "L"] : ml >= 1 ? [ml, "mL"] : ml >= 1e-3 ? [ml * 1e3, "µL"] : [ml * 1e6, "nL"];
  return `${trimNum(v, sig)} ${unit}`;
}

/** 희석 배수 → "200배". 너무 크면 "1×10^10배" */
export function formatFactor(f) {
  if (f < 1e5) return `${trimNum(f, 3)}배`;
  const [m, e] = f.toExponential(1).split("e");
  return `${Number(m)}×10^${Number(e)}배`;
}

const fmtVol = formatVolume;

/**
 * 원액에서 너무 적게(< 100 µL) 취해야 할 때, 원액을 10배·100배·1000배 희석한 중간 용액을 한 번 만들어 쓰는 방법을 찾는다.
 * 중간 용액은 취할 양이 100 µL 이상이 되고, 중간 용액을 만들 때 원액도 100 µL 이상 필요하도록 고른다. 없으면 null.
 */
function planIntermediate({ kind, stockC, targetC, targetMl, sig }) {
  for (const factor of [10, 100, 1000]) {
    const midC = stockC / factor;
    if (midC <= targetC * (1 + 1e-9)) break; // 목표보다 묽어지면 의미가 없다
    const takeMl = (targetMl * targetC) / midC;
    if (takeMl < MIN_PIPETTE_ML) continue;
    const prepMl = Math.max(1, recommendVolume(takeMl)); // 중간 용액은 1 mL 이상(작은 튜브 한 개)으로 만든다
    const stockMl = prepMl / factor;
    if (stockMl < MIN_PIPETTE_ML) continue;
    return {
      factor,
      concText: formatConc(kind, midC, sig),
      stockMl,
      prepMl,
      takeMl,
      stockText: fmtVol(stockMl, sig),
      prepText: fmtVol(prepMl, sig),
      takeText: fmtVol(takeMl, sig),
    };
  }
  return null;
}

/** 그 용액을 어떻게 만드는지, 따라 할 수 있는 순서 글. (화면과 PDF 문서가 같은 글을 쓴다) */
function howSteps(u) {
  if (u.mode === "direct") return [`원액 ${u.takeText}를 그대로 써요.`];
  if (u.mode === "intermediate") {
    const m = u.intermediate;
    return [
      `원액 ${m.stockText}에 용매를 채워 ${m.prepText}로 만들어요 (${m.concText}, ${formatFactor(m.factor)} 희석한 중간 용액).`,
      `그 중간 용액 ${m.takeText}를 취해 ${u.volText}가 되도록 용매를 채워요.`,
    ];
  }
  const steps = [`원액 ${u.takeText}를 취해 ${u.volText}가 되도록 용매를 채워요 (${u.factorText} 희석).`];
  if (u.tooSmall) steps.push("취할 양이 아주 적어요. 마이크로피펫으로 정확히 취하기 어려우면 단계 희석을 하세요.");
  return steps;
}

/**
 * 시약 목록 → 희석 계획.
 * 같은 시약(이름이 달라도 같은 물질이면 같은 시약)을 같은 종류의 농도(몰농도끼리, % w/v 끼리 …)로 서로 다르게 쓰는 경우마다
 * 한 묶음을 만든다. 묶음마다: 원액(가장 진한 농도)을 얼마나 만들지, 다른 농도는 원액에서 얼마를 취해 희석할지.
 *
 * input: { reagents: [{name, concentration, volume}], mwMap, scaleFactor, sigFigs }
 * 반환: { groups: [...] } — 아무 묶음이 없으면 groups 가 빈 배열
 */
export function buildDilutionPlan({ reagents = [], mwMap = {}, scaleFactor = 1, sigFigs = 3 } = {}) {
  const groups = new Map();

  reagents.forEach((row, index) => {
    const name = String(row?.name ?? "").trim();
    const concText = String(row?.concentration ?? "").trim();
    const vol = parseQuantity(row?.volume);
    if (!name || !concText || vol?.type !== "volume" || !(vol.mL > 0)) return;
    const conc = concentrationOf(parseQuantity(concText), findEntry(name));
    if (!conc || !(conc.value > 0)) return;
    const key = `${canonicalKey(name)}|${conc.kind}`;
    const g = groups.get(key) ?? { key, name, kind: conc.kind, uses: [] };
    g.uses.push({ index, name, concText, c: conc.value, volumeMl: vol.mL * scaleFactor });
    groups.set(key, g);
  });

  const out = [];
  for (const g of groups.values()) {
    const stockC = Math.max(...g.uses.map((u) => u.c));
    if (g.uses.every((u) => same(u.c, stockC))) continue; // 농도가 하나뿐이면 희석할 필요가 없다

    const stockUse = g.uses.find((u) => same(u.c, stockC));
    const display = displayName(g.name);
    const uses = g.uses
      .map((u) => {
        const base = { n: u.index + 1, concText: u.concText, volText: fmtVol(u.volumeMl, sigFigs), volumeMl: u.volumeMl, c: u.c };
        if (same(u.c, stockC)) return { ...base, mode: "direct", stockMl: u.volumeMl, takeText: fmtVol(u.volumeMl, sigFigs) };

        const factor = stockC / u.c;
        const takeMl = u.volumeMl / factor;
        const common = {
          ...base,
          factor,
          factorText: formatFactor(factor),
          takeMl,
          takeText: fmtVol(takeMl, sigFigs),
          solventText: fmtVol(u.volumeMl - takeMl, sigFigs),
        };
        if (takeMl >= MIN_PIPETTE_ML) return { ...common, mode: "dilute", stockMl: takeMl };

        const mid = planIntermediate({ kind: g.kind, stockC, targetC: u.c, targetMl: u.volumeMl, sig: sigFigs });
        if (mid) return { ...common, mode: "intermediate", stockMl: mid.stockMl, intermediate: mid };
        return { ...common, mode: "dilute", stockMl: takeMl, tooSmall: true };
      })
      .map((u) => ({ ...u, how: howSteps(u) }))
      .sort((a, b) => b.c - a.c || a.n - b.n);

    const needMl = uses.reduce((sum, u) => sum + u.stockMl, 0);
    const prepMl = recommendVolume(needMl);

    // 원액을 달아서 만드는 양: 이 줄만 따로 계산하는 것과 같은 계산식을 쓴다
    const w = computeRow({ name: stockUse.name, concentration: stockUse.concText, volume: `${prepMl} mL` }, { mwMap });
    const weighing = w.ok
      ? { ok: true, amount: formatAmount(w, sigFigs), basis: w.basis, mw: w.mw ?? null, mwSource: w.mwSource ?? null, notes: w.notes ?? [] }
      : { ok: false, reason: w.reason };

    // 따로 만들면 어떤 점이 불편한지(이 계획을 권하는 이유)
    const why = [];
    for (const u of uses) {
      if (u.mode === "direct") continue;
      const r = computeRow({ name: g.name, concentration: u.concText, volume: `${u.volumeMl} mL` }, { mwMap });
      if (r.ok && r.dim === "mass" && r.value < SMALL_WEIGH_G) {
        why.push(`${u.concText} ${u.volText}를 따로 만들면 ${formatAmount(r, sigFigs)}만 달아야 해서 저울 오차가 커요.`);
      }
    }
    if (uses.some((u) => u.mode === "intermediate")) {
      why.push("원액에서 100 µL보다 적게 취해야 하는 농도가 있어, 원액을 한 번 희석한 중간 용액을 만들어 쓰도록 했어요.");
    }
    if (uses.some((u) => u.tooSmall)) {
      why.push("원액에서 취할 양이 아주 적어요. 마이크로피펫으로 정확히 취하기 어려우면 단계 희석을 하세요.");
    }

    const tags = classifyReagent({ name: g.name }).tags;
    const notes = ["원액과 희석액은 부피 플라스크(또는 눈금 있는 용기)에서 눈금까지 용매를 채워 만드는 것으로 계산했어요."];
    if (tags.includes("acid") || tags.includes("base")) {
      notes.push("산·염기를 희석하면 열이 나요. 용매에 원액을 천천히 넣고(원액에 물을 붓지 않기), 보안경·장갑을 쓰세요.");
    }

    out.push({
      key: g.key,
      name: display,
      concCount: new Set(uses.map((u) => trimNum(u.c, 6))).size, // 따로 만들면 이만큼 계량해야 한다(원액 방식은 1번)
      stock: {
        concText: stockUse.concText,
        needMl,
        needText: fmtVol(needMl, sigFigs),
        prepMl,
        prepText: fmtVol(prepMl, sigFigs),
        marginPct: Math.round((prepMl / needMl - 1) * 100),
        weighing,
      },
      uses,
      why,
      notes,
    });
  }
  return { groups: out };
}
