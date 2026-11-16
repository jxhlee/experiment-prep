import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGhs, parseProperties, parseStatement } from "../src/lib/pubchem.mjs";
import { STREAMS, classifyReagent, findIncompatibilities, groupByStream, hazardText, signalWord } from "../src/lib/hazard.mjs";
import { DB_DISPLAY_NAMES } from "../src/lib/chem.mjs";

// PubChem PUG View 응답 모양(실제 응답에서 필요한 부분만 옮김)
const info = (Name, strings) => ({ Name, Value: { StringWithMarkup: strings.map((String) => ({ String })) } });
const record = (infos) => ({ Record: { Section: [{ TOCHeading: "Safety and Hazards", Section: [{ TOCHeading: "Hazards Identification", Section: [{ TOCHeading: "GHS Classification", Information: infos }] }] }] } });

test("PubChem 속성 응답에서 분자량·화학식·이름을 읽는다", () => {
  const ok = parseProperties({ PropertyTable: { Properties: [{ CID: 6049, MolecularFormula: "C10H16N2O8", MolecularWeight: "292.24", Title: "Ethylenediaminetetraacetic Acid" }] } });
  assert.deepEqual(ok, { cid: 6049, title: "Ethylenediaminetetraacetic Acid", formula: "C10H16N2O8", mw: 292.24 });
  assert.equal(parseProperties({}), null);
  assert.equal(parseProperties({ PropertyTable: { Properties: [{ MolecularWeight: "x" }] } }), null);
});

test("GHS 문구 해석: 합쳐진 코드·비율·접미 글자", () => {
  assert.deepEqual(parseStatement("H300+H310 (16.3%): Fatal if swallowed or in contact with skin"), { codes: ["H300", "H310"], pct: 16.3 });
  assert.deepEqual(parseStatement("H225 (> 99.9%): Highly Flammable liquid"), { codes: ["H225"], pct: 99.9 });
  assert.deepEqual(parseStatement("H350i: May cause cancer by inhalation"), { codes: ["H350"], pct: null });
  assert.deepEqual(parseStatement("H314: Causes severe skin burns"), { codes: ["H314"], pct: null });
  assert.equal(parseStatement("This chemical does not meet GHS hazard criteria"), null);
});

test("GHS: ECHA 집계 블록의 합의 코드만 쓴다 (공급자 한두 곳의 예외는 버린다)", () => {
  const ethanol = record([
    info("Pictogram(s)", ["x"]),
    info("Signal", ["Danger"]),
    info("GHS Hazard Statements", ["H225: Highly Flammable liquid and vapor"]),
    info("Pictogram(s)", ["x"]),
    info("Signal", ["Danger"]),
    info("GHS Hazard Statements", ["H225 (> 99.9%): Highly Flammable liquid and vapor", "H319 (37.7%): Causes serious eye irritation", "H350 (3.1%): May cause cancer"]),
    info("ECHA C&L Notifications Summary", ["Aggregated GHS information provided per 1000 reports…"]),
    // 한 공급자의 예외적인 분류(혼합물 기준) — 쓰면 안 된다
    info("Pictogram(s)", ["x"]),
    info("Signal", ["Danger"]),
    info("GHS Hazard Statements", ["H225: …", "H340: May cause genetic defects", "H350: May cause cancer"]),
  ]);
  const g = parseGhs(ethanol);
  assert.deepEqual(g.hazards.map((h) => h.code), ["H225", "H319"]);
  assert.equal(g.signal, "Danger");
  assert.equal(g.source, "ECHA 신고 집계");
});

