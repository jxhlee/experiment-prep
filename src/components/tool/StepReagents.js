"use client";

import { Icon } from "../icons";

/**
 * 한 단계에서 쓰는 시약을 고른다. 접어 두었다가 펼쳐서 체크하는 방식이라 화면을 어지럽히지 않는다.
 * 접힌 줄에는 지금 연결된 시약 이름을 보여 준다.
 */
export default function StepReagents({ stepId, stepNumber, reagents, selected, onToggle }) {
  const choices = reagents.filter((r) => String(r.name ?? "").trim() !== "");
  const names = choices.filter((r) => selected.includes(r.id)).map((r) => r.name.trim());
  const preview = names.length === 0 ? "없음" : names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개`;

  return (
    <details className="group mt-1 px-1 text-sm">
      <summary className="inline-flex min-h-9 max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md text-ink-muted marker:hidden hover:text-ink pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <Icon name="chevronRight" size={14} className="transition-transform group-open:rotate-90" />
        <span className="shrink-0">쓰는 시약</span>
        <span className={`min-w-0 truncate ${names.length > 0 ? "text-ink" : ""}`}>{preview}</span>
      </summary>
      <fieldset className="mt-1 min-w-0 rounded-lg bg-surface-2 px-3 py-2">
        <legend className="sr-only">{stepNumber}단계에서 쓰는 시약</legend>
        {choices.length === 0 ? (
          <p className="text-ink-muted">이름이 있는 시약이 없어요. 「시약」 탭에서 먼저 추가해 주세요.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {choices.map((r) => {
              const detail = [r.concentration, r.volume].map((v) => String(v ?? "").trim()).filter(Boolean).join(" · ");
              return (
                <li key={r.id}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-ink pointer-coarse:min-h-11">
                    <input
                      id={`step-${stepId}-reagent-${r.id}`}
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={() => onToggle(r.id)}
                      className="h-4 w-4 shrink-0 accent-brand pointer-coarse:h-5 pointer-coarse:w-5"
                    />
                    <span className="min-w-0">
                      {r.name.trim()}
                      {detail && <span className="text-ink-muted"> · {detail}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </details>
  );
}
