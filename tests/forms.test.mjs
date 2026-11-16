import { test } from "node:test";
import assert from "node:assert/strict";
import { formulaMass, hydrateCount, parseFormula } from "../src/lib/formula.mjs";
import { FORM_FAMILIES, formCandidates, matchForm, probeBaseName, probeQueries, titleMatchesHydrate } from "../src/lib/forms.mjs";
import { findEntry } from "../src/lib/chem.mjs";

test("화학식에서 분자량을 계산한다 (시약병 라벨·PubChem 값과 ±0.05)", () => {
  const known = {
    NaCl: 58.44,
    "MgCl2·6H2O": 203.3,
    "CuSO4·5H2O": 249.68,
    "Na2HPO4·7H2O": 268.07,
    "K4[Fe(CN)6]·3H2O": 422.39,
    "Al2(SO4)3·18H2O": 666.43,
    C10H16N2O8: 292.24,
    "Na2C10H14N2O8·2H2O": 372.24,
    "Bi(NO3)3·5H2O": 485.07,
    "HAuCl4·3H2O": 393.83,
    "CoSO4·7H2O": 281.1,
    "Na2MoO4·2H2O": 241.95,
  };
  for (const [formula, mw] of Object.entries(known)) {
    assert.ok(Math.abs(formulaMass(formula) - mw) <= 0.05, `${formula}: ${formulaMass(formula)} ≠ ${mw}`);
  }
});

