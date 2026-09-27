const MODEL = "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 503]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          label: { type: "STRING", description: "단계 이름 (예: 원심분리, 가열)" },
          duration: { type: "STRING", description: "소요 또는 대기 시간 (예: 10분, overnight)" },
        },
        required: ["label"],
      },
    },
  },
  required: ["reagents", "steps"],
};

const PROMPT_PREFIX = `너는 실험 논문의 Methods 섹션을 읽고 필요한 시약과 실행 순서를 구조화하는 도우미이다.
아래 Methods 텍스트에서 (1) 등장하는 모든 시약의 이름·목표 농도·목표 부피와 (2) 실행 순서를 단계별로 소요/대기 시간과 함께 추출하라.
텍스트에 명시되지 않은 값은 빈 문자열로 두고, 절대로 없는 값을 지어내지 마라.

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

  let geminiRes;
  let lastErrBody = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
      });
    } catch (err) {
      return Response.json(
        { error: `Gemini API 호출 중 네트워크 오류: ${err.message}` },
        { status: 502 }
      );
    }

    if (geminiRes.ok) break;

    lastErrBody = await geminiRes.text().catch(() => "");
    const shouldRetry = RETRYABLE_STATUS.has(geminiRes.status) && attempt < MAX_RETRIES;
    if (!shouldRetry) {
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

  return Response.json({
    reagents: Array.isArray(parsed.reagents) ? parsed.reagents : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
  });
}
