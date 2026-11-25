import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProcedure, reagentPhrase, USER_ADDED_LABEL } from "../src/lib/procedure.mjs";

const reagents = [
  { id: 1, name: "NaOH", concentration: "2 M", volume: "20 mL" },
  { id: 2, name: "Ethylene glycol", concentration: "", volume: "10 mL" },
  { id: 3, name: "primary antibody", concentration: "1:1000", volume: "" },
];
const step = (id, label, duration, extra = {}) => ({ id, label, duration, repeat: 1, details: "", isWaiting: false, reagentIds: [], ...extra });

test("시약 문구: 계산할 수 있으면 양과 용액 정보, 없으면 적힌 값 그대로", () => {
  assert.equal(reagentPhrase(reagents[0]).text, "NaOH 1.60 g (2 M, 20 mL 용액)");
  assert.equal(reagentPhrase(reagents[0], { scaleFactor: 2 }).text, "NaOH 3.20 g (2 M, 40 mL 용액)");
  assert.equal(reagentPhrase(reagents[1]).text, "Ethylene glycol 10.0 mL");
  assert.equal(reagentPhrase(reagents[2]).text, "primary antibody (1:1000)");
  assert.equal(reagentPhrase({ id: 9, name: "PBS", concentration: "", volume: "" }).text, "PBS");
  assert.equal(reagentPhrase({ id: 9, name: "", concentration: "", volume: "" }).name, "(이름 없음)");
});

test("양(mmol)으로 적힌 줄은 어디에 녹이는지까지 말한다", () => {
  const p = reagentPhrase({ id: 1, name: "NaCl", concentration: "2.5 mmol", volume: "20 mL" });
  assert.equal(p.text, "NaCl 0.146 g (2.5 mmol, 20 mL에 녹임)");
});

test("직접 추가한 시약은 표시가 붙는다", () => {
  const p = reagentPhrase({ id: 4, name: "Ethanol", concentration: "", volume: "5 mL", userAdded: true });
  assert.equal(p.userAdded, true);
  assert.ok(p.text.endsWith(`[${USER_ADDED_LABEL}]`));
});

test("전체 과정: 단계마다 쓰는 시약과 양, 조건, 시작 시점이 한 문장에 들어간다", () => {
  const p = buildProcedure({
    reagents,
    steps: [
      step(1, "시약 첨가", "", { reagentIds: [1, 2], details: "실온" }),
      step(2, "수열 반응", "24 h", { isWaiting: true, details: "473 K" }),
      step(3, "항체 배양", "1 h", { reagentIds: [3] }),
    ],
  });
  assert.equal(p.items.length, 3);
  assert.equal(
    p.items[0].sentence,
    "1단계 「시약 첨가」: 실험 시작과 함께 진행합니다(소요 시간이 적혀 있지 않아 전체 시간에서 제외). 쓰는 시약은 NaOH 1.60 g (2 M, 20 mL 용액), Ethylene glycol 10.0 mL입니다. 내용: 실온.",
  );
  assert.match(p.items[1].sentence, /^2단계 「수열 반응」: 앞 단계가 끝나는 대로 진행하며 1일 걸립니다\. 내용: 473 K\./);
  assert.match(p.items[1].sentence, /다음 단계 「항체 배양」에 쓸 시약\(primary antibody\)과 기구를 미리 준비/);
  assert.match(p.items[2].sentence, /쓰는 시약은 primary antibody \(1:1000\)입니다/);
  assert.equal(p.total.text, "1일 1시간");
  assert.equal(p.items[0].timeKnown, false);
  assert.deepEqual(p.items[0].reagents.map((r) => r.name), ["NaOH", "Ethylene glycol"]);
});

test("어느 단계에도 연결되지 않은 시약(직접 추가한 것 포함)은 빠뜨리지 않고 따로 알린다", () => {
  const rs = [...reagents, { id: 4, name: "Ethanol", concentration: "", volume: "5 mL", userAdded: true }];
  const p = buildProcedure({ reagents: rs, steps: [step(1, "첨가", "5 min", { reagentIds: [1] })] });
  assert.deepEqual(p.unlinked.map((u) => u.name), ["Ethylene glycol", "primary antibody", "Ethanol"]);
  assert.equal(p.summary.reagents, 4);
  assert.equal(p.summary.linked, 1);
  assert.equal(p.summary.userReagents, 1);
  const last = p.lines.at(-1);
  assert.match(last, /^어느 단계에서 쓰는지 연결하지 않은 시약: /);
  assert.ok(last.includes("Ethanol 5.00 mL [직접 추가]"));
});

test("사용자가 넣은 단계도 순서와 시간·시약이 그대로 이어 붙는다", () => {
  const p = buildProcedure({
    reagents,
    steps: [
      step(1, "녹이기", "10 min", { reagentIds: [1] }),
      step(2, "초음파 처리", "30 min", { userAdded: true, reagentIds: [2], details: "40 kHz" }), // 중간에 끼워 넣은 단계
      step(3, "건조", "1 h"),
    ],
  });
  assert.deepEqual(p.items.map((x) => x.label), ["녹이기", "초음파 처리", "건조"]);
  assert.equal(p.items[1].userAdded, true);
  assert.match(p.items[1].sentence, /^2단계 「초음파 처리」 \[직접 추가\]: 시작 후 10분이 지난 시점에 진행하며 30분 걸립니다\. 쓰는 시약은 Ethylene glycol 10\.0 mL입니다\. 내용: 40 kHz\./);
  assert.match(p.items[2].sentence, /시작 후 40분이 지난 시점에/);
  assert.equal(p.summary.userSteps, 1);
});

test("연결된 시약이 지워졌거나 중복돼도 깨지지 않는다", () => {
  const p = buildProcedure({ reagents, steps: [step(1, "첨가", "1 min", { reagentIds: [1, 1, 999] })] });
  assert.deepEqual(p.items[0].reagents.map((r) => r.id), [1]);
});

test("마무리 문장: 전체 시간과 시간이 없는 단계 수", () => {
  const p = buildProcedure({ reagents, steps: [step(1, "첨가", ""), step(2, "교반", "1 h"), step(3, "여과", "")] });
  assert.equal(p.total.unknownCount, 2);
  assert.ok(p.lines.some((l) => l === "전체 실험은 약 1시간 걸립니다 (시간이 적혀 있지 않은 2개 단계는 제외)."));
});

test("단계가 없으면 모든 시약이 연결되지 않은 것으로 나온다", () => {
  const p = buildProcedure({ reagents, steps: [] });
  assert.equal(p.items.length, 0);
  assert.equal(p.total, null);
  assert.equal(p.unlinked.length, 3);
  assert.equal(buildProcedure({}).lines.length, 0);
});

test("이름이 없는 빈 시약 줄은 연결 안 된 시약으로 세지 않는다", () => {
  const p = buildProcedure({ reagents: [{ id: 1, name: "", concentration: "", volume: "" }], steps: [step(1, "첨가", "1 min")] });
  assert.equal(p.unlinked.length, 0);
  assert.equal(p.summary.reagents, 0);
});
