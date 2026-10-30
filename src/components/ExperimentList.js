"use client";

import { useState } from "react";

const formatDate = (iso) =>
  new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ExperimentList({ items, loading, error, currentId, onOpen, onDelete, onClose }) {
  const [confirmId, setConfirmId] = useState(null);

  return (
    <div className="mx-auto mt-2 w-full max-w-4xl px-4">
      <div className="rounded-lg bg-slate-800 p-4 text-white">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold">내 실험</p>
          <button onClick={onClose} className="text-sm text-slate-300 hover:text-white">
            닫기
          </button>
        </div>
        {loading && <p className="text-sm text-slate-300">불러오는 중…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-slate-300">저장한 실험이 없어요. 2단계나 결과 화면에서 저장해 보세요.</p>
        )}
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-700 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {item.title || "(이름 없음)"}
                  {item.id === currentId && <span className="ml-2 text-xs font-normal text-emerald-300">작업 중</span>}
                </p>
                <p className="text-xs text-slate-300">{formatDate(item.updated_at)}</p>
              </div>
              <button
                onClick={() => onOpen(item.id)}
                className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200"
              >
                불러오기
              </button>
              {confirmId === item.id ? (
                <button
                  onClick={() => {
                    setConfirmId(null);
                    onDelete(item.id);
                  }}
                  className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
                >
                  정말 삭제
                </button>
              ) : (
                <button
                  onClick={() => setConfirmId(item.id)}
                  className="rounded-md border border-white/40 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
