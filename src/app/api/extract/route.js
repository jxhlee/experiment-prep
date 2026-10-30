import {
  ExtractError,
  MAX_CHARS_SERVER,
  buildRequestBody,
  classifyFailure,
  endpoint,
  parseExtraction,
} from "../../../lib/gemini.mjs";
import { extractWithFallback } from "../../../lib/fallback.mjs";

// Vercel 함수 제한(60초) 안에서 끝나도록 한다.
export const maxDuration = 60;
const DEADLINE_MS = 55000;
const HEDGE_AFTER_MS = 12000;

// 우선순위 순서. 경량 모델이 이 작업(텍스트에서 값 옮겨 적기)에서 가장 빠르고 정확했다.
// 한도는 모델별로 따로 집계되어, 뒤쪽 모델이 하루 호출 가능 횟수를 늘려 준다.
// 별칭(-latest, 3.5-flash→3.6-flash)은 다른 모델과 같은 곳을 가리켜서 넣지 않는다.
const MODEL_CHAIN = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"];

const STATUS_BY_KIND = {
  quota: 429,
  rate: 429,
  busy: 503,
  timeout: 504,
  network: 502,
  auth: 500,
  model: 502,
  "bad-response": 502,
  "too-long": 413,
  other: 502,
};

function errorResponse(err) {
  const message =
    err.kind === "auth" ? "서버의 Gemini API 키에 문제가 있습니다. 운영자에게 알려 주세요." : err.message;
  return Response.json(
    { error: message, code: err.kind, waitSec: err.waitSec },
    { status: STATUS_BY_KIND[err.kind] ?? 502 }
  );
}

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다.", code: "auth" }, { status: 500 });
  }

  let methodText;
  try {
    ({ methodText } = await request.json());
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다.", code: "other" }, { status: 400 });
  }

  if (typeof methodText !== "string" || !methodText.trim()) {
    return Response.json({ error: "분석할 Methods 텍스트가 비어 있습니다.", code: "other" }, { status: 400 });
  }

  const length = methodText.trim().length;
  if (length > MAX_CHARS_SERVER) {
    return errorResponse(
      new ExtractError("too-long", {
        message: `서비스 API는 한 번에 ${MAX_CHARS_SERVER.toLocaleString("ko-KR")}자까지 분석합니다 (현재 ${length.toLocaleString("ko-KR")}자). 합성·준비 부분만 붙여넣거나, 내 API 키 방식을 사용해 주세요.`,
      })
    );
  }

  const body = JSON.stringify(buildRequestBody(methodText));

  async function callModel(model, signal) {
    let res;
    try {
      res = await fetch(endpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal,
      });
    } catch (err) {
      const aborted = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new ExtractError(aborted ? "timeout" : "network");
    }
    if (!res.ok) {
      const failure = classifyFailure(res.status, await res.text().catch(() => ""));
      throw new ExtractError(failure.kind, { waitSec: failure.waitSec });
    }
    return parseExtraction(await res.json().catch(() => null));
  }

  try {
    const result = await extractWithFallback({
      models: MODEL_CHAIN,
      callModel,
      hedgeMs: HEDGE_AFTER_MS,
      deadlineMs: DEADLINE_MS,
    });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err instanceof ExtractError ? err : new ExtractError("other"));
  }
}
