import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResultsSnapshot, defaultTitle, fromRecord, toRecord } from "../src/lib/experiments.mjs";

const reagents = [
  { id: 7, name: "NaCl", concentration: "150 mM", volume: "100 mL" },
  { id: 8, name: "HCl", concentration: "1 M", volume: "" },
];
const steps = [
  { id: 3, label: "배양", duration: "30 min", repeat: 1, details: "얼음 위", isWaiting: true },
  { id: 4, label: "세척", duration: "10 min", repeat: "3", details: "", isWaiting: false },
];
const base = { title: "  테스트 실험  ", methodText: "Cells were lysed.", reagents, steps, scaleFactor: 2, sigFigs: 3, mwMap: {} };

test("저장 레코드: 입력값은 정리되고 화면용 id 는 빠진다", () => {
  const r = toRecord(base);
  assert.equal(r.title, "테스트 실험");
  assert.equal(r.method_text, "Cells were lysed.");
  assert.deepEqual(r.reagents[0], { name: "NaCl", concentration: "150 mM", volume: "100 mL" });
  assert.deepEqual(r.steps[1], { label: "세척", duration: "10 min", repeat: 3, details: "", isWaiting: false });
  assert.equal(Object.hasOwn(r.reagents[0], "id"), false);
});

test("저장 레코드: DB 제한(길이·범위)에 맞게 자른다", () => {
  const r = toRecord({ ...base, title: "가".repeat(300), methodText: "x".repeat(70000), scaleFactor: 5000, sigFigs: 9 });
  assert.equal(r.title.length, 120);
  assert.equal(r.method_text.length, 60000);
  assert.equal(r.scale_factor, 1000);
  assert.equal(r.sig_figs, 6);
  for (const bad of [0, -3, NaN, Infinity, undefined]) assert.equal(toRecord({ ...base, scaleFactor: bad }).scale_factor, 1, String(bad));
  assert.equal(toRecord({ ...base, sigFigs: "x" }).sig_figs, 3);
  assert.equal(toRecord({ ...base, sigFigs: 4 }).sig_figs, 4);
});

test("결과 스냅샷: 배수·유효숫자가 반영되고, 계산 못 한 줄은 사유를 남긴다", () => {
  const snap = buildResultsSnapshot({ reagents, steps, scaleFactor: 2, sigFigs: 3 });
  const nacl = snap.weighing[0];
  assert.equal(nacl.ok, true);
  assert.equal(nacl.text, "1.75 g"); // 0.15 M × 0.1 L × 58.44 × 2배 = 1.7532 g
  assert.ok(Math.abs(nacl.value - 1.7532) < 1e-9);
  assert.equal(snap.weighing[1].ok, false);
  assert.ok(snap.weighing[1].reason.includes("농축 원액"));
  assert.equal(snap.merged.length, 1);
  assert.equal(snap.timeline.totalMin, 60); // 30 + 10×3
  assert.equal(snap.timeline.items[1].startMin, 30);
  assert.equal(snap.scaleFactor, 2);
});

test("레코드는 JSON 으로 그대로 저장·복원된다", () => {
  const r = toRecord(base);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

test("불러오기: 저장했던 시약·단계가 편집 가능한 상태로 복원된다", () => {
  const loaded = fromRecord({ id: "abc", ...toRecord(base) });
  assert.equal(loaded.id, "abc");
  assert.equal(loaded.title, "테스트 실험");
  assert.equal(loaded.scaleFactor, 2);
  assert.deepEqual(loaded.reagents.map((r) => r.id), [1, 2]);
  assert.equal(loaded.reagents[1].name, "HCl");
  assert.deepEqual(loaded.steps.map((s) => [s.id, s.label, s.repeat, s.isWaiting]), [[1, "배양", 1, true], [2, "세척", 3, false]]);
});

test("불러오기: 비어 있거나 이상한 값이 와도 깨지지 않는다", () => {
  const loaded = fromRecord({ id: "x", title: null, method_text: null, scale_factor: "0", sig_figs: 99, reagents: "no", steps: [null, { repeat: 0 }] });
  assert.equal(loaded.title, "");
  assert.equal(loaded.scaleFactor, 1);
  assert.equal(loaded.sigFigs, 6);
  assert.deepEqual(loaded.reagents, []);
  assert.deepEqual(loaded.steps.map((s) => s.repeat), [1, 1]);
});

test("기본 이름은 날짜가 들어간다", () => {
  assert.equal(defaultTitle(new Date("2026-10-30T09:00:00Z")), "새 실험 2026-10-30");
});
