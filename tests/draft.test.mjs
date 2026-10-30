import { test } from "node:test";
import assert from "node:assert/strict";
import { clearDraft, loadDraft, saveDraft } from "../src/lib/draft.mjs";

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), raw: m };
};

const sample = {
  step: 2,
  methodText: "Cells were lysed in 50 mM Tris-HCl.",
  scale: 2,
  customScale: "",
  scaleFactor: 2,
  sigFigs: 4,
  saveTitle: "내 실험",
  reagents: [{ id: 3, name: "NaCl", concentration: "150 mM", volume: "100 mL" }],
  timeline: [{ id: 5, label: "배양", duration: "30 min", repeat: 1, details: "얼음 위", isWaiting: true }],
  mwMap: { sodiumpyruvate: { mw: 110.04, formula: "C3H3NaO3", source: "pubchem" }, zzz: { notFound: true } },
  analysisMeta: { fromCache: false, model: "gemini-3.5-flash-lite" },
};

test("저장한 작업이 그대로 복원된다", () => {
  const s = fakeStorage();
  assert.equal(saveDraft(s, sample), true);
  assert.deepEqual(loadDraft(s), sample);
});

test("없는 경우 / 저장소를 못 쓰는 경우는 조용히 null", () => {
  assert.equal(loadDraft(fakeStorage()), null);
  assert.equal(loadDraft(null), null);
  assert.equal(saveDraft(null, sample), false);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(loadDraft(broken), null);
  assert.equal(saveDraft(broken, sample), false);
});

test("6시간이 지난 작업은 버린다", () => {
  const s = fakeStorage();
  const t0 = 1_000_000;
  saveDraft(s, sample, t0);
  assert.notEqual(loadDraft(s, t0 + 5 * 3600 * 1000), null);
  assert.equal(loadDraft(s, t0 + 6 * 3600 * 1000 + 1), null);
  assert.equal(s.raw.size, 0, "오래된 값은 지운다");
});

test("깨졌거나 형식이 다른 값은 버린다", () => {
  const s = fakeStorage();
  s.setItem("ep:draft", "{not json");
  assert.equal(loadDraft(s), null);
  s.setItem("ep:draft", JSON.stringify({ v: 2, savedAt: Date.now(), reagents: [], timeline: [] }));
  assert.equal(loadDraft(s), null);
  s.setItem("ep:draft", JSON.stringify({ v: 1, savedAt: Date.now(), reagents: "x", timeline: [] }));
  assert.equal(loadDraft(s), null);
});

test("복원할 때 값을 다듬는다 (이상한 값이 화면 상태로 새어 들어가지 않게)", () => {
  const s = fakeStorage();
  saveDraft(s, {
    step: 9,
    methodText: "x".repeat(70000),
    scale: "abc",
    scaleFactor: -5,
    sigFigs: 99,
    saveTitle: "y".repeat(500),
    reagents: [{ name: 5 }, null],
    timeline: [{ label: null, isWaiting: 1 }],
    mwMap: { good: { mw: 100 }, bad: { mw: -1 }, junk: "x", nf: { notFound: true } },
    analysisMeta: "no",
  });
  const d = loadDraft(s);
  assert.equal(d.step, 1);
  assert.equal(d.methodText.length, 60000);
  assert.equal(d.scale, null);
  assert.equal(d.scaleFactor, 1);
  assert.equal(d.sigFigs, 6);
  assert.equal(d.saveTitle.length, 120);
  assert.deepEqual(d.reagents, [{ id: 1, name: "", concentration: "", volume: "" }, { id: 2, name: "", concentration: "", volume: "" }]);
  assert.deepEqual(d.timeline[0], { id: 1, label: "", duration: "", repeat: 1, details: "", isWaiting: true });
  assert.deepEqual(Object.keys(d.mwMap).sort(), ["good", "nf"]);
  assert.equal(d.analysisMeta, null);
});

test("복원한 뒤에는 지울 수 있다", () => {
  const s = fakeStorage();
  saveDraft(s, sample);
  clearDraft(s);
  assert.equal(loadDraft(s), null);
  assert.doesNotThrow(() => clearDraft(null));
});
