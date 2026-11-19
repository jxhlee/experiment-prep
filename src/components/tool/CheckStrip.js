"use client";

import { useState } from "react";
import Link from "next/link";
import { normalizeName } from "../../lib/chem.mjs";
import { summarizeInventory } from "../../lib/inventory.mjs";
import { summarizeExistence } from "../../lib/reagent-status.mjs";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Button, Disclosure } from "../ui";

function Item({ label, children, sub }) {
  return (
    // 좁은 화면에서는 "이름 — 값"을 한 줄로 두어 높이를 줄이고, 넓은 화면에서는 이름 아래에 값을 둔다
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 sm:block">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-[15px] font-semibold text-ink sm:mt-0.5">{children}</dd>
      {sub && <dd className="col-start-2 text-sm text-ink-muted sm:mt-0.5">{sub}</dd>}
    </div>
  );
}

const Problem = ({ icon = "alert", tone = "text-danger", children }) => (
  <span className={`inline-flex items-center gap-1 ${tone}`}>
    <Icon name={icon} size={16} />
    {children}
  </span>
);

/**
 * 확인·수정 화면 위쪽의 점검 줄. 세 가지를 한 줄로 요약한다: 원문과 맞는지, 실제 있는 시약인지, 우리 학교에 있는지.
 * 자세한 것은 각 줄에서 문제가 있는 것만 보여 준다.
 */
export default function CheckStrip({ names, counts, hasText }) {
  const { reagentInfo, checkReagents, inventory, inventoryIndex } = useExperiment();
  const [copied, setCopied] = useState("");

  const keyOf = (n) => normalizeName(n).key;
  const existence = summarizeExistence(names, reagentInfo, keyOf);
  const checking = names.some((n) => reagentInfo[keyOf(n)]?.state === "checking");
  const stock = summarizeInventory(names, inventoryIndex);

  async function copyList() {
    try {
      await navigator.clipboard.writeText(["구매 요망 시약", ...stock.missing.map((n) => `- ${n}`)].join("\n"));
      setCopied("복사했어요.");
    } catch {
      setCopied("복사하지 못했어요. 직접 선택해서 복사해 주세요.");
    }
  }

  return (
    <section aria-label="점검 요약" className="border-b border-line p-5">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <Item label="원문 대조" sub={hasText ? `논문 명시 ${counts.paper}개` : undefined}>
          {!hasText ? (
            <span className="font-normal text-ink-muted">직접 입력</span>
          ) : counts.ai > 0 ? (
            <Problem icon="sparkles" tone="text-accent">
              AI 해석 {counts.ai}개
            </Problem>
          ) : (
            "모두 원문과 일치"
          )}
        </Item>

        <Item
          label="시약 확인"
          sub={
            existence.notfound > 0 || existence.pending > 0 ? (
              <Button variant="link" size="sm" className="-ml-1" aria-disabled={checking} aria-busy={checking} onClick={() => !checking && checkReagents()}>
                {checking ? "확인하는 중…" : "PubChem에서 확인하기"}
              </Button>
            ) : undefined
          }
        >
          {existence.notfound > 0 ? (
            <Problem>못 찾음 {existence.notfound}개</Problem>
          ) : existence.pending > 0 ? (
            <span className="font-normal text-ink-muted">미확인 {existence.pending}개</span>
          ) : (
            "모두 확인됨"
          )}
        </Item>

        <Item
          label="보유 시약"
          sub={
            !inventory.loaded ? undefined : stock.none ? (
              <Link href="/inventory" className="inline-flex min-h-9 items-center text-accent underline underline-offset-4 hover:no-underline">
                보유 시약 등록하기
              </Link>
            ) : (
              `보유 ${stock.have}개${stock.variant > 0 ? ` · 다른 형태 ${stock.variant}개` : ""}`
            )
          }
        >
          {!inventory.loaded ? (
            <span className="font-normal text-ink-muted">불러오는 중…</span>
          ) : stock.none ? (
            <span className="font-normal text-ink-muted">목록 없음</span>
          ) : stock.missing.length > 0 ? (
            <Problem>구매 요망 {stock.missing.length}개</Problem>
          ) : (
            "모두 보유"
          )}
        </Item>
      </dl>

      {inventory.loaded && stock.missing.length > 0 && (
        <Disclosure summary={`구매가 필요한 시약 ${stock.missing.length}개 보기`} className="mt-3">
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-ink marker:text-line-strong">
            {stock.missing.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" className="mt-2" onClick={copyList}>
            <Icon name="clipboard" size={16} />
            구매 목록 복사
          </Button>
          {copied && (
            <span role="status" className="ml-2 text-ink-muted">
              {copied}
            </span>
          )}
        </Disclosure>
      )}
    </section>
  );
}
