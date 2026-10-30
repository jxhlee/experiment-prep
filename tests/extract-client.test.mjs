import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtractError } from "../src/lib/gemini.mjs";
import {
  extractViaOwnKey,
  extractViaServer,
  hashText,
  loadCachedExtraction,
  normalizeText,
  saveCachedExtraction,
} from "../src/lib/extract-client.mjs";

function fakeStorage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

const geminiOk = (obj) =>
  Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const RESULT = { reagents: [{ name: "NaCl", concentration: "1 M", volume: "1 L" }], steps: [] };
// Gemini가 실제로 돌려주는 원본 형식(양/용액 부피가 나뉘어 있다)
const RAW = { reagents: [{ name: "NaCl", concentration: "1 M", amount: "", solutionVolume: "1 L" }], steps: [] };

test("텍스트 정규화와 해시: 공백·줄바꿈 차이는 같은 키, 내용이 다르면 다른 키", async () => {
  assert.equal(normalizeText("  a \n\n b\tc  "), "a b c");
  const a = await hashText("Cells were lysed in 50 mM Tris.");
  const b = await hashText("Cells  were lysed\nin 50 mM Tris. ");
  const c = await hashText("Cells were lysed in 60 mM Tris.");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("결과 캐시: 저장하면 같은 키로 다시 읽히고, 없거나 깨진 값은 null", () => {
  const storage = fakeStorage();
  assert.equal(loadCachedExtraction("h1", storage), null);
  saveCachedExtraction("h1", { ...RESULT, model: "m1" }, storage);
  assert.deepEqual(loadCachedExtraction("h1", storage), { ...RESULT, model: "m1" });

  storage.setItem("ep:extract:broken", "{not json");
  assert.equal(loadCachedExtraction("broken", storage), null);
  storage.setItem("ep:extract:shape", JSON.stringify({ reagents: "x" }));
  assert.equal(loadCachedExtraction("shape", storage), null);
  assert.equal(loadCachedExtraction("h1", null), null);
});

test("결과 캐시: 최근 30개만 남기고 오래 안 쓴 것부터 지운다", () => {
  const storage = fakeStorage();
  storage.setItem("unrelated", "keep me");
  const realNow = Date.now;
  let t = 1000;
  Date.now = () => ++t;
  try {
    for (let i = 0; i < 35; i++) saveCachedExtraction(`h${i}`, RESULT, storage);
    const kept = [];
    for (let i = 0; i < storage.length; i++) if (storage.key(i).startsWith("ep:extract:")) kept.push(storage.key(i));
    assert.equal(kept.length, 30);
    assert.equal(storage.getItem("ep:extract:h0"), null);
    assert.equal(storage.getItem("ep:extract:h4"), null);
    assert.notEqual(storage.getItem("ep:extract:h5"), null);
    assert.notEqual(storage.getItem("ep:extract:h34"), null);
    assert.equal(storage.getItem("unrelated"), "keep me");
  } finally {
    Date.now = realNow;
  }
});

test("저장소를 못 쓰는 환경에서도 캐시 호출은 조용히 넘어간다", () => {
  const broken = {
    get length() {
      throw new Error("blocked");
    },
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(loadCachedExtraction("x", broken), null);
  assert.doesNotThrow(() => saveCachedExtraction("x", RESULT, broken));
});

test("내 API 키: 브라우저에서 Google로 직접 호출하고, 키는 URL이 아니라 헤더로만 보낸다", async () => {
  const seen = [];
  await withFetch(
    async (url, init) => {
      seen.push({ url: String(url), key: init.headers["x-goog-api-key"] });
      return geminiOk(RAW);
    },
    async () => {
      const r = await extractViaOwnKey("SECRET-KEY-123", "text");
      assert.equal(r.model, "gemini-3.5-flash-lite");
      assert.deepEqual(r.reagents, RESULT.reagents);
    },
  );
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.startsWith("https://generativelanguage.googleapis.com/"));
  assert.ok(!seen[0].url.includes("SECRET-KEY-123"));
  assert.equal(seen[0].key, "SECRET-KEY-123");
});

test("내 API 키: 서버 혼잡(503)은 같은 모델로 재시도한다", async () => {
  let calls = 0;
  await withFetch(
    async () => (++calls === 1 ? new Response("busy", { status: 503 }) : geminiOk(RAW)),
    async () => {
      const r = await extractViaOwnKey("k".repeat(30), "text", { retryDelayMs: 1 });
      assert.equal(r.reagents.length, 1);
    },
  );
  assert.equal(calls, 2);
});

test("내 API 키: 잘못된 키는 재시도 없이 키 확인 안내로 끝낸다", async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return new Response("API key not valid", { status: 400 });
    },
    async () => {
      await assert.rejects(extractViaOwnKey("bad", "text"), (e) => e instanceof ExtractError && e.kind === "auth" && e.message.includes("API 키"));
    },
  );
  assert.equal(calls, 1);
});

test("내 API 키: 기본 모델을 쓸 수 없으면(404) 별칭 모델로 한 번 바꿔 시도한다", async () => {
  const urls = [];
  await withFetch(
    async (url) => {
      urls.push(String(url));
      return urls.length === 1 ? new Response("not found", { status: 404 }) : geminiOk(RAW);
    },
    async () => {
      const r = await extractViaOwnKey("k".repeat(30), "text", { retryDelayMs: 1 });
      assert.equal(r.model, "gemini-flash-lite-latest");
    },
  );
  assert.ok(urls[0].includes("gemini-3.5-flash-lite"));
  assert.ok(urls[1].includes("gemini-flash-lite-latest"));
});

test("내 API 키: 일일 한도 초과는 대기 시간과 함께 바로 알린다", async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return new Response("Please retry in 23h53m8.7s", { status: 429 });
    },
    async () => {
      await assert.rejects(extractViaOwnKey("k".repeat(30), "text"), (e) => e.kind === "quota" && Math.abs(e.waitSec - (23 * 3600 + 53 * 60 + 8.7)) < 0.01);
    },
  );
  assert.equal(calls, 1);
});

test("서비스 API 호출: 성공 / 서버가 알려 준 오류 분류를 그대로 전달 / 비JSON 504", async () => {
  await withFetch(
    async () => Response.json({ ...RESULT, model: "gemini-3.5-flash-lite" }),
    async () => assert.equal((await extractViaServer("t")).model, "gemini-3.5-flash-lite"),
  );
  await withFetch(
    async () => Response.json({ error: "한도 초과", code: "quota", waitSec: 3600 }, { status: 429 }),
    async () =>
      assert.rejects(extractViaServer("t"), (e) => e.kind === "quota" && e.message === "한도 초과" && e.waitSec === 3600),
  );
  await withFetch(
    async () => new Response("<html>timeout</html>", { status: 504 }),
    async () => assert.rejects(extractViaServer("t"), (e) => e.kind === "timeout"),
  );
  await withFetch(
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => assert.rejects(extractViaServer("t"), (e) => e.kind === "network"),
  );
});
