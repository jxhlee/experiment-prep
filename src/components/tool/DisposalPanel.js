"use client";

import { useEffect, useMemo } from "react";
import { normalizeName } from "../../lib/chem.mjs";
import { classifyReagent, findIncompatibilities, groupByStream } from "../../lib/hazard.mjs";
import { KOSHA_MSDS_URL, pubchemSafetyUrl } from "../../lib/reagent-status.mjs";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Alert, Badge, Card, CardTitle } from "../ui";
import { ExistenceChip } from "./Provenance";

const TONE = { danger: "danger", warn: "warn", neutral: "neutral" };

function ghsSummary(item) {
  const g = item.info?.ghs;
  if (item.info?.ghsState === "error") return "유해성 정보를 가져오지 못했어요.";
  if (item.info?.state === "checking") return "가져오는 중…";
  if (!item.info || item.info.ghsState == null) return "아직 가져오지 않았어요.";
  if (!g) return "PubChem에 GHS 정보가 없어요.";
  if (g.hazards.length === 0 && g.notHazardousShare != null && g.notHazardousShare >= 0.5) {
    return `신고의 ${Math.round(g.notHazardousShare * 100)}%가 GHS 위험 물질이 아니라고 보고했어요.`;
  }
  if (g.hazards.length === 0) return "합의된 유해 분류가 없어요.";
  return "";
}

/** 결과 화면의 "폐기·안전" 탭: 시약마다 어느 폐액으로 모을지, 같이 버리면 안 되는 조합, GHS 유해성을 보여 준다 */
export default function DisposalPanel() {
  const { reagents, reagentInfo, checkReagents } = useExperiment();
  const namesSig = reagents.map((r) => r.name.trim()).filter(Boolean).join("|");

  // 이 탭을 열었을 때만 PubChem 에서 GHS 유해성 정보를 가져온다
  useEffect(() => {
    checkReagents({ ghs: true });
  }, [checkReagents, namesSig]);

  const items = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of reagents) {
      const name = r.name.trim();
      const key = normalizeName(name).key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const info = reagentInfo[key];
      out.push({ key, name, info, ...classifyReagent({ name, formula: info?.formula, ghs: info?.ghs }) });
    }
    return out;
  }, [reagents, reagentInfo]);

  const groups = useMemo(() => groupByStream(items), [items]);
  const warnings = useMemo(() => findIncompatibilities(items), [items]);
  const loading = items.some((i) => i.info?.state === "checking");

  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">시약이 없어서 안내할 내용이 없어요. 이전 단계에서 시약을 추가해 주세요.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert kind="warn">
        <p className="font-medium">참고용 안내예요. 폐기는 학교·연구실의 폐기물 규정과 각 시약 SDS(MSDS)의 13항을 따르세요.</p>
        <p className="mt-0.5">
          내장 시약은 사람이 정리한 분류표를, 그 밖의 시약은 화학식 규칙과 PubChem의 GHS 유해성 정보를 근거로 해요. 기관마다 폐액 이름과 기준이 다를 수 있어요.
        </p>
      </Alert>

      {warnings.length > 0 && (
        <section aria-labelledby="incompat-title">
          <CardTitle id="incompat-title" icon="alert">
            같은 폐액통에 섞으면 안 되는 조합
          </CardTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {warnings.map((w, i) => (
              <li key={i}>
                <Alert kind={w.level === "danger" ? "error" : "warn"}>
                  <p className="font-medium">{w.names.join(" + ")}</p>
                  <p>{w.text}</p>
                </Alert>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="stream-title">
        <CardTitle id="stream-title" icon="folder">
          어느 폐액으로 모을까요
        </CardTitle>
        {loading && (
          <p role="status" className="mt-2 text-sm text-ink-muted">
            PubChem에서 유해성 정보를 가져오는 중이에요…
          </p>
        )}
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const tips = [...new Set(g.items.flatMap((i) => i.tips))];
            return (
              <li key={g.stream}>
                <Card className="h-full">
                  <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                    <Badge tone={TONE[g.tone]}>{g.label}</Badge>
                  </h3>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {g.items.map((i) => (
                      <li key={i.key} className="text-sm">
                        <span className="font-medium text-ink">{i.name}</span>
                        <span className="ml-2 text-ink-muted">
                          {i.certain ? "내장 분류" : `자동 추정 · ${i.basis}`}
                          {i.detail && ` · ${i.detail}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-muted marker:text-line-strong">
                    {tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ghs-title">
        <CardTitle id="ghs-title" icon="info">
          시약별 유해성 (PubChem GHS)
        </CardTitle>
        <p className="mt-0.5 text-sm text-ink-muted">여러 공급자가 신고한 분류 중 30% 이상이 같게 분류한 코드만 보여 줘요. 정확한 내용은 시약병의 SDS를 확인하세요.</p>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">시약별 GHS 유해성: 신호어, 위험 문구, 시약 존재 확인</caption>
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  시약
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  유해·위험
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const note = ghsSummary(i);
                return (
                  <tr key={i.key} className="border-t border-line align-top">
                    <th scope="row" className="px-4 py-3 font-medium text-ink">
                      {i.name}
                      <span className="mt-1 block font-normal">
                        <ExistenceChip name={i.name} info={i.info} />
                      </span>
                    </th>
                    <td className="px-4 py-3">
                      {i.signal && (
                        <Badge tone={i.signal === "Danger" ? "danger" : "warn"} icon="alert">
                          {i.signal === "Danger" ? "위험" : "경고"}
                          <span className="sr-only"> (신호어 {i.signal})</span>
                        </Badge>
                      )}
                      {i.hazards.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {i.hazards.map((h) => (
                            <li key={h.code}>
                              <span className="font-mono text-sm font-medium text-ink">{h.code}</span>
                              <span className="ml-2 text-ink-muted">{h.text || "—"}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {note && <p className="mt-1 text-ink-muted">{note}</p>}
                      {i.info?.cid && (
                        <a
                          href={pubchemSafetyUrl(i.info.cid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-accent underline underline-offset-4 hover:no-underline"
                        >
                          PubChem 안전 정보<span className="sr-only"> (새 창)</span>
                          <Icon name="arrowRight" size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          한국어 MSDS는{" "}
          <a href={KOSHA_MSDS_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4 hover:no-underline">
            안전보건공단 MSDS 사이트<span className="sr-only"> (새 창)</span>
          </a>
          에서 시약 이름으로 찾아볼 수 있어요.
        </p>
      </section>
    </div>
  );
}
