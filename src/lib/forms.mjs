// 같은 시약이라도 무수물·수화물·염의 종류에 따라 분자량이 다르다 (예: EDTA 유리산 292.24, Na2EDTA·2H2O 372.24).
// 자주 쓰는 시약은 형태 목록을 미리 갖고 있고, 분자량은 화학식에서 계산한다. 목록에 없는 시약은 PubChem에서 수화물 이름을 검색해 후보를 찾는다.

import { formulaMass, hydrateCount, parseFormula } from "./formula.mjs";
import { normalizeName } from "./chem.mjs";

const HYDRATE_WORD = {
  1: "monohydrate", 2: "dihydrate", 3: "trihydrate", 4: "tetrahydrate", 5: "pentahydrate", 6: "hexahydrate",
  7: "heptahydrate", 8: "octahydrate", 9: "nonahydrate", 10: "decahydrate", 12: "dodecahydrate", 18: "octadecahydrate",
};
export const PROBE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
export const hydrateWord = (n) => HYDRATE_WORD[n] ?? null;

const HYDRATE_SUFFIX = /\s+(?:mono|di|tri|tetra|penta|hexa|hepta|octa|nona|deca|dodeca|octadeca)?hydrate\s*$/i;
const FORMULA_HYDRATE_SUFFIX = /\s*[·•.*]\s*\d*(?:\.\d+)?\s*H2O\s*$/;

