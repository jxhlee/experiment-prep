import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoSelect,
  blocksToSections,
  cleanChars,
  extractMethods,
  findMethodsRange,
  guessProcedureSections,
  itemsToLines,
  joinSections,
  procedureScore,
  runInTitle,
  splitRunInHeadings,
  textForPages,
  textQuality,
} from "../src/lib/pdf-text.mjs";

// pdf.js 글자 조각을 흉내 낸다: 한 줄을 조각 하나로
const row = (str, { x = 40, w = str.length * 4, h = 8, eol = true } = {}) => ({ str, x, w, h, eol });
const page = (...lines) => lines.map((l) => row(l));

test("깨진 제어문자는 빼기 부호로 바꾸고 숫자와 붙인다", () => {
  assert.equal(cleanChars("(5 mg L\u00011)"), "(5 mg L−1)");
  assert.equal(cleanChars("W m\u0000 2"), "W m−2");
  assert.equal(cleanChars("a\tb\nc"), "a\tb\nc", "탭·줄바꿈은 그대로");
  assert.deepEqual(itemsToLines([{ str: "mol s\u00011", x: 0, w: 30, h: 8, eol: true }]), ["mol s−1"]);
});

test("제목이 한국어이거나 복수형이어도 Methods 로 알아본다", () => {
  const headings = ["2. Experimental sections", "EXPERIMENTAL SECTION", "Materials and Methods", "Online Methods", "실험 방법", "탐구 방법", "연구 과정", "재료 및 방법", "Experimental work"];
  for (const heading of headings) {
    assert.deepEqual(findMethodsRange(["Intro text.", heading, "a", "b", "References", "x"]), { start: 1, end: 4 }, heading);
  }
  assert.equal(findMethodsRange(["Introduction", "Results and discussion"]), null);
});

test("제목 뒤에 본문이 이어 붙은 형식(ACKNOWLEDGMENTS. We thank …)도 끝으로 본다", () => {
  assert.deepEqual(splitRunInHeadings(["ACKNOWLEDGMENTS. We thank the staff.", "Methods. Synthesis of A.", "Plain sentence. Stays."]), [
    "ACKNOWLEDGMENTS",
    "We thank the staff.",
    "Methods",
    "Synthesis of A.",
    "Plain sentence. Stays.",
  ]);
  const r = extractMethods([
    page("Materials and Methods", "Synthesis. A solution of NaCl (1 g) was stirred for 2 h at 80 °C.", "ACKNOWLEDGMENTS. We thank Dr. X for help.", "1. Smith J. Nature 2000."),
  ]);
  assert.equal(r.found, true);
  assert.ok(r.text.includes("stirred for 2 h"));
  assert.ok(!r.text.includes("We thank"));
  assert.ok(!r.text.includes("Smith"));
});

test("논문 끝의 'Received … Accepted …' 날짜 줄에서 끊는다", () => {
  const r = extractMethods([page("Methods", "Dissolve 1 g of NaCl in 10 mL of water.", "Received: 27 September 2016 Accepted: 23 August 2017")]);
  assert.ok(r.text.includes("Dissolve 1 g"));
  assert.ok(!/Received/.test(r.text));
});

test("문단 맨 앞의 짧은 제목은 알아보지만, 본문 문장·명령문·수량이 든 말은 제목으로 보지 않는다", () => {
  assert.equal(runInTitle("Synthesis of BiVO4:Mo. Mo-doped BiVO4 was prepared by a hydrothermal method."), "Synthesis of BiVO4:Mo");
  assert.equal(runInTitle("Chemicals. Zinc acetate (99%) was purchased."), "Chemicals");
  assert.equal(runInTitle("The mixture was stirred. Then it was filtered."), null);
  assert.equal(runInTitle("Stir for 1 h. Then add water."), null);
  assert.equal(runInTitle("After cooling. The solid was washed."), null);
  assert.equal(runInTitle("Dissolve NaCl. Then heat."), null);
});

test("구간 나누기: 소제목과 문단 맨 앞 제목에서 새 구간을 시작하고, 특성 분석은 skip 으로 표시한다", () => {
  const blocks = [
    { text: "Materials and reagents", heading: true, start: 0, end: 0 },
    { text: "NaCl (99%) and water were used.", heading: false, start: 1, end: 1 },
    { text: "Synthesis of A. A (1 g) was dissolved in 10 mL water.", heading: false, start: 2, end: 2 },
    { text: "More steps were carried out for 2 h.", heading: false, start: 3, end: 3 },
    { text: "Characterizations", heading: true, start: 4, end: 4 },
    { text: "XRD patterns were recorded.", heading: false, start: 5, end: 5 },
  ];
  const sections = blocksToSections(blocks, (i) => i + 1);
  assert.deepEqual(sections.map((x) => [x.title, x.kind]), [["Materials and reagents", "prep"], ["Synthesis of A", "prep"], ["Characterizations", "skip"]]);
  assert.equal(sections[1].firstPage, 3);
  assert.equal(sections[1].lastPage, 4);
  assert.ok(sections[1].text.includes("More steps"));
  assert.ok(sections[2].text.startsWith("Characterizations\n\nXRD"));
});

