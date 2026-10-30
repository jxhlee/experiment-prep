import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuantity,
  normalizeName,
  findEntry,
  computeRow,
  formatSig,
  formatAmount,
  mergeResults,
  namesNeedingLookup,
  scaleResult,
} from "../src/lib/chem.mjs";

const close = (actual, expected, rel = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * rel + 1e-15, `expected ${expected}, got ${actual}`);

const row = (name, concentration, volume) => ({ name, concentration, volume });

test("parseQuantity: 농도·부피 표기 변형", () => {
  close(parseQuantity("50 mM").molPerL, 0.05);
  close(parseQuantity("50mM").molPerL, 0.05);
  close(parseQuantity("50 µM").molPerL, 5e-5); // µ (micro sign)
  close(parseQuantity("50 μM").molPerL, 5e-5); // μ (greek mu)
  close(parseQuantity("50 uM").molPerL, 5e-5);
  close(parseQuantity("100 mmol/L").molPerL, 0.1);
  close(parseQuantity("1,000 mL").mL, 1000);
  close(parseQuantity("2 L").mL, 2000);
  close(parseQuantity("50 µL").mL, 0.05);
  close(parseQuantity("5 g").g, 5);
  assert.deepEqual(parseQuantity("0.9 % (w/v)"), { type: "percent", percent: 0.9, basis: "wv" });
  assert.deepEqual(parseQuantity("1 % (v/v)"), { type: "percent", percent: 1, basis: "vv" });
  assert.deepEqual(parseQuantity("1%"), { type: "percent", percent: 1, basis: null });
  close(parseQuantity("2 mg/mL").perMl, 0.002);
  close(parseQuantity("2 mg mL-1").perMl, 0.002);
  close(parseQuantity("5 g/100 mL").perMl, 0.05);
  const enzyme = parseQuantity("5 U/µL");
  assert.equal(enzyme.dim, "count");
  close(enzyme.perMl, 5000);
  assert.equal(parseQuantity("20 units").n, 20);
  assert.equal(parseQuantity("10×").type, "fold");
  assert.equal(parseQuantity("abc"), null);
  assert.equal(parseQuantity(""), null);
  assert.equal(parseQuantity("50"), null);
});

test("normalizeName: buffer/pH 꼬리표 제거와 화학식 표기", () => {
  assert.deepEqual(normalizeName("Tris-HCl buffer (pH 7.5)"), { clean: "Tris-HCl", key: "trishcl" });
  assert.equal(normalizeName("Tris-HCl, pH 7.5").clean, "Tris-HCl");
  assert.equal(findEntry("MgCl₂·6H₂O").display, "MgCl2·6H2O");
  assert.equal(findEntry("(NH4)2SO4").display, "(NH4)2SO4");
  assert.equal(findEntry("sodium chloride").display, "NaCl");
  assert.equal(findEntry("no such reagent"), null);
});

test("몰농도: mass = C × V × MW", () => {
  const nacl = computeRow(row("NaCl", "150 mM", "100 mL"));
  assert.equal(nacl.ok, true);
  assert.equal(nacl.dim, "mass");
  close(nacl.value, 0.8766);

  close(computeRow(row("Tris-HCl buffer (pH 7.5)", "50 mM", "100 mL")).value, 0.788);
  close(computeRow(row("EDTA", "1 mM", "100 mL")).value, 0.029224);
  close(computeRow(row("MgCl2·6H2O", "5 mM", "50 µL")).value, 5.0825e-5);
  close(computeRow(row("DTT", "100 mM", "50 mL")).value, 0.77125);
});

test("퍼센트·질량/부피 농도", () => {
  close(computeRow(row("NaCl", "0.9 % (w/v)", "500 mL")).value, 4.5);
  close(computeRow(row("BSA", "5 % (w/v)", "20 mL")).value, 1);
  close(computeRow(row("lysozyme", "10 mg/mL", "5 mL")).value, 0.05);

  const etoh = computeRow(row("Ethanol", "70 % (v/v)", "100 mL"));
  assert.equal(etoh.dim, "volume");
  close(etoh.value, 70);
});

