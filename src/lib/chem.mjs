const MASS_G = { kg: 1000, g: 1, mg: 1e-3, ug: 1e-6, ng: 1e-9 };
const VOL_ML = { l: 1000, ml: 1, ul: 1e-3 };
const MOLE_MOL = { mol: 1, mmol: 1e-3, umol: 1e-6, nmol: 1e-9 };
const MOLAR = { M: 1, mM: 1e-3, uM: 1e-6, nM: 1e-9, pM: 1e-12 };
const COUNT_UNIT = /^(u|units?|iu)$/i;

// 내장 분자량 DB. 목록에 없는 시약은 PubChem(/api/mw)에서 조회한다.
const DB_ENTRIES = [
  { display: "NaCl", names: ["NaCl", "sodium chloride"], mw: 58.44 },
  { display: "KCl", names: ["KCl", "potassium chloride"], mw: 74.55 },
  { display: "Tris (base)", names: ["Tris", "Tris base", "Trizma base", "tris(hydroxymethyl)aminomethane"], mw: 121.14 },
  { display: "Tris-HCl", names: ["Tris-HCl", "Tris HCl", "Tris hydrochloride", "Trizma HCl"], mw: 157.6 },
  { display: "HEPES", names: ["HEPES"], mw: 238.3 },
  {
    display: "EDTA",
    names: ["EDTA", "ethylenediaminetetraacetic acid"],
    mw: 292.24,
    note: "EDTA 유리산 기준(292.24). 실제로는 Na2EDTA·2H2O(372.24)를 쓰는 경우가 많으니 시약병 라벨의 분자량을 확인하세요.",
  },
  { display: "Na2EDTA·2H2O", names: ["Na2EDTA", "disodium EDTA", "EDTA disodium", "EDTA disodium salt", "EDTA disodium dihydrate", "Na2EDTA·2H2O"], mw: 372.24 },
  { display: "MgCl2", names: ["MgCl2", "magnesium chloride"], mw: 95.21 },
  { display: "MgCl2·6H2O", names: ["MgCl2·6H2O", "magnesium chloride hexahydrate"], mw: 203.3 },
  { display: "MgSO4", names: ["MgSO4", "magnesium sulfate"], mw: 120.37 },
  { display: "MgSO4·7H2O", names: ["MgSO4·7H2O", "magnesium sulfate heptahydrate"], mw: 246.47 },
  { display: "CaCl2", names: ["CaCl2", "calcium chloride"], mw: 110.98 },
  { display: "CaCl2·2H2O", names: ["CaCl2·2H2O", "calcium chloride dihydrate"], mw: 147.01 },
  { display: "Na2HPO4", names: ["Na2HPO4", "disodium hydrogen phosphate", "sodium phosphate dibasic"], mw: 141.96 },
  { display: "Na2HPO4·7H2O", names: ["Na2HPO4·7H2O"], mw: 268.07 },
  { display: "NaH2PO4", names: ["NaH2PO4", "sodium dihydrogen phosphate", "sodium phosphate monobasic"], mw: 119.98 },
  { display: "NaH2PO4·H2O", names: ["NaH2PO4·H2O"], mw: 137.99 },
  { display: "KH2PO4", names: ["KH2PO4", "potassium dihydrogen phosphate", "potassium phosphate monobasic"], mw: 136.09 },
  { display: "K2HPO4", names: ["K2HPO4", "dipotassium hydrogen phosphate", "potassium phosphate dibasic"], mw: 174.18 },
  { display: "SDS", names: ["SDS", "sodium dodecyl sulfate", "sodium dodecyl sulphate", "sodium lauryl sulfate"], mw: 288.38 },
  { display: "DTT", names: ["DTT", "dithiothreitol"], mw: 154.25 },
  { display: "Glycine", names: ["glycine"], mw: 75.07 },
  { display: "Glucose", names: ["glucose", "D-glucose", "dextrose"], mw: 180.16 },
  { display: "Sucrose", names: ["sucrose"], mw: 342.3 },
  { display: "Urea", names: ["urea"], mw: 60.06 },
  { display: "NaOH", names: ["NaOH", "sodium hydroxide"], mw: 40.0 },
  { display: "KOH", names: ["KOH", "potassium hydroxide"], mw: 56.11 },
  { display: "Sodium acetate", names: ["sodium acetate", "NaOAc"], mw: 82.03 },
  { display: "Sodium acetate trihydrate", names: ["sodium acetate trihydrate"], mw: 136.08 },
  { display: "Tricine", names: ["tricine"], mw: 179.17 },
  { display: "MOPS", names: ["MOPS"], mw: 209.26 },
  { display: "PMSF", names: ["PMSF"], mw: 174.19 },
  { display: "Imidazole", names: ["imidazole"], mw: 68.08 },
  { display: "(NH4)2SO4", names: ["(NH4)2SO4", "ammonium sulfate"], mw: 132.14 },
  { display: "APS", names: ["APS", "ammonium persulfate"], mw: 228.2 },
  { display: "NaHCO3", names: ["NaHCO3", "sodium bicarbonate", "sodium hydrogen carbonate"], mw: 84.01 },
  { display: "Na2CO3", names: ["Na2CO3", "sodium carbonate"], mw: 105.99 },
  { display: "NaN3", names: ["NaN3", "sodium azide"], mw: 65.01 },
  { display: "Guanidine HCl", names: ["guanidine hydrochloride", "guanidine HCl", "GuHCl", "GdnHCl"], mw: 95.53 },
  { display: "BSA", names: ["BSA", "bovine serum albumin"], mw: 66463, note: "단백질이라 보통 mg/mL 또는 % (w/v)로 쓴다." },
  { display: "Ethanol", names: ["ethanol", "EtOH"], mw: 46.07, state: "liquid", density: 0.789 },
  { display: "Methanol", names: ["methanol", "MeOH"], mw: 32.04, state: "liquid", density: 0.792 },
  { display: "Isopropanol", names: ["isopropanol", "2-propanol", "isopropyl alcohol", "IPA"], mw: 60.1, state: "liquid", density: 0.786 },
  { display: "Glycerol", names: ["glycerol", "glycerin"], mw: 92.09, state: "liquid", density: 1.261 },
  { display: "DMSO", names: ["DMSO", "dimethyl sulfoxide"], mw: 78.13, state: "liquid", density: 1.1 },
  { display: "2-Mercaptoethanol", names: ["2-mercaptoethanol", "beta-mercaptoethanol", "mercaptoethanol", "2-ME", "BME"], mw: 78.13, state: "liquid", density: 1.114 },
  { display: "Acetic acid", names: ["acetic acid", "glacial acetic acid"], mw: 60.05, state: "liquid", density: 1.049 },
  {
    display: "Triton X-100",
    names: ["Triton X-100", "Triton X100", "Triton"],
    mw: 625,
    state: "liquid",
    density: 1.07,
    note: "평균 분자량 기준(≈625). 보통 % (v/v)로 쓴다.",
  },
  { display: "Tween-20", names: ["Tween-20", "Tween 20", "polysorbate 20"], mw: 1227.54, state: "liquid", density: 1.095 },
  { display: "Tween-80", names: ["Tween-80", "Tween 80", "polysorbate 80"], mw: 1310, state: "liquid", density: 1.064 },
  { display: "NP-40", names: ["NP-40", "NP40", "Igepal CA-630"], mw: 603, state: "liquid", density: 1.06 },
  { display: "HCl", names: ["HCl", "hydrochloric acid"], mw: 36.46, needsStock: true },
  { display: "H2SO4", names: ["H2SO4", "sulfuric acid"], mw: 98.08, needsStock: true },
  { display: "HNO3", names: ["HNO3", "nitric acid"], mw: 63.01, needsStock: true },
  { display: "H3PO4", names: ["H3PO4", "phosphoric acid"], mw: 98.0, needsStock: true },
  { display: "NH4OH", names: ["NH4OH", "ammonium hydroxide", "ammonia solution"], mw: 35.05, needsStock: true },
];

