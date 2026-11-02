"use client";

import { useId, useRef, useState } from "react";
import { Button, inputClass } from "./ui";

// 분자량을 못 찾았거나 잘못 찾았을 때 사용자가 직접 입력한다.
export default function MwOverride({ name, editing, loggedIn, onApply }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const toggleRef = useRef(null);
  const uid = useId();
  const mw = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(mw) && mw > 0 && mw < 1e7;
  const label = name || "이 시약";

  function close() {
    setOpen(false);
    setValue("");
    toggleRef.current?.focus();
  }

  function apply(event) {
    event.preventDefault();
    if (!valid) return;
    onApply(mw);
    close();
  }

  return (
    <div className="mt-1">
      <Button
        ref={toggleRef}
        variant="link"
        size="sm"
        aria-expanded={open}
        aria-controls={`${uid}-form`}
        onClick={() => setOpen((v) => !v)}
      >
        {editing ? "분자량 수정" : "분자량 직접 입력"}
        <span className="sr-only"> ({label})</span>
      </Button>
      {open && (
        <form id={`${uid}-form`} onSubmit={apply} className="mt-1 rounded-lg border border-line bg-surface-2 p-3">
          <label htmlFor={`${uid}-mw`} className="block text-sm font-medium text-ink">
            {label}의 분자량 (g/mol)
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id={`${uid}-mw`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby={`${uid}-note`}
              className={`${inputClass} w-32`}
            />
            <Button type="submit" size="sm" aria-disabled={!valid}>
              적용
            </Button>
            <Button size="sm" variant="secondary" onClick={close}>
              취소
            </Button>
          </div>
          <p id={`${uid}-note`} className="mt-2 text-sm text-ink-muted">
            {loggedIn ? "내 시약 목록에 저장돼 다음에도 쓰여요." : "로그인하면 저장돼요. 지금은 이번 방문에만 적용돼요."}
          </p>
        </form>
      )}
    </div>
  );
}
