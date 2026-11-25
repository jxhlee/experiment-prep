"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { namesNeedingLookup } from "../../lib/chem.mjs";
import { KOSHA_MSDS_URL } from "../../lib/reagent-status.mjs";
import { buildReport } from "../../lib/report.mjs";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Button, Card, EmptyState, PageHeader, buttonClass } from "../ui";

// 문서(.paper) 안의 색은 항상 밝은 토큰이다(globals.css). 색만으로 뜻을 나누지 않고 글자로도 적는다.
const TONE_TEXT = { danger: "text-danger", warn: "text-warn-ink", accent: "text-accent" };
const TONE_ICON = { danger: "alert", warn: "alert", accent: "sparkles" };

const TH = "py-1.5 pr-3 text-left text-xs font-medium text-ink-muted";
const ROW = "break-inside-avoid border-b border-line align-top";

function Section({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="mt-7">
      <h2 id={id} className="border-b border-ink pb-1.5 text-[15px] font-semibold text-ink print:break-after-avoid">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Mark({ tone, children }) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${TONE_TEXT[tone] ?? "text-ink"}`}>
      <Icon name={TONE_ICON[tone] ?? "info"} size={13} />
      {children}
    </span>
  );
}

const mwText = (mw) => `${Number(mw.toPrecision(6))} g/mol`;

export default function ReportView() {
  const {
    reagents, timeline, mwMap, sigFigs, scaleFactor, saveTitle, methodText, reagentInfo, inventoryIndex,
    checkReagents, prepareResults, hasWork, hydrated,
  } = useExperiment();
  const [withSource, setWithSource] = useState(false);
  const [waited, setWaited] = useState(false);
  const date = useMemo(() => new Date(), []);

  // 주소로 바로 들어와도 문서가 채워지도록, 아직 조회하지 않은 분자량·유해성 정보를 여기서 가져온다
  const needsLookup = namesNeedingLookup(reagents, mwMap).length > 0;
  useEffect(() => {
    if (needsLookup) prepareResults();
  }, [needsLookup, prepareResults]);
  const namesSig = reagents.map((r) => r.name.trim()).filter(Boolean).join("|");
  useEffect(() => {
    if (hydrated) checkReagents({ ghs: true });
  }, [hydrated, namesSig, checkReagents]);

  // 정보를 가져오지 못해도 저장은 할 수 있게, 20초 뒤에는 기다리지 않는다
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 20000);
    return () => clearTimeout(t);
  }, []);

  const report = useMemo(
    () => buildReport({ title: saveTitle, date, reagents, timeline, mwMap, scaleFactor, sigFigs, methodText, reagentInfo, inventoryIndex }),
    [saveTitle, date, reagents, timeline, mwMap, scaleFactor, sigFigs, methodText, reagentInfo, inventoryIndex],
  );

  // 브라우저가 "PDF로 저장"할 때 파일 이름으로 쓰는 값이 문서 제목이다
  const fileTitle = report.fileTitle;
  useEffect(() => {
    const previous = document.title;
    document.title = fileTitle;
    return () => {
      document.title = previous;
    };
  }, [fileTitle]);

  if (hydrated && !hasWork) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="PDF로 저장" />
        <Card>
          <EmptyState
            icon="file"
            title="PDF로 저장할 내용이 없어요"
            action={
              <Link href="/new" className={buttonClass()}>
                새 실험 시작하기
              </Link>
            }
          >
            논문 Methods를 붙여넣거나 시약을 입력하면, 계량표와 타임라인을 한 장의 문서로 저장할 수 있어요.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const busy = !waited && (needsLookup || report.disposal.pending);
  const hasSource = Boolean(methodText.trim());
  // 희석 계획이 있는 실험에서만 그 구역이 끼어들므로, 구역 번호는 있는 것만 차례로 붙인다
  const nDilution = 2;
  const nSteps = report.dilutions.length > 0 ? 3 : 2;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 print:hidden">
        <Link href="/new/result" className={buttonClass({ variant: "ghost", size: "sm" })}>
          <Icon name="arrowLeft" size={16} />
          결과로 돌아가기
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {hasSource && (
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink pointer-coarse:min-h-11">
              <input type="checkbox" checked={withSource} onChange={(e) => setWithSource(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              원문 Methods도 붙이기
            </label>
          )}
          <Button aria-disabled={busy} onClick={() => !busy && window.print()}>
            <Icon name="printer" size={16} />
            PDF로 저장
          </Button>
        </div>
      </div>
      <p role="status" className="-mt-2 text-sm text-ink-muted print:hidden">
        {busy
          ? "분자량과 유해성 정보를 가져오는 중이에요. 잠시 뒤에 눌러 주세요."
          : "누르면 인쇄 창이 열려요. 대상(프린터)을 「PDF로 저장」으로 고르면 파일이 만들어져요. 글자는 그대로 선택·검색할 수 있어요."}
      </p>

      <article aria-labelledby="page-title" className="paper rounded-xl border border-line bg-surface p-6 text-[13px] leading-relaxed text-ink sm:p-10 print:rounded-none print:border-0 print:p-0">
        <header className="border-b-2 border-ink pb-4">
          <p className="text-xs text-ink-muted">실험 프렙 (가제)</p>
          <h1 id="page-title" tabIndex={-1} className="mt-1 text-2xl font-semibold leading-tight text-ink focus:outline-none focus-visible:outline-2">
            {report.title}
          </h1>
          <p className="mt-1.5 text-ink-muted">
            {report.dateText} 작성 · {report.summary.join(" · ")}
          </p>
        </header>

        {(report.checks.length > 0 || report.aiCount > 0) && (
          <section aria-labelledby="report-checks" className="mt-6 break-inside-avoid rounded-lg border border-line bg-surface-2 p-4">
            <h2 id="report-checks" className="text-[15px] font-semibold text-ink">
              먼저 확인할 것
            </h2>
            {report.checks.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {report.checks.map((c, i) => (
                  <li key={i}>
                    <Mark tone={c.tone}>{c.subject}</Mark>
                    <span className="text-ink"> — {c.text}</span>
                    {c.hint && <span className="text-ink-muted"> ({c.hint})</span>}
                  </li>
                ))}
              </ul>
            )}
            {report.aiCount > 0 && (
              <p className="mt-2 flex gap-1.5 text-ink-muted">
                <Icon name="sparkles" size={13} className="mt-1 text-accent" />
                <span>
                  AI가 읽었지만 원문에서 그대로 찾지 못한 값이 {report.aiCount}곳 있어요. 아래 표에 「AI 해석」으로 표시했어요. 원문과 대조하세요.
                </span>
              </p>
            )}
          </section>
        )}

        <Section id="report-weigh" title="1. 계량 준비표">
          {report.rows.length === 0 ? (
            <p className="mt-2 text-ink-muted">입력한 시약이 없어요.</p>
          ) : (
            <table className="mt-2 w-full border-collapse">
              <caption className="sr-only">시약별 계량값과 계산 근거</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={`${TH} w-[30%]`}>시약</th>
                  <th scope="col" className={`${TH} w-[22%]`}>계량값</th>
                  <th scope="col" className={TH}>계산 근거·참고</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id} className={ROW}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">{r.name}</th>
                    {r.ok ? (
                      <>
                        <td className="py-2 pr-3 text-[15px] font-semibold tabular-nums text-ink">{r.amount}</td>
                        <td className="py-2 text-ink-muted">
                          <span className="block">{r.basis}</span>
                          {r.mw != null && <span className="block">분자량 {mwText(r.mw)}{r.mwSource ? ` (${r.mwSource})` : ""}</span>}
                          {r.notes.map((n) => (
                            <span key={n} className="block">· {n}</span>
                          ))}
                          {r.issues.length > 0 && (
                            <span className="mt-0.5 flex flex-wrap gap-x-3">
                              {r.issues.map((i) => (
                                <Mark key={i.id} tone={i.tone}>{i.text}</Mark>
                              ))}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={2} className="py-2">
                        <Mark tone="danger">계산하지 못했어요</Mark>
                        <span className="block text-ink-muted">{r.reason}</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {report.merged.length > 0 && (
            <div className="mt-5 break-inside-avoid">
              <h3 className="text-sm font-semibold text-ink">같은 시약을 합친 총 필요량</h3>
              <table className="mt-1 w-full border-collapse">
                <caption className="sr-only">같은 시약을 합친 총 필요량</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={`${TH} w-[30%]`}>시약</th>
                    <th scope="col" className={TH}>총 필요량</th>
                  </tr>
                </thead>
                <tbody>
                  {report.merged.map((m) => (
                    <tr key={`${m.name}-${m.amount}`} className={ROW}>
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                        {m.name}
                        {m.rows > 1 && <span className="ml-1.5 font-normal text-ink-muted">({m.rows}곳 합산)</span>}
                      </th>
                      <td className="py-1.5 text-[15px] font-semibold tabular-nums text-ink">{m.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {report.dilutions.length > 0 && (
          <Section id="report-dilution" title={`${nDilution}. 희석 계획`}>
            <p className="mt-2 text-ink-muted">
              같은 시약을 농도만 다르게 여러 번 쓰므로, 가장 진한 용액(원액)을 한 번에 만들어 나눠 희석해요. 희석량은 C₁V₁ = C₂V₂로 구했어요.
            </p>
            {report.dilutions.map((g) => (
              <div key={g.key} className="mt-4 break-inside-avoid">
                <h3 className="text-sm font-semibold text-ink">
                  {g.name} <span className="font-normal text-ink-muted">· 농도 {g.concCount}가지</span>
                </h3>
                <p className="mt-1 text-ink">
                  <span className="font-medium">원액 준비</span> — {g.stock.concText} {g.name} <span className="font-semibold">{g.stock.prepText}</span>
                  <span className="text-ink-muted"> (쓸 양 합계 {g.stock.needText} + 여유 {g.stock.marginPct}%)</span>
                </p>
                {g.stock.weighing.ok ? (
                  <p className="text-ink-muted">
                    필요한 시약 <span className="font-semibold text-ink">{g.stock.weighing.amount}</span> · {g.stock.weighing.basis}
                  </p>
                ) : (
                  <p className="text-ink-muted">
                    <Mark tone="warn">원액에 필요한 시약량은 계산하지 못했어요</Mark> — {g.stock.weighing.reason}
                  </p>
                )}
                <table className="mt-2 w-full border-collapse">
                  <caption className="sr-only">{g.name}의 농도별 준비 방법</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className={`${TH} w-[34%]`}>쓰는 용액</th>
                      <th scope="col" className={TH}>준비 방법</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.uses.map((u) => (
                      <tr key={`${u.n}-${u.concText}`} className={ROW}>
                        <th scope="row" className="py-1.5 pr-3 text-left font-medium tabular-nums text-ink">
                          {u.concText} · {u.volText}
                        </th>
                        <td className="py-1.5 text-ink-muted">
                          {u.how.map((line, i) => (
                            <span key={i} className="block">{u.how.length > 1 ? `${i + 1}) ${line}` : line}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.why.map((w) => (
                  <p key={w} className="mt-1 text-ink-muted">· {w}</p>
                ))}
                {g.notes.map((n) => (
                  <p key={n} className="text-ink-muted">· {n}</p>
                ))}
              </div>
            ))}
          </Section>
        )}

        <Section id="report-steps" title={`${nSteps}. 실험 순서`}>
          {report.steps.length === 0 ? (
            <p className="mt-2 text-ink-muted">입력한 실행 단계가 없어요.</p>
          ) : (
            <>
              <table className="mt-2 w-full border-collapse">
                <caption className="sr-only">실험 단계별 소요 시간</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={`${TH} w-9`}>단계</th>
                    <th scope="col" className={`${TH} w-[34%]`}>내용</th>
                    <th scope="col" className={`${TH} w-[22%]`}>소요 시간</th>
                    <th scope="col" className={TH}>시작 시점·내용</th>
                  </tr>
                </thead>
                <tbody>
                  {report.steps.map((s) => (
                    <tr key={s.n} className={ROW}>
                      <td className="py-2 pr-3 tabular-nums text-ink-muted">{s.n}</td>
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                        {s.label}
                        {s.userAdded && <span className="font-normal text-ink-muted"> [직접 추가]</span>}
                        {s.waiting && <span className="block font-normal text-ink-muted">기다리는 단계</span>}
                        {s.reagents.length > 0 && (
                          <span className="mt-0.5 block font-normal text-ink-muted">
                            {s.reagents.map((r) => `${r.name}${r.amount ? ` ${r.amount}` : r.detail ? ` (${r.detail})` : ""}${r.userAdded ? " [직접 추가]" : ""}`).join(" · ")}
                          </span>
                        )}
                      </th>
                      <td className="py-2 pr-3 text-ink">{s.duration}</td>
                      <td className="py-2 text-ink-muted">
                        <span className="block">{s.start}</span>
                        {s.details && <span className="block">{s.details}</span>}
                        {s.issues.map((i) => (
                          <Mark key={i.id} tone={i.tone}>{i.text}</Mark>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.unlinked.length > 0 && (
                <p className="mt-2 text-ink-muted">
                  <Mark tone="warn">어느 단계에서 쓰는지 연결하지 않은 시약</Mark> — {report.unlinked.map((u) => u.text).join(", ")}
                </p>
              )}
              {report.total && (
                <p className="mt-2 text-ink">
                  총 소요 시간 <span className="font-semibold">{report.total.text}</span>
                  {report.total.unknownCount > 0 && <span className="text-ink-muted"> (시간 미정 {report.total.unknownCount}단계 제외)</span>}
                </p>
              )}
            </>
          )}
        </Section>

        <Section id="report-disposal" title={`${nSteps + 1}. 폐기·안전`}>
          {report.disposal.items.length === 0 ? (
            <p className="mt-2 text-ink-muted">안내할 시약이 없어요.</p>
          ) : (
            <>
              {report.disposal.warnings.length > 0 && (
                <div className="mt-2 break-inside-avoid">
                  <h3 className="text-sm font-semibold text-ink">같은 폐액통에 섞으면 안 돼요</h3>
                  <ul className="mt-1 flex flex-col gap-1">
                    {report.disposal.warnings.map((w, i) => (
                      <li key={i}>
                        <Mark tone={w.level === "danger" ? "danger" : "warn"}>{w.level === "danger" ? "위험" : "주의"}</Mark>
                        <span className="font-medium text-ink"> {w.names.join(" + ")}</span>
                        <span className="text-ink-muted"> — {w.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <table className="mt-3 w-full border-collapse">
                <caption className="sr-only">시약별 폐기 방법</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={`${TH} w-[26%]`}>시약</th>
                    <th scope="col" className={`${TH} w-[30%]`}>모으는 곳</th>
                    <th scope="col" className={TH}>안내</th>
                  </tr>
                </thead>
                <tbody>
                  {report.disposal.items.map((d) => (
                    <tr key={d.key} className={ROW}>
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">{d.name}</th>
                      <td className="py-2 pr-3 text-ink">
                        {d.streamLabel}
                        {d.signal && (
                          <span className="block">
                            <Mark tone={d.signal === "Danger" ? "danger" : "warn"}>{d.signal === "Danger" ? "위험" : "경고"}</Mark>
                            <span className="text-ink-muted"> (GHS 신호어)</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-ink-muted">
                        {d.tip && <span className="block">{d.tip}</span>}
                        {d.moreTips.map((t) => (
                          <span key={t} className="block">· {t}</span>
                        ))}
                        {d.hazards.length > 0 && (
                          <span className="mt-0.5 block">
                            GHS: {d.hazards.map((h) => (h.text ? `${h.code} ${h.text}` : h.code)).join(", ")}
                          </span>
                        )}
                        {d.note && <span className="block">{d.note}</span>}
                        {d.notFound && <Mark tone="danger">PubChem에서 못 찾음</Mark>}
                        <span className="block text-xs">{d.basis}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {withSource && hasSource && (
          <section aria-labelledby="report-source" className="mt-7 print:break-before-page">
            <h2 id="report-source" className="border-b border-ink pb-1.5 text-[15px] font-semibold text-ink print:break-after-avoid">
              부록. 논문 Methods 원문
            </h2>
            <p className="mt-2 whitespace-pre-line text-ink-muted">{methodText.trim()}</p>
          </section>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
          <p>
            참고용 문서예요. AI가 논문에서 읽은 값은 틀릴 수 있으니 실험 전에 논문 원문과 꼭 대조하세요. 폐기는 학교·연구실 규정과 시약 SDS(MSDS) 13항을 따르세요.
          </p>
          <p className="mt-1">
            한국어 MSDS: {KOSHA_MSDS_URL} · 유해성 정보 출처: PubChem(GHS) · 실험 프렙(가제)에서 {report.dateText} 만듦
          </p>
        </footer>
      </article>
    </div>
  );
}