// 형태: formula 만 쓰면 이름·라벨·분자량이 자동으로 만들어진다. 이름이 따로 필요한 염(EDTA 등)은 label·aliases 를 적는다.
// names: 이 시약을 가리키는 일반 이름(영문 풀네임은 공백이 있는 것). 수화물 이름("… hexahydrate")은 풀네임에서 자동으로 만든다.
const FAMILIES = [
  {
    id: "edta",
    title: "EDTA",
    names: ["EDTA", "ethylenediaminetetraacetic acid", "H4EDTA", "edetic acid"],
    forms: [
      { formula: "C10H16N2O8", label: "EDTA 유리산 (H4EDTA)", aliases: ["EDTA free acid"] },
      {
        formula: "Na2C10H14N2O8·2H2O",
        label: "Na2EDTA·2H2O (이나트륨 이수화물)",
        aliases: ["Na2EDTA", "Na2EDTA·2H2O", "disodium EDTA", "EDTA disodium", "EDTA disodium salt", "EDTA disodium dihydrate", "disodium EDTA dihydrate", "EDTA-2Na", "disodium edetate", "edetate disodium", "disodium ethylenediaminetetraacetate"],
      },
      { formula: "Na2C10H14N2O8", label: "Na2EDTA 무수물", aliases: ["Na2EDTA anhydrous", "disodium EDTA anhydrous"] },
      { formula: "Na4C10H12N2O8", label: "Na4EDTA (사나트륨, 무수)", aliases: ["Na4EDTA", "tetrasodium EDTA", "EDTA tetrasodium", "EDTA-4Na"] },
      { formula: "Na4C10H12N2O8·4H2O", label: "Na4EDTA·4H2O (사나트륨 사수화물)", aliases: ["Na4EDTA·4H2O", "tetrasodium EDTA tetrahydrate"] },
      { formula: "K2C10H14N2O8·2H2O", label: "K2EDTA·2H2O (이칼륨 이수화물)", aliases: ["K2EDTA", "dipotassium EDTA", "EDTA dipotassium"] },
      { formula: "K3C10H13N2O8·2H2O", label: "K3EDTA·2H2O (삼칼륨 이수화물)", aliases: ["K3EDTA", "tripotassium EDTA"] },
    ],
  },
  { id: "na2hpo4", title: "인산수소이나트륨", names: ["Na2HPO4", "disodium hydrogen phosphate", "sodium phosphate dibasic", "disodium phosphate"], forms: ["Na2HPO4", "Na2HPO4·2H2O", "Na2HPO4·7H2O", "Na2HPO4·12H2O"] },
  { id: "nah2po4", title: "인산이수소나트륨", names: ["NaH2PO4", "sodium dihydrogen phosphate", "sodium phosphate monobasic", "monosodium phosphate"], forms: ["NaH2PO4", "NaH2PO4·H2O", "NaH2PO4·2H2O"] },
  { id: "k2hpo4", title: "인산수소이칼륨", names: ["K2HPO4", "dipotassium hydrogen phosphate", "potassium phosphate dibasic"], forms: ["K2HPO4", "K2HPO4·3H2O"] },
  { id: "na3po4", title: "인산삼나트륨", names: ["Na3PO4", "trisodium phosphate", "sodium phosphate tribasic"], forms: ["Na3PO4", "Na3PO4·12H2O"] },
  { id: "mgcl2", title: "염화마그네슘", names: ["MgCl2", "magnesium chloride"], forms: ["MgCl2", "MgCl2·6H2O"] },
  { id: "cacl2", title: "염화칼슘", names: ["CaCl2", "calcium chloride"], forms: ["CaCl2", "CaCl2·2H2O", "CaCl2·6H2O"] },
  { id: "mgso4", title: "황산마그네슘", names: ["MgSO4", "magnesium sulfate", "magnesium sulphate"], forms: ["MgSO4", "MgSO4·H2O", "MgSO4·7H2O"] },
  { id: "na2so4", title: "황산나트륨", names: ["Na2SO4", "sodium sulfate", "sodium sulphate"], forms: ["Na2SO4", "Na2SO4·10H2O"] },
  { id: "cuso4", title: "황산구리(II)", names: ["CuSO4", "copper sulfate", "copper(II) sulfate", "cupric sulfate"], forms: ["CuSO4", "CuSO4·5H2O"] },
  { id: "coso4", title: "황산코발트(II)", names: ["CoSO4", "cobalt sulfate", "cobalt(II) sulfate"], forms: ["CoSO4", "CoSO4·6H2O", "CoSO4·7H2O"] },
  { id: "cocl2", title: "염화코발트(II)", names: ["CoCl2", "cobalt chloride", "cobalt(II) chloride"], forms: ["CoCl2", "CoCl2·6H2O"] },
  { id: "nicl2", title: "염화니켈(II)", names: ["NiCl2", "nickel chloride", "nickel(II) chloride"], forms: ["NiCl2", "NiCl2·6H2O"] },
  { id: "niso4", title: "황산니켈(II)", names: ["NiSO4", "nickel sulfate", "nickel(II) sulfate"], forms: ["NiSO4", "NiSO4·6H2O", "NiSO4·7H2O"] },
  { id: "znso4", title: "황산아연", names: ["ZnSO4", "zinc sulfate"], forms: ["ZnSO4", "ZnSO4·H2O", "ZnSO4·7H2O"] },
  { id: "feso4", title: "황산철(II)", names: ["FeSO4", "iron(II) sulfate", "ferrous sulfate"], forms: ["FeSO4", "FeSO4·7H2O"] },
  { id: "fecl3", title: "염화철(III)", names: ["FeCl3", "iron(III) chloride", "ferric chloride"], forms: ["FeCl3", "FeCl3·6H2O"] },
  { id: "fecl2", title: "염화철(II)", names: ["FeCl2", "iron(II) chloride", "ferrous chloride"], forms: ["FeCl2", "FeCl2·4H2O"] },
  { id: "mncl2", title: "염화망가니즈(II)", names: ["MnCl2", "manganese chloride", "manganese(II) chloride"], forms: ["MnCl2", "MnCl2·4H2O"] },
  { id: "mnso4", title: "황산망가니즈(II)", names: ["MnSO4", "manganese sulfate", "manganese(II) sulfate"], forms: ["MnSO4", "MnSO4·H2O"] },
  { id: "na2co3", title: "탄산나트륨", names: ["Na2CO3", "sodium carbonate"], forms: ["Na2CO3", "Na2CO3·H2O", "Na2CO3·10H2O"] },
  { id: "naoac", title: "아세트산나트륨", names: ["CH3COONa", "NaOAc", "sodium acetate"], forms: ["CH3COONa", "CH3COONa·3H2O"] },
  { id: "citric", title: "시트르산", names: ["citric acid"], forms: ["C6H8O7", "C6H8O7·H2O"] },
  { id: "na3cit", title: "시트르산삼나트륨", names: ["trisodium citrate", "sodium citrate"], forms: ["Na3C6H5O7", "Na3C6H5O7·2H2O"] },
  { id: "oxalic", title: "옥살산", names: ["oxalic acid"], forms: ["C2H2O4", "C2H2O4·2H2O"] },
  { id: "na2moo4", title: "몰리브덴산나트륨", names: ["Na2MoO4", "sodium molybdate"], forms: ["Na2MoO4", "Na2MoO4·2H2O"] },
  { id: "k4fecn6", title: "페로시안화칼륨", names: ["K4[Fe(CN)6]", "potassium ferrocyanide", "potassium hexacyanoferrate(II)"], forms: ["K4[Fe(CN)6]", "K4[Fe(CN)6]·3H2O"] },
  { id: "binitrate", title: "질산비스무트(III)", names: ["Bi(NO3)3", "bismuth nitrate", "bismuth(III) nitrate"], forms: ["Bi(NO3)3", "Bi(NO3)3·5H2O"] },
  { id: "bacl2", title: "염화바륨", names: ["BaCl2", "barium chloride"], forms: ["BaCl2", "BaCl2·2H2O"] },
  { id: "al2so43", title: "황산알루미늄", names: ["Al2(SO4)3", "aluminum sulfate", "aluminium sulfate"], forms: ["Al2(SO4)3", "Al2(SO4)3·18H2O"] },
  { id: "alno33", title: "질산알루미늄", names: ["Al(NO3)3", "aluminum nitrate", "aluminium nitrate"], forms: ["Al(NO3)3", "Al(NO3)3·9H2O"] },
  { id: "cuno32", title: "질산구리(II)", names: ["Cu(NO3)2", "copper nitrate", "copper(II) nitrate"], forms: ["Cu(NO3)2", "Cu(NO3)2·3H2O"] },
  { id: "cono32", title: "질산코발트(II)", names: ["Co(NO3)2", "cobalt nitrate", "cobalt(II) nitrate"], forms: ["Co(NO3)2", "Co(NO3)2·6H2O"] },
  { id: "nino32", title: "질산니켈(II)", names: ["Ni(NO3)2", "nickel nitrate", "nickel(II) nitrate"], forms: ["Ni(NO3)2", "Ni(NO3)2·6H2O"] },
  { id: "zno32", title: "질산아연", names: ["Zn(NO3)2", "zinc nitrate"], forms: ["Zn(NO3)2", "Zn(NO3)2·6H2O"] },
  { id: "feno33", title: "질산철(III)", names: ["Fe(NO3)3", "iron(III) nitrate", "ferric nitrate"], forms: ["Fe(NO3)3", "Fe(NO3)3·9H2O"] },
  { id: "mgno32", title: "질산마그네슘", names: ["Mg(NO3)2", "magnesium nitrate"], forms: ["Mg(NO3)2", "Mg(NO3)2·6H2O"] },
  { id: "cano32", title: "질산칼슘", names: ["Ca(NO3)2", "calcium nitrate"], forms: ["Ca(NO3)2", "Ca(NO3)2·4H2O"] },
  { id: "haucl4", title: "염화금산", names: ["HAuCl4", "chloroauric acid", "tetrachloroauric acid"], forms: ["HAuCl4", "HAuCl4·3H2O", "HAuCl4·4H2O"] },
  { id: "na2s2o3", title: "티오황산나트륨", names: ["Na2S2O3", "sodium thiosulfate", "sodium thiosulphate"], forms: ["Na2S2O3", "Na2S2O3·5H2O"] },
  { id: "cucl2", title: "염화구리(II)", names: ["CuCl2", "copper chloride", "copper(II) chloride"], forms: ["CuCl2", "CuCl2·2H2O"] },
  { id: "sncl2", title: "염화주석(II)", names: ["SnCl2", "tin(II) chloride", "stannous chloride"], forms: ["SnCl2", "SnCl2·2H2O"] },
  { id: "licl", title: "염화리튬", names: ["LiCl", "lithium chloride"], forms: ["LiCl", "LiCl·H2O"] },
  { id: "borax", title: "붕사", names: ["Na2B4O7", "borax", "sodium tetraborate"], forms: ["Na2B4O7", "Na2B4O7·10H2O"] },
  { id: "na2wo4", title: "텅스텐산나트륨", names: ["Na2WO4", "sodium tungstate"], forms: ["Na2WO4", "Na2WO4·2H2O"] },
  { id: "zn-oac", title: "아세트산아연", names: ["zinc acetate", "Zn(OAc)2"], forms: ["Zn(CH3COO)2", "Zn(CH3COO)2·2H2O"] },
  { id: "co-oac", title: "아세트산코발트(II)", names: ["cobalt acetate", "cobalt(II) acetate"], forms: ["Co(CH3COO)2", "Co(CH3COO)2·4H2O"] },
  { id: "ni-oac", title: "아세트산니켈(II)", names: ["nickel acetate", "nickel(II) acetate"], forms: ["Ni(CH3COO)2", "Ni(CH3COO)2·4H2O"] },
  { id: "mn-oac", title: "아세트산망가니즈(II)", names: ["manganese acetate", "manganese(II) acetate"], forms: ["Mn(CH3COO)2", "Mn(CH3COO)2·4H2O"] },
  { id: "cu-oac", title: "아세트산구리(II)", names: ["copper acetate", "copper(II) acetate"], forms: ["Cu(CH3COO)2", "Cu(CH3COO)2·H2O"] },
  { id: "mg-oac", title: "아세트산마그네슘", names: ["magnesium acetate"], forms: ["Mg(CH3COO)2", "Mg(CH3COO)2·4H2O"] },
  { id: "ca-oac", title: "아세트산칼슘", names: ["calcium acetate"], forms: ["Ca(CH3COO)2", "Ca(CH3COO)2·H2O"] },
  { id: "pb-oac", title: "아세트산납(II)", names: ["lead acetate", "lead(II) acetate"], forms: ["Pb(CH3COO)2", "Pb(CH3COO)2·3H2O"] },
  { id: "glucose", title: "포도당", names: ["glucose", "D-glucose", "dextrose"], forms: ["C6H12O6", "C6H12O6·H2O"] },
  { id: "lactose", title: "젖당", names: ["lactose"], forms: ["C12H22O11", "C12H22O11·H2O"] },
  { id: "trehalose", title: "트레할로스", names: ["trehalose"], forms: ["C12H22O11", "C12H22O11·2H2O"] },
  { id: "na2s", title: "황화나트륨", names: ["Na2S", "sodium sulfide", "sodium sulphide"], forms: ["Na2S", "Na2S·9H2O"] },
  { id: "na2sio3", title: "규산나트륨", names: ["Na2SiO3", "sodium metasilicate", "sodium silicate"], forms: ["Na2SiO3", "Na2SiO3·9H2O"] },
  { id: "caso4", title: "황산칼슘", names: ["CaSO4", "calcium sulfate"], forms: ["CaSO4", "CaSO4·2H2O"] },
];

