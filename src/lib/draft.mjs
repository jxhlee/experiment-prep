// 로그인 화면(/login)으로 이동했다가 돌아와도 하던 작업이 사라지지 않도록, 이동 직전에 작업 내용을 임시로 보관한다.
// 탭 단위 sessionStorage 에만 두고(탭을 닫으면 사라짐), 일정 시간이 지나면 버린다.

const KEY = "ep:draft";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_ROWS = 500;

export function sessionStore() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const str = (v, max = 100000) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

function cleanMwMap(map) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [key, e] of Object.entries(map).slice(0, 1000)) {
    if (!e || typeof e !== "object") continue;
    if (Number.isFinite(e.mw) && e.mw > 0) out[key] = { mw: e.mw, formula: typeof e.formula === "string" ? e.formula : undefined, source: str(e.source, 20) || undefined };
    else if (e.notFound === true) out[key] = { notFound: true };
  }
  return out;
}

function clean(d) {
  const step = [1, 2, 3].includes(d.step) ? d.step : 1;
  return {
    step,
    // 가 본 가장 먼 단계(진행 표시줄에서 다시 눌러 갈 수 있는 곳)와, 저장해 둔 실험에서 이어 하는 중이면 그 id
    reached: [1, 2, 3].includes(d.reached) ? d.reached : step,
    currentId: typeof d.currentId === "string" && d.currentId ? d.currentId.slice(0, 64) : null,
    methodText: str(d.methodText, 60000),
    scale: Number.isFinite(d.scale) ? d.scale : null,
    customScale: str(d.customScale, 20),
    scaleFactor: Number.isFinite(d.scaleFactor) && d.scaleFactor > 0 ? d.scaleFactor : 1,
    sigFigs: Math.min(6, Math.max(1, Math.round(num(d.sigFigs, 3)))),
    saveTitle: str(d.saveTitle, 120),
    reagents: d.reagents.slice(0, MAX_ROWS).map((r, i) => ({
      id: num(r?.id, i + 1),
      name: str(r?.name, 200),
      concentration: str(r?.concentration, 100),
      volume: str(r?.volume, 100),
    })),
    timeline: d.timeline.slice(0, MAX_ROWS).map((s, i) => ({
      id: num(s?.id, i + 1),
      label: str(s?.label, 200),
      duration: str(s?.duration, 100),
      repeat: s?.repeat ?? 1,
      details: str(s?.details, 300),
      isWaiting: Boolean(s?.isWaiting),
    })),
    mwMap: cleanMwMap(d.mwMap),
    analysisMeta:
      d.analysisMeta && typeof d.analysisMeta === "object"
        ? { fromCache: Boolean(d.analysisMeta.fromCache), model: str(d.analysisMeta.model, 80) }
        : null,
  };
}

export function saveDraft(storage, data, now = Date.now()) {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify({ v: 1, savedAt: now, ...data }));
    return true;
  } catch {
    return false;
  }
}

/** 보관된 작업을 돌려준다. 없거나, 오래됐거나, 형식이 이상하면 null (그리고 지운다) */
export function loadDraft(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const valid =
      d?.v === 1 && Number.isFinite(d.savedAt) && now - d.savedAt <= MAX_AGE_MS && Array.isArray(d.reagents) && Array.isArray(d.timeline);
    if (!valid) {
      storage.removeItem(KEY);
      return null;
    }
    return clean(d);
  } catch {
    return null;
  }
}

export function clearDraft(storage) {
  try {
    storage?.removeItem(KEY);
  } catch {}
}