test("자동 선택: 한도 안에서 앞쪽부터, 특성 분석은 뺀다. 첫 구간이 한도보다 길면 그 구간이라도 고른다", () => {
  const sec = (id, chars, kind = "prep") => ({ id, title: "s" + id, text: "x".repeat(chars), chars, kind, firstPage: 1, lastPage: 1 });
  const sections = [sec(0, 1000), sec(1, 3000), sec(2, 5000, "skip"), sec(3, 1500), sec(4, 2000)];
  assert.deepEqual(autoSelect(sections, 6000), [0, 1, 3]); // 1000 + 3000 + 1500 + 구분 4, 2000 은 넘침
  assert.deepEqual(autoSelect(sections, 30000), [0, 1, 3, 4]);
  assert.deepEqual(autoSelect([sec(0, 1000), sec(1, 9000), sec(2, 100)], 6000), [0], "안 들어가는 구간을 만나면 멈춘다(뒤의 작은 구간을 주워 담지 않는다)");
  assert.deepEqual(autoSelect([sec(0, 9000), sec(1, 100)], 6000), [0], "첫 구간이 한도보다 길면 그 구간이라도 선택하고 한도 초과로 알린다");
  assert.deepEqual(autoSelect([sec(0, 9000)], 6000), [0], "하나뿐이면 한도를 넘어도 선택");
  assert.equal(joinSections(sections, [3, 0]).length, 1000 + 2 + 1500, "글 순서대로 이어 붙인다");
});

test("제목을 못 찾으면 수량·조작 동사가 몰린 문단만 골라 '추정'으로 돌려준다", () => {
  const intro = "Photocatalysis has attracted wide attention because of its potential in energy conversion and environmental remediation applications.";
  const exp1 = "In a typical synthesis, 2.5 mmol of Bi(NO3)3 was dissolved in 20 mL of 2 M HNO3 and stirred for 30 min at 25 °C.";
  const exp2 = "The suspension was transferred to a 100 mL autoclave, heated at 200 °C for 24 h, then washed with 50 mL of water and dried at 60 °C.";
  const ref = "[12] Smith, J. et al. Nature 2001, 413, 1. doi:10.1000/xyz";
  // 문단 끝은 짧은 줄로 끝나게 해서, 실제 PDF 처럼 문단이 나뉘게 한다
  const r = extractMethods([page(intro, "Many applications exist.", exp1, "Then it was cooled.", exp2, "The solid was dried.", ref)]);
  assert.equal(r.found, "guess");
  assert.ok(r.text.includes("2.5 mmol"));
  assert.ok(r.text.includes("autoclave"));
  assert.ok(!r.text.includes("wide attention"));
  assert.ok(!r.text.includes("doi:"));
  assert.ok(r.sections.every((x) => x.kind === "prep"));
});

test("실험 문단이 한 개뿐이거나 없으면 추정하지 않는다 (서론·참고문헌 쓰레기를 넣지 않는다)", () => {
  assert.deepEqual(guessProcedureSections([{ text: "Short text with 5 mL.", heading: false, start: 0, end: 0 }]), []);
  const review = extractMethods([page("1. Introduction", "Photocatalysis has attracted wide attention because of its potential in many fields of science.", "Many reviews exist.")]);
  assert.equal(review.found, false);
  assert.equal(review.text, "");
  assert.deepEqual(procedureScore("We heated 5 g in 10 mL for 2 h."), { quantities: 3, verbs: 1, score: 4 });
});

test("글자 품질: 정상 논문 글은 통과하고, 깨진 OCR 글은 의심한다", () => {
  const good = "Bi(NO3)3·5H2O (2.5 mmol, 1.213 g) was dissolved in 20 mL of 2 M HNO3, while NH4VO3 (2.5 mmol) was dissolved in 20 mL of 2 M NaOH and stirred.";
  assert.equal(textQuality(good).suspicious, false);
  assert.equal(textQuality("실험 방법: NaCl 1 g을 물 100 mL에 녹인 뒤 30분 동안 교반하였다. 이후 여과하여 건조하였다.").suspicious, false);
  const bad = "!\"# (Project) !\"$% \"&&' ()* ,# -.* ST25mg , urea(fogmel) 6g.WOH 025y EbWt-6) , DW l0OmL G3OWE(X*Konm)eh- ·& à0025 g图5h层, 3εl0 h,60℃ ( ) #3";
  assert.equal(textQuality(bad).suspicious, true);
  assert.equal(textQuality("짧음").suspicious, false);
  // 영어 낱말이 많은데 the·of·was 같은 기능어가 거의 없으면 깨진 글 (OCR 쓰레기)
  const scrambled = Array.from({ length: 60 }, (_, i) => ["xqzt", "plmk", "wrvb", "hgfd", "nbcx"][i % 5] + (i % 3 ? "q" : "z")).join(" ");
  assert.equal(textQuality(scrambled).suspicious, true);
  // 영어 낱말이 적은 글(화학식·숫자 위주)은 판단하지 않는다
  assert.equal(textQuality("NaCl 1 g, KCl 2 g, HCl 10 mL, NaOH 4.0 g, H2SO4 5 mL, Na2SO4 1 M, NH4VO3 0.29 g").suspicious, false);
});

