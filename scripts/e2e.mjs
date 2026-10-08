// 실제 Gemini 추출 → 분자량 조회 → 계산 → 합산 → 타임라인 전체 흐름을 테스트 데이터로 검증한다.
// 사용법: (개발 서버를 켠 상태에서) npm run test:e2e [-- 고정자id]
//   test-data/fixtures.json        정답(손계산)이 있는 테스트 데이터
//   test-data/*.txt                논문 Methods 텍스트를 넣어두면 정답 없이 결과만 출력
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeRow, canonicalKey, displayName, formatAmount, mergeResults, namesNeedingLookup } from "../src/lib/chem.mjs";
import { buildTimeline, formatMinutes } from "../src/lib/timeline.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SIG = 4;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "test-data");
const only = process.argv[2];

async function extract(methodText) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ methodText }),
    });
    const data = await res.json();
    if (res.ok) return { ...data, ms: Date.now() - t0 };
    console.log(`  (추출 실패 ${attempt}/3: ${data.error?.slice(0, 120)})`);
  }
  throw new Error("Gemini 추출 3회 실패");
}

async function lookupMW(reagents) {
  const mwMap = {};
  const targets = namesNeedingLookup(reagents);
  await Promise.all(
    targets.map(async ({ key, name }) => {
      const res = await fetch(`${BASE}/api/mw?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      mwMap[key] = res.ok ? { mw: data.mw, formula: data.formula } : { notFound: true };
    }),
  );
  return { mwMap, targets };
}

const pad = (s, n) => String(s).padEnd(n);
const checks = [];
function check(ok, label, detail = "") {
  checks.push(ok);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function compare(exp, got, label) {
  if (!got) return check(false, label, "결과에 해당 시약 없음");
  if (!got.ok) return check(false, label, `계산 불가: ${got.reason}`);
  if (got.dim !== exp.dim) return check(false, label, `종류 불일치(기대 ${exp.dim}, 실제 ${got.dim})`);
  const tol = exp.tolerance ?? 0.005;
  const rel = Math.abs(got.value - exp.value) / exp.value;
  check(rel <= tol, label, `기대 ${formatAmount(exp, SIG)} / 실제 ${formatAmount(got, SIG)}${exp.note ? ` (${exp.note})` : ""}`);
}

async function run({ id, title, methods, expect }) {
  console.log(`\n=== ${id}: ${title ?? ""}`);
  const ex = await extract(methods);
  const { mwMap, targets } = await lookupMW(ex.reagents);
  console.log(`  Gemini ${ex.ms}ms · 시약 ${ex.reagents.length}줄 · 단계 ${ex.steps.length}개 · PubChem 조회 ${targets.length}건`);

  const rows = ex.reagents.map((r) => ({ ...r, res: computeRow(r, { mwMap }) }));
  console.log(`\n  ${pad("시약", 26)}${pad("농도", 16)}${pad("부피", 12)}계량값 / 사유`);
  for (const r of rows) {
    const out = r.res.ok ? `${formatAmount(r.res, SIG)}   [${r.res.basis}${r.res.mw ? ` @${r.res.mwSource}` : ""}]` : `✗ ${r.res.reason}`;
    console.log(`  ${pad(r.name, 26)}${pad(r.concentration, 16)}${pad(r.volume, 12)}${out}`);
  }

  const merged = mergeResults(rows.map((r) => ({ name: r.name, res: r.res })));
  const tl = buildTimeline(ex.steps);
  console.log(`\n  통합 준비 리스트: ${merged.map((m) => `${m.name} ${formatAmount(m, SIG)}${m.rows > 1 ? ` (${m.rows}곳 합산)` : ""}`).join(", ")}`);
  console.log(`  타임라인: ${tl.items.map((s) => `${s.label}${s.totalMin == null ? "(시간 미정)" : `(${formatMinutes(s.totalMin)})`}`).join(" → ")}  =  총 ${formatMinutes(tl.totalMin)}`);

  if (!expect) return;
  console.log("");
  const findIn = (list, name) => list.find((x) => canonicalKey(x.name) === canonicalKey(name));
  for (const e of expect.reagents ?? []) compare(e, findIn(rows.map((r) => ({ name: r.name, ...r.res })), e.name), `${e.name}`);
  for (const e of expect.merged ?? []) compare(e, findIn(merged, e.name), `${displayName(e.name)} (합산)`);
  for (const name of expect.refused ?? []) {
    const hit = rows.find((r) => canonicalKey(r.name) === canonicalKey(name));
    check(Boolean(hit) && !hit.res.ok, `${name} 은(는) 계산을 거부해야 함`, hit ? (hit.res.ok ? `잘못 계산됨: ${formatAmount(hit.res, SIG)}` : hit.res.reason) : "추출되지 않음");
  }
  if (expect.totalMinutes != null) {
    check(Math.abs(tl.totalMin - expect.totalMinutes) < 0.01, "타임라인 총 시간", `기대 ${formatMinutes(expect.totalMinutes)} / 실제 ${formatMinutes(tl.totalMin)}${tl.unknownCount ? ` (시간 미정 ${tl.unknownCount}단계 제외)` : ""}`);
  }
}

const fixtures = JSON.parse(readFileSync(join(root, "fixtures.json"), "utf8"));
const extras = readdirSync(root)
  .filter((f) => f.endsWith(".txt"))
  .map((f) => ({ id: f, title: "(정답 없는 사용자 샘플)", methods: readFileSync(join(root, f), "utf8") }));

for (const f of [...fixtures, ...extras]) {
  if (only && f.id !== only) continue;
  try {
    await run(f);
  } catch (err) {
    check(false, `${f.id} 실행`, err.message);
  }
}

const passed = checks.filter(Boolean).length;
console.log(`\n결과: ${passed}/${checks.length} 통과`);
process.exit(passed === checks.length ? 0 : 1);
