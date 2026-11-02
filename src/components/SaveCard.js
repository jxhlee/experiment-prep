"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useExperiment } from "./ExperimentProvider";
import { Icon } from "./icons";
import { Alert, Button, Card, CardTitle, Field, buttonClass, inputClass } from "./ui";

export default function SaveCard() {
  const pathname = usePathname();
  const { auth, saveTitle, setSaveTitle, currentId, saveStatus, save } = useExperiment();
  if (!auth.configured) return null;
  const saving = saveStatus?.kind === "saving";

  return (
    <Card as="section" aria-labelledby="save-title-heading">
      <CardTitle id="save-title-heading" icon="save">
        실험 저장
      </CardTitle>

      {auth.user ? (
        <>
          <Field id="save-title" label="실험 이름" hint="비워 두면 오늘 날짜로 저장해요." className="mt-3">
            <input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} maxLength={120} className={inputClass} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button aria-disabled={saving} onClick={() => !saving && save(false)} className="flex-1">
              <Icon name="save" size={16} />
              {currentId ? "덮어쓰기" : "저장하기"}
            </Button>
            {currentId && (
              <Button variant="secondary" aria-disabled={saving} onClick={() => !saving && save(true)} className="flex-1">
                새로 저장
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">로그인하면 저장해 두고 나중에 다시 불러올 수 있어요. 지금까지 한 작업은 그대로 이어져요.</p>
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={`${buttonClass({ variant: "secondary" })} mt-3 w-full`}>
            <Icon name="logIn" size={16} />
            로그인하고 저장하기
          </Link>
        </div>
      )}

      {saveStatus && (
        <div className="mt-3">
          {saveStatus.kind === "error" ? (
            <Alert kind="error">{saveStatus.message}</Alert>
          ) : (
            <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-ok-ink">
              <Icon name="checkCircle" size={16} />
              {saveStatus.kind === "saving" ? "저장하는 중…" : saveStatus.message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
