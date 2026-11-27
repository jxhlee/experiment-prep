import { useId } from "react";

export const BRAND_NAME = "Experiment Prep";

/**
 * Experiment Prep 로고 마크: 눈금이 있는 삼각플라스크 안에 시약이 채워진 모양.
 * 바탕은 앱의 주 색(--brand), 플라스크 선은 그 위의 글자색(--brand-ink), 시약은 포인트 색(--accent)이라
 * 밝은 화면에서는 검은 바탕, 어두운 화면에서는 흰 바탕으로 저절로 바뀐다. 장식이라 화면 낭독기에서는 숨긴다.
 * (파비콘 src/app/icon.svg 도 같은 그림이다. 모양을 바꾸면 둘을 함께 고친다.)
 */
export function LogoMark({ size = 32, className = "" }) {
  const clip = useId();
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <defs>
        <clipPath id={clip}>
          <path d="M13.5 7V13L8.2 22.6A2.2 2.2 0 0 0 10.1 25.8H21.9A2.2 2.2 0 0 0 23.8 22.6L18.5 13V7Z" />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <g clipPath={`url(#${clip})`}>
        <rect x="6" y="18.6" width="20" height="9" fill="var(--accent)" />
      </g>
      <path
        d="M11.5 7H20.5M13.5 7V13L8.2 22.6A2.2 2.2 0 0 0 10.1 25.8H21.9A2.2 2.2 0 0 0 23.8 22.6L18.5 13V7"
        fill="none"
        stroke="var(--brand-ink)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14.6" cy="22.4" r="0.95" fill="var(--brand-ink)" opacity="0.9" />
      <circle cx="18.2" cy="21.2" r="0.7" fill="var(--brand-ink)" opacity="0.9" />
    </svg>
  );
}

/** 마크 + 이름. 이름은 글자로 써서 화면 낭독기가 읽고, 마크는 장식이다. */
export function Logo({ size = 32, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold leading-none tracking-tight text-ink">
        Experiment <span className="font-normal text-ink-muted">Prep</span>
      </span>
    </span>
  );
}
