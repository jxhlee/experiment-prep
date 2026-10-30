"use client";

import { useState } from "react";
import { authErrorMessage } from "../lib/db.mjs";

const MIN_PASSWORD = 8;

// closeLabel 이 null 이면 닫기 버튼을 숨긴다 (별도 로그인 페이지에서 쓸 때)
export default function AuthPanel({ onSignIn, onSignUp, onClose, closeLabel = "닫기" }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const isSignUp = mode === "signup";

  async function submit(event) {
    event.preventDefault();
    if (isSignUp && password.length < MIN_PASSWORD) {
      setMessage({ kind: "error", text: `비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (isSignUp) {
        const { needsConfirmation } = await onSignUp(email.trim(), password);
        if (needsConfirmation) {
          setMessage({ kind: "info", text: "가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요." });
          setMode("signin");
          return;
        }
      } else {
        await onSignIn(email.trim(), password);
      }
      onClose();
    } catch (err) {
      setMessage({ kind: "error", text: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-2 w-full max-w-md px-4">
      <form onSubmit={submit} className="rounded-lg bg-slate-800 p-4 text-white">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold">{isSignUp ? "회원가입" : "로그인"}</p>
          {closeLabel && (
            <button type="button" onClick={onClose} className="text-sm text-slate-300 hover:text-white">
              {closeLabel}
            </button>
          )}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-300">
          실험을 저장하고 다시 불러올 때만 필요해요. 로그인하지 않아도 분석과 계산은 모두 쓸 수 있어요.
        </p>
        <label className="block text-xs text-slate-300">
          이메일
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-9 w-full rounded-md bg-slate-700 px-3 text-sm text-white outline-none focus:bg-slate-600"
          />
        </label>
        <label className="mt-2 block text-xs text-slate-300">
          비밀번호{isSignUp && ` (${MIN_PASSWORD}자 이상)`}
          <input
            type="password"
            required
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-9 w-full rounded-md bg-slate-700 px-3 text-sm text-white outline-none focus:bg-slate-600"
          />
        </label>
        {message && (
          <p className={`mt-3 text-sm ${message.kind === "error" ? "text-red-300" : "text-emerald-300"}`}>{message.text}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-md bg-white py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-40"
        >
          {busy ? "처리 중…" : isSignUp ? "가입하기" : "로그인"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(isSignUp ? "signin" : "signup");
            setMessage(null);
          }}
          className="mt-2 w-full text-center text-xs text-slate-300 underline hover:text-white"
        >
          {isSignUp ? "이미 계정이 있어요 → 로그인" : "처음이에요 → 회원가입"}
        </button>
      </form>
    </div>
  );
}