test("% 기준이 없으면 액체는 v/v, 고체는 w/v로 가정하고 그 사실을 알린다", () => {
  const triton = computeRow(row("Triton X-100", "1 %", "100 mL"));
  assert.equal(triton.dim, "volume");
  close(triton.value, 1);
  assert.ok(triton.notes.some((n) => n.includes("v/v")));

  const sds = computeRow(row("SDS", "2 %", "50 mL"));
  assert.equal(sds.dim, "mass");
  close(sds.value, 1);
  assert.ok(sds.notes.some((n) => n.includes("w/v")));
});

test("액체 시약의 몰농도는 밀도로 부피 환산", () => {
  const me = computeRow(row("2-mercaptoethanol", "100 mM", "10 mL"));
  assert.equal(me.dim, "volume");
  close(me.value, (0.1 * 0.01 * 78.13) / 1.114);
});

test("농도 없이 양만 있는 경우는 입력값 그대로", () => {
  assert.equal(computeRow(row("EcoRI", "", "20 units")).dim, "count");
  close(computeRow(row("EcoRI", "", "20 units")).value, 20);
  close(computeRow(row("water", "", "50 µL")).value, 0.05);
  close(computeRow(row("NaCl", "", "2 mmol")).value, 0.11688);
});

test("PubChem 조회값(mwMap) 사용 및 실패 사유", () => {
  const mwMap = { sodiumpyruvate: { mw: 110.04, formula: "C3H3NaO3" } };
  const ok = computeRow(row("sodium pyruvate", "1 mM", "10 mL"), { mwMap });
  close(ok.value, 0.0011004);
  assert.equal(ok.mwSource, "PubChem");

  const unresolved = computeRow(row("sodium pyruvate", "1 mM", "10 mL"));
  assert.equal(unresolved.ok, false);
  assert.equal(unresolved.code, "unresolved");

  const missing = computeRow(row("sodium pyruvate", "1 mM", "10 mL"), { mwMap: { sodiumpyruvate: { notFound: true } } });
  assert.equal(missing.code, "not-found");
});

test("계산하면 안 되는 입력은 숫자를 만들지 않고 사유를 돌려준다", () => {
  const cases = [
    row("HCl", "1 M", "100 mL"), // 농축 원액 희석
    row("NaCl", "150 mM", ""), // 부피 없음
    row("NaCl", "ten mM", "100 mL"), // 농도 해석 불가
    row("NaCl", "150 mM", "a lot"), // 부피 해석 불가
    row("PBS", "10 mM", "100 mL"), // 혼합 용액
    row("PBS", "10×", "100 mL"), // 희석 배수
    row("NaCl", "", ""), // 정보 없음
    row("", "10 mM", "100 mL"), // 이름 없음
    row("NaCl", "10 % (w/w)", "100 mL"), // w/w
    row("NaCl", "10 mM", "5 g"), // 농도 + 질량
  ];
  for (const c of cases) {
    const r = computeRow(c);
    assert.equal(r.ok, false, JSON.stringify(c));
    assert.ok(r.reason.length > 0);
  }
});

test("분자량 조회 대상은 DB·혼합용액·퍼센트 행을 제외하고 중복 제거", () => {
  const rows = [
    row("sodium pyruvate", "1 mM", "10 mL"),
    row("Sodium Pyruvate", "2 mM", "5 mL"),
    row("NaCl", "150 mM", "100 mL"),
    row("PBS", "1 mM", "10 mL"),
    row("someprotein", "5 %", "10 mL"),
  ];
  assert.deepEqual(namesNeedingLookup(rows), [{ key: "sodiumpyruvate", name: "sodium pyruvate" }]);
  assert.deepEqual(namesNeedingLookup(rows, { sodiumpyruvate: { notFound: true } }), []);
});

