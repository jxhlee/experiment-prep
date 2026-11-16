import { parseGhs, parseProperties } from "../../../lib/pubchem.mjs";
import { PUG_VIEW, cleanName, createCache, propertyUrl, pubchemJson } from "../../../lib/pubchem-server.mjs";

export const maxDuration = 30;

const propsCache = createCache();
const ghsCache = createCache();

async function lookup(name) {
  const key = name.toLowerCase();
  const hit = propsCache.get(key);
  if (hit !== undefined) return hit;
  const { status, json } = await pubchemJson(propertyUrl(name));
  const value = status === 404 ? null : parseProperties(json);
  propsCache.set(key, value);
  return value;
}

async function ghsOf(cid) {
  const hit = ghsCache.get(cid);
  if (hit !== undefined) return hit;
  const { status, json } = await pubchemJson(`${PUG_VIEW}/${cid}/JSON?heading=GHS+Classification`, { timeoutMs: 15000 });
  const value = status === 404 ? null : parseGhs(json);
  ghsCache.set(cid, value);
  return value;
}

/**
 * 시약이 실제로 있는 물질인지 PubChem 에서 확인한다.
 * GET /api/reagent?name=sodium%20azide[&ghs=1]
 *  → { found: true, cid, title, formula, mw, ghs? }  /  { found: false }
 * (이름이 PubChem 에 없는 것은 오류가 아니므로 200 으로 알린다)
 */
export async function GET(request) {
  const name = cleanName(request.nextUrl.searchParams.get("name"));
  if (!name) return Response.json({ error: "시약 이름이 비어 있거나 너무 깁니다." }, { status: 400 });
  const wantGhs = request.nextUrl.searchParams.get("ghs") === "1";

  try {
    const props = await lookup(name);
    if (!props) return Response.json({ found: false });
    const result = { found: true, ...props };
    if (wantGhs && props.cid) {
      try {
        result.ghs = await ghsOf(props.cid);
      } catch {
        result.ghs = null;
        result.ghsError = true;
      }
    }
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: `PubChem 호출 실패: ${err.message}` }, { status: 502 });
  }
}
