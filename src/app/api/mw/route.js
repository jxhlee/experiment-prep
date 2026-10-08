const PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name";
const cache = new Map();

export async function GET(request) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name || name.length > 100) {
    return Response.json({ error: "시약 이름이 비어 있거나 너무 깁니다." }, { status: 400 });
  }

  const cacheKey = name.toLowerCase();
  if (cache.has(cacheKey)) return Response.json(cache.get(cacheKey));

  let res;
  try {
    res = await fetch(`${PUBCHEM}/${encodeURIComponent(name)}/property/MolecularWeight,MolecularFormula/JSON`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return Response.json({ error: `PubChem 호출 실패: ${err.message}` }, { status: 502 });
  }

  if (res.status === 404) return Response.json({ error: "PubChem에서 찾을 수 없습니다." }, { status: 404 });
  if (!res.ok) return Response.json({ error: `PubChem 오류 (${res.status})` }, { status: 502 });

  const data = await res.json().catch(() => null);
  const prop = data?.PropertyTable?.Properties?.[0];
  const mw = Number(prop?.MolecularWeight);
  if (!Number.isFinite(mw) || mw <= 0) {
    return Response.json({ error: "PubChem 응답에서 분자량을 찾을 수 없습니다." }, { status: 404 });
  }

  const result = { mw, formula: prop.MolecularFormula, cid: prop.CID };
  cache.set(cacheKey, result);
  return Response.json(result);
}