test("GHS: 집계 블록이 없으면 첫 분류를 쓰고, 정보가 없으면 null, 대부분 '위험 아님'이면 비율을 알려 준다", () => {
  const single = record([info("Pictogram(s)", ["x"]), info("Signal", ["Warning"]), info("GHS Hazard Statements", ["H302: Harmful if swallowed", "H412: Harmful to aquatic life"])]);
  const g = parseGhs(single);
  assert.deepEqual(g.hazards.map((h) => h.code), ["H302", "H412"]);
  assert.equal(g.source, "분류 1건");

  assert.equal(parseGhs({ Record: { Section: [] } }), null);
  assert.equal(parseGhs({}), null);

  const salt = record([
    info("Pictogram(s)", ["x"]),
    info("Signal", ["Warning"]),
    info("GHS Hazard Statements", ["H319 (10.8%): Causes serious eye irritation"]),
    info("ECHA C&L Notifications Summary", ["Aggregated GHS information…", "Reported as not meeting GHS hazard criteria per 410 of 480 reports by companies."]),
  ]);
  const s = parseGhs(salt);
  assert.deepEqual(s.hazards, [], "10.8% 는 합의가 아니다");
  assert.ok(Math.abs(s.notHazardousShare - 410 / 480) < 1e-9);
});

test("GHS 위험 문구에 한국어 설명이 있다", () => {
  for (const code of ["H225", "H300", "H314", "H350", "H400", "H410"]) assert.ok(hazardText(code), code);
  assert.equal(hazardText("H999"), "");
});

test("내장 시약: 폐액 종류가 맞고 모든 내장 시약이 분류된다", () => {
  const stream = (name) => classifyReagent({ name }).stream;
  assert.equal(stream("HCl"), "acid");
  assert.equal(stream("sulfuric acid"), "acid");
  assert.equal(stream("NaOH"), "base");
  assert.equal(stream("ammonia solution"), "base");
  assert.equal(stream("sodium azide"), "azide");
  assert.equal(stream("potassium ferricyanide"), "cyanide");
  assert.equal(stream("K2CrO4"), "cr6");
  assert.equal(stream("chloroform"), "org-halo");
  assert.equal(stream("DCM"), "org-halo");
  assert.equal(stream("ethanol"), "org-nonhalo");
  assert.equal(stream("acetone"), "org-nonhalo");
  assert.equal(stream("ammonium persulfate"), "oxidizer");
  assert.equal(stream("NaCl"), "aqueous");
  assert.equal(stream("Tris-HCl"), "aqueous");
  assert.equal(stream("EDTA"), "aqueous");
  assert.equal(stream("water"), "none");
  assert.equal(stream("bismuth nitrate pentahydrate"), "metal");
  assert.equal(stream("CoSO4"), "metal");
  assert.equal(stream("ammonium metavanadate"), "metal");

  for (const display of DB_DISPLAY_NAMES) {
    const r = classifyReagent({ name: display });
    assert.notEqual(r.stream, "unknown", `${display}: 분류하지 못함`);
    assert.ok(STREAMS[r.stream], display);
  }
});

test("내장 시약의 안내에 꼭 필요한 주의가 들어 있다", () => {
  const tips = (name) => classifyReagent({ name }).tips.join(" ");
  assert.match(tips("HNO3"), /유기용매/);
  assert.match(tips("sodium azide"), /하수구/);
  assert.match(tips("K3[Fe(CN)6]"), /시안화수소/);
  assert.match(tips("methanol"), /실명/);
  assert.equal(classifyReagent({ name: "HNO3" }).certain, true);
  assert.ok(classifyReagent({ name: "HNO3" }).tags.includes("nitric"));
});

test("내장되지 않은 시약: 화학식 규칙으로 분류하고 근거를 밝힌다", () => {
  const cu = classifyReagent({ name: "copper(II) nitrate trihydrate", formula: "CuH6N2O9" });
  assert.equal(cu.stream, "metal");
  assert.equal(cu.certain, false);
  assert.equal(cu.basis, "화학식 규칙");
  assert.match(cu.detail, /Cu/);

  assert.equal(classifyReagent({ name: "trichloroethylene", formula: "C2HCl3" }).stream, "org-halo");
  assert.equal(classifyReagent({ name: "potassium bromide", formula: "BrK" }).stream, "aqueous");
  assert.equal(classifyReagent({ name: "lithium chloride", formula: "ClLi" }).stream, "aqueous");
  assert.equal(classifyReagent({ name: "zinc chloride", formula: "Cl2Zn" }).stream, "metal");
  assert.equal(classifyReagent({ name: "sodium sulfide", formula: "Na2S" }).stream, "sulfide");
  assert.equal(classifyReagent({ name: "calcium hydroxide", formula: "CaH2O2" }).stream, "base");
  assert.equal(classifyReagent({ name: "tetramethylammonium hydroxide", formula: "C4H13NO" }).stream !== "base", true, "유기 염기는 무기염기 폐액이 아니다");
  assert.equal(classifyReagent({ name: "mystery reagent" }).stream, "unknown");
});