// 분자량 하나로 정의할 수 없는 혼합 용액·배지 이름
const MIXTURE_KEYS = new Set([
  "pbs", "pbst", "tbs", "tbst", "te", "tae", "tbe", "lb", "dmem", "rpmi", "fbs", "ripa", "laemmli", "medium", "media",
]);

const IGNORABLE_PAREN = /\bph\b|\bph\s*\d|w\/v|v\/v|w\/w|sigma|thermo|invitrogen|merck|aldrich|fisher|anhydrous|grade|stock|#|\d\s*%/i;

export function normalizeName(raw) {
  let s = String(raw ?? "").normalize("NFKC");
  s = s.replace(/\(([^)]*)\)/g, (match, inner) => (IGNORABLE_PAREN.test(inner) ? " " : match));
  s = s.replace(/[,;]?\s*pH\s*[\d.]+(?:\s*[-~]\s*[\d.]+)?/gi, " ");
  s = s.replace(/\b(buffer|buffered|solution|soln|stock|reagent)\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim().replace(/^[,;\s]+|[,;\s]+$/g, "");
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return { clean: s, key };
}

const INDEX = new Map();
for (const entry of DB_ENTRIES) {
  for (const alias of entry.names) {
    INDEX.set(normalizeName(alias).key, entry);
  }
}

