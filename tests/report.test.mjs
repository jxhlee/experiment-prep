import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, formatDateIso, formatDateKo, reportFileTitle, REPORT_TITLE } from "../src/lib/report.mjs";

const DATE = new Date(2026, 10, 19); // 2026-11-19 (이 기기 시간대)

const nacl = { id: 1, name: "NaCl", concentration: "0.1 M", volume: "100 mL" };
const steps = [
  { id: 1, label: "녹이기", duration: "10 min", repeat: 1, details: "상온", isWaiting: false },
  { id: 2, label: "정치", duration: "1 h", repeat: 2, details: "", isWaiting: true },
];

test("날짜: 한국어 표기와 파일 이름용 표기", () => {
  assert.equal(formatDateKo(DATE), "2026년 11월 19일");
  assert.equal(formatDateIso(DATE), "2026-11-19");
});

test("파일 제목: 파일에 못 쓰는 글자를 빼고, 비면 기본 제목을 쓴다", () => {
  assert.equal(reportFileTitle("광촉매: BiVO4 / Mo?", DATE), "광촉매 BiVO4 Mo 2026-11-19");
  assert.equal(reportFileTitle("   ", DATE), `${REPORT_TITLE} 2026-11-19`);
  assert.equal(reportFileTitle(undefined, DATE), `${REPORT_TITLE} 2026-11-19`);
  assert.ok(reportFileTitle("가".repeat(200), DATE).length <= 60 + 11);
});

test("계량 준비표: 실험 규모와 유효숫자를 반영하고, 계산 근거를 함께 적는다", () => {
  const r = buildReport({ reagents: [nacl], scaleFactor: 2, sigFigs: 3, date: DATE });
  assert.equal(r.rows.length, 1);
  assert.deepEqual([r.rows[0].ok, r.rows[0].name, r.rows[0].amount], [true, "NaCl", "1.17 g"]);
  assert.match(r.rows[0].basis, /0\.1 M × 100 mL/);
  assert.match(r.rows[0].basis, /× 2배$/);
  assert.equal(r.rows[0].mwSource, "내장 DB");
  assert.deepEqual(r.summary, ["시약 1개", "실험 규모 ×2"]);
  assert.equal(r.title, REPORT_TITLE);
  assert.equal(r.dateText, "2026년 11월 19일");
});

test("규모 1배면 근거에 배수를 붙이지 않는다", () => {
  const r = buildReport({ reagents: [nacl], date: DATE });
  assert.ok(!r.rows[0].basis.includes("배"));
});

test("계산할 수 없는 시약은 사유를 적고 '확인할 것'에 올린다", () => {
  const r = buildReport({ reagents: [{ id: 1, name: "Water", concentration: "", volume: "" }], date: DATE });
  assert.equal(r.rows[0].ok, false);
  assert.ok(r.rows[0].reason.length > 0);
  assert.ok(r.checks.some((c) => c.tone === "danger" && c.subject === "Water"));
});

test("같은 시약이 여러 줄이면 합산표를 만들고, 아니면 비워 둔다", () => {
  const one = buildReport({ reagents: [nacl, { id: 2, name: "KCl", concentration: "0.1 M", volume: "50 mL" }], date: DATE });
  assert.deepEqual(one.merged, []);
  const two = buildReport({ reagents: [nacl, { id: 2, name: "NaCl", concentration: "0.1 M", volume: "50 mL" }], date: DATE });
  assert.equal(two.merged.length, 1);
  assert.equal(two.merged[0].rows, 2);
  assert.equal(two.merged[0].amount, "0.877 g"); // 0.1 M × 150 mL × 58.44 g/mol
});

test("타임라인: 반복 시간, 시작 시점, 총 시간, 대기 단계, 시간 미정 경고", () => {
  const r = buildReport({ reagents: [nacl], timeline: steps, date: DATE });
  assert.equal(r.steps.length, 2);
  assert.deepEqual([r.steps[0].n, r.steps[0].label, r.steps[0].duration, r.steps[0].start, r.steps[0].details], [1, "녹이기", "10분", "시작 +0분", "상온"]);
  assert.equal(r.steps[1].duration, "2시간 (1시간 × 2회)");
  assert.equal(r.steps[1].waiting, true);
  assert.equal(r.total.text, "2시간 10분");
  assert.ok(r.summary.includes("총 소요 시간 2시간 10분"));

  const unknown = buildReport({ timeline: [{ id: 1, label: "건조", duration: "", repeat: 1, details: "", isWaiting: false }], date: DATE });
  assert.equal(unknown.steps[0].duration, "시간 미정");
  assert.ok(unknown.checks.some((c) => c.text.includes("소요 시간")));
});

test("원문 대조: 원문에 없는 값은 'AI 해석'으로 확인할 것에 올린다", () => {
  const methodText = "Cells were washed with NaCl (0.1 M, 100 mL) and then incubated for 10 min.";
  const same = buildReport({ reagents: [nacl], methodText, date: DATE });
  assert.equal(same.aiCount, 0);
  assert.ok(!same.rows[0].issues.some((i) => i.id === "ai"));
  const changed = buildReport({ reagents: [{ ...nacl, concentration: "0.7 M" }], methodText, date: DATE });
  const ai = changed.rows[0].issues.find((i) => i.id === "ai");
  assert.ok(ai, "원문에 없는 농도는 표의 그 줄에 AI 해석으로 표시");
  assert.match(ai.text, /AI 해석/);
  assert.equal(changed.aiCount, 1);
  assert.deepEqual(changed.checks, [], "AI 해석은 위쪽 확인 목록에 따로 늘어놓지 않고 개수만 센다");
});

