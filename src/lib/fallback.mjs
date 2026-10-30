import { ExtractError } from "./gemini.mjs";

function summarizeFailures(failures) {
  if (failures.length === 0) return new ExtractError("timeout");
  const kinds = failures.map((f) => f.kind);
  if (kinds.includes("auth")) return new ExtractError("auth");

  // 모두 한도·제한·모델 없음이면 한도 문제로 알린다 (가장 빨리 풀리는 모델 기준 대기 시간)
  if (kinds.every((k) => k === "quota" || k === "rate" || k === "model")) {
    const waits = failures.filter((f) => f.kind === "quota" && f.waitSec != null).map((f) => f.waitSec);
    if (waits.length > 0) return new ExtractError("quota", { waitSec: Math.min(...waits) });
    if (kinds.includes("rate")) return new ExtractError("rate");
    return new ExtractError("model");
  }
  if (kinds.includes("busy")) return new ExtractError("busy");
  if (kinds.includes("timeout")) return new ExtractError("timeout");
  if (kinds.includes("network")) return new ExtractError("network");
  return new ExtractError(kinds[kinds.length - 1]);
}

/**
 * models를 우선순위 순으로 시도한다.
 * - 한 모델이 실패하면 기다리지 않고 바로 다음 모델을 시작한다.
 * - 한 모델이 hedgeMs 넘게 응답이 없으면 다음 모델을 동시에 시작한다(먼저 성공한 쪽 사용).
 * - deadlineMs가 지나거나 모두 실패하면 실패 종류를 합쳐 하나의 ExtractError로 던진다.
 * callModel(model, signal) 은 성공 시 결과를, 실패 시 ExtractError를 던져야 한다.
 */
export function extractWithFallback({ models, callModel, hedgeMs = 12000, deadlineMs = 55000 }) {
  return new Promise((resolve, reject) => {
    const failures = [];
    const controllers = [];
    const deadline = AbortSignal.timeout(deadlineMs);
    let started = 0;
    let finished = 0;
    let settled = false;
    let hedgeTimer;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      for (const c of controllers) c.abort();
      fn(value);
    };

    const startNext = () => {
      if (settled || started >= models.length) return;
      const model = models[started++];
      const controller = new AbortController();
      controllers.push(controller);
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(startNext, hedgeMs);

      Promise.resolve()
        .then(() => callModel(model, AbortSignal.any([controller.signal, deadline])))
        .then(
          (result) => settle(resolve, { ...result, model }),
          (err) => {
            if (settled) return;
            finished += 1;
            failures.push(err instanceof ExtractError ? err : new ExtractError("network"));
            if (failures.at(-1).kind === "auth") return settle(reject, summarizeFailures(failures));
            if (started >= models.length && finished >= started) return settle(reject, summarizeFailures(failures));
            startNext();
          },
        );
    };

    deadline.addEventListener(
      "abort",
      () => {
        // 아직 응답이 없던 시도는 시간 초과로 센다
        for (let i = 0; i < started - finished; i++) failures.push(new ExtractError("timeout"));
        settle(reject, summarizeFailures(failures));
      },
      { once: true },
    );
    startNext();
  });
}
