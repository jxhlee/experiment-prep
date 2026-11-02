"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../icons";

const GROUPS = [
  {
    label: "작업",
    items: [
      { href: "/", label: "홈", icon: "home", exact: true },
      { href: "/new", label: "새 실험", icon: "flask" },
    ],
  },
  {
    label: "보관함",
    items: [
      { href: "/experiments", label: "내 실험", icon: "folder" },
      { href: "/reagents", label: "내 시약", icon: "beaker" },
    ],
  },
  {
    label: "지원",
    items: [{ href: "/help", label: "도움말", icon: "help" }],
  },
];

const isActive = (pathname, item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

export function BrandLink({ className = "" }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 rounded-lg text-ink no-underline ${className}`}>
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-ink">
        <Icon name="flask" size={18} />
      </span>
      <span className="text-[15px] font-semibold">
        실험 프렙 <span className="font-normal text-ink-muted">(가제)</span>
      </span>
    </Link>
  );
}

/** 넓은 화면의 왼쪽 메뉴 */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start">
      <div className="flex h-14 items-center px-4">
        <BrandLink />
      </div>
      <nav aria-label="주 메뉴" className="flex-1 overflow-y-auto px-3 py-2">
        {GROUPS.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? "" : "mt-5"}>
            <p id={`nav-group-${gi}`} className="px-3 pb-1 text-sm text-ink-muted">
              {group.label}
            </p>
            <ul aria-labelledby={`nav-group-${gi}`} className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm no-underline ${
                        active
                          ? "bg-surface-2 font-semibold text-ink before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                          : "font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      <Icon name={item.icon} size={18} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-muted">
        <p className="flex items-center gap-1.5 font-medium text-ink">
          <Icon name="info" size={16} />
          꼭 확인하세요
        </p>
        <p className="mt-1 leading-relaxed">AI가 읽은 결과는 틀릴 수 있어요. 실험 전에 논문 원문과 대조해 주세요.</p>
      </div>
    </aside>
  );
}

/** 좁은 화면의 아래쪽 메뉴 */
export function MobileNav() {
  const pathname = usePathname();
  const items = GROUPS.flatMap((g) => g.items);
  return (
    <nav
      aria-label="하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm no-underline ${
                  active ? "font-semibold text-ink before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-accent" : "text-ink-muted"
                }`}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
