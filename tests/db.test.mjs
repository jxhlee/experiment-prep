import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authErrorMessage,
  deleteExperiment,
  friendlyDbError,
  libraryToMwMap,
  listExperiments,
  listUserReagents,
  loadExperiment,
  mergeLibrary,
  saveExperiment,
  saveUserReagents,
} from "../src/lib/db.mjs";

// 호출 기록을 남기고, 미리 정해 둔 응답을 순서대로 돌려주는 가짜 Supabase 클라이언트
function fakeSb(...responses) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const builder = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") {
              return (resolve, reject) => Promise.resolve(responses.shift() ?? { data: null, error: null }).then(resolve, reject);
            }
            return (...args) => {
              call.ops.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
}
const opNames = (call) => call.ops.map((o) => o[0]);

test("실험 목록: 최근 수정순으로 100개까지, 본문은 빼고 가져온다", async () => {
  const sb = fakeSb({ data: [{ id: "a" }], error: null });
  assert.deepEqual(await listExperiments(sb), [{ id: "a" }]);
  assert.equal(sb.calls[0].table, "experiments");
  assert.deepEqual(opNames(sb.calls[0]), ["select", "order", "limit"]);
  assert.ok(!sb.calls[0].ops[0][1].includes("method_text"));
  assert.deepEqual(sb.calls[0].ops[1], ["order", "updated_at", { ascending: false }]);
});

test("실험 불러오기 / 삭제", async () => {
  const sb = fakeSb({ data: { id: "a", title: "t" }, error: null }, { data: null, error: null });
  assert.equal((await loadExperiment(sb, "a")).title, "t");
  assert.deepEqual(sb.calls[0].ops, [["select", "*"], ["eq", "id", "a"], ["single"]]);
  await deleteExperiment(sb, "a");
  assert.deepEqual(sb.calls[1].ops, [["delete"], ["eq", "id", "a"]]);
});

test("처음 저장: user_id 를 붙여 insert 한다", async () => {
  const sb = fakeSb({ data: { id: "new", updated_at: "t" }, error: null });
  const saved = await saveExperiment(sb, "user-1", { title: "x" });
  assert.equal(saved.id, "new");
  assert.deepEqual(sb.calls[0].ops[0], ["insert", { title: "x", user_id: "user-1" }]);
});

test("덮어쓰기: 있는 실험이면 update 만 하고 소유자는 건드리지 않는다", async () => {
  const sb = fakeSb({ data: { id: "e1", updated_at: "t" }, error: null });
  const saved = await saveExperiment(sb, "user-1", { title: "수정" }, "e1");
  assert.equal(saved.id, "e1");
  assert.equal(sb.calls.length, 1);
  assert.deepEqual(sb.calls[0].ops[0], ["update", { title: "수정" }]);
  assert.deepEqual(sb.calls[0].ops[1], ["eq", "id", "e1"]);
});

test("덮어쓰기 대상이 사라졌으면(다른 기기에서 삭제) 새로 저장한다", async () => {
  const sb = fakeSb({ data: null, error: null }, { data: { id: "again", updated_at: "t" }, error: null });
  const saved = await saveExperiment(sb, "user-1", { title: "x" }, "gone");
  assert.equal(saved.id, "again");
  assert.deepEqual(sb.calls.map(opNames), [["update", "eq", "select", "maybeSingle"], ["insert", "select", "single"]]);
});

test("DB 오류는 그대로 던진다 (화면에서 friendlyDbError 로 바꿔 보여준다)", async () => {
  const error = { code: "42501", message: "row-level security" };
  await assert.rejects(saveExperiment(fakeSb({ data: null, error }), "u", {}), (e) => e === error);
  await assert.rejects(listExperiments(fakeSb({ data: null, error })), (e) => e === error);
});

