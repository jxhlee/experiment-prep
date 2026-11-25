"use client";

import { useEffect, useMemo } from "react";
import { disposalItems, findIncompatibilities } from "../../lib/hazard.mjs";
import { KOSHA_MSDS_URL, existenceOf, ghsNote, pubchemSafetyUrl } from "../../lib/reagent-status.mjs";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Badge, Disclosure } from "../ui";

const TONE = { danger: "danger", warn: "warn", neutral: "neutral" };

/** 결과 화면의 「폐기·안전」 탭: 같이 버리면 안 되는 조합, 시약마다 어느 폐액에 모을지 */
export default function DisposalPanel() {
  const { reagents, reagentInfo, checkReagents } = useExperiment();
  const namesSig = reagents.map((r) => r.name.trim()).filter(Boolean).join("|");

  // 이 탭을 열었을 때만 PubChem 에서 GHS 유해성 정보를 가져온다
  useEffect(() => {
    checkReagents({ ghs: true });
  }, [checkReagents, namesSig]);

  const items = useMemo(() => disposalItems(reagents, reagentInfo), [reagents, reagentInfo]);
  const warnings = useMemo(() => findIncompatibilities(items), [items]);
  const loading = items.some((i) => i.info?.state === "checking");

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">시약이 없어서 안내할 내용이 없어요. 이전 단계에서 시약을 추가해 주세요.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-sm text-ink-muted">
        <p>참고용이에요. 폐기는 학교·연구실 규정과 시약 SDS(MSDS) 13항을 따르세요.</p>
        <Disclosure summary="이 안내의 근거" className="mt-1">
          기본 분류표에 있는 시약은 사람이 정리한 분류표를, 그 밖의 시약은 화학식 규칙과 PubChem의 GHS 유해성 정보를 근거로 해요. 기관마다 폐액 이름과 기준이 다를 수 있어요.
        </Disclosure>
      </div>

      {warnings.length > 0 && (
        <section aria-labelledby="incompat-title">
          <h2 id="incompat-title" className="text-[15px] font-semibold text-ink">
            같은 폐액통에 섞으면 안 돼요
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2.5 py-2.5 text-sm">
                <Icon name="alert" size={16} className={`mt-0.5 ${w.level === "danger" ? "text-danger" : "text-warn-ink"}`} />
                <span>
                  <span className="sr-only">{w.level === "danger" ? "위험: " : "주의: "}</span>
                  <span className="font-medium text-ink">{w.names.join(" + ")}</span>
                  <span className="ml-2 text-ink-muted">{w.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="stream-title">
        <h2 id="stream-title" className="text-[15px] font-semibold text-ink">
          시약별 폐기 방법
        </h2>
        {loading && (
          <p role="status" className="mt-1 text-sm text-ink-muted">
            유해성 정보를 가져오는 중이에요…
          </p>
        )}
        <ul className="mt-2 divide-y divide-line">
          {items.map((i) => {
            const note = ghsNote(i.info);
            const notFound = existenceOf(i.name, i.info)?.kind === "notfound";
            return (
              <li key={i.key} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-ink">{i.name}</span>
                  <Badge tone={TONE[i.tone]}>{i.streamLabel}</Badge>
                  {i.signal && (
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${i.signal === "Danger" ? "text-danger" : "text-warn-ink"}`}>
                      <Icon name="alert" size={14} />
                      {i.signal === "Danger" ? "위험" : "경고"}
                      <span className="sr-only"> (GHS 신호어 {i.signal})</span>
                    </span>
                  )}
                  {notFound && <span className="text-sm text-danger">PubChem에서 못 찾음</span>}
                </div>
                {i.tips[0] && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{i.tips[0]}</p>}
                {(i.tips.length > 1 || i.hazards.length > 0 || note) && (
                  <Disclosure summary="자세히">
                    <div className="flex flex-col gap-3">
                      {i.tips.length > 1 && (
                        <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed marker:text-line-strong">
                          {i.tips.slice(1).map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      )}
                      {i.hazards.length > 0 && (
                        <ul className="flex flex-col gap-0.5">
                          {i.hazards.map((h) => (
                            <li key={h.code}>
                              <span className="font-mono font-medium text-ink">{h.code}</span>
                              <span className="ml-2">{h.text || "—"}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {note && <p>{note}</p>}
                      <p>
                        {i.certain ? "정리된 분류표" : `자동 추정 · ${i.basis}`}
                        {i.detail && ` · ${i.detail}`}
                        {i.info?.cid && (
                          <>
                            {" · "}
                            <a href={pubchemSafetyUrl(i.info.cid)} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4 hover:no-underline">
                              PubChem 안전 정보<span className="sr-only"> (새 창)</span>
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </Disclosure>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-ink-muted">
          한국어 MSDS는{" "}
          <a href={KOSHA_MSDS_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4 hover:no-underline">
            안전보건공단 MSDS 사이트<span className="sr-only"> (새 창)</span>
          </a>
          에서 찾아볼 수 있어요.
        </p>
      </section>
    </div>
  );
}
