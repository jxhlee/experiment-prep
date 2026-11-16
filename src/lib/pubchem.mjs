// PubChem 응답을 우리가 쓰는 모양으로 바꾸는 순수 함수들 (서버 라우트와 테스트가 함께 쓴다).

/** /compound/name/…/property/Title,MolecularFormula,MolecularWeight/JSON → { cid, title, formula, mw } */
export function parseProperties(json) {
  const p = json?.PropertyTable?.Properties?.[0];
  const mw = Number(p?.MolecularWeight);
  if (!p || !Number.isFinite(mw) || mw <= 0) return null;
  return { cid: p.CID ?? null, title: typeof p.Title === "string" ? p.Title : "", formula: p.MolecularFormula ?? "", mw };
}

const STATEMENT_RE = /^\s*((?:EUH|H)\d{3}[A-Za-z]*(?:\s*\+\s*(?:EUH|H)\d{3}[A-Za-z]*)*)\s*(?:\(\s*(?:>\s*)?([\d.]+)\s*%\s*\))?\s*:/;

/** "H300+H310 (16.3%): …" → { codes: ["H300", "H310"], pct: 16.3 }. 해석할 수 없으면 null. */
export function parseStatement(text) {
  const m = STATEMENT_RE.exec(String(text ?? ""));
  if (!m) return null;
  const codes = m[1]
    .split("+")
    .map((c) => c.trim().replace(/^(EUH\d{3}|H\d{3}).*$/, "$1"))
    .filter((c) => /^H\d{3}$/.test(c));
  return { codes, pct: m[2] != null ? Number(m[2]) : null };
}

function findSection(node, heading) {
  if (node?.TOCHeading === heading) return node;
  for (const child of node?.Section ?? []) {
    const hit = findSection(child, heading);
    if (hit) return hit;
  }
  return null;
}

const strings = (info) => (info?.Value?.StringWithMarkup ?? []).map((v) => v?.String).filter((s) => typeof s === "string");

// 합의된 분류로 인정하는 최소 비율. PubChem 은 10% 넘는 코드만 보여 주는데, 공급자 한두 곳의 예외(에탄올에 "암 유발" 등)가 섞여 있다.
const CONSENSUS_PCT = 30;

/**
 * PubChem PUG View(GHS Classification) → { signal, hazards: [{ code, pct }], source, notHazardousShare }.
 * 여러 공급자의 분류가 섞여 있어서, ECHA 신고를 집계한 블록의 합의 코드(30% 이상)만 쓴다.
 * 집계 블록이 없으면 첫 분류를 쓴다. GHS 정보가 없으면 null.
 */
export function parseGhs(json) {
  const section = findSection({ Section: json?.Record?.Section }, "GHS Classification");
  const infos = section?.Information;
  if (!Array.isArray(infos) || infos.length === 0) return null;

  const blocks = [];
  let current = null;
  const open = () => {
    current = { signal: null, statements: [], echa: false, summary: "" };
    blocks.push(current);
  };
  for (const info of infos) {
    const name = info?.Name;
    if (name === "Pictogram(s)") open();
    else if (!current) open();
    if (name === "Signal") current.signal = strings(info)[0] ?? null;
    else if (name === "GHS Hazard Statements") current.statements.push(...strings(info));
    else if (name === "ECHA C&L Notifications Summary") {
      current.echa = true;
      current.summary = strings(info).join(" ");
    }
  }

  const chosen = blocks.find((b) => b.echa && b.statements.length > 0) ?? blocks.find((b) => b.statements.length > 0);
  const echaBlock = blocks.find((b) => b.echa);
  const share = /not meeting GHS hazard criteria per (\d+) of (\d+) reports/i.exec(echaBlock?.summary ?? "");
  const notHazardousShare = share && Number(share[2]) > 0 ? Number(share[1]) / Number(share[2]) : null;
  if (!chosen && notHazardousShare == null) return null;

  const byCode = new Map();
  for (const text of chosen?.statements ?? []) {
    const st = parseStatement(text);
    if (!st) continue;
    if (chosen.echa && st.pct != null && st.pct < CONSENSUS_PCT) continue;
    for (const code of st.codes) {
      const prev = byCode.get(code);
      if (prev == null || (st.pct ?? 100) > prev) byCode.set(code, st.pct ?? 100);
    }
  }
  return {
    signal: chosen?.signal ?? null,
    hazards: [...byCode.entries()].map(([code, pct]) => ({ code, pct })).sort((a, b) => a.code.localeCompare(b.code)),
    source: chosen ? (chosen.echa ? "ECHA 신고 집계" : "분류 1건") : "",
    notHazardousShare,
  };
}
