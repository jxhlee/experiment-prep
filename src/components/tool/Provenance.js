import { existenceOf, pubchemUrl } from "../../lib/reagent-status.mjs";
import { Icon } from "../icons";
import { Badge } from "../ui";

const SRC = {
  paper: { tone: "ok", icon: "check", word: "논문 명시", hint: "원문에 그대로 적혀 있어요" },
  ai: { tone: "accent", icon: "sparkles", word: "AI 해석", hint: "원문에서 그대로 찾지 못했어요. AI가 환산·해석했거나 직접 고친 값이에요. 원문과 대조해 주세요" },
};

/** 값 하나의 출처 표시. 색만이 아니라 아이콘과 글자로도 구분한다. */
export function SourceBadge({ src, field }) {
  const s = SRC[src];
  if (!s) return null;
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {field && <span>{field}</span>}
      <span>{s.word}</span>
      <span className="sr-only"> — {s.hint}</span>
    </Badge>
  );
}

/** 스스로 정한 것(단계 이름 요약, 대기 여부)은 항상 AI 몫이다 */
export function AiOnlyBadge({ field }) {
  return <SourceBadge src="ai" field={field} />;
}

/** 원문 문장에서 이름·값이 적힌 곳을 강조해서 보여 준다 */
export function HighlightedSentence({ evidence }) {
  const { sentence, ranges } = evidence;
  const parts = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<span key={`t${i}`}>{sentence.slice(cursor, start)}</span>);
    parts.push(
      <mark key={`m${i}`} className="rounded bg-accent-soft px-0.5 font-medium text-accent-soft-ink">
        {sentence.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < sentence.length) parts.push(<span key="tail">{sentence.slice(cursor)}</span>);
  return <>{parts}</>;
}

export function EvidenceDetails({ evidence, missing = "원문에서 이 항목이 나오는 문장을 찾지 못했어요. 원문과 직접 대조해 주세요." }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md text-ink-muted marker:hidden hover:text-ink pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <Icon name="chevronRight" size={14} className="transition-transform group-open:rotate-90" />
        원문 근거 보기
      </summary>
      <blockquote className="mt-1 rounded-lg border-l-2 border-line-strong bg-surface-2 px-3 py-2 leading-relaxed text-ink">
        {evidence ? <HighlightedSentence evidence={evidence} /> : <span className="text-ink-muted">{missing}</span>}
      </blockquote>
    </details>
  );
}

const EXIST_ICON = { ok: "checkCircle", danger: "alert", warn: "alert", neutral: "info" };

/** 이 이름이 실제로 있는 시약인지(내장 목록·PubChem) 보여 준다 */
export function ExistenceChip({ name, info }) {
  const e = existenceOf(name, info);
  if (!e) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <Badge tone={e.tone} icon={EXIST_ICON[e.tone]}>
        {e.text}
      </Badge>
      {e.kind === "found" && e.detail && <span className="text-sm text-ink-muted">{e.detail}</span>}
      {e.kind === "found" && e.cid && (
        <a href={pubchemUrl(e.cid)} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline underline-offset-4 hover:no-underline">
          PubChem 보기<span className="sr-only"> (새 창)</span>
        </a>
      )}
    </span>
  );
}

/** 시약 한 줄의 원문 대조 결과를 한 줄 배지로 */
export function ReagentSources({ analysis }) {
  if (!analysis) return null;
  return (
    <>
      <SourceBadge src={analysis.name} field="이름" />
      <SourceBadge src={analysis.concentration} field="농도" />
      <SourceBadge src={analysis.volume} field="부피" />
    </>
  );
}

/** 이 줄의 계량값이 논문에 적힌 값만으로 계산됐는지, AI 가 해석한 값이 섞였는지 */
export function ProvenanceSummary({ analysis }) {
  if (!analysis) return null;
  if (analysis.overall === "paper") {
    return (
      <Badge tone="ok" icon="check">
        논문 명시 값으로 계산
      </Badge>
    );
  }
  return (
    <Badge tone="accent" icon="sparkles">
      AI 해석 포함 ({analysis.aiFields.join("·")})
      <span className="sr-only"> — 원문과 대조해 주세요</span>
    </Badge>
  );
}