test("쪽 범위로 글 가져오기: 범위를 바로잡고 빈 쪽은 건너뛴다", () => {
  const pages = ["첫째", "", "셋째", "넷째"];
  assert.deepEqual(textForPages(pages, 1, 3), { text: "첫째\n\n셋째", from: 1, to: 3 });
  assert.deepEqual(textForPages(pages, 3, 2), { text: "셋째", from: 3, to: 3 }, "끝이 앞서면 시작쪽 하나");
  assert.deepEqual(textForPages(pages, 0, 99), { text: "첫째\n\n셋째\n\n넷째", from: 1, to: 4 }, "범위를 벗어나면 끝까지");
  assert.deepEqual(textForPages([], 1, 2), { text: "", from: 1, to: 1 });
});

test("소제목 단위 구간: 논문 한 편에서 구간·쪽 번호가 나온다", () => {
  const header = "Journal | 2026";
  const r = extractMethods([
    page(header, "Abstract", "We report.", "1"),
    page(header, "Methods", "Materials", "NaCl (99%) was purchased from Sigma.", "Synthesis of A", "A (1 g) was dissolved in 10 mL of water and stirred for 2 h at 80 °C.", "2"),
    page(header, "Characterization", "XRD patterns were collected.", "References", "x", "3"),
  ]);
  assert.equal(r.found, true);
  assert.deepEqual(r.sections.map((x) => x.title), ["Materials", "Synthesis of A", "Characterization"]);
  assert.deepEqual(r.sections.map((x) => x.kind), ["prep", "prep", "skip"]);
  assert.equal(r.sections[0].firstPage, 2);
  assert.equal(r.sections[2].firstPage, 3);
  assert.equal(r.pageTexts.length, 3);
});

test("Methods 시작점: 서론 쪽의 우연한 'Methods' 줄은 걸러 내고, 상위 제목 아래의 하위 'Method' 제목은 앞부분까지 포함한다", () => {
  const intro = Array.from({ length: 12 }, (_, i) => `Photocatalysis is an attractive topic for scientists around the world, line ${i}.`);
  const reagents = ["2.1 Materials", "Analytical grade NaCl (99.5%) was purchased from Sigma and 10 mL of water was added.", "KCl (2 g) was dissolved in 20 mL of water and stirred for 1 h."];
  const method = ["2.2 Method", "A 5 g sample was heated at 80 °C for 2 h, then washed with 20 mL of ethanol and dried."];
  // 서론 중간의 가짜 'Methods' 줄 → 실험 문단이 없는 서론을 Methods 로 잡지 않는다
  const fake = findMethodsRange(["Abstract", "Methods", ...intro, "2 Materials and methods", ...reagents, ...method, "3 Results and discussion", "More."]);
  assert.ok(fake.start > 12, "서론 쪽 가짜 시작점이 아니라 진짜 제목에서 시작");
  // 하위 제목('2.2 Method') 앞의 시약 목록(2.1 Materials)까지 포함
  const lines = ["Intro line.", "2 Materials and methods", ...reagents, ...method, "3 Results and discussion", "More."];
  const r = findMethodsRange(lines);
  assert.equal(lines[r.start], "2 Materials and methods");
  assert.ok(lines.slice(r.start, r.end).includes("2.1 Materials"));
});

test("내용 없이 제목 한 줄뿐인 구간은 다음 구간에 붙고, 한국어 연구 결과 제목에서 끝난다", () => {
  const blocks = [
    { text: "Catalyst preparation", heading: true, start: 0, end: 0 },
    { text: "Synthesis of ZrO2", heading: true, start: 1, end: 1 },
    { text: "ZrO2 (1 g) was dissolved in 10 mL of water.", heading: false, start: 2, end: 2 },
    { text: "Cocatalyst deposition", heading: true, start: 3, end: 3 },
  ];
  const sections = blocksToSections(blocks, () => 1);
  assert.equal(sections.length, 1, "제목뿐인 구간은 합쳐진다");
  assert.equal(sections[0].title, "Synthesis of ZrO2");
  assert.ok(sections[0].text.startsWith("Catalyst preparation\n\nSynthesis of ZrO2\n\nZrO2 (1 g)"));
  assert.ok(sections[0].text.endsWith("Cocatalyst deposition"), "맨 끝의 제목뿐인 구간은 앞 구간에 붙는다");

  const r = extractMethods([page("2. 연구 과정", "NaOH 0.4 g을 증류수 100 mL에 녹였다.", "3. 연구 결과", "결과는 다음과 같다.")]);
  assert.equal(r.found, true);
  assert.ok(r.text.includes("NaOH 0.4 g"));
  assert.ok(!r.text.includes("결과는"));
});
