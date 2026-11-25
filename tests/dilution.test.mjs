import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_PIPETTE_ML, buildDilutionPlan, formatConc, formatFactor, formatVolume, recommendVolume } from "../src/lib/dilution.mjs";

const row = (name, concentration, volume) => ({ name, concentration, volume });

test("만들 양: 여유 10%를 더해 계량하기 쉬운 숫자로 올린다", () => {
  assert.equal(recommendVolume(20.25), 25); // 22.3 → 25
  assert.equal(recommendVolume(9), 10); // 9.9 → 10
  assert.equal(recommendVolume(10), 15); // 11 → 15 (딱 맞게 만들면 모자란다)
  assert.equal(recommendVolume(3), 3.5); // 3.3 → 3.5
  assert.equal(recommendVolume(0.25), 1);
  assert.equal(recommendVolume(137), 160); // 150.7 → 160 (표준 플라스크 200 mL 로 올리면 여유가 46%)
  assert.equal(recommendVolume(300), 330);
  assert.equal(recommendVolume(1000), 1100);
  assert.equal(recommendVolume(2500), 3000);
  assert.ok(recommendVolume(25) / 25 <= 1.25, "여유는 대체로 25% 안쪽");
});

test("농도 표기: 단위를 알맞게 바꾸고 군더더기 0은 없앤다", () => {
  assert.equal(formatConc("molar", 2), "2 M");
  assert.equal(formatConc("molar", 0.2), "200 mM");
  assert.equal(formatConc("molar", 0.00005), "50 µM");
  assert.equal(formatConc("wv", 5), "5 % (w/v)");
  assert.equal(formatConc("vv", 70), "70 % (v/v)");
  assert.equal(formatConc("mass", 0.002), "2 mg/mL");
});

test("부피·배수 표기: 끝의 0 을 붙이지 않고 단위를 바꾼다", () => {
  assert.equal(formatVolume(25), "25 mL");
  assert.equal(formatVolume(0.25), "250 µL");
  assert.equal(formatVolume(1500), "1.5 L");
  assert.equal(formatVolume(49.75), "49.8 mL");
  assert.equal(formatVolume(0.00002), "20 nL");
  assert.equal(formatFactor(200), "200배");
  assert.equal(formatFactor(2.5), "2.5배");
  assert.equal(formatFactor(1e10), "1×10^10배");
});

test("같은 시약을 두 농도로 쓰면: 진한 쪽을 원액으로, 묽은 쪽은 C1·V1 = C2·V2 로 희석한다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaOH", "2 M", "20 mL"), row("NaOH", "0.01 M", "50 mL")] });
  assert.equal(groups.length, 1);
  const g = groups[0];
  assert.equal(g.name, "NaOH");
  assert.equal(g.concCount, 2);
  assert.equal(g.stock.concText, "2 M");
  assert.ok(Math.abs(g.stock.needMl - 20.25) < 1e-9); // 20 mL + 0.01 M × 50 mL ÷ 2 M = 0.25 mL
  assert.equal(g.stock.prepMl, 25);
  assert.equal(g.stock.prepText, "25 mL");
  assert.equal(g.stock.marginPct, 23);
  assert.equal(g.stock.weighing.ok, true);
  assert.equal(g.stock.weighing.amount, "2.00 g"); // 2 M × 25 mL × 40 g/mol
  const [direct, diluted] = g.uses;
  assert.equal(direct.mode, "direct");
  assert.equal(diluted.mode, "dilute");
  assert.equal(diluted.factorText, "200배");
  assert.equal(diluted.takeText, "250 µL");
  assert.equal(diluted.solventText, "49.8 mL");
  assert.ok(g.notes.some((n) => /열이 나요/.test(n)), "염기라서 희석 열 주의");
});

