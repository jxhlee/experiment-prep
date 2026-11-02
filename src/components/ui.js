import { cloneElement } from "react";
import { Icon } from "./icons";

// 화면 전체에서 같이 쓰는 작은 부품들. 색은 globals.css 의 토큰만 쓰고,
// 터치 화면(pointer-coarse)에서는 누르는 칸을 44px 이상으로 키운다.

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-center text-sm font-medium no-underline transition-colors select-none " +
  "pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const BUTTON_SIZES = {
  sm: "min-h-9 px-3",
  md: "min-h-10 px-4",
  lg: "min-h-11 px-5 text-[15px]",
};

const BUTTON_VARIANTS = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "border border-danger text-danger hover:bg-danger-soft",
  link: "px-1 text-accent underline underline-offset-4 hover:no-underline",
};

/** 버튼과 링크가 같은 모양을 쓰도록 클래스만 따로 내보낸다 */
export function buttonClass({ variant = "primary", size = "md", className = "" } = {}) {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`.trim();
}

export function Button({ variant, size, className, type = "button", ...props }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

export const inputClass =
  "block min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted pointer-coarse:min-h-11";

const ALERTS = {
  error: { box: "border-danger/40 bg-danger-soft text-danger-ink", icon: "alert", role: "alert", label: "오류" },
  warn: { box: "border-warn-ink/30 bg-warn-soft text-warn-ink", icon: "alert", role: "status", label: "주의" },
  success: { box: "border-ok-ink/30 bg-ok-soft text-ok-ink", icon: "checkCircle", role: "status", label: "완료" },
  info: { box: "border-line bg-surface-2 text-ink", icon: "info", role: "status", label: "안내" },
};

/** 색에만 기대지 않도록 아이콘과 종류 이름을 함께 보여 준다 */
export function Alert({ kind = "info", children, className = "", ...props }) {
  const a = ALERTS[kind];
  return (
    <div role={a.role} className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed ${a.box} ${className}`} {...props}>
      <Icon name={a.icon} size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{a.label}: </span>
        {children}
      </div>
    </div>
  );
}

/** 라벨·도움말·오류를 입력칸과 연결한다. children 은 입력 요소 하나. */
export function Field({ id, label, hint, error, children, className = "" }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <div className="mt-1.5">
        {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

/** 라디오 버튼으로 만든 선택 막대. 화살표 키로 옮길 수 있고, 고른 항목은 ✓ 와 진한 글씨로도 표시한다. */
export function Segmented({ legend, name, value, onChange, options, hideLegend = false, className = "" }) {
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className={hideLegend ? "sr-only" : "mb-1.5 text-sm font-medium text-ink"}>{legend}</legend>
      <div className="flex w-full gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              className={`relative flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-center text-sm leading-snug pointer-coarse:min-h-10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
                selected ? "bg-surface font-semibold text-ink shadow-sm ring-1 ring-line" : "text-ink-muted hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {selected && <Icon name="check" size={14} />}
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Card({ as: Tag = "div", className = "", ...props }) {
  return <Tag className={`rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-5 ${className}`} {...props} />;
}

/** 카드 안의 소제목 */
export function CardTitle({ icon, children, id, className = "" }) {
  return (
    <h2 id={id} className={`flex items-center gap-2 text-[15px] font-semibold text-ink ${className}`}>
      {icon && <Icon name={icon} size={16} className="text-ink-muted" />}
      {children}
    </h2>
  );
}

/** 페이지마다 한 번, 맨 위에 둔다. 페이지를 옮기면 이 제목으로 포커스가 온다. */
export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 id="page-title" tabIndex={-1} className="text-xl font-semibold tracking-tight text-ink focus:outline-none sm:text-2xl">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 아이콘을 담는 작은 둥근 네모. tone="accent" 는 포인트 색이 꼭 필요할 때만. */
export function IconChip({ name, tone = "neutral", className = "" }) {
  const tones = { neutral: "bg-surface-2 text-ink", accent: "bg-accent-soft text-accent" };
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]} ${className}`}>
      <Icon name={name} size={18} />
    </span>
  );
}

export function Stat({ icon, label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <IconChip name={icon} tone={tone} />
        <p className="text-sm text-ink-muted">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

const BADGES = {
  neutral: "bg-surface-2 text-ink",
  accent: "bg-accent-soft text-accent-soft-ink",
  warn: "bg-warn-soft text-warn-ink",
  ok: "bg-ok-soft text-ok-ink",
  danger: "bg-danger-soft text-danger-ink",
};

export function Badge({ tone = "neutral", icon, children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium ${BADGES[tone]} ${className}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function EmptyState({ icon = "inbox", title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <IconChip name={icon} className="h-11 w-11" />
      <p className="mt-1 text-[15px] font-semibold text-ink">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** 탭: 화살표 키·Home·End 로 옮긴다. 패널은 TabPanel 로 만들고 숨기기만 해서 입력한 내용이 유지된다. */
export function Tabs({ label, idPrefix, tabs, value, onChange }) {
  const onKeyDown = (event, index) => {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`${idPrefix}-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-5 border-b border-line">
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-0.5 text-sm font-medium pointer-coarse:min-h-11 ${
              selected ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.icon && <Icon name={tab.icon} size={16} />}
            {tab.label}
            {tab.count != null && (
              <span className="rounded-full bg-surface-2 px-1.5 text-sm tabular-nums text-ink-muted">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, id, value, children, className = "" }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={value !== id} className={className}>
      {children}
    </div>
  );
}