test("유효숫자·단위 표시", () => {
  assert.equal(formatSig(0.788, 3), "0.788");
  assert.equal(formatSig(4.5, 3), "4.50");
  assert.equal(formatSig(1234.5, 3), "1230");
  assert.equal(formatSig(0.000123456, 3), "0.000123");
  assert.equal(formatSig(9.996, 3), "10.0");
  assert.equal(formatSig(0.788, 1), "0.8");

  assert.equal(formatAmount({ dim: "mass", value: 0.788 }, 3), "0.788 g");
  assert.equal(formatAmount({ dim: "mass", value: 0.0292 }, 3), "29.2 mg");
  assert.equal(formatAmount({ dim: "mass", value: 5.0825e-5 }, 3), "50.8 µg");
  assert.equal(formatAmount({ dim: "mass", value: 1500 }, 3), "1.50 kg");
  assert.equal(formatAmount({ dim: "mass", value: 0 }, 3), "0 g");
  assert.equal(formatAmount({ dim: "volume", value: 1 }, 3), "1.00 mL");
  assert.equal(formatAmount({ dim: "volume", value: 0.05 }, 3), "50.0 µL");
  assert.equal(formatAmount({ dim: "volume", value: 1500 }, 3), "1.50 L");
  assert.equal(formatAmount({ dim: "count", value: 20, unitLabel: "units" }, 3), "20.0 units");
  assert.equal(formatAmount({ dim: "mass", value: 0.0876 }, 3), "87.6 mg");
  assert.equal(formatAmount({ dim: "mass", value: 4.5 }, 3), "4.50 g");
  assert.equal(formatAmount({ dim: "volume", value: 0.5 }, 3), "500 µL");
  // 반올림 때문에 1000이 되면 한 단계 위 단위로 올린다
  assert.equal(formatAmount({ dim: "mass", value: 0.9997 }, 3), "1.00 g");
  assert.equal(formatAmount({ dim: "mass", value: 999.7 }, 3), "1.00 kg");
});

test("배수는 모든 양에 선형으로 곱해진다", () => {
  const base = computeRow(row("NaCl", "150 mM", "100 mL"));
  close(scaleResult(base, 2).value, 1.7532);
  close(scaleResult(base, 0.5).value, 0.4383);
});

test("같은 시약은 종류가 같을 때만 합산", () => {
  const merged = mergeResults([
    { name: "NaCl", res: { ok: true, dim: "mass", value: 1 } },
    { name: "sodium chloride", res: { ok: true, dim: "mass", value: 2 } },
    { name: "NaCl", res: { ok: true, dim: "volume", value: 3 } },
    { name: "X", res: { ok: false, reason: "-" } },
  ]);
  assert.equal(merged.length, 2);
  const mass = merged.find((m) => m.dim === "mass");
  assert.equal(mass.name, "NaCl");
  assert.equal(mass.value, 3);
  assert.equal(mass.rows, 2);
});

test("시약 부가 안내(평균 분자량 등)는 분자량을 쓰는 몰농도 계산에서만 붙는다", () => {
  const percent = computeRow(row("Triton X-100", "1 %", "100 mL"));
  assert.ok(!percent.notes.some((n) => n.includes("분자량")));
  const molar = computeRow(row("Triton X-100", "1 mM", "100 mL"));
  assert.ok(molar.notes.some((n) => n.includes("평균 분자량")));
});

test("인산 완충액 같은 이름은 PubChem 이온 분자량으로 계산하지 않는다", () => {
  const r = computeRow(row("phosphate buffer (pH 6)", "25 mM", "100 mL"), {
    mwMap: { phosphate: { mw: 94.971, formula: "O4P-3" } },
  });
  assert.equal(r.ok, false);
  assert.ok(r.reason.includes("구성 성분"));
  assert.deepEqual(namesNeedingLookup([row("phosphate buffer", "25 mM", "100 mL")]), []);
  // 구체적인 염 이름은 그대로 계산된다
  close(computeRow(row("sodium phosphate dibasic", "25 mM", "100 mL")).value, 0.025 * 0.1 * 141.96);
});

test("암모니아수 표기 변형도 농축 원액으로 보고 계산을 거부한다", () => {
  for (const name of ["NH3·H2O", "aqueous ammonia", "ammonium hydroxide", "ammonia water"]) {
    const r = computeRow(row(name, "25 %", "4 mL"));
    assert.equal(r.ok, false, name);
    assert.ok(r.reason.includes("농축 원액"), name);
  }
});

