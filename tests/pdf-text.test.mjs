import { test } from "node:test";
import assert from "node:assert/strict";
import { dropRepeatedLines, extractMethods, findMethodsRange, itemsToLines, linesToParagraphs } from "../src/lib/pdf-text.mjs";

// pdf.js 글자 조각을 흉내 낸다: 한 줄을 조각 하나로
const row = (str, { x = 40, w = str.length * 4, h = 8, eol = true } = {}) => ({ str, x, w, h, eol });
const page = (...lines) => lines.map((l) => (typeof l === "string" ? row(l) : l));

test("글자 조각 → 줄: 'fi' 같은 합자 조각은 붙이고, 떨어진 조각은 공백으로 잇는다", () => {
  const items = [
    { str: "generally disordered and dif", x: 40, w: 110, h: 8, eol: false },
    { str: "fi", x: 150, w: 5, h: 8, eol: false }, // 바로 이어짐 (합자)
    { str: "cult to be manipulated", x: 155, w: 90, h: 8, eol: true },
    { str: "Mo", x: 40, w: 10, h: 8, eol: false },
    { str: "doped", x: 60, w: 20, h: 8, eol: true }, // 10 이상 떨어짐 → 공백
  ];
  assert.deepEqual(itemsToLines(items), ["generally disordered and difficult to be manipulated", "Mo doped"]);
});

test("글자 조각 → 줄: 빈 조각·이미 있는 공백·끝에 남은 글자를 다룬다", () => {
  const items = [
    { str: "Article", x: 0, w: 30, h: 10, eol: false },
    { str: " ", x: 30, w: 4, h: 0, eol: false },
    { str: "doi", x: 34, w: 12, h: 10, eol: true },
    { str: "", x: 0, w: 0, h: 0, eol: true },
    { str: "마지막 줄", x: 0, w: 20, h: 10, eol: false },
  ];
  assert.deepEqual(itemsToLines(items), ["Article doi", "마지막 줄"]);
});

test("쪽마다 되풀이되는 머리글·바닥글과 쪽 번호를 지운다", () => {
  const bodies = ["alpha beta gamma", "delta epsilon zeta", "eta theta iota", "kappa lambda mu", "nu xi omicron"];
  const pages = bodies.map((body, n) => ["Nature Communications | (2025) 16:3517", body, String(n + 1)]);
  const cleaned = dropRepeatedLines(pages);
  assert.deepEqual(cleaned[0], ["alpha beta gamma"], "머리글(숫자만 다른 것 포함)·쪽 번호 제거");
  assert.equal(cleaned[4].length, 1);
  // 쪽이 적으면(되풀이 기준 3회 미만) 지우지 않는다
  assert.equal(dropRepeatedLines([["Title", "a"], ["Title", "b"]])[0].length, 2);
});

test("문단 만들기: 줄바꿈 하이픈을 잇고, 문장이 끝난 짧은 줄 뒤에서 문단을 나눈다", () => {
  const long = "x".repeat(70);
  const lines = [
    `${long} syn-`,
    `thesis was carried out for 24 h at ${"y".repeat(30)}`,
    "The mixture was stirred.", // 짧고 문장 끝 → 문단 끝
    `Then ${long} was added to the solution ${"z".repeat(20)}`,
  ];
  const paragraphs = linesToParagraphs(lines);
  assert.equal(paragraphs.length, 2);
  assert.match(paragraphs[0], /synthesis was carried out/);
  assert.match(paragraphs[0], /The mixture was stirred\.$/);
  assert.match(paragraphs[1], /^Then /);
});

test("Methods 구간 찾기: 번호가 붙은 제목, 다음 큰 제목 직전까지", () => {
  const lines = ["Abstract", "short abstract.", "Results", "text", "2. Experimental Section", "Synthesis of BiVO4.", "Bi(NO3)3 was dissolved.", "3. Results and Discussion", "more"];
  const r = findMethodsRange(lines);
  assert.deepEqual(r, { start: 4, end: 7 });
  assert.equal(findMethodsRange(["no headings here", "just text"]), null);
  // 본문 문장 속의 'methods' 는 제목이 아니다
  assert.equal(findMethodsRange(["We describe the methods used in this work."]), null);
});

