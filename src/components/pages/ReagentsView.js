"use client";

import { useEffect, useState } from "react";
import { friendlyDbError, listUserReagents } from "../../lib/db.mjs";
import { getSupabase } from "../../lib/supabase";
import { useExperiment } from "../ExperimentProvider";
import MwOverride from "../MwOverride";
import RequireLogin from "../RequireLogin";
import { Alert, Badge, Card, PageHeader } from "../ui";

export default function ReagentsView() {
  const { auth, setMw } = useExperiment();
  const userId = auth.user?.id;
  const [state, setState] = useState({ rows: [], loading: true, error: "" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    listUserReagents(getSupabase())
      .then((rows) => {
        if (!active) return;
        rows.sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
        setState({ rows, loading: false, error: "" });
      })
      .catch((err) => {
        if (active) setState({ rows: [], loading: false, error: friendlyDbError(err) });
      });
    return () => {
      active = false;
    };
  }, [userId, reloadTick]);

  async function onApply(row, mw) {
    await setMw(row.name, mw);
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="내 시약"
        description="계산할 때 조회하거나 직접 입력한 분자량이 이곳에 쌓여요. 다음 분석부터는 다시 조회하지 않고 이 값을 써요."
      />
      <RequireLogin what="로그인하면 조회했던 시약의 분자량을 기억해 두었다가 다음에도 써요.">
        <Card>
          {state.error && <Alert kind="error">{state.error}</Alert>}
          {state.loading && state.rows.length === 0 && (
            <p role="status" className="py-6 text-center text-sm text-ink-muted">
              불러오는 중…
            </p>
          )}
          {!state.loading && !state.error && state.rows.length === 0 && (
            <p role="status" className="py-6 text-center text-sm text-ink-muted">
              아직 저장된 시약이 없어요. 로그인한 상태로 계산하면 조회한 분자량이 자동으로 쌓여요.
            </p>
          )}
          {state.rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">내 시약 목록: 이름, 화학식, 분자량, 출처</caption>
                <thead className="bg-surface-2 text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      시약
                    </th>
                    <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                      화학식
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      분자량
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => (
                    <tr key={row.key} className="border-t border-line align-top">
                      <th scope="row" className="px-4 py-3 font-medium text-ink">
                        {row.name}
                        <span className="mt-0.5 block text-sm font-normal text-ink-muted sm:hidden">{row.formula}</span>
                      </th>
                      <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{row.formula || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold tabular-nums text-ink">{Number(row.mw)} g/mol</span>
                        <span className="ml-2">
                          <Badge tone={row.source === "user" ? "accent" : "neutral"}>{row.source === "user" ? "직접 입력" : "PubChem"}</Badge>
                        </span>
                        <MwOverride name={row.name} editing loggedIn onApply={(mw) => onApply(row, mw)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </RequireLogin>
    </div>
  );
}