test("확인할 것은 심각한 순서(위험 > 주의 > AI 해석)로 정렬한다", () => {
  const r = buildReport({
    reagents: [{ id: 1, name: "Water", concentration: "", volume: "" }, { ...nacl, concentration: "0.7 M" }],
    methodText: "Cells were washed with NaCl (0.1 M, 100 mL).",
    date: DATE,
  });
  const tones = r.checks.map((c) => c.tone);
  assert.deepEqual(tones, [...tones].sort((a, b) => ["danger", "warn", "accent"].indexOf(a) - ["danger", "warn", "accent"].indexOf(b)));
});

test("폐기·안전: 시약마다 폐액 종류와 안내, 섞으면 안 되는 조합", () => {
  const r = buildReport({
    reagents: [
      { id: 1, name: "HCl", concentration: "1 M", volume: "10 mL" },
      { id: 2, name: "NaCN", concentration: "0.1 M", volume: "10 mL" },
      { id: 3, name: "HCl", concentration: "2 M", volume: "5 mL" },
    ],
    date: DATE,
  });
  assert.equal(r.disposal.items.length, 2, "이름이 같은 시약은 한 번만");
  const hcl = r.disposal.items.find((i) => i.name === "HCl");
  assert.match(hcl.streamLabel, /산/);
  assert.ok(hcl.tip.length > 0);
  assert.ok(r.disposal.warnings.some((w) => w.level === "danger" && /시안|HCN/.test(w.text)));
});

test("폐기·안전: 유해성 정보를 가져오는 중이면 pending", () => {
  const checking = buildReport({ reagents: [nacl], reagentInfo: { nacl: { state: "checking" } }, date: DATE });
  // 키는 normalizeName 결과를 따르므로, 어떤 키로든 'checking' 이면 pending 이다
  const key = checking.disposal.items[0].key;
  const pending = buildReport({ reagents: [nacl], reagentInfo: { [key]: { state: "checking" } }, date: DATE });
  assert.equal(pending.disposal.pending, true);
  const done = buildReport({ reagents: [nacl], reagentInfo: { [key]: { state: "found", ghsState: "done", ghs: { hazards: [] } } }, date: DATE });
  assert.equal(done.disposal.pending, false);
  const waitingGhs = buildReport({ reagents: [nacl], reagentInfo: { [key]: { state: "found", ghsState: null } }, date: DATE });
  assert.equal(waitingGhs.disposal.pending, true);
});

test("아무것도 없으면 isEmpty", () => {
  assert.equal(buildReport({ date: DATE }).isEmpty, true);
  assert.equal(buildReport({ reagents: [nacl], date: DATE }).isEmpty, false);
});

test("제목: 저장 이름이 있으면 문서 제목으로 쓴다", () => {
  const r = buildReport({ title: "BiVO4 합성 1차", reagents: [nacl], date: DATE });
  assert.equal(r.title, "BiVO4 합성 1차");
  assert.equal(r.fileTitle, "BiVO4 합성 1차 2026-11-19");
});

test("희석 계획: 같은 시약을 여러 농도로 쓰면 문서에 들어가고, 아니면 비어 있다", () => {
  const r = buildReport({
    reagents: [
      { id: 1, name: "NaOH", concentration: "2 M", volume: "20 mL" },
      { id: 2, name: "NaOH", concentration: "0.01 M", volume: "50 mL" },
    ],
    scaleFactor: 2,
    date: DATE,
  });
  assert.equal(r.dilutions.length, 1);
  assert.equal(r.dilutions[0].name, "NaOH");
  assert.equal(r.dilutions[0].stock.prepText, "45 mL"); // 규모 ×2 반영: 40.5 mL + 여유
  assert.equal(buildReport({ reagents: [nacl], date: DATE }).dilutions.length, 0);
});

test("같은 시약이 여러 줄에서 똑같이 문제여도 '먼저 확인할 것'에는 한 번만 올린다", () => {
  const r = buildReport({
    reagents: [
      { id: 1, name: "HNO3", concentration: "2 M", volume: "20 mL" },
      { id: 2, name: "HNO3", concentration: "0.1 M", volume: "100 mL" },
    ],
    date: DATE,
  });
  assert.equal(r.rows.filter((x) => !x.ok).length, 2, "표에는 두 줄 모두 남는다");
  assert.equal(r.checks.filter((c) => c.subject === "HNO3" && c.tone === "danger").length, 1);
});

test("전체 과정: 단계마다 쓰는 시약과 양이 들어가고, 직접 추가한 것과 연결 안 된 시약도 빠지지 않는다", () => {
  const r = buildReport({
    reagents: [
      { id: 1, name: "NaOH", concentration: "2 M", volume: "20 mL" },
      { id: 2, name: "Ethanol", concentration: "", volume: "5 mL", userAdded: true },
      { id: 3, name: "KCl", concentration: "0.1 M", volume: "10 mL" },
    ],
    timeline: [
      { id: 1, label: "녹이기", duration: "10 min", repeat: 1, details: "", isWaiting: false, reagentIds: [1] },
      { id: 2, label: "세척", duration: "", repeat: 1, details: "", isWaiting: false, reagentIds: [2], userAdded: true },
    ],
    date: DATE,
  });
  assert.deepEqual(r.steps[0].reagents.map((x) => [x.name, x.amount]), [["NaOH", "1.60 g"]]);
  assert.equal(r.steps[1].userAdded, true);
  assert.equal(r.steps[1].reagents[0].userAdded, true);
  assert.deepEqual(r.unlinked.map((u) => u.name), ["KCl"]);
  // "직접 추가"는 확인할 일이 아니므로 위쪽 확인 목록에는 올리지 않는다
  assert.ok(!r.checks.some((c) => /직접 추가/.test(c.text)));
  assert.ok(r.rows[1].issues.some((i) => i.id === "user"));
});
