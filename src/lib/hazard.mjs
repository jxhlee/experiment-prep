// 시약별 폐기 분류와 함께 버리면 안 되는 조합을 알려 준다.
// AI 가 지어내는 부분은 없다. 내장 시약은 사람이 정리한 분류표를, 그 밖의 시약은 화학식·이름 규칙과 PubChem 의 GHS 유해성 정보
// (공급자 MSDS 가 쓰는 것과 같은 체계)를 근거로 삼고, 어떤 근거로 나왔는지(basis)를 함께 돌려준다.
// 기관마다 폐기물 분류표가 다르므로 어디까지나 참고용이다. 화면에서도 그렇게 안내한다.

import { findEntry, normalizeName } from "./chem.mjs";
import { parseFormula } from "./formula.mjs";

/** 폐액 종류 */
export const STREAMS = {
  acid: { label: "무기산 폐액", tone: "danger" },
  base: { label: "무기염기(알칼리) 폐액", tone: "danger" },
  metal: { label: "금속 함유 무기 폐액", tone: "warn" },
  cr6: { label: "6가 크롬 폐액", tone: "danger" },
  cyanide: { label: "시안 함유 폐액", tone: "danger" },
  azide: { label: "아자이드 폐액 (전용 용기)", tone: "danger" },
  sulfide: { label: "황화물 폐액 (알칼리성 유지)", tone: "danger" },
  oxidizer: { label: "산화제 폐액", tone: "danger" },
  "org-halo": { label: "할로겐 유기용매 폐액", tone: "warn" },
  "org-nonhalo": { label: "비할로겐 유기용매 폐액", tone: "warn" },
  aqueous: { label: "비유해 수용액 (기관 규정 확인)", tone: "neutral" },
  none: { label: "별도 폐기 절차 없음", tone: "neutral" },
  unknown: { label: "분류 불가 — SDS 13항 확인", tone: "warn" },
};

// GHS 위험 문구(유엔 GHS 표준 문구)
const H_TEXT = {
  H200: "불안정한 폭발물", H220: "극인화성 가스", H221: "인화성 가스", H224: "극인화성 액체·증기", H225: "고인화성 액체·증기",
  H226: "인화성 액체·증기", H228: "인화성 고체", H240: "가열 시 폭발할 수 있음", H241: "가열 시 화재·폭발할 수 있음",
  H242: "가열 시 화재가 날 수 있음", H250: "공기와 접촉하면 자연발화", H251: "자기발열, 화재가 날 수 있음", H252: "대량이면 자기발열, 화재가 날 수 있음",
  H260: "물과 닿으면 인화성 가스 방출", H261: "물과 닿으면 인화성 가스 방출", H270: "화재를 일으키거나 키울 수 있음(산화제)",
  H271: "화재·폭발을 일으킬 수 있음(강한 산화제)", H272: "화재를 키울 수 있음(산화제)", H280: "고압가스, 가열하면 폭발할 수 있음",
  H281: "냉동가스, 극저온 화상·손상 가능", H290: "금속을 부식시킬 수 있음", H300: "삼키면 치명적", H301: "삼키면 유독", H302: "삼키면 유해",
  H304: "삼켜서 기도로 들어가면 치명적일 수 있음", H310: "피부에 닿으면 치명적", H311: "피부에 닿으면 유독", H312: "피부에 닿으면 유해",
  H314: "피부에 심한 화상, 눈 손상", H315: "피부 자극", H317: "알레르기성 피부 반응 가능", H318: "눈에 심한 손상", H319: "눈에 심한 자극",
  H330: "흡입하면 치명적", H331: "흡입하면 유독", H332: "흡입하면 유해", H334: "흡입 시 알레르기·천식·호흡곤란 가능", H335: "호흡기 자극 가능",
  H336: "졸음·현기증 유발 가능", H340: "유전적 결함 유발 가능", H341: "유전적 결함 유발 의심", H350: "암 유발 가능", H351: "암 유발 의심",
  H360: "생식능력·태아에 손상 가능", H361: "생식능력·태아에 손상 의심", H362: "모유 수유 아이에게 해로울 수 있음", H370: "장기 손상",
  H371: "장기 손상 가능", H372: "장기간·반복 노출 시 장기 손상", H373: "장기간·반복 노출 시 장기 손상 가능", H400: "수생 생물에 매우 유독",
  H410: "수생 생물에 매우 유독, 장기적 영향", H411: "수생 생물에 유독, 장기적 영향", H412: "수생 생물에 유해, 장기적 영향", H413: "수생 생물에 장기적 유해 영향 가능",
};

