"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { Button, inputClass } from "./ui";

export const MIN_SIG_FIGS = 1;
export const MAX_SIG_FIGS = 6;
export const MAX_SCALE = 1000;

// 끝에 닿았을 때 disabled 로 바꾸면 키보드 포커스가 사라지므로 aria-disabled 를 쓰고 동작만 막는다.
export function SigFigsControl({ id, value, onChange }) {
  const atMin = value <= MIN_SIG_FIGS;
  const atMax = value >= MAX_SIG_FIGS;
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`}>
      <p id={`${id}-label`} className="text-sm font-medium text-ink">
        유효숫자
      </p>
      <p id={`${id}-hint`} className="mt-0.5 text-sm text-ink-muted">
        계량값에 보여 줄 숫자 자릿수 ({MIN_SIG_FIGS}~{MAX_SIG_FIGS})
      </p>
      <div className="mt-2 inline-flex items-center rounded-lg border border-line-strong bg-surface">
        <Button
          variant="ghost"
          className="w-10 px-0"
          aria-label="유효숫자 줄이기"
          aria-disabled={atMin}
          onClick={() => !atMin && onChange(value - 1)}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            −
          </span>
        </Button>
        <output className="min-w-12 border-x border-line text-center text-[15px] font-semibold tabular-nums text-ink">
          {value}
          <span className="sr-only">자리</span>
        </output>
        <Button
          variant="ghost"
          className="w-10 px-0"
          aria-label="유효숫자 늘리기"
          aria-disabled={atMax}
          onClick={() => !atMax && onChange(value + 1)}
        >
          <Icon name="plus" size={16} />
        </Button>
      </div>
    </div>
  );
}

const parseScale = (text) => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 && n <= MAX_SCALE ? n : null;
};

/** 슬라이더와 숫자 입력칸이 같은 값을 함께 고친다. 숫자 칸에 잘못된 값을 쓰는 동안에는 마지막 올바른 값을 유지한다. */
export function ScaleControl({ id, value, onChange }) {
  const [text, setText] = useState(null);
  const invalid = text !== null && parseScale(text) === null;
  const sliderValue = Math.min(10, Math.max(0.5, value));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${id}-range`} className="text-sm font-medium text-ink">
          실험 규모 (배수)
        </label>
        <span aria-hidden="true" className="text-[15px] font-semibold tabular-nums text-ink">
          ×{value}
        </span>
      </div>
      <input
        id={`${id}-range`}
        type="range"
        min="0.5"
        max="10"
        step="0.5"
        value={sliderValue}
        aria-valuetext={`${value}배`}
        onChange={(e) => {
          setText(null);
          onChange(Number(e.target.value));
        }}
        className="w-full"
      />
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-number`} className="shrink-0 whitespace-nowrap text-sm text-ink-muted">
          직접 입력
        </label>
        <input
          id={`${id}-number`}
          type="number"
          inputMode="decimal"
          min="0.1"
          max={MAX_SCALE}
          step="any"
          value={text ?? String(value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseScale(e.target.value);
            if (n !== null) onChange(n);
          }}
          onBlur={() => setText(null)}
          className={`${inputClass} w-24 text-right tabular-nums`}
        />
        <span className="text-sm text-ink-muted">배</span>
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger">
          <Icon name="alert" size={16} />0보다 크고 {MAX_SCALE.toLocaleString("ko-KR")} 이하인 숫자를 입력해 주세요.
        </p>
      )}
    </div>
  );
}