test("농도 칸에 양(몰·질량)이 적힌 경우는 그 부피에 녹이는 양으로 해석", () => {
  const mwMap = {};
  const mole = computeRow(row("Bi(NO3)3·5H2O", "2.5 mmol", "20 mL"), { mwMap });
  close(mole.value, 2.5e-3 * 485.07);
  assert.ok(mole.notes.some((n) => n.includes("녹이는 양")));

  const mass = computeRow(row("NH4VO3", "0.292 g", "20 mL"));
  assert.equal(mass.dim, "mass");
  close(mass.value, 0.292);

  const noVolume = computeRow(row("Bi(NO3)3·5H2O", "2.5 mmol", ""));
  close(noVolume.value, 2.5e-3 * 485.07);

  // 분자량 조회가 필요한 이름이면 조회 대상에 포함된다
  assert.deepEqual(namesNeedingLookup([row("sodium pyruvate", "1 mmol", "10 mL")]), [{ key: "sodiumpyruvate", name: "sodium pyruvate" }]);
});

test("농도 없이 부피만 있으면: 액체는 그대로, 그 외 시약은 해석했다는 안내를 붙인다", () => {
  const water = computeRow(row("distilled water", "", "800 mL"));
  assert.equal(water.dim, "volume");
  close(water.value, 800);
  assert.equal(water.notes.length, 0);
  assert.equal(computeRow(row("ethylene glycol", "", "10 mL")).notes.length, 0);

  const salt = computeRow(row("Na3RhCl6", "", "100 mL"));
  assert.equal(salt.ok, true);
  assert.ok(salt.notes.some((n) => n.includes("용액 전체 부피")));
});

test("논문에 자주 나오는 무기 시약 표기는 내장 DB로 계산", () => {
  close(computeRow(row("K3[Fe(CN)6]", "0.5 mM", "100 mL")).value, 0.0005 * 0.1 * 329.24);
  close(computeRow(row("NaIO3", "20 mM", "100 mL")).value, 0.02 * 0.1 * 197.89);
  const k4 = computeRow(row("K4[Fe(CN)6]", "0.8 mM", "100 mL"));
  close(k4.value, 0.0008 * 0.1 * 368.35);
  assert.ok(k4.notes.some((n) => n.includes("3수화물")));
  assert.equal(computeRow(row("HAuCl4", "1 mM", "10 mL")).ok, true);
});

test("직접 입력한 분자량은 내장 DB·PubChem·혼합 용액 판정보다 우선한다", () => {
  const user = (key, mw) => ({ [key]: { mw, source: "user" } });
  const nacl = computeRow(row("NaCl", "1 M", "1 L"), { mwMap: user("nacl", 60) });
  close(nacl.value, 60);
  assert.equal(nacl.mwSource, "직접 입력");

  // PubChem 조회값이 있어도 직접 입력이 이긴다 / 출처 표시는 PubChem
  const both = computeRow(row("sodium pyruvate", "1 mM", "10 mL"), { mwMap: { sodiumpyruvate: { mw: 110.04, source: "pubchem" } } });
  assert.equal(both.mwSource, "PubChem");
  close(computeRow(row("sodium pyruvate", "1 mM", "10 mL"), { mwMap: user("sodiumpyruvate", 100) }).value, 0.001);

  // 혼합 용액으로 막혀 있던 이름도, 사용자가 분자량을 알려 주면 계산한다
  assert.equal(computeRow(row("phosphate buffer", "25 mM", "100 mL")).code, "mixture");
  close(computeRow(row("phosphate buffer", "25 mM", "100 mL"), { mwMap: user("phosphate", 120) }).value, 0.025 * 0.1 * 120);

  // 조회 실패 사유에는 구분용 code 가 붙는다
  assert.equal(computeRow(row("zzz", "1 mM", "1 mL"), { mwMap: { zzz: { notFound: true } } }).code, "not-found");
});
