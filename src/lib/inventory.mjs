// 학교(연구실) 보유 시약 목록과 논문에서 뽑은 시약을 대조한다.
// 보유 목록은 사람이 아무렇게나 적은 이름(영문·한글·약어·순도 표기)이라서, 이름을 정리하고 같은 시약의 여러 표기를 함께 비교한다.

import { findEntry, isMixtureName } from "./chem.mjs";
import { FORM_FAMILIES, formCandidates } from "./forms.mjs";
import { KO_BY_DISPLAY, KO_BY_FAMILY } from "./ko-names.mjs";

export const MAX_INVENTORY = 2000;
export const MAX_NAME_LENGTH = 120;

/** 비교용 키: 영문·숫자·한글만 남긴 소문자 (한글 시약 이름도 키가 되도록 chem.mjs 의 키와 따로 둔다) */
export const inventoryKey = (name) =>
  String(name ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

const BULLET = /^\s*(?:[-*•·▪●]|\d{1,4}[.)])\s+/;
const PURITY = /[≥≤><~]?\s*\d+(?:\.\d+)?\s*%/g;
const GRADE = /\b(?:ACS|GR|EP|AR|LR|extra\s+pure|reagent\s+grade|analytical\s+grade|puriss|p\.a\.)\b|특급|일급|이급|1급|2급|시약급|초순도/gi;
const HEADER = /^(?:시약\s*명?|시약\s*이름|품명|이름|name|reagent|chemical|item)$/i;

/** 보유 목록에 적힌 이름 한 줄을 정리한다: 번호·순도·등급 표기를 떼고, 쉼표 뒤의 설명은 버린다 */
export function cleanInventoryName(raw) {
  let s = String(raw ?? "").normalize("NFKC").replace(BULLET, "");
  s = s.split(/,\s+/)[0]; // "Sodium chloride, ≥99%" → 앞부분 (N,N-… 같은 위치 번호의 쉼표는 공백이 없어서 남는다)
  s = s.replace(PURITY, " ").replace(GRADE, " ").replace(/\(\s*\)/g, " "); // 순도를 떼고 남은 빈 괄호도 정리
  return s.replace(/\s+/g, " ").replace(/^[\s,;:]+|[\s,;:]+$/g, "");
}

/**
 * 붙여넣은 글 → 시약 이름 목록. 줄마다 하나씩 읽고, 표(엑셀)에서 복사했으면 첫 번째 칸을 이름으로 본다.
 * 같은 시약(같은 키)은 한 번만 넣는다.
 */
export function parseInventoryText(text, { max = 500 } = {}) {
  const items = [];
  const seen = new Set();
  let skipped = 0;
  let duplicates = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const first = line.split("\t").find((cell) => cell.trim() !== "");
    if (first === undefined) continue;
    const name = cleanInventoryName(first);
    if (!name || HEADER.test(name)) continue;
    const key = inventoryKey(name);
    if (!key || name.length > MAX_NAME_LENGTH) {
      skipped += 1;
      continue;
    }
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    if (items.length >= max) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    items.push({ name, key });
  }
  return { items, skipped, duplicates };
}

// 한국어 표기 → 내장 시약(표시 이름) / 형태 계열
const KO_DISPLAY_INDEX = new Map();
for (const [display, names] of Object.entries(KO_BY_DISPLAY)) for (const n of names) KO_DISPLAY_INDEX.set(inventoryKey(n), display);

const KO_FAMILY_INDEX = new Map();
for (const fam of FORM_FAMILIES) {
  KO_FAMILY_INDEX.set(inventoryKey(fam.title), fam);
  for (const n of KO_BY_FAMILY[fam.id] ?? []) KO_FAMILY_INDEX.set(inventoryKey(n), fam);
}

const KO_HYDRATE = /(?:[0-9]+|[일이삼사오육칠팔구십]+)?\s*수화물|무수물|무수|결정수\s*\d*/g;

/** "염화마그네슘 6수화물" → 기본 이름과 결정수 표기 여부 */
function stripKoHydrate(name) {
  const hydrated = /(?:[0-9]+|[일이삼사오육칠팔구십]+)?\s*수화물/.test(name);
  return { base: name.replace(KO_HYDRATE, " ").replace(/\s+/g, " ").trim(), hydrated };
}

/** 같은 이름을 부르는 여러 표기: 정리한 이름, 괄호 설명을 뗀 이름 (로마 숫자 괄호 "(II)"와 화학식 괄호는 남긴다) */
function variants(name) {
  const cleaned = cleanInventoryName(name);
  const noParen = cleaned.replace(/\((?![ivx]+\))(?=[^)]*[가-힣a-z]{3,})[^)]*\)/gi, " ").replace(/\s+/g, " ").trim();
  return [...new Set([cleaned, noParen].filter(Boolean))];
}

/**
 * 한 이름이 가리킬 수 있는 모든 표기(keys)와, 수화물·염 계열(family)·형태 번호(formIndex).
 * formIndex: 숫자 = 특정 형태, null = 일반 이름(기본 형태), -1 = 형태가 따로 적혀 있지만 어떤 형태인지 모름
 */
