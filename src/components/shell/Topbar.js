"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../icons";
import { buttonClass } from "../ui";
import { useExperiment } from "../ExperimentProvider";
import { BrandLink } from "./Navigation";

const CRUMBS = {
  "/": ["홈"],
  "/new": ["새 실험", "입력"],
  "/new/review": ["새 실험", "추출 결과 확인"],
  "/new/result": ["새 실험", "결과"],
  "/experiments": ["내 실험"],
  "/reagents": ["내 시약"],
  "/help": ["도움말"],
};

function AccountMenu() {
  const { auth, signOut } = useExperiment();
  const pathname = usePathname();
  const ref = useRef(null);

  // 바깥을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    const onPointer = (e) => {
      if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false;
    };
    const onKey = (e) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!auth.configured) return null;
  if (!auth.ready) return <span className="text-sm text-ink-muted">계정 확인 중…</span>;
  if (!auth.user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
        <Icon name="logIn" size={16} />
        로그인
      </Link>
    );
  }

  const email = auth.user.email ?? "";
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label="계정 메뉴"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink marker:hidden pointer-coarse:h-11 pointer-coarse:w-11 [&::-webkit-details-marker]:hidden"
      >
        {email.slice(0, 1).toUpperCase() || <Icon name="user" size={16} />}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg">
        <p className="px-3 py-2 text-sm">
          <span className="block text-ink-muted">로그인한 계정</span>
          <span className="block truncate font-medium text-ink" title={email}>
            {email}
          </span>
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink hover:bg-surface-2 pointer-coarse:min-h-11"
        >
          <Icon name="logOut" size={16} />
          로그아웃
        </button>
      </div>
    </details>
  );
}

export default function Topbar() {
  const pathname = usePathname();
  const crumbs = CRUMBS[pathname] ?? [];

  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
      <BrandLink className="lg:hidden" />
      <nav aria-label="현재 위치" className="hidden lg:block">
        <ol className="flex items-center gap-1.5 text-sm text-ink-muted">
          {crumbs.map((crumb, i) => (
            <li key={crumb} className="flex items-center gap-1.5">
              {i > 0 && <Icon name="chevronRight" size={14} />}
              <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "font-medium text-ink" : undefined}>
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block">
          <Link href="/new" className={buttonClass({ size: "sm" })}>
            <Icon name="plus" size={16} />새 실험
          </Link>
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}
