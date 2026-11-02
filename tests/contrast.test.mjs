import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// globals.css 의 색 토큰을 읽어, 실제로 함께 쓰이는 글자색·배경색 조합이 WCAG 2.2 AA 를 넘는지 확인한다.
// 글자는 4.5:1, 입력칸 테두리·포커스 링 같은 화면 요소는 3:1.

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(source, startPattern) {
  const start = source.search(startPattern);
  assert.ok(start >= 0, `${startPattern} 를 찾지 못했어요`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error("블록이 닫히지 않았어요");
}

function tokens(body) {
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const light = tokens(block(css, /^:root\s*\{/m));
const dark = { ...light, ...tokens(block(block(css, /@media \(prefers-color-scheme: dark\)/), /:root\s*\{/)) };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [글자(또는 요소), 바탕, 최소 대비]
const TEXT = 4.5;
const UI = 3;
const PAIRS = [
  ["ink", "bg", TEXT],
  ["ink", "surface", TEXT],
  ["ink", "surface-2", TEXT],
  ["ink", "brand-soft", TEXT],
  ["ink-muted", "bg", TEXT],
  ["ink-muted", "surface", TEXT],
  ["ink-muted", "surface-2", TEXT],
  ["ink-muted", "brand-soft", TEXT],
  ["brand-ink", "brand", TEXT],
  ["brand-ink", "brand-hover", TEXT],
  ["brand-soft-ink", "brand-soft", TEXT],
  ["accent-ink", "accent", TEXT],
  ["accent", "surface", TEXT],
  ["accent", "bg", TEXT],
  ["accent-soft-ink", "accent-soft", TEXT],
  ["danger", "bg", TEXT],
  ["danger", "surface", TEXT],
  ["danger", "surface-2", TEXT],
  ["danger-ink", "danger-soft", TEXT],
  ["danger-solid-ink", "danger-solid", TEXT],
  ["warn-ink", "warn-soft", TEXT],
  ["warn-ink", "surface", TEXT],
  ["ok-ink", "ok-soft", TEXT],
  ["ok-ink", "surface", TEXT],
  ["ok-ink", "surface-2", TEXT],
  // 글자가 아닌 화면 요소
  ["line-strong", "bg", UI],
  ["line-strong", "surface", UI],
  ["line-strong", "surface-2", UI],
  ["focus", "bg", UI],
  ["focus", "surface", UI],
  ["focus", "surface-2", UI],
  ["focus", "brand-soft", UI],
  ["brand", "surface", UI],
  ["brand", "bg", UI],
  ["danger", "danger-soft", UI],
  ["accent", "accent-soft", UI],
  ["accent", "surface-2", UI],
  ["accent", "surface", UI],
];

for (const [name, palette] of [
  ["밝은 화면", light],
  ["어두운 화면", dark],
]) {
  test(`${name}: 색 조합이 WCAG AA 대비를 넘는다`, () => {
    const failures = [];
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(palette[fg], `--${fg} 토큰이 없어요`);
      assert.ok(palette[bg], `--${bg} 토큰이 없어요`);
      const ratio = contrast(palette[fg], palette[bg]);
      if (ratio < min) failures.push(`${fg} / ${bg}: ${ratio.toFixed(2)} (최소 ${min})`);
    }
    assert.deepEqual(failures, []);
  });
}

test("대비 계산식이 알려진 값과 맞는다", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 0.01);
  assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.02);
});

test("어두운 화면이 밝은 화면의 모든 토큰을 다시 정의한다", () => {
  const darkOnly = tokens(block(block(css, /@media \(prefers-color-scheme: dark\)/), /:root\s*\{/));
  const missing = Object.keys(light).filter((k) => !(k in darkOnly));
  assert.deepEqual(missing, []);
});