export function findEntry(name) {
  return INDEX.get(normalizeName(name).key) ?? null;
}

export function displayName(name) {
  const { clean } = normalizeName(name);
  return INDEX.get(normalizeName(name).key)?.display ?? (clean || String(name ?? "").trim());
}

function unitToken(tok) {
  if (Object.hasOwn(MOLAR, tok)) return { kind: "molar", factor: MOLAR[tok] };
  const low = tok.toLowerCase();
  if (Object.hasOwn(MASS_G, low)) return { kind: "mass", factor: MASS_G[low] };
  if (Object.hasOwn(VOL_ML, low)) return { kind: "volume", factor: VOL_ML[low] };
  if (Object.hasOwn(MOLE_MOL, low)) return { kind: "mole", factor: MOLE_MOL[low] };
  if (COUNT_UNIT.test(tok)) return { kind: "count", factor: 1 };
  return null;
}

/**
 * "50 mM", "0.9 % (w/v)", "2 mg/mL", "100 mL", "20 units" 같은 문자열을 해석한다.
 * 해석할 수 없으면 null.
 */
export function parseQuantity(input) {
  if (input == null) return null;
  let s = String(input).normalize("NFKC").trim();
  s = s.replace(/^(?:~|≈|about|approx\.?|approximately)\s*/i, "");
  s = s.replace(/[−–—]/g, "-").replace(/[μµ]/g, "u").replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const m = s.match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*(.*)$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  let unit = m[2].trim();
  if (!unit) return null;

  if (unit.includes("%")) {
    let basis = null;
    if (/w\s*\/\s*v/i.test(unit)) basis = "wv";
    else if (/v\s*\/\s*v/i.test(unit)) basis = "vv";
    else if (/w\s*\/\s*w|wt/i.test(unit)) basis = "ww";
    return { type: "percent", percent: value, basis };
  }
  if (/^[x×]$/i.test(unit) || unit.startsWith(":")) return { type: "fold", factor: value };

  unit = unit
    .replace(/\s+per\s+/i, "/")
    .replace(/^([a-z]+)\s+([a-z]+)-1$/i, "$1/$2")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\.$/, "");

  if (unit.includes("/")) {
    const parts = unit.split("/");
    if (parts.length !== 2) return null;
    const num = unitToken(parts[0]);
    const denMatch = parts[1].match(/^(\d*\.?\d+)?\s*([a-z]+)$/i);
    if (!num || !denMatch) return null;
    const den = unitToken(denMatch[2]);
    if (!den || den.kind !== "volume") return null;
    const denMl = (denMatch[1] ? parseFloat(denMatch[1]) : 1) * den.factor;
    if (num.kind === "mass") return { type: "perVolume", dim: "mass", perMl: (value * num.factor) / denMl };
    if (num.kind === "count") return { type: "perVolume", dim: "count", perMl: value / denMl, unitLabel: "units" };
    if (num.kind === "mole") return { type: "molar", molPerL: (value * num.factor) / (denMl / 1000) };
    return null;
  }

  const tok = unitToken(unit);
  if (!tok) return null;
  if (tok.kind === "molar") return { type: "molar", molPerL: value * tok.factor };
  if (tok.kind === "mass") return { type: "mass", g: value * tok.factor };
  if (tok.kind === "volume") return { type: "volume", mL: value * tok.factor };
  if (tok.kind === "mole") return { type: "mole", mol: value * tok.factor };
  return { type: "count", n: value, unitLabel: "units" };
}

function describeRow(row) {
  const name = String(row?.name ?? "").trim();
  const concStr = String(row?.concentration ?? "").trim();
  const volStr = String(row?.volume ?? "").trim();
  const { clean, key } = normalizeName(name);
  return {
    name,
    clean,
    key,
    concStr,
    volStr,
    conc: concStr ? parseQuantity(concStr) : null,
    vol: volStr ? parseQuantity(volStr) : null,
  };
}

function needsMW(d) {
  return (d.conc?.type === "molar" && d.vol?.type === "volume") || (!d.conc && d.vol?.type === "mole");
}

