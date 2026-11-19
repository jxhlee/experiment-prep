"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseInventoryText } from "../../lib/inventory.mjs";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Alert, Button, Card, CardTitle, EmptyState, Field, IconButton, PageHeader, buttonClass, inputClass } from "../ui";

const SHOWN = 300;

export default function InventoryView() {
  const {
    auth, inventory, localInventoryCount,
    addInventoryItems, removeInventoryItem, clearInventoryItems, importLocalInventory,
  } = useExperiment();
  const [text, setText] = useState("");
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const loggedIn = Boolean(auth.configured && auth.user);
  const q = filter.trim().toLowerCase();
  const shown = useMemo(() => (q ? inventory.items.filter((i) => i.name.toLowerCase().includes(q)) : inventory.items), [inventory.items, q]);

  async function run(task) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const report = (r, skipped = 0) => {
    if (r.error) return setMessage({ kind: "error", text: r.error });
    const parts = [`${r.added}개를 추가했어요`];
    if (r.existed > 0) parts.push(`이미 있는 ${r.existed}개는 건너뛰었어요`);
    if (skipped > 0) parts.push(`읽지 못한 줄 ${skipped}개`);
    setMessage({ kind: r.added > 0 ? "success" : "info", text: `${parts.join(" · ")}.` });
  };

  const add = (event) => {
    event.preventDefault();
    return run(async () => {
      const parsed = parseInventoryText(text);
      if (parsed.items.length === 0) return setMessage({ kind: "error", text: "추가할 시약 이름을 찾지 못했어요. 한 줄에 하나씩 적어 주세요." });
      const r = await addInventoryItems(parsed.items);
      report({ ...r, existed: (r.existed ?? 0) + parsed.duplicates }, parsed.skipped);
      if (!r.error) setText("");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="보유 시약"
        description="우리 학교에 있는 시약을 등록해 두면, 확인 단계에서 없는 시약을 「구매 요망」으로 알려 줘요."
      />

      <p className="text-sm text-ink-muted">
        {loggedIn ? (
          "내 계정에 저장돼요. 다른 기기에서도 같은 목록을 써요."
        ) : (
          <>
            이 브라우저에만 저장돼요.
            {auth.configured && (
              <>
                {" "}
                <Link href="/login?next=%2Finventory" className="text-accent underline underline-offset-4 hover:no-underline">
                  로그인하면 계정에 저장
                </Link>
                돼요.
              </>
            )}
          </>
        )}
      </p>

      {loggedIn && localInventoryCount > 0 && (
        <Alert kind="warn">
          <p>로그인하기 전에 이 브라우저에 저장한 목록이 {localInventoryCount}개 있어요.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            aria-disabled={busy}
            onClick={() =>
              run(async () => {
                report(await importLocalInventory());
              })
            }
          >
            계정으로 옮기기
          </Button>
        </Alert>
      )}
      {inventory.error && <Alert kind="error">{inventory.error}</Alert>}

      <form onSubmit={add}>
        <Field
          id="inventory-text"
          label="시약 이름"
          hint="한 줄에 하나씩 적거나, 엑셀·문서에서 이름 열을 복사해 붙여넣으세요. 순도(99%)와 등급은 알아서 빼요."
        >
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"염화나트륨\nEthanol (99.9%)\nTris"}
            className={`${inputClass} resize-y py-2.5 leading-relaxed`}
          />
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" aria-disabled={busy}>
            <Icon name="plus" size={16} />
            추가
          </Button>
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-danger" : "text-ink-muted"}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>

      <Card as="section" aria-labelledby="list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="list-title">
            등록한 시약 <span className="font-normal text-ink-muted">({inventory.items.length.toLocaleString("ko-KR")}개)</span>
          </CardTitle>
          {inventory.items.length > 0 &&
            (confirmClear ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink">정말 모두 지울까요?</span>
                <Button
                  variant="danger"
                  size="sm"
                  autoFocus
                  aria-disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await clearInventoryItems();
                      setConfirmClear(false);
                      setMessage(r.error ? { kind: "error", text: r.error } : { kind: "success", text: "보유 시약을 모두 지웠어요." });
                    })
                  }
                >
                  모두 지우기
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                  취소
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
                모두 지우기
              </Button>
            ))}
        </div>

        {!inventory.loaded ? (
          <p role="status" className="py-6 text-center text-sm text-ink-muted">
            불러오는 중…
          </p>
        ) : inventory.items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="아직 등록한 시약이 없어요"
            action={
              <Link href="/new" className={buttonClass({ variant: "secondary" })}>
                새 실험 시작하기
              </Link>
            }
          >
            위에 시약 이름을 적어 추가해 보세요.
          </EmptyState>
        ) : (
          <>
            {inventory.items.length > 8 && (
              <div className="mt-3 max-w-sm">
                <Field id="inventory-filter" label="목록에서 찾기">
                  <input value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" className={inputClass} />
                </Field>
              </div>
            )}
            <p role="status" className="mt-2 text-sm text-ink-muted">
              {q ? `${shown.length.toLocaleString("ko-KR")}개를 찾았어요.` : ""}
            </p>
            <ul className="mt-1 divide-y divide-line">
              {shown.slice(0, SHOWN).map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-1">
                  <span className="min-w-0 break-words text-sm text-ink">{item.name}</span>
                  <IconButton
                    icon="trash"
                    label={`${item.name} 지우기`}
                    onClick={() => run(async () => void (await removeInventoryItem(item.key)))}
                  />
                </li>
              ))}
            </ul>
            {shown.length > SHOWN && <p className="mt-2 text-sm text-ink-muted">앞의 {SHOWN}개만 보여요. 위의 검색으로 좁혀 보세요.</p>}
          </>
        )}
      </Card>
    </div>
  );
}
