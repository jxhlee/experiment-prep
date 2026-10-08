const UNIT = "(days?|d|일|hours?|hrs?|hr|h|시간|minutes?|mins?|min|분|seconds?|secs?|sec|s|초)";
const OVERNIGHT = /overnight|o\/n|하룻밤|밤새|철야/i;
const OVERNIGHT_MIN = 12 * 60;

function unitMinutes(unit) {
  const u = unit.toLowerCase();
  if (u === "일" || u.startsWith("d")) return 1440;
  if (u === "시간" || u.startsWith("h")) return 60;
  if (u === "분" || u.startsWith("m")) return 1;
  return 1 / 60;
}

/**
 * "30 minutes", "1 h 30 min", "10-15 min", "3 x 10 min", "overnight" 같은 시간 표현을 분 단위로 바꾼다.
 * 범위는 상한을, overnight은 12시간을 쓰고 approx=true로 표시한다. 해석할 수 없으면 null.
 */
export function parseDuration(input) {
  if (input == null) return null;
  const s = String(input).normalize("NFKC").replace(/[−–—]/g, "-").trim();
  if (!s) return null;

  const times = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (times) {
    const inner = parseDuration(times[2]);
    return inner && { minutes: inner.minutes * Number(times[1]), approx: inner.approx };
  }

  if (OVERNIGHT.test(s)) return { minutes: OVERNIGHT_MIN, approx: true };

  const range = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|~|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}(?![a-z])`, "i"));
  if (range) return { minutes: Number(range[2]) * unitMinutes(range[3]), approx: true };

  let total = 0;
  let found = false;
  for (const m of s.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}(?![a-z])`, "gi"))) {
    total += Number(m[1]) * unitMinutes(m[2]);
    found = true;
  }
  return found ? { minutes: total, approx: false } : null;
}

export function formatMinutes(min) {
  if (min == null) return "시간 미정";
  if (min === 0) return "0분";
  if (min < 1) return `${Math.round(min * 60)}초`;
  if (min < 60 && !Number.isInteger(min)) {
    const m = Math.floor(min);
    const sec = Math.round((min - m) * 60);
    return sec ? `${m}분 ${sec}초` : `${m}분`;
  }
  const total = Math.round(min);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts = [];
  if (d) parts.push(`${d}일`);
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  return parts.length ? parts.join(" ") : "0분";
}

/** 단계마다 소요 시간(반복 포함)과 누적 시작 시각을 붙인다. 시간을 알 수 없는 단계는 합계에서 뺀다. */
export function buildTimeline(steps) {
  let t = 0;
  let unknownCount = 0;
  const items = steps.map((step) => {
    const parsed = parseDuration(step.duration);
    const repeat = Math.max(1, Math.floor(Number(step.repeat)) || 1);
    const perMin = parsed ? parsed.minutes : null;
    const totalMin = perMin == null ? null : perMin * repeat;
    const item = {
      ...step,
      repeat,
      perMin,
      totalMin,
      approx: Boolean(parsed?.approx),
      startMin: t,
      endMin: totalMin == null ? t : t + totalMin,
      unknownBefore: unknownCount,
    };
    if (totalMin == null) unknownCount += 1;
    else t += totalMin;
    return item;
  });
  return { items, totalMin: t, unknownCount };
}

/** 시간이 미정인 단계가 앞에 있으면 시작 시각은 "그 이후"로만 말할 수 있다 */
export function formatStart(item) {
  return `시작 +${formatMinutes(item.startMin)}${item.unknownBefore > 0 ? " 이후" : ""}`;
}

/** 단계별 줄글 설명 + 전체 요약 */
export function buildNarrative({ items, totalMin, unknownCount }) {
  const lines = items.map((it, i) => {
    let start;
    if (it.unknownBefore > 0) {
      start = it.startMin === 0 ? "앞 단계가 끝나는 대로" : `시작 후 최소 ${formatMinutes(it.startMin)}이 지난 시점에`;
    } else {
      start = it.startMin === 0 ? "실험 시작과 함께" : `시작 후 ${formatMinutes(it.startMin)}이 지난 시점에`;
    }
    let dur;
    if (it.totalMin == null) dur = "소요 시간이 명시되지 않았습니다(전체 시간 계산에서 제외)";
    else {
      const rep = it.repeat > 1 ? ` (${formatMinutes(it.perMin)} × ${it.repeat}회)` : "";
      dur = `${it.approx ? "약 " : ""}${formatMinutes(it.totalMin)}${rep} 걸립니다${it.approx ? "(추정값)" : ""}`;
    }
    let text = `${i + 1}단계 「${it.label}」: ${start} 진행하며 ${dur}.`;
    if (it.details) text += ` 조건은 ${it.details}입니다.`;
    const next = items[i + 1];
    if (it.isWaiting && next) {
      text += ` 이 단계는 기다리는 시간이므로, 그 사이에 다음 단계 「${next.label}」에 쓸 기구와 시약을 미리 준비해 두세요.`;
    }
    return text;
  });
  if (items.length) {
    const rest = unknownCount ? ` (시간이 명시되지 않은 ${unknownCount}개 단계는 제외)` : "";
    lines.push(`전체 실험은 약 ${formatMinutes(totalMin)} 걸립니다${rest}.`);
  }
  return lines;
}