/** 계산에 분자량이 필요한데 내장 DB에도 캐시에도 없는 시약 → PubChem 조회 대상 */
export function namesNeedingLookup(rows, mwMap = {}) {
  const seen = new Map();
  for (const row of rows) {
    const d = describeRow(row);
    if (!d.name || !d.key || !needsMW(d)) continue;
    if (INDEX.has(d.key) || MIXTURE_KEYS.has(d.key) || Object.hasOwn(mwMap, d.key)) continue;
    if (!seen.has(d.key)) seen.set(d.key, { key: d.key, name: d.clean });
  }
  return Array.from(seen.values());
}

function fail(reason, code) {
  return { ok: false, reason, code };
}

function resolveMW(d, entry, mwMap) {
  if (entry) return { mw: entry.mw, source: "내장 DB", note: entry.note };
  if (MIXTURE_KEYS.has(d.key)) return { fail: "혼합 용액이라 분자량으로 계산할 수 없음 — 구성 성분별로 입력해 주세요" };
  if (!d.key) return { fail: "분자량을 찾을 수 없음 — 영문 화학명으로 입력해 주세요", code: "no-key" };
  const hit = mwMap[d.key];
  if (hit?.mw) {
    const formula = hit.formula ? ` (${hit.formula})` : "";
    return { mw: hit.mw, source: "PubChem", note: `분자량을 PubChem에서 조회함${formula} — 맞는 물질인지 확인하세요` };
  }
  if (hit?.notFound) return { fail: "분자량을 찾을 수 없음(내장 DB·PubChem) — 정확한 영문 화학명으로 고쳐 보세요", code: "not-found" };
  return { fail: "분자량 미조회 — 「계산하기」를 눌러 조회해 주세요", code: "unresolved" };
}

const num = (x) => String(Number(x.toPrecision(6)));

/**
 * 시약 한 줄의 기준(배수 1) 계량값을 구한다.
 * 성공: { ok, dim: "mass"(g) | "volume"(mL) | "count", value, unitLabel?, basis, mw?, mwSource?, notes[] }
 */
export function computeRow(row, { mwMap = {} } = {}) {
  const d = describeRow(row);
  if (!d.name) return fail("시약 이름을 입력해 주세요");
  if (d.concStr && !d.conc) return fail(`농도를 해석할 수 없음: "${d.concStr}" (예: 50 mM, 0.9 % (w/v), 2 mg/mL)`);
  if (d.volStr && !d.vol) return fail(`부피/양을 해석할 수 없음: "${d.volStr}" (예: 100 mL, 50 µL, 5 g)`);
  if (!d.conc && !d.vol) return fail("농도와 부피(양) 정보가 없음 — 직접 입력해 주세요");
  if (d.conc?.type === "fold") return fail("희석 배수(×) 표기는 지원하지 않음 — 필요한 부피를 직접 입력해 주세요");

  const entry = INDEX.get(d.key);
  if (d.conc && entry?.needsStock) {
    return fail(`${entry.display}은(는) 농축 원액을 희석해 쓰는 시약 — 원액 농도·밀도를 확인해 직접 계산해 주세요`);
  }

  const notes = [];
  const done = (r) => ({ ok: true, notes, ...r });

  if (!d.conc) {
    const basis = `${d.volStr} (입력값 그대로)`;
    if (d.vol.type === "mass") return done({ dim: "mass", value: d.vol.g, basis });
    if (d.vol.type === "volume") return done({ dim: "volume", value: d.vol.mL, basis });
    if (d.vol.type === "count") return done({ dim: "count", value: d.vol.n, unitLabel: d.vol.unitLabel, basis });
    const r = resolveMW(d, entry, mwMap);
    if (r.fail) return fail(r.fail, r.code);
    if (r.note) notes.push(r.note);
    return done({ dim: "mass", value: d.vol.mol * r.mw, basis: `${d.volStr} × ${num(r.mw)} g/mol`, mw: r.mw, mwSource: r.source });
  }

  if (!d.vol) return fail(`부피를 입력해 주세요 (농도 ${d.concStr} 기준 계량에 필요)`);
  if (d.vol.type !== "volume") return fail("농도와 함께 쓰려면 부피를 mL·L·µL 단위로 입력해야 함");
  const V = d.vol.mL;
  const basis = `${d.concStr} × ${d.volStr}`;

  if (d.conc.type === "molar") {
    const r = resolveMW(d, entry, mwMap);
    if (r.fail) return fail(r.fail, r.code);
    if (r.note) notes.push(r.note);
    const mass = d.conc.molPerL * (V / 1000) * r.mw;
    const mwText = `${num(r.mw)} g/mol`;
    if (entry?.state === "liquid" && entry.density) {
      notes.push(`순수 액체(밀도 ${entry.density} g/mL) 기준으로 부피로 환산`);
      return done({ dim: "volume", value: mass / entry.density, basis: `${basis} × ${mwText} ÷ ${entry.density} g/mL`, mw: r.mw, mwSource: r.source });
    }
    return done({ dim: "mass", value: mass, basis: `${basis} × ${mwText}`, mw: r.mw, mwSource: r.source });
  }

  if (d.conc.type === "percent") {
    let pBasis = d.conc.basis;
    if (pBasis === "ww") return fail("% (w/w)는 전체 질량이 필요해 계산할 수 없음 — w/v 또는 v/v로 바꿔 입력해 주세요");
    if (!pBasis) {
      pBasis = entry?.state === "liquid" ? "vv" : "wv";
      notes.push(`% 기준이 적혀 있지 않아 ${pBasis === "vv" ? "v/v" : "w/v"}로 가정함`);
    }
    const amount = (d.conc.percent / 100) * V;
    return pBasis === "vv" ? done({ dim: "volume", value: amount, basis }) : done({ dim: "mass", value: amount, basis });
  }

  if (d.conc.type === "perVolume") {
    const amount = d.conc.perMl * V;
    if (d.conc.dim === "count") return done({ dim: "count", value: amount, unitLabel: d.conc.unitLabel, basis });
    return done({ dim: "mass", value: amount, basis });
  }

  return fail("농도와 부피의 조합을 해석할 수 없음");
}