test("제목이 여럿이면 가장 긴 구간을 고른다", () => {
  const lines = ["Methods", "a", "Results", ...Array.from({ length: 5 }, (_, i) => `r${i}`), "Methods", "m1", "m2", "m3", "m4", "References"];
  assert.deepEqual(findMethodsRange(lines), { start: 8, end: 13 });
});

test("논문 한 편 전체: Methods 만 뽑고 머리글·쪽 번호는 뺀다", () => {
  const header = "Journal of Photocatalysis | 2026";
  const pages = [
    page(header, "Title of the paper", "Abstract", "We report a study.", "1"),
    page(header, "Results", "Some results text here.", "2"),
    page(header, "Methods", "Synthesis of BiVO4:Mo. Bi(NO3)3·5H2O (2.5 mmol) was dissolved", "in 20 mL of 2 M HNO3 and stirred for 0.5 h.", "3"),
    page(header, "Data availability", "Data are available.", "4"),
  ];
  const r = extractMethods(pages);
  assert.equal(r.found, true);
  assert.equal(r.firstPage, 3);
  assert.equal(r.lastPage, 3);
  assert.ok(r.text.startsWith("Synthesis of BiVO4:Mo."));
  assert.ok(r.text.includes("in 20 mL of 2 M HNO3"));
  assert.ok(!r.text.includes("Some results text"));
  assert.ok(!r.text.includes(header));
  assert.equal(r.pages, 4);
});

test("Methods 제목도 실험 문단도 없으면 아무것도 넣지 않고(found=false), 쪽별 글은 남긴다", () => {
  const r = extractMethods([page("Plain page", "No headings at all, only text.")]);
  assert.equal(r.found, false);
  assert.equal(r.text, "");
  assert.deepEqual(r.sections, []);
  assert.match(r.pageTexts[0], /Plain page/);
});

test("글자가 없는 PDF(스캔본)는 빈 글", () => {
  const r = extractMethods([[], []]);
  assert.equal(r.text, "");
  assert.equal(r.pages, 2);
});

test("너무 길면 문단 경계에서 자르고 알린다", () => {
  // 문단 = 긴 줄 셋 + 짧은 마지막 줄
  const paragraph = (i) => [`Paragraph ${i} ${"word ".repeat(16)}`, `${"word ".repeat(16)}`, `${"word ".repeat(16)}`, "The end of it."];
  const lines = ["Methods", ...Array.from({ length: 12 }, (_, i) => paragraph(i)).flat(), "References"];
  const r = extractMethods([page(...lines)], { maxChars: 1500 });
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= 1500);
  assert.ok(r.text.endsWith("The end of it."), "문단 중간에서 끊기지 않는다");
  assert.ok(r.text.split("\n\n").length >= 2);
});

test("짧은 줄이 없어 문단이 하나로 이어져도 한도에서 문장 경계로 자른다", () => {
  const sentence = "Compound A was dissolved in water and stirred for an hour at room temperature. ";
  const longLines = Array.from({ length: 80 }, () => sentence.repeat(1).trim());
  const r = extractMethods([page("Methods", ...longLines, "References")], { maxChars: 1000 });
  assert.equal(r.truncated, true);
  assert.ok(r.text.length > 300 && r.text.length <= 1000);
  assert.ok(r.text.endsWith("."), "문장 중간에서 끊기지 않는다");
});

test("소제목은 따로 두고, 문장 중간의 짧은 줄(쉼표로 끝남)에서는 문단을 나누지 않는다", () => {
  const full = "x".repeat(80);
  const lines = [
    `${full} reagents were used for the synthesis.`,
    "All chemicals were used as purchased.",
    "Catalyst preparation", // 소제목
    `Synthesis of A. ${full} NaH2PO4 (99.9%, Macklin Chemical Reagent) and Na2HPO4 (99%,`,
    "Macklin Chemical Reagent) were used to prepare buffer.",
  ];
  const paragraphs = linesToParagraphs(lines);
  assert.ok(paragraphs.includes("Catalyst preparation"), "소제목이 앞 문단에 붙지 않는다");
  const joined = paragraphs.find((p) => p.includes("Na2HPO4 (99%,"));
  assert.match(joined, /\(99%, Macklin Chemical Reagent\) were used/, "쉼표로 끝난 줄 뒤에서 끊기지 않는다");
});