test("GHS 정보가 분류를 보정하고 주의 문구를 더한다", () => {
  const ghs = { signal: "Danger", hazards: [{ code: "H225", pct: 99 }, { code: "H350", pct: 60 }, { code: "H410", pct: 80 }] };
  const r = classifyReagent({ name: "mystery solvent", ghs });
  assert.equal(r.stream, "org-nonhalo", "인화성이면 비할로겐 유기용매로");
  assert.equal(r.basis, "PubChem GHS(인화성)");
  assert.ok(r.tags.includes("cmr"));
  assert.match(r.tips.join(" "), /하수구/);
  assert.match(r.tips.join(" "), /발암/);
  assert.deepEqual(r.hazards.map((h) => h.code), ["H225", "H350", "H410"]);
  assert.ok(r.hazards.every((h) => h.text));
  assert.equal(r.signal, "Danger");

  const strong = classifyReagent({ name: "mystery oxidant", ghs: { hazards: [{ code: "H272", pct: 90 }] } });
  assert.equal(strong.stream, "oxidizer");
});

test("함께 버리면 안 되는 조합을 찾는다", () => {
  const item = (name) => ({ name, ...classifyReagent({ name }) });
  const warn = findIncompatibilities([item("HCl"), item("potassium ferricyanide"), item("NaOH"), item("ethanol")]);
  assert.ok(warn.some((w) => w.level === "danger" && /시안화수소/.test(w.text) && w.names.includes("HCl")));
  assert.ok(warn.some((w) => w.level === "caution" && /열이 나요/.test(w.text)));

  const nitric = findIncompatibilities([item("HNO3"), item("ethanol")]);
  assert.equal(nitric.length, 1, "한 쌍에는 경고 하나만");
  assert.match(nitric[0].text, /질산/);

  const azide = findIncompatibilities([item("NaN3"), item("CoSO4")]);
  assert.match(azide[0].text, /금속 아자이드/);

  assert.deepEqual(findIncompatibilities([item("NaCl"), item("glucose")]), []);
  assert.deepEqual(findIncompatibilities([item("NaOH")]), []);
  assert.equal(findIncompatibilities([item("chloroform"), item("NaOH")])[0].level, "danger");
});

test("폐액 종류별로 묶고, 같은 시약은 한 번만 센다", () => {
  const item = (name) => ({ key: name.toLowerCase(), name, ...classifyReagent({ name }) });
  const groups = groupByStream([item("NaOH"), item("HCl"), item("NaOH"), item("NaCl"), item("HNO3")]);
  assert.deepEqual(groups.map((g) => g.stream), ["acid", "base", "aqueous"]);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].items.length, 1);
});

test("신호어는 위험 문구 코드에서 정한다 (공급자별로 섞인 신호어를 쓰지 않는다)", () => {
  assert.equal(signalWord(["H315"]), "Warning");
  assert.equal(signalWord(["H302", "H319", "H410"]), "Warning");
  assert.equal(signalWord(["H302", "H314"]), "Danger");
  assert.equal(signalWord(["H225"]), "Danger");
  assert.equal(signalWord([]), null);
  const mg = classifyReagent({ name: "MgCl2", ghs: { signal: "Danger", hazards: [{ code: "H315", pct: 60 }] } });
  assert.equal(mg.signal, "Warning", "PubChem 블록의 신호어가 Danger 여도 코드가 H315 뿐이면 경고");
  assert.equal(classifyReagent({ name: "NaCl", ghs: { signal: "Warning", hazards: [] } }).signal, null);
});
