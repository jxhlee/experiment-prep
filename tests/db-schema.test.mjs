import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Supabase 마이그레이션을 진짜 Postgres 엔진(PGlite)에서 그대로 실행해, 문법과 접근 제한(RLS)을 검증한다.
// Supabase에만 있는 auth.uid()·auth.users·authenticated/anon 역할은 아래에서 흉내 낸다.

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261030000000_init.sql", import.meta.url), "utf8");
const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users (id) values ('${ALICE}'), ('${BOB}');
  `);
  await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

// 해당 사용자(authenticated 역할)로 실행한다
async function as(userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

const insertExperiment = (title = "t", extra = "") =>
  db.query(`insert into public.experiments (title, method_text ${extra ? ", " + extra.split("=")[0] : ""}) values ($1, 'text' ${extra ? ", " + extra.split("=")[1] : ""}) returning id, user_id`, [title]);

test("마이그레이션이 적용되고, user_id 는 로그인한 사용자로 자동 채워진다", async () => {
  const { rows } = await as(ALICE, () => insertExperiment("앨리스의 실험"));
  assert.equal(rows[0].user_id, ALICE);
});

test("사용자는 본인 실험만 읽는다", async () => {
  await as(BOB, () => insertExperiment("밥의 실험"));
  const alice = await as(ALICE, () => db.query("select title from public.experiments order by title"));
  const bob = await as(BOB, () => db.query("select title from public.experiments order by title"));
  assert.deepEqual(alice.rows.map((r) => r.title), ["앨리스의 실험"]);
  assert.deepEqual(bob.rows.map((r) => r.title), ["밥의 실험"]);
});

test("남의 실험은 고치거나 지울 수 없고, 남의 이름으로 저장할 수도 없다", async () => {
  const upd = await as(BOB, () => db.query("update public.experiments set title = '탈취' where title = '앨리스의 실험'"));
  assert.equal(upd.affectedRows, 0);
  const del = await as(BOB, () => db.query("delete from public.experiments where title = '앨리스의 실험'"));
  assert.equal(del.affectedRows, 0);
  const still = await as(ALICE, () => db.query("select count(*)::int as n from public.experiments where title = '앨리스의 실험'"));
  assert.equal(still.rows[0].n, 1);

  await assert.rejects(
    as(BOB, () => db.query("insert into public.experiments (user_id, title) values ($1, '위조')", [ALICE])),
    /row-level security/i,
  );
  // 자기 행의 소유자를 남에게 넘기는 수정도 막는다
  await assert.rejects(
    as(BOB, () => db.query("update public.experiments set user_id = $1 where title = '밥의 실험'", [ALICE])),
    /row-level security/i,
  );
});

test("로그인하지 않은(anon) 요청은 두 테이블 모두 접근할 수 없다", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select * from public.experiments"), /permission denied/i);
    await assert.rejects(db.query("select * from public.user_reagents"), /permission denied/i);
    await assert.rejects(db.query("insert into public.experiments (title) values ('x')"), /permission denied/i);
  } finally {
    await db.exec("reset role");
  }
});

test("수정하면 updated_at 이 갱신된다", async () => {
  const { rows } = await as(ALICE, () => insertExperiment("갱신 확인"));
  const before = await as(ALICE, () => db.query("select updated_at, created_at from public.experiments where id = $1", [rows[0].id]));
  await new Promise((r) => setTimeout(r, 20));
  await as(ALICE, () => db.query("update public.experiments set title = '갱신 확인(수정)' where id = $1", [rows[0].id]));
  const after = await as(ALICE, () => db.query("select updated_at, created_at from public.experiments where id = $1", [rows[0].id]));
  assert.ok(after.rows[0].updated_at > before.rows[0].updated_at);
  assert.equal(String(after.rows[0].created_at), String(before.rows[0].created_at));
});

test("형식·크기 제한: 잘못된 값은 거부한다", async () => {
  const bad = async (sql, params = []) => assert.rejects(as(ALICE, () => db.query(sql, params)), /check constraint|violates/i, sql);
  await bad("insert into public.experiments (title) values ($1)", ["가".repeat(121)]);
  await bad("insert into public.experiments (title, sig_figs) values ('s', 7)");
  await bad("insert into public.experiments (title, sig_figs) values ('s', 0)");
  await bad("insert into public.experiments (title, scale_factor) values ('s', 0)");
  await bad("insert into public.experiments (title, scale_factor) values ('s', 5000)");
  await bad(`insert into public.experiments (title, reagents) values ('s', '{"a":1}')`);
  await bad(`insert into public.experiments (title, steps) values ('s', '"문자열"')`);
  await bad(`insert into public.experiments (title, results) values ('s', '[]')`);
  await bad("insert into public.experiments (title, method_text) values ('s', $1)", ["x".repeat(60001)]);
  await bad("insert into public.experiments (title, reagents) values ('s', $1::jsonb)", [JSON.stringify(Array(30000).fill({ name: "x".repeat(10) }))]);

  const ok = await as(ALICE, () =>
    db.query(
      `insert into public.experiments (title, method_text, scale_factor, sig_figs, reagents, steps, results)
       values ('정상', $1, 2.5, 4, '[{"name":"NaCl"}]', '[]', '{"version":1}') returning id`,
      ["x".repeat(60000)],
    ),
  );
  assert.equal(ok.rows.length, 1);
});

test("사용자당 실험은 200개까지만 저장된다 (다른 사용자에게는 영향 없음)", async () => {
  const have = await as(ALICE, () => db.query("select count(*)::int as n from public.experiments"));
  const toFill = 200 - have.rows[0].n;
  await as(ALICE, () => db.query(`insert into public.experiments (title) select 'n' || g from generate_series(1, ${toFill}) g`));
  const full = await as(ALICE, () => db.query("select count(*)::int as n from public.experiments"));
  assert.equal(full.rows[0].n, 200);
  await assert.rejects(as(ALICE, () => insertExperiment("201번째")), /저장 한도\(200개\)/);
  await as(BOB, () => insertExperiment("밥은 아직 여유 있음"));
});

test("자주 쓰는 시약: 키가 같으면 갱신(upsert), 본인 것만 보이고, 값 검증이 걸린다", async () => {
  const upsert = (mw, source = "pubchem") =>
    db.query(
      `insert into public.user_reagents (key, name, mw, formula, source) values ('sodiumpyruvate', 'sodium pyruvate', $1, 'C3H3NaO3', $2)
       on conflict (user_id, key) do update set mw = excluded.mw, source = excluded.source returning mw, source`,
      [mw, source],
    );
  assert.equal(Number((await as(ALICE, () => upsert(110.04))).rows[0].mw), 110.04);
  const second = await as(ALICE, () => upsert(110.0, "user"));
  assert.deepEqual([Number(second.rows[0].mw), second.rows[0].source], [110, "user"]);

  const alice = await as(ALICE, () => db.query("select count(*)::int as n from public.user_reagents"));
  const bob = await as(BOB, () => db.query("select count(*)::int as n from public.user_reagents"));
  assert.deepEqual([alice.rows[0].n, bob.rows[0].n], [1, 0]);

  await assert.rejects(as(ALICE, () => upsert(0)), /check constraint|violates/i);
  await assert.rejects(as(ALICE, () => upsert(-5)), /check constraint|violates/i);
  await assert.rejects(as(ALICE, () => upsert(100, "admin")), /check constraint|violates/i);
  await assert.rejects(
    as(BOB, () => db.query("insert into public.user_reagents (user_id, key, name, mw) values ($1, 'k', 'n', 1)", [ALICE])),
    /row-level security/i,
  );
});

test("자주 쓰는 시약은 사용자당 500개까지만 저장된다", async () => {
  await as(BOB, () =>
    db.query("insert into public.user_reagents (key, name, mw) select 'k' || g, 'n' || g, 100 from generate_series(1, 500) g"),
  );
  await assert.rejects(
    as(BOB, () => db.query("insert into public.user_reagents (key, name, mw) values ('extra', 'extra', 1)")),
    /저장 한도\(500개\)/,
  );
});

test("계정이 삭제되면 그 사용자의 데이터도 함께 삭제된다", async () => {
  await db.query("delete from auth.users where id = $1", [BOB]);
  const left = await db.query("select (select count(*) from public.experiments where user_id = $1)::int as e, (select count(*) from public.user_reagents where user_id = $1)::int as r", [BOB]);
  assert.deepEqual(left.rows[0], { e: 0, r: 0 });
});

test("앱이 만드는 저장 레코드(toRecord)는 DB 제약을 그대로 통과한다", async () => {
  const { toRecord } = await import("../src/lib/experiments.mjs");
  const rec = toRecord({
    title: "논문 재현 실험",
    methodText: "Lysis buffer: 50 mM Tris-HCl, 150 mM NaCl in 100 mL. Incubated on ice for 30 min.",
    reagents: [
      { id: 1, name: "Tris-HCl", concentration: "50 mM", volume: "100 mL" },
      { id: 2, name: "HCl", concentration: "1 M", volume: "" },
    ],
    steps: [{ id: 1, label: "배양", duration: "30 min", repeat: 1, details: "얼음 위", isWaiting: true }],
    scaleFactor: 2.5,
    sigFigs: 4,
    mwMap: {},
  });
  // 앞선 테스트가 ALICE 의 저장 한도를 채워 두므로, 이 테스트는 별도 사용자로 실행한다
  const CAROL = "33333333-3333-3333-3333-333333333333";
  await db.query("insert into auth.users (id) values ($1) on conflict do nothing", [CAROL]);
  const { rows } = await as(CAROL, () =>
    db.query(
      `insert into public.experiments (title, method_text, scale_factor, sig_figs, reagents, steps, results)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb) returning reagents, results`,
      [rec.title, rec.method_text, rec.scale_factor, rec.sig_figs, JSON.stringify(rec.reagents), JSON.stringify(rec.steps), JSON.stringify(rec.results)],
    ),
  );
  assert.equal(rows[0].reagents[0].name, "Tris-HCl");
  assert.equal(rows[0].results.weighing[0].text, "1.970 g"); // 0.05 M × 0.1 L × 157.6 g/mol × 2.5배, 유효숫자 4자리
});
