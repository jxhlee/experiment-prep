const MODEL = "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 503]);
// Vercel 함수 제한(60초 이내)에 맞춰, 응답 없는 요청 1회를 끊고 재시도해도 넘지 않게 잡는다.
export const maxDuration = 60;
const REQUEST_TIMEOUT_MS = 28000;
const DEADLINE_MS = 55000;
const MIN_RETRY_WINDOW_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 본문의 "Please retry in 23h53m8.7s"에서 대기 시간(초)을 읽는다.
function parseRetryAfterSec(body) {
  const m = body.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function formatWait(sec) {
  const h = Math.floor(sec / 3600);
  const min = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `약 ${h}시간 ${min}분` : `약 ${min}분`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reagents: {
      type: "ARRAY",
      description: "논문 Methods에 등장하는 시약 목록",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "시약 이름" },
          concentration: { type: "STRING", description: "목표 농도 (예: 50 mM, 0.9 % (w/v))" },
          volume: { type: "STRING", description: "목표 부피 또는 양 (예: 500 mL)" },
        },
        required: ["name"],
      },
    },
    steps: {
      type: "ARRAY",
      description: "실행 순서와 각 단계의 소요/대기 시간",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING", description: "짧은 한국어 단계 이름 (예: 원심분리, 얼음 위 배양)" },
          duration: { type: "STRING", description: "한 번 수행하는 시간을 '숫자 단위'로 (예: 30 min, 1 h, overnight). 없으면 빈 문자열" },
          repeat: { type: "INTEGER", description: "반복 횟수. 반복이 없으면 1" },
          details: { type: "STRING", description: "온도·속도(rpm, g)·pH 등 조건. 없으면 빈 문자열" },
          isWaiting: { type: "BOOLEAN", description: "사용자가 손을 쓰지 않고 기다리는 단계(배양, 반응, 냉각, 방치, 원심분리 등)면 true" },
        },
        required: ["label"],
      },
    },
  },
  required: ["reagents", "steps"],
};

const PROMPT_PREFIX = `너는 실험 논문의 Methods 섹션을 읽고 실험 준비에 필요한 정보를 구조화하는 도우미이다.
계산은 하지 말고, 텍스트에 적힌 값을 옮겨 적기만 하라. 텍스트에 없는 값은 빈 문자열로 두고 절대 지어내지 마라.

[시약 reagents]
- 용액(버퍼 등)을 이루는 성분마다 한 줄씩 만든다. 같은 시약이 여러 용액에 쓰이면 용액마다 따로 한 줄씩 만든다.
- name: 화학물질 이름만 영문으로 적는다. 'buffer', 'solution' 같은 말은 빼고, pH는 필요하면 괄호로 덧붙인다. (예: 'Tris-HCl (pH 7.5)')
- concentration: 목표 농도를 '숫자 단위' 형식으로 적는다. (예: '50 mM', '2 mg/mL', '0.9 % (w/v)', '1 % (v/v)') 텍스트에 w/v, v/v가 적혀 있지 않으면 '1 %'처럼 %만 적는다.
- volume: 그 시약이 들어가는 용액의 최종 부피, 또는 시약 자체의 양을 '숫자 단위'로 적는다. (예: '100 mL', '50 µL', '20 units') 용액의 최종 부피가 적혀 있으면 그 용액의 모든 성분 줄에 같은 부피를 넣는다.

[실행 단계 steps]
- 실험 조작을 순서대로 나열한다. 용액 제조는 소요 시간이 적혀 있을 때만 단계로 넣는다.
- 'washed 3 times for 10 min each'는 duration '10 min', repeat 3으로 적는다.

Methods 텍스트:
"""
`;

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다." },
      { status: 500 }
    );
  }

  let methodText;
  try {
    ({ methodText } = await request.json());
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!methodText || !methodText.trim()) {
    return Response.json({ error: "분석할 Methods 텍스트가 비어 있습니다." }, { status: 400 });
  }

  const prompt = `${PROMPT_PREFIX}${methodText.trim()}\n"""`;

  const busy = () =>
    Response.json({ error: "Gemini 서버가 혼잡해 응답하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });

  let geminiRes;
  let lastErrBody = "";
  let timeoutRetried = false;
  const started = Date.now();
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const remaining = DEADLINE_MS - (Date.now() - started);
    if (attempt > 0 && remaining < MIN_RETRY_WINDOW_MS) return busy();
    try {
      geminiRes = await fetch(`${ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });
    } catch (err) {
      if (err.name === "TimeoutError") {
        if (!timeoutRetried && attempt < MAX_RETRIES) {
          timeoutRetried = true;
          continue;
        }
        return Response.json(
          { error: "Gemini 응답이 오지 않아 중단했습니다. 잠시 후 다시 시도해 주세요." },
          { status: 504 }
        );
      }
      return Response.json(
        { error: `Gemini API 호출 중 네트워크 오류: ${err.message}` },
        { status: 502 }
      );
    }

    if (geminiRes.ok) break;

    lastErrBody = await geminiRes.text().catch(() => "");
    if (geminiRes.status === 429) {
      const waitSec = parseRetryAfterSec(lastErrBody);
      if (waitSec != null && waitSec > 20) {
        return Response.json(
          { error: `Gemini 무료 사용 한도를 모두 사용했습니다. ${formatWait(waitSec)} 뒤에 다시 시도해 주세요.` },
          { status: 429 }
        );
      }
    }
    const shouldRetry = RETRYABLE_STATUS.has(geminiRes.status) && attempt < MAX_RETRIES;
    if (!shouldRetry) {
      if (geminiRes.status === 503) return busy();
      return Response.json(
        { error: `Gemini API 오류 (${geminiRes.status}): ${lastErrBody.slice(0, 500)}` },
        { status: 502 }
      );
    }
    await sleep(500 * 2 ** attempt);
  }

  const data = await geminiRes.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    return Response.json({ error: "Gemini 응답에서 결과를 찾을 수 없습니다." }, { status: 502 });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Gemini 응답을 JSON으로 해석하지 못했습니다." }, { status: 502 });
  }

  const text$ = (v) => (typeof v === "string" ? v.trim() : "");
  return Response.json({
    reagents: (Array.isArray(parsed.reagents) ? parsed.reagents : []).map((r) => ({
      name: text$(r.name),
      concentration: text$(r.concentration),
      volume: text$(r.volume),
    })),
    steps: (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => ({
      label: text$(s.label),
      duration: text$(s.duration),
      repeat: Math.max(1, Math.floor(Number(s.repeat)) || 1),
      details: text$(s.details),
      isWaiting: Boolean(s.isWaiting),
    })),
  });
}
