"use client";

import { useState } from "react";

// 분자량을 못 찾았거나 잘못 찾았을 때 사용자가 직접 입력한다.
export default function MwOverride({ editing, loggedIn, onApply }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const mw = Number(value);
  const valid = Number.isFinite(mw) && mw > 0 && mw < 1e7;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-1 block text-xs font-medium text-orange-700 underline">
        {editing ? "분자량 수정" : "분자량 직접 입력"}
      </button>
    );
  }
  return (
    <span className="mt-1 block">
      <span className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="g/mol"
          className="h-7 w-24 rounded border border-orange-300 bg-white px-1.5 text-xs text-slate-900 outline-none focus:bg-orange-50"
        />
        <button
          onClick={() => {
            onApply(mw);
            setOpen(false);
            setValue("");
          }}
          disabled={!valid}
          className="rounded bg-orange-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          적용
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-600">
          취소
        </button>
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-600">
        {loggedIn ? "내 시약 목록에 저장돼 다음에도 쓰여요." : "로그인하면 저장돼요. 지금은 이번 방문에만 적용돼요."}
      </span>
    </span>
  );
}