function kindLabel(formula) {
  const n = hydrateCount(formula);
  return n === 0 ? "무수물" : `${n}수화물`;
}

function build(family) {
  // 영문 풀네임(공백이 있고 글자가 4자 이상 이어지는 이름)에서 "… hexahydrate" 같은 수화물 이름을 만든다
  const longNames = family.names.filter((n) => /\s/.test(n) && /[a-z]{4,}/i.test(n));
  const forms = family.forms.map((f) => {
    const spec = typeof f === "string" ? { formula: f } : f;
    const mw = formulaMass(spec.formula);
    const n = hydrateCount(spec.formula);
    const aliases = [spec.formula, ...(spec.aliases ?? [])];
    if (n > 0 && hydrateWord(n)) for (const base of longNames) aliases.push(`${base} ${hydrateWord(n)}`);
    if (n === 0) for (const base of longNames) aliases.push(`${base} anhydrous`);
    return {
      formula: spec.formula,
      label: spec.label ?? `${kindLabel(spec.formula)} · ${spec.formula}`,
      mw,
      hydrate: n,
      aliases,
    };
  });
  return { id: family.id, title: family.title, names: family.names, forms };
}

export const FORM_FAMILIES = FAMILIES.map(build);

// 이름(정규화한 키) → { family, formIndex }. formIndex 가 null 이면 형태를 특정하지 않은 일반 이름.
const INDEX = new Map();
for (const family of FORM_FAMILIES) {
  for (const name of family.names) {
    const key = normalizeName(name).key;
    if (key && !INDEX.has(key)) INDEX.set(key, { family, formIndex: null });
  }
}
for (const family of FORM_FAMILIES) {
  family.forms.forEach((form, formIndex) => {
    for (const alias of form.aliases) {
      const key = normalizeName(alias).key;
      if (key) INDEX.set(key, { family, formIndex });
    }
  });
}

