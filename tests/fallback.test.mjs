import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtractError } from "../src/lib/gemini.mjs";
import { extractWithFallback } from "../src/lib/fallback.mjs";

const OK = { reagents: [], steps: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 신호가 중단될 때까지 응답하지 않는 모델
const hang = (signal) =>
  new Promise((_, reject) => signal.addEventListener("abort", () => reject(new ExtractError("timeout")), { once: true }));

function harness(behaviors) {
  const calls = [];
  const signals = {};
  return {
    calls,
    signals,
    callModel: async (model, signal) => {
      calls.push(model);
      signals[model] = signal;
      return behaviors[model](signal);
    },
  };
}

test("첫 모델이 성공하면 다른 모델은 부르지 않는다", async () => {
  const h = harness({ a: async () => OK, b: async () => OK });
  const r = await extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 50, deadlineMs: 500 });
  assert.equal(r.model, "a");
  await sleep(80);
  assert.deepEqual(h.calls, ["a"]);
});

test("실패하면 기다리지 않고 바로 다음 모델로 넘어간다", async () => {
  const h = harness({
    a: async () => {
      throw new ExtractError("busy");
    },
    b: async () => OK,
  });
  const t0 = Date.now();
  const r = await extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 400, deadlineMs: 2000 });
  assert.equal(r.model, "b");
  assert.ok(Date.now() - t0 < 200, "hedge 시간을 기다리면 안 된다");
  assert.deepEqual(h.calls, ["a", "b"]);
});

test("응답이 느리면 다음 모델을 동시에 시작하고, 먼저 성공한 쪽을 쓰며 나머지는 중단한다", async () => {
  const h = harness({ a: hang, b: async () => OK });
  const r = await extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 40, deadlineMs: 1000 });
  assert.equal(r.model, "b");
  assert.equal(h.signals.a.aborted, true);
});

test("느리지만 결국 성공하는 첫 모델이 이길 수도 있다", async () => {
  const h = harness({
    a: async () => {
      await sleep(70);
      return OK;
    },
    b: hang,
  });
  const r = await extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 30, deadlineMs: 1000 });
  assert.equal(r.model, "a");
  assert.deepEqual(h.calls, ["a", "b"]);
});

test("모든 모델이 한도 초과면 한도 오류로 합치고, 가장 빠른 대기 시간을 알린다", async () => {
  const quota = (waitSec) => async () => {
    throw new ExtractError("quota", { waitSec });
  };
  const h = harness({ a: quota(7200), b: quota(3600), c: quota(5000) });
  await assert.rejects(
    extractWithFallback({ models: ["a", "b", "c"], callModel: h.callModel, hedgeMs: 50, deadlineMs: 500 }),
    (e) => e.kind === "quota" && e.waitSec === 3600,
  );
});

test("한도와 혼잡이 섞이면 혼잡으로 알린다", async () => {
  const h = harness({
    a: async () => {
      throw new ExtractError("quota", { waitSec: 3600 });
    },
    b: async () => {
      throw new ExtractError("busy");
    },
  });
  await assert.rejects(
    extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 50, deadlineMs: 500 }),
    (e) => e.kind === "busy",
  );
});

test("키 오류는 다른 모델을 시도하지 않고 바로 끝낸다", async () => {
  const h = harness({
    a: async () => {
      throw new ExtractError("auth");
    },
    b: async () => OK,
  });
  await assert.rejects(
    extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 50, deadlineMs: 500 }),
    (e) => e.kind === "auth",
  );
  assert.deepEqual(h.calls, ["a"]);
});

test("마감 시간까지 아무 모델도 응답하지 않으면 시간 초과이고, 진행 중이던 요청은 모두 중단한다", async () => {
  const h = harness({ a: hang, b: hang });
  await assert.rejects(
    extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 20, deadlineMs: 90 }),
    (e) => e.kind === "timeout",
  );
  assert.equal(h.signals.a.aborted && h.signals.b.aborted, true);
});

test("한 모델은 한도 초과, 다른 모델은 마감까지 무응답이면 시간 초과로 알린다", async () => {
  const h = harness({
    a: async () => {
      throw new ExtractError("quota", { waitSec: 3600 });
    },
    b: hang,
  });
  await assert.rejects(
    extractWithFallback({ models: ["a", "b"], callModel: h.callModel, hedgeMs: 20, deadlineMs: 80 }),
    (e) => e.kind === "timeout",
  );
});