test("실험 규모를 부피에 곱해서 계산한다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaOH", "2 M", "20 mL"), row("NaOH", "0.01 M", "50 mL")], scaleFactor: 2 });
  const g = groups[0];
  assert.ok(Math.abs(g.stock.needMl - 40.5) < 1e-9);
  assert.equal(g.stock.prepMl, 45); // 44.55 → 45
  assert.equal(g.uses[1].volText, "100 mL");
  assert.equal(g.uses[1].takeText, "500 µL");
});

test("단위가 달라도 같은 농도면 희석할 필요가 없다 (10 mM = 0.01 M)", () => {
  assert.deepEqual(buildDilutionPlan({ reagents: [row("NaCl", "10 mM", "10 mL"), row("NaCl", "0.01 M", "20 mL")] }).groups, []);
  const { groups } = buildDilutionPlan({ reagents: [row("NaCl", "1 M", "10 mL"), row("NaCl", "10 mM", "20 mL")] });
  assert.equal(groups[0].uses[1].factorText, "100배");
});

test("농도가 하나뿐이거나, 농도·부피가 없거나, 종류가 다른 농도끼리는 계획을 만들지 않는다", () => {
  assert.deepEqual(buildDilutionPlan({ reagents: [row("NaCl", "1 M", "10 mL")] }).groups, []);
  assert.deepEqual(buildDilutionPlan({ reagents: [row("NaCl", "", "10 mL"), row("NaCl", "1 M", "")] }).groups, []);
  // 몰농도와 %는 서로 바꿀 수 없다
  assert.deepEqual(buildDilutionPlan({ reagents: [row("HCl", "1 M", "10 mL"), row("HCl", "37 %", "10 mL")] }).groups, []);
  // 양(mmol)을 적은 줄은 농도가 아니다
  assert.deepEqual(buildDilutionPlan({ reagents: [row("NaCl", "2.5 mmol", "20 mL"), row("NaCl", "1 M", "5 mL")] }).groups, []);
  assert.deepEqual(buildDilutionPlan({}).groups, []);
});

test("이름 표기가 달라도 같은 물질이면 한 묶음이다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaOH", "1 M", "10 mL"), row("sodium hydroxide", "0.1 M", "20 mL")] });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].uses.length, 2);
});

test("서로 다른 시약은 따로 묶는다", () => {
  const { groups } = buildDilutionPlan({
    reagents: [row("NaOH", "1 M", "10 mL"), row("NaOH", "0.1 M", "20 mL"), row("KCl", "1 M", "10 mL"), row("KCl", "0.5 M", "10 mL")],
  });
  assert.deepEqual(groups.map((g) => g.name).sort(), ["KCl", "NaOH"]);
});

test("원액에서 100 µL보다 적게 취해야 하면 중간 용액을 제안한다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaOH", "2 M", "20 mL"), row("NaOH", "0.001 M", "50 mL")] });
  const u = groups[0].uses[1];
  assert.ok(u.takeMl < MIN_PIPETTE_ML);
  assert.equal(u.mode, "intermediate");
  assert.equal(u.intermediate.factor, 10);
  assert.equal(u.intermediate.concText, "200 mM");
  assert.equal(u.intermediate.takeText, "250 µL"); // 0.001 M × 50 mL ÷ 0.2 M
  assert.equal(u.intermediate.prepText, "1 mL");
  assert.equal(u.intermediate.stockText, "100 µL");
  // 원액 합계에는 중간 용액을 만드는 데 드는 양이 들어간다
  assert.ok(Math.abs(groups[0].stock.needMl - 20.1) < 1e-9);
  assert.ok(groups[0].why.some((w) => /따로 만들면 2\.00 mg/.test(w)), "따로 만들면 2 mg 만 달아야 한다는 이유");
  assert.ok(groups[0].why.some((w) => /중간 용액/.test(w)));
});

test("너무 묽어서 중간 용액으로도 안 되면 단계 희석을 하라고 알린다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaOH", "1 M", "1 mL"), row("NaOH", "0.0001 µM", "1 mL")] });
  const u = groups[0].uses[1];
  assert.equal(u.mode, "dilute");
  assert.equal(u.tooSmall, true);
  assert.equal(u.factorText, "1×10^10배");
  assert.ok(groups[0].why.some((w) => /단계 희석/.test(w)));
});

