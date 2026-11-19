"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExperiment } from "./ExperimentProvider";
import { Icon } from "./icons";
import { Alert, Button, Field, buttonClass, inputClass } from "./ui";

/**
 * 페이지 위쪽의 「저장」 버튼. 누르면 이름을 묻는 작은 창(dialog)이 뜬다.
 * 화면 한쪽을 차지하던 저장 카드를 없애려고 창으로 옮겼다. dialog 는 Esc 로 닫히고 포커스를 가둔다.
 */
export default function SaveControl() {
  const pathname = usePathname();
  const dialogRef = useRef(null);
  const { auth, saveTitle, setSaveTitle, currentId, saveStatus, save } = useExperiment();
  if (!auth.configured) return null;

  if (!auth.user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
        <Icon name="logIn" size={16} />
        로그인하고 저장
      </Link>
    );
  }

  const saving = saveStatus?.kind === "saving";

  async function run(asNew) {
    if (saving) return;
    if (await save(asNew)) dialogRef.current?.close();
  }

  return (
    <div className="flex items-center gap-3">
      {saveStatus?.kind === "saved" && (
        <span role="status" className="text-sm text-ink-muted">
          {saveStatus.message}
        </span>
      )}
      <Button variant="secondary" size="sm" onClick={() => dialogRef.current?.showModal()}>
        <Icon name="save" size={16} />
        저장
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="save-dialog-title"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(false);
          }}
        >
          <h2 id="save-dialog-title" className="text-base font-semibold">
            실험 저장
          </h2>
          <Field id="save-title" label="실험 이름" hint="비워 두면 오늘 날짜로 저장해요." className="mt-4">
            <input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} maxLength={120} className={inputClass} />
          </Field>
          {saveStatus?.kind === "error" && (
            <Alert kind="error" className="mt-3">
              {saveStatus.message}
            </Alert>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              닫기
            </Button>
            {currentId && (
              <Button variant="secondary" aria-disabled={saving} onClick={() => run(true)}>
                새로 저장
              </Button>
            )}
            <Button type="submit" aria-disabled={saving}>
              {saving ? "저장하는 중…" : currentId ? "덮어쓰기" : "저장하기"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