export const hazardText = (code) => H_TEXT[code] ?? "";

// GHS 에서 신호어 "위험(Danger)"을 붙이는 구분의 위험 문구. 나머지는 "경고(Warning)".
const DANGER_CODES = new Set([
  "H200", "H201", "H202", "H203", "H204", "H220", "H224", "H225", "H240", "H241", "H250", "H260", "H270", "H271", "H300", "H301",
  "H310", "H311", "H314", "H318", "H330", "H331", "H334", "H340", "H350", "H360", "H370", "H372",
]);

/** 위험 문구 코드들로 신호어를 정한다. 코드가 없으면 null. */
export function signalWord(codes) {
  const list = [...codes];
  if (list.length === 0) return null;
  return list.some((c) => DANGER_CODES.has(c)) ? "Danger" : "Warning";
}

const CMR = ["H340", "H341", "H350", "H351", "H360", "H361"];
const ACUTE = ["H300", "H310", "H330"];
const AQUATIC = ["H400", "H410", "H411"];
const FLAMMABLE = ["H224", "H225", "H226"];
const OXIDIZER = ["H270", "H271", "H272"];
const CORROSIVE = ["H314"];

// 금속 이온을 포함하면 하수구에 버리지 않고 모은다 (Na·K·Mg·Ca·Li·Al 등은 제외)
const METALS = new Set([
  "Be", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Zr", "Mo", "Ru", "Rh", "Pd", "Ag", "Cd", "In",
  "Sn", "Sb", "Te", "Ba", "La", "Ce", "W", "Pt", "Au", "Hg", "Tl", "Pb", "Bi",
]);
const HALOGENS = ["F", "Cl", "Br", "I"];

const T = {
  acidCommon: "산성 폐액 전용 용기에만 모으고, 염기·시안·아자이드·황화물과 섞지 마세요. 농축 산을 희석할 때는 물에 산을 천천히 넣으세요(산에 물을 붓지 않기).",
  nitric: "질산은 강한 산화제예요. 아세톤·알코올 같은 유기용매 폐액과 절대 섞지 마세요(폭발한 사고가 있어요).",
  baseCommon: "알칼리 전용 용기에 모으고 산과 섞지 마세요(발열). 암모니아는 표백제(차아염소산염)와 섞으면 독성 가스가 생겨요.",
  metal: "금속 이온은 하수구에 버리지 말고 금속 함유 폐액으로 모으세요. 산성이면 용기에 '산성'이라고 함께 적어 두세요.",
  cr6: "6가 크롬은 발암성이고 강한 산화제예요. 전용 용기에 따로 모으고 유기물·환원제와 섞지 마세요.",
  cyanide: "산과 섞이면 시안화수소 가스가 나와요. 산성 폐액과 절대 섞지 말고, 염기성을 유지한 전용 용기에 모으세요.",
  azide: "산과 섞이면 독성·폭발성 가스(아지드화수소)가 생기고, 구리·납 배관에 흘리면 폭발성 금속 아자이드가 쌓여요. 하수구에 버리지 말고 전용 용기에 모으세요.",
  oxidizer: "유기물·환원제(DTT, 머캅토에탄올)·가연성 물질과 떨어뜨려 모으세요.",
  halo: "할로겐 유기용매는 비할로겐 용매와 따로 모으세요(처리 방법이 달라요). 강염기와 섞으면 격렬하게 반응할 수 있어요.",
  nonhalo: "밀폐 용기에 모으고 불·열을 멀리하세요. 산화제·질산 폐액과 섞지 마세요.",
  aqueous: "독성이 낮은 수용액이라도 배수 가능 여부는 기관 규정에 따라 달라요. 농도가 높거나 확실하지 않으면 해당 폐액으로 모으세요.",
  thiol: "냄새가 심하고 독성이 있어요. 후드에서 다루고 산화제와 섞지 마세요.",
  aquatic: "수생 생물에 해로워요. 하수구에 버리지 마세요.",
};

const S = (stream, tags, tips, extra = {}) => ({ stream, tags, tips, ...extra });

