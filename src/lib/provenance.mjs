// AI가 뽑은 값이 논문 원문에 그대로 적혀 있는지(paper), 아니면 AI가 환산·해석·요약했거나 사용자가 고친 값인지(ai)를 가려낸다.
// AI의 자기 보고를 믿지 않고, 값을 원문과 직접 맞춰 보는 방식이라 AI가 없는 말을 지어내도 걸러진다.

import { findEntry, normalizeName, parseQuantity } from "./chem.mjs";
import { formCandidates } from "./forms.mjs";
import { parseDuration } from "./timeline.mjs";

const UNIT = String.raw`(?:mmol|[µμu]mol|nmol|mol|kg|mg|[µμu]g|ng|g|mL|[µμu]L|L|mM|[µμu]M|nM|pM|M|%(?:\s*\(?\s*[wv]\s*\/\s*[wv]\s*\)?)?)`;
const QUANTITY_RE = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(${UNIT})(?:\s*(?:\/|per)\s*(?:\d+(?:\.\d+)?\s*)?(?:mL|[µμu]L|L))?(?![A-Za-z])`, "gi");
const DURATION_RE = /(\d+(?:\.\d+)?)(?:\s*[-–~]\s*(\d+(?:\.\d+)?))?\s*(days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|seconds?|secs?|sec|s)(?![A-Za-z])/gi;
const ABBREV = /\b(approx|e\.g|i\.e|vs|Fig|Figs|ca|cf|et al)\./gi;
const WORD_COUNT = { once: 1, twice: 2, thrice: 3, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// 비교용 표기: 소문자, µ→u, 숫자와 단위 사이 공백 제거 ("0.5 M" = "0.5M")
const loose = (s) =>
  String(s ?? "").normalize("NFKC").toLowerCase().replace(/[μµ]/g, "u").replace(/(\d)\s+(?=[a-z%])/g, "$1").replace(/\s+/g, " ").trim();

// 글 속에 값이 그대로 있는가. "10 mL"이 "110 mL"에, "2 M"이 "2 mM"에 들어 있다고 보지 않도록 앞뒤 경계를 본다.
function containsBounded(text, value) {
  const h = loose(text);
  const n = loose(value);
  if (!n) return false;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + 1)) {
    const prev = h[i - 1];
    const next = h[i + n.length];
    if (!(prev && /[0-9.]/.test(prev)) && !(next && /[a-z0-9]/.test(next))) return true;
  }
  return false;
}

/** 글을 문장으로 나눈다 (약어의 마침표에서는 자르지 않는다) */
export function splitSentences(text) {
  const protectedText = String(text ?? "").replace(ABBREV, (m) => m.replace(".", "\u0001"));
  return protectedText
    .split(/(?<=[.!?。])\s+(?=[A-Z0-9(\[가-힣])|\n+/)
    .map((s) => s.replace(/\u0001/g, ".").trim())
    .filter(Boolean);
}

/** 글자·숫자 덩어리(토큰)와 그 위치 */
function tokenize(text) {
  const out = [];
  for (const m of String(text ?? "").normalize("NFKC").matchAll(/[A-Za-z0-9가-힣]+/g)) {
    out.push({ t: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** 이름 키(영문·숫자만 남긴 소문자)와 같아지는 연속 토큰 구간을 찾는다. 단어 일부가 우연히 겹치는 경우(perhaps ⊃ aps)는 제외된다. */
function findKeyRanges(tokens, key) {
  const ranges = [];
  for (let i = 0; i < tokens.length; i++) {
    let acc = "";
    for (let j = i; j < tokens.length && j < i + 10; j++) {
      acc += tokens[j].t;
      if (acc === key) {
        ranges.push([tokens[i].start, tokens[j].end]);
        break;
      }
      if (acc.length >= key.length || !key.startsWith(acc)) break;
    }
  }
  return ranges;
}

/** 시약 이름이 글에 나올 수 있는 모든 표기(키) */
function nameKeys(name) {
  const keys = new Set();
  const add = (n) => {
    const k = normalizeName(n).key;
    if (k.length >= 2) keys.add(k);
  };
  add(name);
  String(name ?? "").split(/[()]/).forEach((part) => part.trim() && add(part));
  const entry = findEntry(name);
  entry?.names.forEach(add);
  const fc = formCandidates(name);
  if (fc) {
    if (fc.named != null) fc.forms[fc.named].aliases.forEach(add);
    else fc.forms[0]?.aliases.forEach(add);
  }
  return [...keys];
}

function sameQuantity(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  const close = (x, y) => Math.abs(x - y) <= 1e-9 + 1e-6 * Math.max(Math.abs(x), Math.abs(y));
  switch (a.type) {
    case "molar": return close(a.molPerL, b.molPerL);
    case "mass": return close(a.g, b.g);
    case "volume": return close(a.mL, b.mL);
    case "mole": return close(a.mol, b.mol);
    case "percent": return close(a.percent, b.percent) && (!a.basis || !b.basis || a.basis === b.basis);
    case "perVolume": return a.dim === b.dim && close(a.perMl, b.perMl);
    case "count": return close(a.n, b.n);
    case "fold": return close(a.factor, b.factor);
    default: return false;
  }
}

/** 글 속 수량 표현들 (위치 포함) */
function quantitiesIn(text) {
  const out = [];
  for (const m of String(text ?? "").normalize("NFKC").matchAll(QUANTITY_RE)) {
    const q = parseQuantity(m[0].trim());
    if (q) out.push({ q, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function durationsIn(text) {
  const out = [];
  for (const m of String(text ?? "").normalize("NFKC").matchAll(DURATION_RE)) {
    const d = parseDuration(m[0]);
    if (d) out.push({ minutes: d.minutes, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** 값(농도·부피·양)이 글에 같은 크기로 적혀 있는가. 단위 표기가 달라도(mg/mL vs mg per mL) 크기가 같으면 인정한다. */
export function quantityInText(value, text) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (containsBounded(text, v)) return true;
  const target = parseQuantity(v);
  if (!target) return false;
  return quantitiesIn(text).some(({ q }) => sameQuantity(target, q));
}

export function durationInText(value, text) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (containsBounded(text, v)) return true;
  const target = parseDuration(v);
  if (!target) return false;
  return durationsIn(text).some((d) => Math.abs(d.minutes - target.minutes) < 1e-6);
}

export function nameInText(name, text) {
  const tokens = tokenize(text);
  return nameKeys(name).some((key) => findKeyRanges(tokens, key).length > 0);
}

const numbersIn = (s) => (String(s ?? "").normalize("NFKC").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** 조건(온도·pH 등): 적힌 숫자가 모두 글에 있으면 원문 값으로 본다. 숫자가 없으면 글자 그대로 들어 있는지 본다. */
export function detailsInText(details, text) {
  const d = String(details ?? "").trim();
  if (!d) return null;
  const nums = numbersIn(d);
  if (nums.length > 0) {
    const have = new Set(numbersIn(text));
    return nums.every((n) => have.has(n));
  }
  return loose(text).includes(loose(d));
}

/** 반복 횟수: "3 times", "×3", "twice", "3회" 같은 표현이 글에 있는가 */
export function repeatInText(repeat, text) {
  const n = Math.floor(Number(repeat));
  if (!Number.isFinite(n) || n <= 1) return null;
  const s = String(text ?? "").normalize("NFKC").toLowerCase();
  for (const m of s.matchAll(/(\d+)\s*(?:times|time|x\b|×|cycles?|rounds?|회|번)|[x×]\s*(\d+)\b|\b(once|twice|thrice|two|three|four|five|six|seven|eight|nine|ten)\s+times?\b|\b(twice|thrice)\b/g)) {
    const found = m[1] ? Number(m[1]) : m[2] ? Number(m[2]) : WORD_COUNT[m[3] ?? m[4]];
    if (found === n) return true;
  }
  return false;
}

/** 시약 이름이 나오는 문장과 그 다음 문장을 이어 붙인 글 (값을 찾는 범위). 이름이 안 나오면 빈 문자열. */
function reagentContext(name, text) {
  const keys = nameKeys(name);
  if (keys.length === 0) return "";
  const sentences = splitSentences(text);
  const picked = new Set();
  sentences.forEach((sentence, i) => {
    const tokens = tokenize(sentence);
    if (keys.some((k) => findKeyRanges(tokens, k).length > 0)) {
      picked.add(i);
      if (i + 1 < sentences.length) picked.add(i + 1);
    }
  });
  return [...picked].sort((a, b) => a - b).map((i) => sentences[i]).join(" ");
}

const verdict = (found) => (found === null ? null : found ? "paper" : "ai");

function mergeRanges(ranges) {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

function matchingQuantityRanges(sentence, value) {
  const target = parseQuantity(String(value ?? "").trim());
  if (!target) return [];
  return quantitiesIn(sentence).filter(({ q }) => sameQuantity(target, q)).map(({ start, end }) => [start, end]);
}

/** 시약이 나오는 문장 하나와, 그 안에서 이름·값이 적힌 위치 */
export function findReagentEvidence(reagent, text) {
  const keys = nameKeys(reagent?.name);
  if (keys.length === 0) return null;
  let best = null;
  for (const sentence of splitSentences(text)) {
    const tokens = tokenize(sentence);
    const nameRanges = keys.flatMap((k) => findKeyRanges(tokens, k));
    if (nameRanges.length === 0) continue;
    const concRanges = matchingQuantityRanges(sentence, reagent.concentration);
    const volRanges = matchingQuantityRanges(sentence, reagent.volume);
    const score = (concRanges.length > 0 ? 1 : 0) + (volRanges.length > 0 ? 1 : 0);
    if (!best || score > best.score) best = { score, sentence, ranges: mergeRanges([...nameRanges, ...concRanges, ...volRanges]) };
    if (score === 2) break;
  }
  return best ? { sentence: best.sentence, ranges: best.ranges } : null;
}

/** 단계가 나오는 문장: 적힌 시간(없으면 조건의 숫자)이 들어 있는 첫 문장 */
export function findStepEvidence(step, text) {
  const target = parseDuration(step?.duration);
  const nums = numbersIn(step?.details);
  for (const sentence of splitSentences(text)) {
    const ranges = [];
    if (target) for (const d of durationsIn(sentence)) if (Math.abs(d.minutes - target.minutes) < 1e-6) ranges.push([d.start, d.end]);
    if (ranges.length === 0 && !target && nums.length > 0) {
      for (const m of sentence.matchAll(/\d+(?:\.\d+)?/g)) if (nums.includes(Number(m[0]))) ranges.push([m.index, m.index + m[0].length]);
    }
    if (ranges.length > 0) return { sentence, ranges: mergeRanges(ranges) };
  }
  return null;
}

const FIELD_LABEL = { name: "이름", concentration: "농도", volume: "부피", duration: "시간", repeat: "반복", details: "조건", label: "단계 이름", isWaiting: "대기 여부" };

function summarize(fields) {
  const present = Object.entries(fields).filter(([, v]) => v);
  const aiFields = present.filter(([, v]) => v === "ai").map(([k]) => FIELD_LABEL[k]);
  return { overall: aiFields.length === 0 ? "paper" : "ai", aiFields };
}

/**
 * 시약 한 줄의 값마다 원문 일치 여부를 돌려준다. 값이 비어 있으면 null.
 * 원문이 없으면(직접 입력) null 을 돌려준다.
 */
export function analyzeReagent(reagent, text) {
  if (reagent?.userAdded) return null; // 사용자가 직접 넣은 줄은 원문과 맞춰 볼 대상이 아니다(AI 가 뽑은 값이 아니므로)
  if (!String(text ?? "").trim()) return null;
  const hasName = String(reagent?.name ?? "").trim() !== "";
  const context = reagentContext(reagent?.name, text);
  // 값은 그 시약이 언급된 문장 근처에서만 찾는다. 다른 시약의 양이 우연히 같은 값이어도 원문 값으로 치지 않는다.
  const inContext = (value) => (String(value ?? "").trim() === "" ? null : context ? quantityInText(value, context) : false);
  const fields = {
    name: verdict(hasName ? nameInText(reagent.name, text) : null),
    concentration: verdict(inContext(reagent?.concentration)),
    volume: verdict(inContext(reagent?.volume)),
  };
  return { ...fields, ...summarize(fields), evidence: fields.name === "paper" ? findReagentEvidence(reagent, text) : null };
}

/** 실행 단계: 이름(한국어 요약)과 대기 여부는 항상 AI 가 정한 것이고, 시간·반복·조건은 원문과 맞춰 본다. */
export function analyzeStep(step, text) {
  if (step?.userAdded) return null;
  if (!String(text ?? "").trim()) return null;
  const fields = {
    duration: verdict(durationInText(step?.duration, text)),
    repeat: verdict(repeatInText(step?.repeat, text)),
    details: verdict(detailsInText(step?.details, text)),
  };
  return { label: "ai", isWaiting: "ai", ...fields, ...summarize(fields), evidence: findStepEvidence(step, text) };
}

/** 시약 목록의 원문 일치 요약 (값 단위) */
export function countSources(analyses) {
  let paper = 0;
  let ai = 0;
  for (const a of analyses) {
    if (!a) continue;
    for (const k of ["name", "concentration", "volume", "duration", "repeat", "details"]) {
      if (a[k] === "paper") paper += 1;
      else if (a[k] === "ai") ai += 1;
    }
  }
  return { paper, ai };
}