test("화학식 해석: 괄호·대괄호·소수 결정수·점 표기, 잘못된 입력은 null", () => {
  assert.deepEqual(parseFormula("Ca(OH)2"), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(parseFormula("K4[Fe(CN)6]"), { K: 4, Fe: 1, C: 6, N: 6 });
  assert.equal(parseFormula("CuCl2·2.5H2O").H, 5);
  assert.equal(parseFormula("MgCl2•6H2O").O, 6);
  assert.equal(parseFormula("Xx2"), null);
  assert.equal(parseFormula("Tris"), null);
  assert.equal(parseFormula("(NaCl"), null);
  assert.equal(parseFormula(""), null);
  assert.equal(formulaMass("DMSO"), null);
});

test("결정수 개수", () => {
  assert.equal(hydrateCount("MgCl2·6H2O"), 6);
  assert.equal(hydrateCount("NaH2PO4·H2O"), 1);
  assert.equal(hydrateCount("MgCl2"), 0);
  assert.equal(hydrateCount("CuCl2·2.5H2O"), 2.5);
});

test("모든 형태 목록의 화학식이 해석되고, 같은 계열 안에서 분자량이 겹치지 않는다", () => {
  for (const fam of FORM_FAMILIES) {
    assert.ok(fam.forms.length >= 2, `${fam.id}: 형태가 둘 이상이어야 고를 의미가 있음`);
    const seen = new Set();
    for (const f of fam.forms) {
      assert.ok(Number.isFinite(f.mw) && f.mw > 0, `${fam.id} ${f.formula}: 분자량을 계산하지 못함`);
      assert.ok(!seen.has(f.mw), `${fam.id}: ${f.formula} 분자량이 다른 형태와 같음`);
      seen.add(f.mw);
    }
  }
});

test("EDTA: 일반 이름은 형태 목록을 보여 주고, 특정 염 이름은 그 형태를 가리킨다", () => {
  const generic = formCandidates("EDTA");
  assert.equal(generic.id, "edta");
  assert.equal(generic.named, null);
  assert.ok(generic.forms.length >= 5);
  assert.equal(generic.forms[0].mw, 292.24);
  const na2 = formCandidates("Na2EDTA·2H2O");
  assert.equal(na2.id, "edta");
  assert.equal(generic.forms[na2.named].mw, 372.24);
  assert.equal(formCandidates("disodium EDTA dihydrate").named, na2.named);
});

test("수화물 이름·화학식 표기가 달라도 같은 계열을 찾는다", () => {
  assert.equal(formCandidates("magnesium chloride hexahydrate").id, "mgcl2");
  assert.equal(formCandidates("MgCl2.6H2O").id, "mgcl2");
  assert.equal(formCandidates("MgCl2 · 6H2O").named, 1);
  assert.equal(formCandidates("copper(II) sulfate pentahydrate").named, 1);
  assert.equal(formCandidates("Sodium phosphate dibasic heptahydrate").forms[formCandidates("Sodium phosphate dibasic heptahydrate").named].hydrate, 7);
  assert.equal(formCandidates("dextrose").id, "glucose");
  assert.equal(formCandidates("Zzyzx"), null);
  assert.equal(formCandidates("NaCl"), null);
});

test("내장 분자량 DB의 수화물 값이 화학식 계산값과 맞는다 (손으로 적은 값 검증)", () => {
  const pairs = [
    ["MgCl2", "MgCl2"], ["MgCl2·6H2O", "MgCl2·6H2O"], ["CaCl2", "CaCl2"], ["CaCl2·2H2O", "CaCl2·2H2O"],
    ["MgSO4", "MgSO4"], ["MgSO4·7H2O", "MgSO4·7H2O"], ["Na2HPO4", "Na2HPO4"], ["Na2HPO4·7H2O", "Na2HPO4·7H2O"],
    ["NaH2PO4", "NaH2PO4"], ["NaH2PO4·H2O", "NaH2PO4·H2O"], ["Na2MoO4", "Na2MoO4"], ["CoSO4", "CoSO4"],
    ["Bi(NO3)3·5H2O", "Bi(NO3)3·5H2O"], ["K4[Fe(CN)6]", "K4[Fe(CN)6]"], ["HAuCl4", "HAuCl4"],
  ];
  for (const [name, formula] of pairs) {
    const entry = findEntry(name);
    assert.ok(entry, `${name}: 내장 DB에 없음`);
    assert.ok(Math.abs(entry.mw - formulaMass(formula)) <= 0.05, `${name}: DB ${entry.mw} ≠ 계산 ${formulaMass(formula)}`);
  }
});

test("matchForm: 지금 쓰는 분자량과 같은 형태를 찾는다", () => {
  const { forms } = formCandidates("MgCl2");
  assert.equal(matchForm(forms, 95.21), 0);
  assert.equal(matchForm(forms, 203.3), 1);
  assert.equal(matchForm(forms, 100), -1);
  assert.equal(matchForm(forms, NaN), -1);
});

test("PubChem 수화물 검색: 기본 이름에서 결정수 표기를 떼고 질의를 만든다", () => {
  assert.equal(probeBaseName("cobalt(II) sulfate heptahydrate"), "cobalt(II) sulfate");
  assert.equal(probeBaseName("MgCl2·6H2O"), "MgCl2");
  assert.equal(probeBaseName("Tris-HCl (pH 7.5)"), "Tris-HCl");
  const q = probeQueries("zinc chloride");
  assert.equal(q[0].query, "zinc chloride");
  assert.equal(q[0].hydrate, null);
  assert.ok(q.some((x) => x.query === "zinc chloride hexahydrate" && x.hydrate === 6));
  assert.deepEqual(probeQueries(""), []);
});

test("PubChem 결과 검증: 제목에 요청한 결정수 단어가 있어야 한다", () => {
  assert.equal(titleMatchesHydrate("Magnesium chloride hexahydrate", 6), true);
  assert.equal(titleMatchesHydrate("Edetate Disodium", 2), false);
  assert.equal(titleMatchesHydrate("Edetic acid dihydrate", 2), true);
  assert.equal(titleMatchesHydrate("Anything", null), true);
  assert.equal(titleMatchesHydrate("Sodium carbonate decahydrate", 1), false);
});

import { existenceOf, summarizeExistence } from "../src/lib/reagent-status.mjs";
import { computeRow, normalizeName } from "../src/lib/chem.mjs";

test("시약 존재 표시: 내장·혼합 용액·PubChem 결과·미확인", () => {
  assert.equal(existenceOf("NaCl", undefined).kind, "builtin");
  assert.equal(existenceOf("PBS", undefined).kind, "mixture");
  assert.equal(existenceOf("   ", undefined), null);
  assert.equal(existenceOf("Zzyzx-9", undefined).kind, "unchecked");
  assert.equal(existenceOf("Zzyzx-9", { state: "checking" }).kind, "checking");
  assert.equal(existenceOf("Zzyzx-9", { state: "notfound" }).tone, "danger");
  assert.equal(existenceOf("Zzyzx-9", { state: "error" }).tone, "warn");
  const found = existenceOf("sodium bromide", { state: "found", cid: 253881, title: "Sodium bromide", formula: "BrNa" });
  assert.equal(found.kind, "found");
  assert.equal(found.cid, 253881);
  assert.match(found.detail, /BrNa/);
});

test("존재 확인 현황 요약: 같은 시약은 한 번만 센다", () => {
  const infos = { zzyzx9: { state: "notfound" }, sodiumbromide: { state: "found" } };
  const names = ["NaCl", "nacl", "Zzyzx-9", "sodium bromide", "PBS", "mystery"];
  const s = summarizeExistence(names, infos, (n) => normalizeName(n).key);
  assert.deepEqual(s, { builtin: 1, found: 1, notfound: 1, pending: 1, mixture: 1 });
});

test("형태를 골라 정한 분자량은 계산에 쓰이고 어떤 형태인지 알려 준다", () => {
  const row = { name: "MgCl2", concentration: "100 mM", volume: "1 L" };
  const base = computeRow(row, { mwMap: {} });
  assert.equal(base.mwSource, "내장 DB");
  const picked = computeRow(row, { mwMap: { mgcl2: { mw: 203.3, source: "user", formula: "MgCl2·6H2O" } } });
  assert.equal(picked.mwSource, "형태 선택");
  assert.ok(Math.abs(picked.value - 20.33) < 1e-9);
  assert.ok(picked.notes.some((n) => n.includes("MgCl2·6H2O")));
  const typed = computeRow(row, { mwMap: { mgcl2: { mw: 100, source: "user" } } });
  assert.equal(typed.mwSource, "직접 입력");
});