// 내장 시약(chem.mjs 의 표시 이름) 분류표
const CURATED = new Map(
  Object.entries({
    HCl: S("acid", ["acid"], [T.acidCommon]),
    H2SO4: S("acid", ["acid"], [T.acidCommon]),
    H3PO4: S("acid", ["acid"], [T.acidCommon]),
    HNO3: S("acid", ["acid", "oxidizer", "nitric"], [T.acidCommon, T.nitric]),
    NaOH: S("base", ["base"], [T.baseCommon]),
    KOH: S("base", ["base"], [T.baseCommon]),
    NH4OH: S("base", ["base", "ammonia"], [T.baseCommon]),
    "Na2CO3": S("aqueous", [], [T.aqueous, "약한 염기성이에요. 많이 모이면 pH를 확인하세요."]),
    "Bi(NO3)3·5H2O": S("metal", ["metal"], [T.metal, "질산염이라 유기용매 폐액과 섞지 마세요."]),
    NH4VO3: S("metal", ["metal", "toxic"], [T.metal, "바나듐 화합물은 독성이 있어요. 소량이라도 일반 수용액과 섞지 마세요."]),
    Na2MoO4: S("metal", ["metal"], [T.metal]),
    CoSO4: S("metal", ["metal", "cmr"], [T.metal, "코발트 화합물은 발암 의심 물질이에요. 분진을 마시지 않게 다루세요."]),
    HAuCl4: S("metal", ["metal", "acid"], [T.metal, "강산성이에요. 산성 금속 폐액으로 표기하고, 금은 회수 가치가 있으니 따로 모으는 곳도 많아요."]),
    K2CrO4: S("cr6", ["cr6", "oxidizer", "cmr"], [T.cr6]),
    "K3[Fe(CN)6]": S("cyanide", ["cyanide"], [T.cyanide, "페리시안화칼륨은 시안 화합물보다 독성이 낮지만, 산·강한 빛에서 시안이 나올 수 있어 같은 방식으로 다뤄요."]),
    "K4[Fe(CN)6]": S("cyanide", ["cyanide"], [T.cyanide, "페로시안화칼륨은 시안 화합물보다 독성이 낮지만, 산에서 시안이 나올 수 있어 같은 방식으로 다뤄요."]),
    NaN3: S("azide", ["azide", "toxic"], [T.azide]),
    APS: S("oxidizer", ["oxidizer"], [T.oxidizer]),
    NaIO3: S("oxidizer", ["oxidizer"], [T.oxidizer]),
    Chloroform: S("org-halo", ["organic", "halogenated"], [T.halo, "발암 의심·간독성이 있어요. 후드에서 다루세요."]),
    Dichloromethane: S("org-halo", ["organic", "halogenated"], [T.halo, "휘발성이 매우 커요. 후드에서 다루세요."]),
    Ethanol: S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]),
    Methanol: S("org-nonhalo", ["organic", "flammable", "toxic"], [T.nonhalo, "삼키거나 흡입하면 독성이 커요(실명 위험)."]),
    Isopropanol: S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]),
    Acetone: S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]),
    Acetonitrile: S("org-nonhalo", ["organic", "flammable", "toxic"], [T.nonhalo, "독성이 있어요. 산·강염기와 섞지 마세요."]),
    DMF: S("org-nonhalo", ["organic", "toxic"], [T.nonhalo, "생식독성 의심 물질이에요."]),
    DMSO: S("org-nonhalo", ["organic"], [T.nonhalo, "피부로 다른 물질을 함께 흡수시킬 수 있어요. 독성 물질이 녹아 있으면 그 물질 기준으로 분류하세요."]),
    Hexane: S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]),
    Toluene: S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]),
    "Ethyl acetate": S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]),
    "Ethylene glycol": S("org-nonhalo", ["organic", "toxic"], [T.nonhalo, "삼키면 유해해요. 하수구에 버리지 마세요."]),
    "Acetic acid": S("org-nonhalo", ["organic", "acid", "flammable"], [T.nonhalo, "산성이에요. 염기·산화제와 섞지 마세요."]),
    "2-Mercaptoethanol": S("org-nonhalo", ["organic", "thiol", "toxic"], [T.thiol, T.nonhalo]),
    DTT: S("aqueous", ["thiol"], [T.thiol, "저농도 수용액은 기관 규정에 따르되, 고체나 고농도는 유기 폐액으로 모으세요."]),
    PMSF: S("org-nonhalo", ["organic", "toxic"], ["독성이 있고 부식성이에요. 보통 알코올에 녹여 쓰니 유기용매 폐액으로 모으세요."]),
    SDS: S("aqueous", [], [T.aqueous, "계면활성제는 수생 생물에 해롭고 거품이 많아요. 많은 양을 하수구에 버리지 마세요."]),
    "Triton X-100": S("aqueous", [], [T.aqueous, T.aquatic]),
    "NP-40": S("aqueous", [], [T.aqueous, T.aquatic]),
    "Tween-20": S("aqueous", [], [T.aqueous]),
    "Tween-80": S("aqueous", [], [T.aqueous]),
    Imidazole: S("aqueous", ["toxic"], [T.aqueous, "부식성·생식독성이 있을 수 있어요. 고농도는 일반 수용액과 따로 모으세요."]),
    "Guanidine HCl": S("aqueous", ["toxic"], [T.aqueous, "표백제(염소계)·산과 섞으면 독성 가스가 나올 수 있어요."]),
    "Tris (base)": S("aqueous", [], [T.aqueous]),
    "Tris-HCl": S("aqueous", [], [T.aqueous]),
    HEPES: S("aqueous", [], [T.aqueous]),
    MOPS: S("aqueous", [], [T.aqueous]),
    Tricine: S("aqueous", [], [T.aqueous]),
    EDTA: S("aqueous", [], [T.aqueous, "금속 이온과 강하게 결합하는 킬레이트제예요. 많은 양을 하수구에 버리지 마세요."]),
    "Na2EDTA·2H2O": S("aqueous", [], [T.aqueous, "금속 이온과 강하게 결합하는 킬레이트제예요. 많은 양을 하수구에 버리지 마세요."]),
    Glycine: S("aqueous", [], [T.aqueous]),
    Glucose: S("aqueous", [], [T.aqueous]),
    Sucrose: S("aqueous", [], [T.aqueous]),
    Urea: S("aqueous", [], [T.aqueous]),
    Glycerol: S("aqueous", [], [T.aqueous]),
    BSA: S("aqueous", [], [T.aqueous, "단백질 용액은 세균이 자라기 쉬워요. 오래 보관하지 말고 규정에 맞게 처리하세요."]),
    "Sodium acetate": S("aqueous", [], [T.aqueous]),
    "Sodium acetate trihydrate": S("aqueous", [], [T.aqueous]),
    Water: S("none", [], ["물은 별도 폐기 절차가 필요 없어요. 다른 시약이 녹아 있으면 그 시약 기준으로 분류하세요."]),
  }),
);

