import {
  EXTRACT_VERSION,
  ExtractError,
  buildRequestBody,
  classifyFailure,
  endpoint,
  parseExtraction,
} from "./gemini.mjs";

// ---- 결과 캐시 (서비스 API·내 API 키 공통) -------------------------------------------------
// 같은 텍스트는 다시 호출하지 않는다. 브라우저 localStorage에 최근 분석 결과만 저장한다.

const CACHE_PREFIX = "ep:extract:";
const CACHE_LIMIT = 30;

export function normalizeText(text) {
  return String(text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export async function hashText(text) {
  const bytes = new TextEncoder().encode(`${EXTRACT_VERSION}\n${normalizeText(text)}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCachedExtraction(hash, storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(CACHE_PREFIX + hash);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!Array.isArray(entry?.reagents) || !Array.isArray(entry?.steps)) return null;
    storage.setItem(CACHE_PREFIX + hash, JSON.stringify({ ...entry, usedAt: Date.now() }));
    return { reagents: entry.reagents, steps: entry.steps, model: entry.model ?? "" };
  } catch {
    return null;
  }
}

export function saveCachedExtraction(hash, result, storage = defaultStorage()) {
  try {
    if (!storage) return;
    const now = Date.now();
    storage.setItem(
      CACHE_PREFIX + hash,
      JSON.stringify({ reagents: result.reagents, steps: result.steps, model: result.model ?? "", savedAt: now, usedAt: now }),
    );

    const entries = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      let usedAt = 0;
      try {
        usedAt = JSON.parse(storage.getItem(key))?.usedAt ?? 0;
      } catch {}
      entries.push({ key, usedAt });
    }
    entries.sort((a, b) => b.usedAt - a.usedAt);
    for (const { key } of entries.slice(CACHE_LIMIT)) storage.removeItem(key);
  } catch {
    // 저장 공간이 없거나 막혀 있으면 캐시 없이 동작한다
  }
}

// ---- 서비스 API (서버 라우트) ----------------------------------------------------------------

export async function extractViaServer(methodText, { signal } = {}) {
  let res;
  try {
    res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ methodText }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ExtractError("network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ExtractError(data.code ?? (res.status === 504 ? "timeout" : "other"), {
      message: data.error,
      waitSec: data.waitSec,
    });
  }
  return { reagents: data.reagents ?? [], steps: data.steps ?? [], model: data.model ?? "" };
}

// ---- 사용자 본인 키: 브라우저에서 Google로 직접 호출 (키가 우리 서버를 거치지 않는다) -----------

// 서비스 API와 같은 기본 모델을 쓰되, 그 키로 쓸 수 없으면(404) 항상 유효한 별칭으로 한 번 바꿔 시도한다.
const OWN_KEY_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
const OWN_REQUEST_MS = 60000;
const OWN_TOTAL_MS = 100000;
const OWN_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function extractViaOwnKey(apiKey, methodText, { signal, retryDelayMs = 1500 } = {}) {
  const body = JSON.stringify(buildRequestBody(methodText));
  const started = Date.now();
  let lastError = new ExtractError("busy");
  let modelIndex = 0;

  for (let attempt = 0; attempt < OWN_ATTEMPTS; attempt++) {
    const remaining = OWN_TOTAL_MS - (Date.now() - started);
    if (attempt > 0 && remaining < 10000) break;
    const signals = [AbortSignal.timeout(Math.min(OWN_REQUEST_MS, remaining))];
    if (signal) signals.push(signal);

    const model = OWN_KEY_MODELS[modelIndex];
    let res;
    try {
      res = await fetch(endpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = new ExtractError(err?.name === "TimeoutError" ? "timeout" : "network");
      continue;
    }

    if (res.ok) {
      const data = await res.json().catch(() => null);
      return { ...parseExtraction(data), model };
    }

    const failure = classifyFailure(res.status, await res.text().catch(() => ""));
    if (failure.kind === "model" && modelIndex < OWN_KEY_MODELS.length - 1) {
      modelIndex += 1;
      lastError = new ExtractError("model");
      continue;
    }
    if (failure.kind === "busy" || failure.kind === "rate") {
      lastError = new ExtractError(failure.kind);
      await sleep(retryDelayMs * (attempt + 1));
      continue;
    }
    throw new ExtractError(failure.kind, {
      waitSec: failure.waitSec,
      message: failure.kind === "auth" ? "입력한 API 키가 올바르지 않거나 사용 권한이 없습니다. 키를 확인해 주세요." : undefined,
    });
  }
  throw lastError;
}