test("내 시약 목록 저장: 잘못된 값은 거르고, PubChem 결과는 덮어쓰지 않고 직접 입력은 덮어쓴다", async () => {
  const entries = [
    { key: "sodiumpyruvate", name: "sodium pyruvate", mw: 110.04, formula: "C3H3NaO3", source: "pubchem" },
    { key: "bad0", name: "x", mw: 0 },
    { key: "badnan", name: "x", mw: NaN },
    { key: "", name: "nokey", mw: 5 },
    { key: "mine", name: "내 시약", mw: 123.4, source: "user" },
  ];
  const sb = fakeSb({ error: null }, { error: null }, { error: null });
  await saveUserReagents(sb, "user-1", entries);
  const [op, rows, opts] = sb.calls[0].ops[0];
  assert.equal(op, "upsert");
  assert.deepEqual(rows.map((r) => r.key), ["sodiumpyruvate", "mine"]);
  assert.deepEqual(rows[0], { user_id: "user-1", key: "sodiumpyruvate", name: "sodium pyruvate", mw: 110.04, formula: "C3H3NaO3", source: "pubchem" });
  assert.equal(rows[1].source, "user");
  assert.deepEqual(opts, { onConflict: "user_id,key", ignoreDuplicates: true });

  await saveUserReagents(sb, "user-1", [entries[4]], { overwrite: true });
  assert.deepEqual(sb.calls[1].ops[0][2], { onConflict: "user_id,key", ignoreDuplicates: false });

  await saveUserReagents(sb, "user-1", [entries[1], entries[2]]);
  assert.equal(sb.calls.length, 2, "저장할 게 없으면 호출하지 않는다");
});

test("내 시약 목록 → 계산기용 mwMap, 로그인 직후 병합 규칙", async () => {
  const sb = fakeSb({ data: [{ key: "k", name: "n", mw: "110.04", formula: null, source: "pubchem" }], error: null });
  const rows = await listUserReagents(sb);
  const lib = libraryToMwMap([...rows, { key: "bad", mw: 0 }, { mw: 5 }]);
  assert.deepEqual(lib, { k: { mw: 110.04, formula: undefined, source: "pubchem" } });

  const merged = mergeLibrary(
    { kept: { mw: 50, source: "user" }, failed: { notFound: true } },
    { kept: { mw: 99, source: "pubchem" }, failed: { mw: 70, source: "user" }, fresh: { mw: 10, source: "pubchem" } },
  );
  assert.equal(merged.kept.mw, 50, "이번 방문에서 확정한 값이 우선");
  assert.equal(merged.failed.mw, 70, "조회 실패 표시는 저장된 값으로 대체");
  assert.equal(merged.fresh.mw, 10);
});

test("오류 문구: 인증", () => {
  const cases = [
    [{ code: "invalid_credentials", message: "Invalid login credentials" }, "비밀번호가 올바르지 않"],
    [{ message: "Email not confirmed" }, "메일 인증"],
    [{ code: "user_already_exists", message: "x" }, "이미 가입"],
    [{ message: "Password should be at least 6 characters." }, "8자 이상"],
    [{ status: 429, message: "x" }, "너무 많아요"],
    [{ code: "over_email_send_rate_limit", message: "x" }, "너무 많아요"],
    [{ message: "Unable to validate email address: invalid format" }, "이메일 형식"],
    [{ message: "Signups not allowed for this instance" }, "회원가입을 받지"],
    [{ message: "Failed to fetch" }, "서버에 연결"],
    [{ message: "???" }, "오류가 발생"],
  ];
  for (const [err, expected] of cases) assert.ok(authErrorMessage(err).includes(expected), JSON.stringify(err));
});

test("오류 문구: 저장소", () => {
  const cases = [
    [{ message: "저장 한도(200개)를 넘었습니다. 오래된 항목을 삭제해 주세요." }, "저장 한도(200개)"],
    [{ code: "PGRST205", message: "Could not find the table 'public.experiments' in the schema cache" }, "마이그레이션 SQL"],
    [{ code: "42P01", message: 'relation "experiments" does not exist' }, "마이그레이션 SQL"],
    [{ code: "PGRST301", message: "JWT expired" }, "로그인이 만료"],
    [{ code: "42501", message: "new row violates row-level security policy" }, "권한이 없어요"],
    [{ code: "23514", message: "check constraint" }, "크기 제한"],
    [{ code: "PGRST116", message: "0 rows" }, "찾을 수 없어요"],
    [{ message: "TypeError: Failed to fetch" }, "서버에 연결"],
    [{ message: "???" }, "오류가 발생"],
  ];
  for (const [err, expected] of cases) assert.ok(friendlyDbError(err).includes(expected), JSON.stringify(err));
});