export function scaleResult(res, factor) {
  return { ...res, value: res.value * factor };
}

export function formatSig(x, sig) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const rounded = Number(x.toPrecision(sig));
  const mag = Math.floor(Math.log10(Math.abs(rounded)));
  return rounded.toFixed(Math.max(0, sig - 1 - mag));
}

// [단위, 기준단위(g·mL) 대비 배율, 이 단위를 쓰기 시작하는 최소값(기준단위)]
// 질량은 저울 표시에 맞춰 0.1 g부터 g, 부피는 1 mL부터 mL을 쓴다.
const MASS_LADDER = [["kg", 1000, 1000], ["g", 1, 0.1], ["mg", 1e-3, 1e-4], ["µg", 1e-6, 1e-7], ["ng", 1e-9, 0]];
const VOL_LADDER = [["L", 1000, 1000], ["mL", 1, 1], ["µL", 1e-3, 1e-3], ["nL", 1e-6, 0]];

function formatOnLadder(value, ladder, sig) {
  if (value === 0) return `0 ${ladder[1][0]}`;
  let i = ladder.findIndex(([, , min]) => value >= min);
  if (i > 0 && Number((value / ladder[i][1]).toPrecision(sig)) >= 1000) i -= 1;
  return `${formatSig(value / ladder[i][1], sig)} ${ladder[i][0]}`;
}

/** 계산 결과를 사람이 읽는 단위(kg~ng, L~nL)와 유효숫자로 표시 */
export function formatAmount(res, sig) {
  if (res.dim === "mass") return formatOnLadder(res.value, MASS_LADDER, sig);
  if (res.dim === "volume") return formatOnLadder(res.value, VOL_LADDER, sig);
  return `${formatSig(res.value, sig)} ${res.unitLabel ?? ""}`.trim();
}

export function canonicalKey(name) {
  const { key } = normalizeName(name);
  const entry = INDEX.get(key);
  return entry ? `db:${entry.display}` : key || String(name ?? "").trim().toLowerCase();
}

/** 같은 시약(같은 종류의 양)을 한 줄로 합산해 한 번에 준비할 총량을 구한다 */
export function mergeResults(items) {
  const groups = new Map();
  for (const { name, res } of items) {
    if (!res.ok) continue;
    const key = `${canonicalKey(name)}|${res.dim}|${res.unitLabel ?? ""}`;
    const g = groups.get(key);
    if (g) {
      g.value += res.value;
      g.rows += 1;
    } else {
      groups.set(key, { ok: true, name: displayName(name), dim: res.dim, unitLabel: res.unitLabel, value: res.value, rows: 1 });
    }
  }
  return Array.from(groups.values());
}
