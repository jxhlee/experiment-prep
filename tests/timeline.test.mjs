import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatMinutes, buildTimeline, buildNarrative, formatStart } from "../src/lib/timeline.mjs";

test("parseDuration: 영어·한글 시간 표현", () => {
  const minutes = (s) => parseDuration(s)?.minutes;
  assert.equal(minutes("30 minutes"), 30);
  assert.equal(minutes("30 min"), 30);
  assert.equal(minutes("5분"), 5);
  assert.equal(minutes("1 hour"), 60);
  assert.equal(minutes("1.5 hours"), 90);
  assert.equal(minutes("1 h 30 min"), 90);
  assert.equal(minutes("1시간 30분"), 90);
  assert.equal(minutes("30 sec"), 0.5);
  assert.equal(minutes("2 days"), 2880);
  assert.equal(minutes("3 x 10 min"), 30);
});

test("parseDuration: 범위·overnight은 추정값으로 표시", () => {
  assert.deepEqual(parseDuration("10-15 min"), { minutes: 15, approx: true });
  assert.deepEqual(parseDuration("10–15 min"), { minutes: 15, approx: true }); // en dash
  assert.deepEqual(parseDuration("10–15 minutes"), { minutes: 15, approx: true });
  assert.deepEqual(parseDuration("overnight"), { minutes: 720, approx: true });
  assert.deepEqual(parseDuration("O/N"), { minutes: 720, approx: true });
});

test("parseDuration: 해석 불가는 null (시간을 지어내지 않는다)", () => {
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration("until the solution turns clear"), null);
  assert.equal(parseDuration("37 °C"), null);
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(30), "30분");
  assert.equal(formatMinutes(75), "1시간 15분");
  assert.equal(formatMinutes(90), "1시간 30분");
  assert.equal(formatMinutes(1440), "1일");
  assert.equal(formatMinutes(0.5), "30초");
  assert.equal(formatMinutes(1.5), "1분 30초");
  assert.equal(formatMinutes(0), "0분");
  assert.equal(formatMinutes(null), "시간 미정");
});

test("buildTimeline: 누적 시작 시각, 반복, 시간 미정 단계 처리", () => {
  const tl = buildTimeline([
    { label: "A", duration: "30 min" },
    { label: "B", duration: "" },
    { label: "C", duration: "15 min", repeat: 3 },
  ]);
  assert.deepEqual(tl.items.map((i) => i.startMin), [0, 30, 30]);
  assert.deepEqual(tl.items.map((i) => i.totalMin), [30, null, 45]);
  assert.equal(tl.totalMin, 75);
  assert.equal(tl.unknownCount, 1);
});

test("buildNarrative: 시작 시점·대기 안내·전체 요약", () => {
  const tl = buildTimeline([
    { label: "배양", duration: "30 min", isWaiting: true, details: "얼음 위" },
    { label: "원심분리", duration: "15 min", isWaiting: false, details: "" },
  ]);
  const lines = buildNarrative(tl);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes("1단계 「배양」"));
  assert.ok(lines[0].includes("실험 시작과 함께"));
  assert.ok(lines[0].includes("얼음 위"));
  assert.ok(lines[0].includes("「원심분리」에 쓸 기구와 시약을 미리 준비"));
  assert.ok(lines[1].includes("시작 후 30분이 지난 시점"));
  assert.ok(!lines[1].includes("미리 준비"));
  assert.ok(lines[2].includes("전체 실험은 약 45분"));
});

test("시간이 미정인 단계 뒤의 시작 시각은 '이후'로만 표시", () => {
  const tl = buildTimeline([
    { label: "A", duration: "" },
    { label: "B", duration: "10 min" },
    { label: "C", duration: "5 min" },
  ]);
  assert.deepEqual(tl.items.map((i) => i.unknownBefore), [0, 1, 1]);
  assert.equal(formatStart(tl.items[0]), "시작 +0분");
  assert.equal(formatStart(tl.items[1]), "시작 +0분 이후");
  assert.equal(formatStart(tl.items[2]), "시작 +10분 이후");
  const lines = buildNarrative(tl);
  assert.ok(lines[1].includes("앞 단계가 끝나는 대로"));
  assert.ok(lines[2].includes("시작 후 최소 10분이 지난 시점에"));
});