export function aliasInfo(name) {
  const keys = new Set();
  const add = (n) => {
    const k = inventoryKey(n);
    if (k) keys.add(k);
  };
  let family = null;
  let formIndex = null;

  for (const v of variants(name)) {
    add(v);
    const vKey = inventoryKey(v);
    const display = KO_DISPLAY_INDEX.get(vKey) ?? findEntry(v)?.display ?? null;
    if (display) {
      add(display);
      findEntry(display)?.names.forEach(add);
      (KO_BY_DISPLAY[display] ?? []).forEach(add);
    }

    const fc = formCandidates(v) ?? (display ? formCandidates(display) : null);
    if (fc && !family) {
      family = FORM_FAMILIES.find((f) => f.id === fc.id);
      formIndex = fc.named;
    }
    if (!family) {
      // 한글 이름: "염화마그네슘 6수화물" → 계열 + 형태를 알 수 없음
      const { base, hydrated } = stripKoHydrate(v);
      const fam = KO_FAMILY_INDEX.get(inventoryKey(base));
      if (fam) {
        family = fam;
        formIndex = hydrated ? -1 : null;
      }
    }
  }

  if (family) {
    if (formIndex === null) {
      // 일반 이름은 기본 형태(무수물 등)와 계열의 일반 이름·한글 이름을 모두 가리킨다
      family.names.forEach(add);
      family.forms[0].aliases.forEach(add);
      add(family.title);
      (KO_BY_FAMILY[family.id] ?? []).forEach(add);
    } else if (formIndex >= 0) {
      family.forms[formIndex].aliases.forEach(add);
    }
  }
  return { keys, familyId: family?.id ?? null, formIndex };
}

/** 같은 시약을 다르게 적은 이름(NaCl / sodium chloride / 염화나트륨)이 같은 값이 되는 식별자 */
export function reagentIdentity(name) {
  const info = aliasInfo(name);
  for (const v of variants(name)) {
    const display = KO_DISPLAY_INDEX.get(inventoryKey(v)) ?? findEntry(v)?.display;
    if (display) return `db:${display}`;
  }
  if (info.familyId) return `fam:${info.familyId}:${info.formIndex ?? "any"}`;
  return inventoryKey(name);
}

/** 보유 목록을 한 번 정리해 두고 여러 시약을 빠르게 대조한다 */
export function buildInventoryIndex(items) {
  const entries = items.map((item) => ({ ...item, info: aliasInfo(item.name) }));
  const byKey = new Map();
  const byFamily = new Map();
  for (const e of entries) {
    for (const k of e.info.keys) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(e);
    }
    if (e.info.familyId) {
      if (!byFamily.has(e.info.familyId)) byFamily.set(e.info.familyId, []);
      byFamily.get(e.info.familyId).push(e);
    }
  }
  return { size: entries.length, byKey, byFamily };
}

/**
 * 논문에서 뽑은 시약 하나를 보유 목록과 대조한다.
 * status: have(있음) | variant(같은 시약의 다른 형태만 있음) | missing(구매 요망) | exempt(대조 대상 아님) | none(보유 목록이 비어 있음)
 */
export function checkInventory(name, index) {
  const n = String(name ?? "").trim();
  if (!n) return null;
  if (findEntry(n)?.display === "Water") return { status: "exempt", reason: "물은 대조하지 않아요" };
  if (isMixtureName(n)) return { status: "exempt", reason: "혼합 용액이라 구성 성분으로 확인해 주세요" };
  if (!index || index.size === 0) return { status: "none" };

  const info = aliasInfo(n);
  const exact = new Map();
  for (const k of info.keys) for (const e of index.byKey.get(k) ?? []) exact.set(e.key, e);
  if (exact.size > 0) return { status: "have", matched: [...exact.values()].map((e) => e.name) };

  if (info.familyId) {
    const same = index.byFamily.get(info.familyId) ?? [];
    if (same.length > 0) return { status: "variant", matched: same.map((e) => e.name) };
  }
  return { status: "missing" };
}

/** 대조 결과를 시약 목록 전체에 적용해 요약한다 (같은 시약은 한 번만 센다) */
export function summarizeInventory(names, index) {
  const out = { have: 0, variant: 0, missing: [], variantNames: [], exempt: 0, none: false };
  const seen = new Set();
  for (const name of names) {
    if (!inventoryKey(name)) continue;
    const id = reagentIdentity(name);
    if (seen.has(id)) continue;
    seen.add(id);
    const r = checkInventory(name, index);
    if (!r) continue;
    if (r.status === "have") out.have += 1;
    else if (r.status === "variant") {
      out.variant += 1;
      out.variantNames.push(String(name).trim());
    } else if (r.status === "missing") out.missing.push(String(name).trim());
    else if (r.status === "exempt") out.exempt += 1;
    else if (r.status === "none") out.none = true;
  }
  return out;
}
