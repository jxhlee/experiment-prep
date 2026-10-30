export default function SaveBar({ save }) {
  const { user, title, setTitle, currentId, status, onSave, onLogin } = save;
  const saving = status?.kind === "saving";

  return (
    <div className="rounded-lg bg-slate-800 p-3 text-white">
      <p className="mb-2 text-center text-xs">실험 저장</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="실험 이름 (비우면 날짜)"
        className="h-9 w-full rounded-md bg-slate-700 px-2 text-sm text-white placeholder-slate-300 outline-none focus:bg-slate-600"
      />
      {user ? (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onSave(false)}
            disabled={saving}
            className="flex-1 rounded-md bg-white py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-40"
          >
            {currentId ? "덮어쓰기" : "저장"}
          </button>
          {currentId && (
            <button
              onClick={() => onSave(true)}
              disabled={saving}
              className="flex-1 rounded-md border border-white/50 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-40"
            >
              새로 저장
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={onLogin}
          className="mt-2 w-full rounded-md bg-white py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
        >
          로그인하고 저장
        </button>
      )}
      {status && (
        <p className={`mt-2 text-xs ${status.kind === "error" ? "text-red-300" : "text-emerald-300"}`}>
          {status.kind === "saving" ? "저장 중…" : status.message}
        </p>
      )}
    </div>
  );
}