// 이름 패턴 규칙 (내장 분류표에 없는 시약용)
const NAME_RULES = [
  { re: /azide/, apply: () => S("azide", ["azide", "toxic"], [T.azide]) },
  { re: /cyanide|cyanoferrate|ferricyanide|ferrocyanide/, apply: () => S("cyanide", ["cyanide"], [T.cyanide]) },
  { re: /dichromate|chromate|chromium\s*\(?vi\)?|chromic acid|chromium trioxide/, apply: () => S("cr6", ["cr6", "oxidizer", "cmr"], [T.cr6]) },
  { re: /hydrochloric|sulfuric|sulphuric|nitric|phosphoric|hydrobromic|perchloric|hydroiodic/, apply: (c) => S("acid", ["acid", ...(/nitric|perchloric/.test(c.lower) ? ["oxidizer", "nitric"] : [])], [T.acidCommon, ...(/nitric/.test(c.lower) ? [T.nitric] : [])]) },
  { re: /hydrofluoric/, apply: () => S("acid", ["acid", "toxic"], [T.acidCommon, "불산은 뼈까지 침투하는 맹독성이에요. 유리 용기를 쓰지 말고 지도 교원·안전 담당자와 상의하세요."]) },
  { re: /peroxide|persulfate|persulphate|periodate|iodate|bromate|chlorate|perchlorate|permanganate|hypochlorite|bleach/, apply: (c) => S("oxidizer", ["oxidizer", ...(/hypochlorite|bleach/.test(c.lower) ? ["hypochlorite"] : [])], [T.oxidizer]) },
  { re: /sulfide|sulphide/, apply: () => S("sulfide", ["sulfide", "toxic"], ["산과 섞이면 황화수소(독성 가스)가 나와요. 알칼리성을 유지한 전용 용기에 모으고 산성 폐액과 섞지 마세요.", "냄새가 심해요. 후드에서 다루세요."]) },
  { re: /hydroxide|ammonia/, apply: (c) => (c.elements?.C ? null : S("base", ["base", ...(/ammon/.test(c.lower) ? ["ammonia"] : [])], [T.baseCommon])) },
  { re: /chloroform|dichloromethane|methylene chloride|carbon tetrachloride|tetrachloromethane|dichloroethane|trichloroethane|trichloroethylene|tetrachloroethylene|chlorobenzene|bromoform|iodomethane|methyl iodide/, apply: () => S("org-halo", ["organic", "halogenated"], [T.halo]) },
  { re: /methanol|ethanol|propanol|butanol|acetone|acetonitrile|dimethylformamide|dimethyl sulfoxide|hexane|heptane|toluene|benzene|xylene|ethyl acetate|diethyl ether|tetrahydrofuran|dioxane|pyridine|formaldehyde|formalin|phenol/, apply: () => S("org-nonhalo", ["organic", "flammable"], [T.nonhalo]) },
  { re: /thiol|mercapto|dithiothreitol|tcep/, apply: () => S("aqueous", ["thiol"], [T.thiol]) },
];

