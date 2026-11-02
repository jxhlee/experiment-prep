"use client";

import { useRef, useState } from "react";
import { authErrorMessage } from "../lib/db.mjs";
import { Alert, Button, Field, Segmented, inputClass } from "./ui";

const MIN_PASSWORD = 8;

// onDone 은 로그인(또는 메일 인증이 필요 없는 가입)이 끝났을 때 불린다
export default function AuthPanel({ onSignIn, onSignUp, onDone }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [passwordError, setPasswordError] = useState("");
  const passwordRef = useRef(null);

  const isSignUp = mode === "signup";

  function changeMode(next) {
    setMode(next);
    setMessage(null);
    setPasswordError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (isSignUp && password.length < MIN_PASSWORD) {
      setPasswordError(`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.`);
      passwordRef.current?.focus();
      return;
    }
    setPasswordError("");
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
      onDone();
    } catch (err) {
      setMessage({ kind: "error", text: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label={isSignUp ? "회원가입" : "로그인"}>
      <Segmented
        legend="어떤 걸 하시겠어요?"
        name="auth-mode"
        value={mode}
        onChange={changeMode}
        options={[
          { value: "signin", label: "로그인" },
          { value: "signup", label: "회원가입" },
        ]}
      />

      <Field id="auth-email" label="이메일">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        id="auth-password"
        label="비밀번호"
        hint={isSignUp ? `${MIN_PASSWORD}자 이상으로 정해 주세요.` : undefined}
        error={passwordError}
      >
        <input
          ref={passwordRef}
          type="password"
          required
          autoComplete={isSignUp ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>

      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      <Button type="submit" size="lg" aria-disabled={busy} className="w-full">
        {busy ? "처리 중…" : isSignUp ? "가입하기" : "로그인"}
      </Button>
    </form>
  );
}
