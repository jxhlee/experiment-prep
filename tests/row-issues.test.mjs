import { test } from "node:test";
import assert from "node:assert/strict";
import { reagentIssues, stepIssues } from "../src/lib/row-issues.mjs";
import { buildInventoryIndex, inventoryKey } from "../src/lib/inventory.mjs";
import { analyzeReagent, analyzeStep } from "../src/lib/provenance.mjs";

const index = (...names) => buildInventoryIndex(names.map((name) => ({ name, key: inventoryKey(name) })));
const ids = (issues) => issues.map((i) => i.id);

test("정상인 시약(원문 일치·보유 중)은 아무것도 보여 주지 않는다", () => {
  const text = "NaCl (5 g) was dissolved in 100 mL of water.";
  const analysis = analyzeReagent({ name: "NaCl", concentration: "", volume: "5 g" }, text);
  assert.deepEqual(reagentIssues({ name: "NaCl", analysis, inventoryIndex: index("염화나트륨") }), []);
});

test("보유 목록이 없거나 이름이 비어 있으면 보유 관련 표시는 없다", () => {
  assert.deepEqual(reagentIssues({ name: "KCl", inventoryIndex: buildInventoryIndex([]) }), []);
  assert.deepEqual(reagentIssues({ name: "  ", inventoryIndex: index("NaCl") }), []);
});

test("없는 시약은 '구매 요망', 같은 시약의 다른 형태만 있으면 '다른 형태 보유'", () => {
  const idx = index("NaCl", "MgCl2·6H2O");
  assert.deepEqual(ids(reagentIssues({ name: "KCl", inventoryIndex: idx })), ["missing"]);
  const v = reagentIssues({ name: "MgCl2", inventoryIndex: idx });
  assert.deepEqual(ids(v), ["variant"]);
  assert.match(v[0].hint, /MgCl2·6H2O/);
});

test("PubChem 에서 못 찾은 이름과 AI 가 바꾼 값을 알린다", () => {
  const text = "NH4VO3 (0.292 g) was dissolved in 20 mL of water.";
  const analysis = analyzeReagent({ name: "NH4VO3", concentration: "", volume: "0.5 g" }, text);
  const issues = reagentIssues({ name: "Zzyzx-9", analysis, info: { state: "notfound" }, inventoryIndex: index("NaCl") });
  assert.deepEqual(ids(issues), ["missing", "notfound", "ai"], "우선순위: 구매 요망 > 못 찾음 > AI 해석");
  assert.equal(issues.at(-1).text, "AI 해석 · 부피");
  assert.ok(issues.every((i) => i.hint), "화면 낭독기용 설명이 있다");
});

test("확인 중·확인 실패·내장 시약은 주의 사항이 아니다", () => {
  assert.deepEqual(reagentIssues({ name: "unknown thing", info: { state: "checking" } }), []);
  assert.deepEqual(reagentIssues({ name: "unknown thing", info: { state: "error" } }), []);
  assert.deepEqual(reagentIssues({ name: "NaCl" }), []);
});

test("실행 단계: 시간·반복·조건이 원문에서 찾아지지 않을 때만", () => {
  const text = "The suspension was kept at 473 K for 24 h.";
  const ok = analyzeStep({ label: "수열 반응", duration: "24 h", repeat: 1, details: "473 K", isWaiting: true }, text);
  assert.deepEqual(stepIssues({ analysis: ok }), []);
  const guessed = analyzeStep({ label: "건조", duration: "2 h", repeat: 1, details: "", isWaiting: true }, text);
  const issues = stepIssues({ analysis: guessed });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].text, "AI 해석 · 시간");
  assert.deepEqual(stepIssues({ analysis: null }), []);
});