/** 시약 이름과 화학식에서 판단에 쓸 정보를 모은다 */
function context(name, formula) {
  const entry = findEntry(name);
  const lower = [String(name ?? ""), entry?.display ?? ""].join(" ").normalize("NFKC").toLowerCase();
  let elements = parseFormula(String(formula ?? "").replace(/[+-]\d*$/, ""));
  if (!elements) {
    // 내장 시약은 화학식처럼 적힌 이름(NaCl, MgCl2 등)에서 원소를 읽는다
    for (const alias of [entry?.display, ...(entry?.names ?? [])]) {
      elements = alias ? parseFormula(alias) : null;
      if (elements) break;
    }
  }
  return { name: String(name ?? ""), entry, display: entry?.display ?? null, lower, elements: elements ?? null };
}

function inferFromElements(c) {
  const el = c.elements;
  if (!el) return null;
  const metals = Object.keys(el).filter((e) => METALS.has(e));
  if (metals.length > 0) return S("metal", ["metal"], [T.metal], { detail: `금속(${metals.join("·")}) 포함` });
  const organic = (el.C ?? 0) > 0 && (el.H ?? 0) > 0;
  const halogen = HALOGENS.some((h) => (el[h] ?? 0) > 0);
  if (organic && halogen) return S("org-halo", ["organic", "halogenated"], [T.halo], { detail: "탄소와 할로겐 포함" });
  return null;
}

/**
 * 시약 하나의 폐기 분류.
 * ghs: PubChem GHS 정보({ hazards: [{code}], signal, … })가 있으면 주의 문구를 더하고 분류를 보정한다.
 * 결과: { stream, streamLabel, tags[], tips[], hazards[{code, text}], signal, basis, certain }
 */
export function classifyReagent({ name, formula, ghs = null }) {
  const c = context(name, formula);
  let base = (c.display && CURATED.get(c.display)) || null;
  let basis = base ? "기본 분류표" : "";

  if (!base) {
    for (const rule of NAME_RULES) {
      if (rule.re.test(c.lower)) {
        const r = rule.apply(c);
        if (r) {
          base = r;
          basis = "이름 규칙";
          break;
        }
      }
    }
  }
  if (!base) {
    base = inferFromElements(c);
    if (base) basis = "화학식 규칙";
  }

  const codes = new Set((ghs?.hazards ?? []).map((h) => h.code));
  const has = (list) => list.some((code) => codes.has(code));
  const tags = new Set(base?.tags ?? []);
  const tips = [...(base?.tips ?? [])];
  let stream = base?.stream ?? null;

  if (has(OXIDIZER)) tags.add("oxidizer");
  if (has(FLAMMABLE)) tags.add("flammable");
  if (has(CORROSIVE)) tags.add("corrosive");
  if (has(CMR)) tags.add("cmr");
  if (has(ACUTE)) tags.add("toxic");

  if (!stream) {
    if (has(FLAMMABLE)) {
      stream = "org-nonhalo";
      tags.add("organic");
      tips.push(T.nonhalo);
      basis = "PubChem GHS(인화성)";
    } else if (has(OXIDIZER)) {
      stream = "oxidizer";
      tips.push(T.oxidizer);
      basis = "PubChem GHS(산화성)";
    } else if (c.elements) {
      stream = "aqueous";
      tips.push(T.aqueous);
      basis = "화학식 규칙(특별한 위험 원소 없음)";
    } else {
      stream = "unknown";
      tips.push("자동으로 분류하지 못했어요. 시약병 라벨이나 SDS 13항(폐기 시 주의사항)을 확인하세요.");
      basis = "분류 근거 없음";
    }
  }
  if (stream === "aqueous" && has(CORROSIVE)) tips.push("부식성(H314)이 있어요. pH를 확인해 산 또는 염기 폐액으로 모으세요.");
  if (has(AQUATIC) && !tips.includes(T.aquatic)) tips.push(T.aquatic);
  if (has(CMR)) tips.push("발암·변이원성·생식독성 의심 물질이에요(GHS). 일반 폐액과 구분해 표시하세요.");
  if (has(ACUTE)) tips.push("급성 독성이 커요(GHS). 소량이라도 다른 폐액과 섞지 말고 전용 용기에 모으세요.");

  const hazards = (ghs?.hazards ?? []).map((h) => ({ code: h.code, text: hazardText(h.code) }));
  return {
    stream,
    streamLabel: STREAMS[stream].label,
    tone: STREAMS[stream].tone,
    tags: [...tags],
    tips,
    hazards,
    signal: signalWord(codes),
    basis,
    certain: basis === "기본 분류표",
    detail: base?.detail ?? "",
  };
}

