export default function AccountBar({ ready, user, listOpen, onLogin, onToggleList, onSignOut }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-end gap-2 px-4 pb-1 text-sm">
      {!ready ? (
        <span className="text-slate-500">확인 중…</span>
      ) : user ? (
        <>
          <span className="max-w-[13rem] truncate text-slate-600" title={user.email}>
            {user.email}
          </span>
          <button
            onClick={onToggleList}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              listOpen ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            내 실험
          </button>
          <button onClick={onSignOut} className="rounded-full px-3 py-1 text-slate-600 hover:bg-slate-100">
            로그아웃
          </button>
        </>
      ) : (
        <button
          onClick={onLogin}
          className="rounded-full bg-slate-800 px-4 py-1.5 font-medium text-white transition-colors hover:bg-slate-700"
        >
          로그인 / 회원가입
        </button>
      )}
    </div>
  );
}
