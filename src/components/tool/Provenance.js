import { Icon } from "../icons";

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

/** 근거 문장 상자. 버튼으로 펼쳤을 때만 그려진다. */
export function EvidenceQuote({ id, evidence, missing = "원문에서 이 항목이 나오는 문장을 찾지 못했어요. 원문과 직접 대조해 주세요." }) {
  return (
    <blockquote id={id} className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink">
      <Icon name="clipboard" size={14} className="mt-1 text-ink-muted" />
      <span className="min-w-0">{evidence ? <HighlightedSentence evidence={evidence} /> : <span className="text-ink-muted">{missing}</span>}</span>
    </blockquote>
  );
}