// 함께 버리면 안 되는 조합 (두 시약의 tags 에 이 두 표지가 하나씩 있으면 경고)
const PAIR_RULES = [
  { a: "acid", b: "cyanide", level: "danger", text: "산과 시안 화합물을 섞으면 맹독성 시안화수소(HCN) 가스가 나와요." },
  { a: "acid", b: "azide", level: "danger", text: "산과 아자이드를 섞으면 독성·폭발성 아지드화수소(HN3)가 생겨요." },
  { a: "acid", b: "sulfide", level: "danger", text: "산과 황화물을 섞으면 독성 황화수소(H2S) 가스가 나와요." },
  { a: "azide", b: "metal", level: "danger", text: "아자이드가 구리·납 같은 금속과 만나면 충격에 폭발하는 금속 아자이드가 생겨요." },
  { a: "nitric", b: "organic", level: "danger", text: "질산을 아세톤·알코올 같은 유기용매와 섞으면 격렬하게 반응해 폭발할 수 있어요." },
  { a: "oxidizer", b: "organic", level: "danger", text: "산화제를 유기용매와 섞으면 발열·화재·폭발 위험이 있어요." },
  { a: "oxidizer", b: "thiol", level: "danger", text: "산화제를 티올(DTT·머캅토에탄올)과 섞으면 격렬하게 반응해요." },
  { a: "ammonia", b: "hypochlorite", level: "danger", text: "암모니아와 표백제(차아염소산염)를 섞으면 독성 클로라민 가스가 나와요." },
  { a: "halogenated", b: "base", level: "danger", text: "클로로폼 같은 할로겐 용매를 강염기와 섞으면 격렬하게 반응할 수 있어요." },
  { a: "acid", b: "base", level: "caution", text: "산과 염기를 한 통에 섞으면 열이 나요. 각각 따로 모으세요." },
  { a: "cyanide", b: "oxidizer", level: "caution", text: "시안 화합물은 산화제와 섞이면 반응할 수 있어요. 따로 모으세요." },
];

/** 한 번의 실험에 쓰는 시약들 사이에서 같은 폐액통에 넣으면 안 되는 조합을 찾는다 */
export function findIncompatibilities(items) {
  const found = [];
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i];
      const y = items[j];
      for (const rule of PAIR_RULES) {
        const hit = (x.tags.includes(rule.a) && y.tags.includes(rule.b)) || (x.tags.includes(rule.b) && y.tags.includes(rule.a));
        if (!hit) continue;
        const id = `${rule.a}|${rule.b}|${x.name}|${y.name}`;
        if (seen.has(id)) continue;
        seen.add(id);
        found.push({ level: rule.level, names: [x.name, y.name], text: rule.text });
        break;
      }
    }
  }
  return found.sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1));
}

/** 같은 폐액 종류끼리 묶는다. 이름이 같은 시약은 한 번만 센다. */
export function groupByStream(items) {
  const order = Object.keys(STREAMS);
  const groups = new Map();
  for (const item of items) {
    const g = groups.get(item.stream) ?? { stream: item.stream, label: item.streamLabel, tone: item.tone, items: [] };
    if (!g.items.some((x) => x.key === item.key)) g.items.push(item);
    groups.set(item.stream, g);
  }
  return [...groups.values()].sort((a, b) => order.indexOf(a.stream) - order.indexOf(b.stream));
}

export const reagentKey = (name) => normalizeName(name).key;
