// 서버 라우트가 PubChem 을 부를 때 쓰는 공통 도구: 호출 간격 제한(초당 5회 이하), 시간 제한, 결과 보관.

const MIN_GAP_MS = 220;
let lastStart = 0;
let chain = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 모든 PubChem 호출이 이 줄을 지나가며 최소 간격을 지킨다
function nextSlot() {
  const turn = chain.then(async () => {
    await sleep(Math.max(0, lastStart + MIN_GAP_MS - Date.now()));
    lastStart = Date.now();
  });
  chain = turn.catch(() => {});
  return turn;
}

/** PubChem JSON 호출. 없는 항목(404)은 { status: 404 }, 그 밖의 실패는 오류를 던진다. */
export async function pubchemJson(url, { timeoutMs = 10000 } = {}) {
  await nextSlot();
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (res.status === 404) return { status: 404, json: null };
  if (!res.ok) throw new Error(`PubChem 오류 (${res.status})`);
  return { status: 200, json: await res.json() };
}

/** 오래된 것부터 지우는 작은 보관함 */
export function createCache({ max = 500, ttlMs = 24 * 3600 * 1000 } = {}) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(key, { at: Date.now(), value });
    },
  };
}

/** 시약 이름 검사: 비어 있거나 너무 길거나 제어 문자가 있으면 null */
export function cleanName(raw) {
  const name = String(raw ?? "").trim();
  if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name)) return null;
  return name;
}

export const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
export const PUG_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound";
export const propertyUrl = (name) => `${PUG}/compound/name/${encodeURIComponent(name)}/property/Title,MolecularFormula,MolecularWeight/JSON`;