test("따로 만들어도 충분히 달 수 있는 양이면 '작은 양' 이유를 붙이지 않는다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaCl", "1 M", "100 mL"), row("NaCl", "0.5 M", "100 mL")] });
  assert.deepEqual(groups[0].why, []);
});

test("퍼센트(v/v)도 희석한다: 에탄올 95%에서 70%", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("Ethanol", "95 %", "100 mL"), row("Ethanol", "70 %", "50 mL")] });
  assert.equal(groups.length, 1);
  const u = groups[0].uses[1];
  assert.equal(u.mode, "dilute");
  assert.equal(u.takeText, "36.8 mL"); // 50 × 70 ÷ 95
  assert.equal(groups[0].stock.concText, "95 %");
});

test("농축 원액을 희석해 쓰는 시약(질산)은 원액을 직접 못 달아도 희석량은 알려 준다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("HNO3", "2 M", "20 mL"), row("HNO3", "0.1 M", "100 mL")] });
  const g = groups[0];
  assert.equal(g.stock.weighing.ok, false);
  assert.match(g.stock.weighing.reason, /원액/);
  assert.equal(g.uses[1].takeText, "5 mL"); // 0.1 M × 100 mL ÷ 2 M
  assert.ok(g.notes.some((n) => /열이 나요/.test(n)));
});

test("분자량을 아직 모르는 시약도 희석량은 알려 주고, 원액 계량값만 비워 둔다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("Xylitolium", "1 M", "10 mL"), row("Xylitolium", "0.1 M", "10 mL")] });
  assert.equal(groups[0].uses[1].takeText, "1 mL");
  assert.equal(groups[0].stock.weighing.ok, false);
});

test("PubChem 에서 가져온 분자량(mwMap)을 쓴다", () => {
  const mwMap = { acmenium: { mw: 100, source: "pubchem" } };
  const { groups } = buildDilutionPlan({ reagents: [row("Acmenium", "1 M", "10 mL"), row("Acmenium", "0.1 M", "10 mL")], mwMap });
  assert.equal(groups[0].stock.weighing.ok, true);
  assert.equal(groups[0].stock.weighing.mwSource, "PubChem");
});

test("같은 농도 줄이 여럿이면 모두 원액을 그대로 쓰고 부피를 합한다", () => {
  const { groups } = buildDilutionPlan({ reagents: [row("NaCl", "1 M", "10 mL"), row("NaCl", "1 M", "10 mL"), row("NaCl", "0.1 M", "10 mL")] });
  const g = groups[0];
  assert.equal(g.uses.filter((u) => u.mode === "direct").length, 2);
  assert.ok(Math.abs(g.stock.needMl - 21) < 1e-9);
  assert.equal(g.stock.prepMl, 25);
});

test("만드는 순서 글: 그대로 쓰기 / 한 번 희석 / 중간 용액을 거치기", () => {
  const plain = buildDilutionPlan({ reagents: [row("NaOH", "2 M", "20 mL"), row("NaOH", "0.01 M", "50 mL")] }).groups[0];
  assert.deepEqual(plain.uses[0].how, ["원액 20 mL를 그대로 써요."]);
  assert.deepEqual(plain.uses[1].how, ["원액 250 µL를 취해 50 mL가 되도록 용매를 채워요 (200배 희석)."]);
  const mid = buildDilutionPlan({ reagents: [row("NaOH", "2 M", "20 mL"), row("NaOH", "0.001 M", "50 mL")] }).groups[0];
  assert.equal(mid.uses[1].how.length, 2);
  assert.ok(mid.uses[1].how[0].includes("원액 100 µL에 용매를 채워 1 mL로 만들어요 (200 mM, 10배 희석한 중간 용액)"), mid.uses[1].how[0]);
  assert.match(mid.uses[1].how[1], /중간 용액 250 µL를 취해 50 mL가 되도록/);
});
