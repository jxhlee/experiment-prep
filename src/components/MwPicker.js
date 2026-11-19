"use client";

import { useId, useRef, useState } from "react";
import { normalizeName } from "../lib/chem.mjs";
import { formCandidates } from "../lib/forms.mjs";
import { useExperiment } from "./ExperimentProvider";
import { Icon } from "./icons";
import { Alert, Badge, Button, inputClass } from "./ui";

const fmt = (n) => String(Number(n.toFixed(2)));

/**
 * 분자량을 바꾸는 창: 같은 시약의 무수물·수화물·염 형태 중에서 고르거나(내장 목록 → 없으면 PubChem 에서 찾기), 값을 직접 입력한다.
 * onApply(mw, form) — form 은 고른 형태의 화학식(직접 입력이면 빈 문자열)
 */
export default function MwPicker({ name, currentMw, notFound = false, loggedIn, onApply }) {
  const { formProbe, probeForms } = useExperiment();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const toggleRef = useRef(null);
  const uid = useId();
  const label = name || "이 시약";

  const family = formCandidates(name);
  const curated = family?.forms ?? [];
  const probe = formProbe[normalizeName(name).key];
  // 이미 목록에 있거나, 지금 쓰고 있는 기본 형태와 같은 것은 후보에서 뺀다
  const extra = (probe?.forms ?? []).filter(
    (f) => !curated.some((c) => Math.abs(c.mw - f.mw) <= 0.05) && !(f.hydrate === null && Math.abs(f.mw - currentMw) <= 0.05),
  );
  const options = [
    ...curated.map((f, i) => ({ id: `c${i}`, label: f.label, mw: f.mw, form: f.label.slice(0, 60) })),
    ...extra.map((f) => ({ id: `p${f.cid}`, label: `${f.title} (${f.formula})`, mw: f.mw, form: String(f.title).slice(0, 60), fromPubchem: true })),
  ];
  const currentIndex = Number.isFinite(currentMw) ? options.findIndex((o) => Math.abs(o.mw - currentMw) <= 0.05) : -1;
  const selected = choice || (currentIndex >= 0 ? options[currentIndex].id : "");
  const customMw = Number(custom);
  const customValid = custom.trim() !== "" && Number.isFinite(customMw) && customMw > 0 && customMw < 1e7;
  const picked = options.find((o) => o.id === selected);
  const canApply = selected === "custom" ? customValid : Boolean(picked);

  function close() {
    setOpen(false);
    setChoice("");
    setCustom("");
    toggleRef.current?.focus();
  }

  function apply(event) {
    event.preventDefault();
    if (!canApply) return;
    if (selected === "custom") onApply(customMw, "");
    else onApply(picked.mw, picked.form);
    close();
  }

  const toggleText = family ? "형태 바꾸기" : notFound ? "분자량 입력" : "분자량 변경";

  return (
    <div className="mt-1">
      <Button ref={toggleRef} variant="link" size="sm" aria-expanded={open} aria-controls={`${uid}-form`} onClick={() => setOpen((v) => !v)}>
        {toggleText}
        <span className="sr-only"> ({label})</span>
      </Button>
      {open && (
        <form id={`${uid}-form`} onSubmit={apply} className="mt-1 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium text-ink">{label}의 분자량</legend>
            <p className="mt-0.5 text-sm text-ink-muted">
              같은 시약도 무수물·수화물·염에 따라 분자량이 달라요. 시약병 라벨에 적힌 형태를 고르세요.
            </p>

            {options.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {options.map((o) => (
                  <li key={o.id}>
                    <label className="flex min-h-10 cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface p-2.5 text-sm has-checked:border-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
                      <input
                        type="radio"
                        name={`${uid}-form`}
                        checked={selected === o.id}
                        onChange={() => setChoice(o.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{o.label}</span>
                        <span className="ml-2 tabular-nums text-ink-muted">{fmt(o.mw)} g/mol</span>
                        {options.indexOf(o) === currentIndex && (
                          <Badge tone="accent" className="ml-2">
                            지금 쓰는 값
                          </Badge>
                        )}
                        {o.fromPubchem && <Badge className="ml-2">PubChem</Badge>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2">
              <label className="flex min-h-10 cursor-pointer flex-wrap items-center gap-2.5 text-sm text-ink">
                <input
                  type="radio"
                  name={`${uid}-form`}
                  checked={selected === "custom"}
                  onChange={() => setChoice("custom")}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className="font-medium">직접 입력</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onFocus={() => setChoice("custom")}
                  aria-label={`${label}의 분자량 직접 입력 (g/mol)`}
                  className={`${inputClass} w-32`}
                />
                <span className="text-ink-muted">g/mol</span>
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-disabled={probe?.state === "loading"}
              aria-busy={probe?.state === "loading"}
              onClick={() => probe?.state !== "loading" && probeForms(name)}
            >
              <Icon name="refresh" size={16} />
              {probe?.state === "loading" ? "찾는 중…" : "PubChem에서 다른 형태 찾기"}
            </Button>
            {probe?.state === "done" && (
              <span role="status" className="text-sm text-ink-muted">
                {extra.length > 0 ? `${extra.length}가지를 더 찾았어요.` : "더 찾은 형태가 없어요."}
              </span>
            )}
          </div>
          {probe?.state === "error" && <Alert kind="error">{probe.error}</Alert>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" aria-disabled={!canApply}>
              적용
            </Button>
            <Button size="sm" variant="secondary" onClick={close}>
              취소
            </Button>
          </div>
          <p className="text-sm text-ink-muted">{loggedIn ? "분자량 기록에 저장돼 다음에도 쓰여요." : "로그인하면 저장돼요. 지금은 이번 방문에만 적용돼요."}</p>
        </form>
      )}
    </div>
  );
}
