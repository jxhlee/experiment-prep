import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeReagent,
  analyzeStep,
  countSources,
  detailsInText,
  durationInText,
  findReagentEvidence,
  nameInText,
  quantityInText,
  repeatInText,
  splitSentences,
} from "../src/lib/provenance.mjs";
import { SAMPLE_METHODS } from "../src/lib/sample.mjs";

const TEXT = SAMPLE_METHODS;

test("문장 나누기: 소수점·약어의 마침표에서는 자르지 않는다", () => {
  const s = splitSentences("Stir for 0.5 h at approx. 5 mL min-1. Then add 1.213 g of NaCl. Done.");
  assert.equal(s.length, 3);
  assert.ok(s[0].includes("approx. 5 mL"));
  assert.ok(s[1].startsWith("Then add 1.213 g"));
});

test("이름: 원문 표기와 달라도(약어·영문 이름·결정수) 같은 시약이면 원문 값으로 본다", () => {
  assert.equal(nameInText("Bi(NO3)3·5H2O", TEXT), true);
  assert.equal(nameInText("NH4VO3", TEXT), true);
  assert.equal(nameInText("Ethylene glycol", TEXT), true);
  assert.equal(nameInText("sodium chloride", "Cells were washed in 150 mM NaCl."), true);
  assert.equal(nameInText("NaCl", "Cells were washed in 150 mM sodium chloride."), true);
  assert.equal(nameInText("Zzyzx-9", TEXT), false);
  // 단어 일부가 우연히 겹치는 경우는 제외
  assert.equal(nameInText("APS", "Perhaps the sample was dried."), false);
  assert.equal(nameInText("APS", "10% APS was added."), true);
});

test("값: 같은 크기면 표기가 달라도 원문 값, 크기가 다르면 AI 해석", () => {
  assert.equal(quantityInText("20 mL", TEXT), true);
  assert.equal(quantityInText("2 M", TEXT), true);
  assert.equal(quantityInText("0.2 mg", TEXT), true);
  assert.equal(quantityInText("2.5 mmol", TEXT), true);
  assert.equal(quantityInText("0.0002 g", TEXT), true, "0.2 mg = 0.0002 g");
  assert.equal(quantityInText("25 mL", TEXT), false);
  assert.equal(quantityInText("1.5 g", TEXT), false);
  assert.equal(quantityInText("", TEXT), null);
});

test("값: 더 큰 수나 다른 단위의 일부를 원문 값으로 착각하지 않는다", () => {
  assert.equal(quantityInText("10 mL", "Add 110 mL of buffer."), false);
  assert.equal(quantityInText("2 M", "Add 2 mM EDTA."), false);
  assert.equal(quantityInText("5 mL", "Add 5 mL of buffer."), true);
  assert.equal(quantityInText("0.5 M", "in 0.5M NaOH"), true);
  assert.equal(quantityInText("2 mg/mL", "BSA (2 mg per mL)"), true);
});

test("시간: 단위를 바꿔 적어도 같은 길이면 원문 값 (0.5 h = 30 min)", () => {
  assert.equal(durationInText("30 min", TEXT), true);
  assert.equal(durationInText("24 h", TEXT), true);
  assert.equal(durationInText("6 min", TEXT), true);
  assert.equal(durationInText("45 min", TEXT), false);
  assert.equal(durationInText("1440 min", TEXT), true, "24 h");
  assert.equal(durationInText("overnight", "Incubate overnight at 4 °C."), true);
  assert.equal(durationInText("overnight", TEXT), false);
  assert.equal(durationInText("", TEXT), null);
});

test("조건: 숫자가 모두 원문에 있어야 원문 값", () => {
  assert.equal(detailsInText("473 K", TEXT), true);
  assert.equal(detailsInText("pH 2.1", TEXT), true);
  assert.equal(detailsInText("pH 7.4", TEXT), false);
  assert.equal(detailsInText("room temperature", "stirred at room temperature for 6 min"), true);
  assert.equal(detailsInText("상온", TEXT), false);
  assert.equal(detailsInText("", TEXT), null);
});

test("반복 횟수: 원문에 횟수 표현이 있어야 원문 값", () => {
  assert.equal(repeatInText(3, "washed 3 times with PBS"), true);
  assert.equal(repeatInText(2, "washed twice with PBS"), true);
  assert.equal(repeatInText(3, "washed twice with PBS"), false);
  assert.equal(repeatInText(3, "repeated ×3"), true);
  assert.equal(repeatInText(1, TEXT), null);
});

test("시약 한 줄 분석: 원문 그대로인 값과 AI 가 바꾼 값을 구분하고, 근거 문장을 찾는다", () => {
  const a = analyzeReagent({ name: "NH4VO3", concentration: "", volume: "0.292 g" }, TEXT);
  assert.equal(a.name, "paper");
  assert.equal(a.concentration, null);
  assert.equal(a.volume, "paper");
  assert.equal(a.overall, "paper");
  assert.ok(a.evidence.sentence.includes("NH4VO3"));
  assert.ok(a.evidence.ranges.length >= 2, "이름과 값 위치를 표시");

  const changed = analyzeReagent({ name: "NH4VO3", concentration: "", volume: "0.5 g" }, TEXT);
  assert.equal(changed.volume, "ai");
  assert.equal(changed.overall, "ai");
  assert.deepEqual(changed.aiFields, ["부피"]);

  const invented = analyzeReagent({ name: "Zzyzx-9", concentration: "10 mM", volume: "20 mL" }, TEXT);
  assert.equal(invented.name, "ai");
  assert.equal(invented.evidence, null);
});

test("같은 시약이 여러 번 나오면 값이 가장 많이 맞는 문장을 근거로 쓴다", () => {
  const e = findReagentEvidence({ name: "NaOH", concentration: "0.01 M", volume: "50 mL" }, TEXT);
  assert.ok(e.sentence.includes("0.01 M NaOH"), e.sentence);
});

test("단계 분석: 이름·대기 여부는 항상 AI, 시간·조건은 원문과 맞춰 본다", () => {
  const a = analyzeStep({ label: "수열 반응", duration: "24 h", repeat: 1, details: "473 K", isWaiting: true }, TEXT);
  assert.equal(a.label, "ai");
  assert.equal(a.isWaiting, "ai");
  assert.equal(a.duration, "paper");
  assert.equal(a.details, "paper");
  assert.equal(a.repeat, null);
  assert.ok(a.evidence.sentence.includes("24 h"));

  const converted = analyzeStep({ label: "교반", duration: "30 min", repeat: 1, details: "", isWaiting: false }, TEXT);
  assert.equal(converted.duration, "paper", "0.5 h 가 30 min 으로 바뀐 것은 값이 같음");

  const guessed = analyzeStep({ label: "건조", duration: "2 h", repeat: 1, details: "", isWaiting: true }, TEXT);
  assert.equal(guessed.duration, "ai");
  assert.deepEqual(guessed.aiFields, ["시간"]);
});

test("원문이 없으면(직접 입력) 분석하지 않는다", () => {
  assert.equal(analyzeReagent({ name: "NaCl", concentration: "1 M", volume: "1 L" }, ""), null);
  assert.equal(analyzeStep({ label: "x" }, "   "), null);
});

test("countSources: 값 단위로 원문/AI 개수를 센다", () => {
  const rows = [
    analyzeReagent({ name: "NH4VO3", concentration: "", volume: "0.292 g" }, TEXT),
    analyzeReagent({ name: "Zzyzx-9", concentration: "10 mM", volume: "20 mL" }, TEXT),
    null,
  ];
  assert.deepEqual(countSources(rows), { paper: 2, ai: 3 });
});
