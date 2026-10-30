// 서버 라우트(서비스 API)와 브라우저(사용자 본인 키)가 함께 쓰는 Gemini 추출 공통 모듈.

// 프롬프트나 스키마를 바꾸면 올린다. 저장된 분석 결과 캐시가 이 값으로 구분되어 자동으로 무효화된다.
export const EXTRACT_VERSION = "3";

// 서비스 API는 하루 호출 한도가 작아서 입력 길이를 제한한다. 사용자 본인 키는 안전 상한만 둔다.
export const MAX_CHARS_SERVER = 6000;
export const MAX_CHARS_OWN_KEY = 30000;

export function endpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reagents: {
      type: "ARRAY",
      description: "논문 Methods에 등장하는 시약 목록",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "시약 이름" },
          concentration: { type: "STRING", description: "목표 농도 (예: 50 mM, 0.9 % (w/v)). 농도가 적혀 있지 않으면 빈 문자열" },
          amount: { type: "STRING", description: "그 시약 자체의 양(예: 1.213 g, 0.2 mg, 10 mL, 20 units). 텍스트에 그 시약의 양이 직접 적힌 경우에만. 없으면 빈 문자열" },
          solutionVolume: { type: "STRING", description: "농도가 적힌 시약이 들어 있는 용액의 최종 부피(예: 100 mL). 농도가 없으면 빈 문자열" },
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
- amount: 텍스트에 그 시약 자체의 양이 적혀 있을 때만 '숫자 단위'로 적는다. (예: '1.213 g', '0.2 mg', '10 mL', '20 units') 질량과 mmol이 함께 적혀 있으면 질량을 쓴다. 농도로 만드는 용액의 부피는 여기에 넣지 않는다.
- solutionVolume: concentration을 적은 시약이 들어 있는 용액의 최종 부피를 '숫자 단위'로 적는다. (예: '100 mL') 용액의 최종 부피가 적혀 있으면 그 용액의 모든 농도 성분 줄에 같은 값을 넣는다. concentration이 없는 시약은 비워 둔다.

[실행 단계 steps]
- 실험 조작을 순서대로 나열한다. 용액 제조는 소요 시간이 적혀 있을 때만 단계로 넣는다.
- label은 반드시 한국어 명사형으로 적는다. (예: '소성', '질화', '교반', '수열 반응', '광조사', '여과', '건조', '원심분리') 영어 동사를 그대로 쓰지 않는다.
- 'washed 3 times for 10 min each'는 duration '10 min', repeat 3으로 적는다.

Methods 텍스트:
"""
`;

export function buildRequestBody(methodText) {
  return {
    contents: [{ parts: [{ text: `${PROMPT_PREFIX}${String(methodText).trim()}\n"""` }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  };
}

/** 실패 종류: quota(일일 한도) rate(일시적 제한) busy(서버 혼잡) timeout network auth model bad-response too-long other */
export class ExtractError extends Error {
  constructor(kind, { message, waitSec } = {}) {
    super(message ?? failureMessage(kind, waitSec));
    this.name = "ExtractError";
    this.kind = kind;
    this.waitSec = waitSec;
  }
}

// 429 본문의 "Please retry in 23h53m8.7s"에서 대기 시간(초)을 읽는다.
export function parseRetryAfterSec(body) {
  const m = String(body).match(/retry in\s+(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function formatWait(sec) {
  const h = Math.floor(sec / 3600);
  const min = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `약 ${h}시간 ${min}분` : `약 ${min}분`;
}

export function classifyFailure(status, body = "") {
  if (status === 429) {
    const waitSec = parseRetryAfterSec(body);
    return { kind: waitSec != null && waitSec > 20 ? "quota" : "rate", waitSec: waitSec ?? undefined };
  }
  if (status === 401 || status === 403 || (status === 400 && /api[ _]?key/i.test(body))) return { kind: "auth" };
  if (status === 404) return { kind: "model" };
  if (status >= 500) return { kind: "busy" };
  return { kind: "other" };
}

export function failureMessage(kind, waitSec) {
  switch (kind) {
    case "quota":
      return `Gemini 무료 사용 한도를 모두 사용했습니다.${waitSec ? ` ${formatWait(waitSec)} 뒤에 다시 시도해 주세요.` : ""}`;
    case "rate":
      return "요청이 한꺼번에 몰려 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
    case "busy":
      return "Gemini 서버가 혼잡해 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "timeout":
      return "Gemini 응답이 오지 않아 중단했습니다. 잠시 후 다시 시도해 주세요.";
    case "network":
      return "네트워크 오류로 Gemini에 연결하지 못했습니다.";
    case "auth":
      return "API 키가 올바르지 않거나 사용 권한이 없습니다.";
    case "model":
      return "사용할 수 있는 Gemini 모델을 찾지 못했습니다.";
    case "bad-response":
      return "Gemini 응답을 해석하지 못했습니다. 다시 시도해 주세요.";
    default:
      return "Gemini 호출 중 오류가 발생했습니다.";
  }
}

const text$ = (v) => (typeof v === "string" ? v.trim() : "");

/** Gemini 응답 → { reagents, steps }. 해석할 수 없으면 bad-response 오류 */
export function parseExtraction(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join("")
    : "";
  if (!text) throw new ExtractError("bad-response");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExtractError("bad-response");
  }
  return {
    reagents: (Array.isArray(parsed?.reagents) ? parsed.reagents : []).map((r) => {
      const concentration = text$(r?.concentration);
      const amount = text$(r?.amount);
      const solutionVolume = text$(r?.solutionVolume);
      // 농도가 없는 시약에 용액 부피를 쓰면 "시약 100 mL"로 잘못 읽히므로, 농도가 있을 때만 용액 부피를 쓴다
      return { name: text$(r?.name), concentration, volume: concentration ? solutionVolume || amount : amount };
    }),
    steps: (Array.isArray(parsed?.steps) ? parsed.steps : []).map((s) => ({
      label: text$(s?.label),
      duration: text$(s?.duration),
      repeat: Math.max(1, Math.floor(Number(s?.repeat)) || 1),
      details: text$(s?.details),
      isWaiting: Boolean(s?.isWaiting),
    })),
  };
}