/** 시약 이름 → 고를 수 있는 형태 목록. 내장 목록에 없으면 null. */
export function formCandidates(name) {
  const hit = INDEX.get(normalizeName(name).key);
  if (!hit) return null;
  return { id: hit.family.id, title: hit.family.title, named: hit.formIndex, forms: hit.family.forms };
}

/** 지금 쓰는 분자량과 같은(±0.05) 형태의 번호. 없으면 -1. */
export function matchForm(forms, mw) {
  if (!Number.isFinite(mw)) return -1;
  return forms.findIndex((f) => Math.abs(f.mw - mw) <= 0.05);
}

/** PubChem 검색용 기본 이름: 이미 붙은 결정수 표기("… hexahydrate", "·6H2O")는 뗀다. */
export function probeBaseName(name) {
  const { clean } = normalizeName(name);
  return clean.replace(FORMULA_HYDRATE_SUFFIX, "").replace(HYDRATE_SUFFIX, "").trim();
}

/** PubChem 에서 찾아 볼 이름들: 기본 이름 + 결정수별 이름 */
export function probeQueries(name) {
  const base = probeBaseName(name);
  if (!base) return [];
  return [
    { query: base, hydrate: null },
    ...PROBE_COUNTS.map((n) => ({ query: `${base} ${HYDRATE_WORD[n]}`, hydrate: n })),
  ];
}

/** PubChem 검색 결과가 정말 요청한 수화물인지 확인한다 (제목에 같은 결정수 단어가 있어야 함) */
export function titleMatchesHydrate(title, hydrate) {
  if (hydrate == null) return true;
  return new RegExp(`\\b${HYDRATE_WORD[hydrate]}\\b`, "i").test(String(title ?? ""));
}

export { formulaMass, parseFormula, hydrateCount };
