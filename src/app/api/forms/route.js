import { probeQueries, titleMatchesHydrate } from "../../../lib/forms.mjs";
import { parseProperties } from "../../../lib/pubchem.mjs";
import { cleanName, createCache, propertyUrl, pubchemJson } from "../../../lib/pubchem-server.mjs";

export const maxDuration = 45;

const cache = createCache({ max: 200 });

/**
 * 같은 시약의 다른 형태(무수물·수화물) 후보를 PubChem 에서 찾는다.
 * GET /api/forms?name=zinc%20chloride → { forms: [{ hydrate, cid, title, formula, mw }] }
 * 기본 이름과 "… hexahydrate" 같은 이름을 차례로 검색하고, 결과 제목에 그 결정수 단어가 있는 것만 인정한다.
 */
export async function GET(request) {
  const name = cleanName(request.nextUrl.searchParams.get("name"));
  if (!name) return Response.json({ error: "시약 이름이 비어 있거나 너무 깁니다." }, { status: 400 });

  const queries = probeQueries(name);
  if (queries.length === 0) return Response.json({ forms: [] });
  const key = queries[0].query.toLowerCase();
  const hit = cache.get(key);
  if (hit) return Response.json({ forms: hit });

  const found = [];
  const seen = new Set();
  let failures = 0;
  for (const { query, hydrate } of queries) {
    try {
      const { status, json } = await pubchemJson(propertyUrl(query), { timeoutMs: 8000 });
      const props = status === 404 ? null : parseProperties(json);
      if (!props || !titleMatchesHydrate(props.title, hydrate) || (props.cid != null && seen.has(props.cid))) continue;
      if (props.cid != null) seen.add(props.cid);
      found.push({ hydrate, cid: props.cid, title: props.title, formula: props.formula, mw: props.mw });
    } catch {
      failures += 1;
    }
  }
  if (found.length === 0 && failures > 0) return Response.json({ error: "PubChem 호출에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });

  found.sort((a, b) => (a.hydrate ?? 0) - (b.hydrate ?? 0));
  if (failures === 0) cache.set(key, found);
  return Response.json({ forms: found });
}
