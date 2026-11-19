import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aliasInfo,
  buildInventoryIndex,
  checkInventory,
  cleanInventoryName,
  inventoryKey,
  parseInventoryText,
  summarizeInventory,
} from "../src/lib/inventory.mjs";
import { addInventory, clearInventory, deleteInventoryItem, listInventory } from "../src/lib/db.mjs";

const index = (...names) => buildInventoryIndex(names.map((name) => ({ name, key: inventoryKey(name) })));
const status = (name, idx) => checkInventory(name, idx).status;

test("비교용 키: 영문·숫자·한글만 남기고 소문자로", () => {
  assert.equal(inventoryKey("Sodium Chloride (NaCl)"), "sodiumchloridenacl");
  assert.equal(inventoryKey("염화 나트륨"), "염화나트륨");
  assert.equal(inventoryKey("  "), "");
});

test("이름 정리: 번호·순도·등급·쉼표 뒤 설명을 뗀다", () => {
  assert.equal(cleanInventoryName("1. Sodium chloride"), "Sodium chloride");
  assert.equal(cleanInventoryName("- 에탄올 (99.9%)"), "에탄올");
  assert.equal(cleanInventoryName("Sodium chloride, ≥99.0%, ACS reagent"), "Sodium chloride");
  assert.equal(cleanInventoryName("NaOH 특급"), "NaOH");
  assert.equal(cleanInventoryName("N,N-Dimethylformamide"), "N,N-Dimethylformamide", "위치 번호의 쉼표는 남긴다");
  assert.equal(cleanInventoryName("Bi(NO3)3·5H2O"), "Bi(NO3)3·5H2O");
});

test("붙여넣기 해석: 줄마다 하나, 표에서 복사하면 첫 칸, 머리글·빈 줄·중복은 건너뛴다", () => {
  const text = ["시약명\t제조사\t수량", "NaCl\tSigma\t500 g", "", "  에탄올  \tDaejung", "1) Tris", "nacl", "x".repeat(200)].join("\r\n");
  const r = parseInventoryText(text);
  assert.deepEqual(r.items.map((i) => i.name), ["NaCl", "에탄올", "Tris"]);
  assert.equal(r.duplicates, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.items[0].key, "nacl");
  assert.deepEqual(parseInventoryText("").items, []);
  assert.equal(parseInventoryText(Array.from({ length: 30 }, (_, i) => `시약${i}`).join("\n"), { max: 10 }).items.length, 10);
});

test("있는 시약: 영문 이름·약어·화학식·한글 이름이 달라도 같은 시약이면 '있음'", () => {
  const idx = index("NaCl", "에탄올", "Tris", "수산화나트륨", "Isopropyl alcohol");
  assert.equal(status("sodium chloride", idx), "have");
  assert.equal(status("Ethanol", idx), "have");
  assert.equal(status("Tris base", idx), "have");
  assert.equal(status("NaOH", idx), "have");
  assert.equal(status("isopropanol", idx), "have");
  assert.deepEqual(checkInventory("ethanol", idx).matched, ["에탄올"]);

  const ko = index("Sodium hydroxide", "염산", "황산", "아세톤");
  assert.equal(status("NaOH", ko), "have");
  assert.equal(status("HCl", ko), "have");
  assert.equal(status("H2SO4", ko), "have");
  assert.equal(status("acetone", ko), "have");
});

test("없는 시약은 '구매 요망'(missing)이고, 목록이 비어 있으면 판단하지 않는다(none)", () => {
  const idx = index("NaCl", "에탄올");
  assert.equal(status("KCl", idx), "missing");
  assert.equal(status("Zzyzx-9", idx), "missing");
  assert.equal(status("NaCl", buildInventoryIndex([])), "none");
  assert.equal(checkInventory("   ", idx), null);
});

test("순도·제조사 표기가 붙은 보유 이름도 알아본다", () => {
  const idx = index("Sodium chloride, ≥99.0%", "에탄올 (99.9%)", "NaOH 특급", "Methanol (Sigma-Aldrich)");
  assert.equal(status("NaCl", idx), "have");
  assert.equal(status("ethanol", idx), "have");
  assert.equal(status("sodium hydroxide", idx), "have");
  assert.equal(status("methanol", idx), "have");
});

test("수화물·염 형태: 같은 시약의 다른 형태만 있으면 '다른 형태'(variant)로 알린다", () => {
  const idx = index("MgCl2·6H2O", "Na2EDTA", "염화칼슘 2수화물");
  const mg = checkInventory("MgCl2", idx);
  assert.equal(mg.status, "variant");
  assert.deepEqual(mg.matched, ["MgCl2·6H2O"]);
  assert.equal(status("magnesium chloride hexahydrate", idx), "have");
  assert.equal(status("EDTA", idx), "variant", "EDTA 유리산이 필요한데 Na2EDTA 만 있음");
  assert.equal(status("disodium EDTA dihydrate", idx), "have");
  assert.equal(status("CaCl2", idx), "variant", "한글 '염화칼슘 2수화물'은 계열은 알지만 형태는 모른다");
  assert.equal(status("KCl", idx), "missing");
});

test("한글 이름만 있는 목록에서 일반 이름은 기본 형태로 본다", () => {
  const idx = index("염화마그네슘", "황산구리", "포도당");
  assert.equal(status("MgCl2", idx), "have");
  assert.equal(status("copper(II) sulfate", idx), "have");
  assert.equal(status("glucose", idx), "have");
  assert.equal(status("copper(II) sulfate pentahydrate", idx), "variant");
});

test("물·혼합 용액은 대조 대상이 아니다", () => {
  const idx = index("NaCl");
  assert.equal(status("distilled water", idx), "exempt");
  assert.equal(status("PBS", idx), "exempt");
});

test("별개의 시약을 같은 것으로 착각하지 않는다", () => {
  const idx = index("염화나트륨", "수산화나트륨");
  assert.equal(status("sodium carbonate", idx), "missing");
  assert.equal(status("potassium hydroxide", idx), "missing");
  assert.equal(status("NaOH", idx), "have");
  assert.equal(status("NaCl", idx), "have");
  assert.equal(status("Na2CO3", idx), "missing");
});

test("aliasInfo: 계열과 형태 번호", () => {
  assert.equal(aliasInfo("MgCl2").familyId, "mgcl2");
  assert.equal(aliasInfo("MgCl2").formIndex, 0, "화학식 MgCl2 는 무수물이라는 구체적인 형태");
  assert.equal(aliasInfo("magnesium chloride").formIndex, null, "일반 이름은 형태를 특정하지 않는다");
  assert.equal(aliasInfo("MgCl2·6H2O").formIndex, 1);
  assert.equal(aliasInfo("염화마그네슘 6수화물").formIndex, -1);
  assert.equal(aliasInfo("NaCl").familyId, null);
});

test("요약: 없는 시약 이름을 모아 주고, 같은 시약은 한 번만 센다", () => {
  const idx = index("NaCl", "MgCl2·6H2O");
  const s = summarizeInventory(["NaCl", "sodium chloride", "KCl", "Zzyzx-9", "MgCl2", "water", "PBS"], idx);
  assert.deepEqual(s, { have: 1, variant: 1, missing: ["KCl", "Zzyzx-9"], variantNames: ["MgCl2"], exempt: 2, none: false });
  assert.equal(summarizeInventory(["NaCl"], buildInventoryIndex([])).none, true);
});

// 호출 기록을 남기는 가짜 Supabase 클라이언트
function fakeSb(...responses) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve, reject) => Promise.resolve(responses.shift() ?? { data: null, error: null }).then(resolve, reject);
          return (...args) => {
            call.ops.push([prop, ...args]);
            return builder;
          };
        },
      });
      return builder;
    },
  };
}

test("보유 시약 DB 호출: 목록·추가(중복은 무시)·삭제·전체 삭제", async () => {
  const sb = fakeSb({ data: [{ key: "nacl", name: "NaCl" }], error: null }, { data: null, error: null }, { data: null, error: null }, { data: null, error: null });
  assert.deepEqual(await listInventory(sb), [{ key: "nacl", name: "NaCl" }]);
  assert.equal(sb.calls[0].table, "inventory_items");
  assert.deepEqual(sb.calls[0].ops[1], ["order", "name", { ascending: true }]);

  await addInventory(sb, "u1", [{ key: "kcl", name: "KCl" }, { key: "", name: "x" }, { key: "k", name: "" }]);
  const [op, rows, options] = sb.calls[1].ops[0];
  assert.equal(op, "upsert");
  assert.deepEqual(rows, [{ user_id: "u1", key: "kcl", name: "KCl" }]);
  assert.deepEqual(options, { onConflict: "user_id,key", ignoreDuplicates: true });

  await deleteInventoryItem(sb, "kcl");
  assert.deepEqual(sb.calls[2].ops, [["delete"], ["eq", "key", "kcl"]]);
  await clearInventory(sb);
  assert.deepEqual(sb.calls[3].ops, [["delete"], ["neq", "key", ""]]);

  const none = fakeSb();
  await addInventory(none, "u1", []);
  assert.equal(none.calls.length, 0, "넣을 것이 없으면 호출하지 않는다");
});

test("보유 시약 DB 오류는 오류로 던진다", async () => {
  const sb = fakeSb({ data: null, error: { code: "PGRST205", message: "relation does not exist" } });
  await assert.rejects(() => listInventory(sb), (e) => e.code === "PGRST205");
});

import { loadLocalInventory, saveLocalInventory } from "../src/lib/inventory-store.mjs";

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};

test("브라우저 보관: 저장한 목록이 그대로 돌아오고, 깨진 값·중복은 걸러진다", () => {
  const s = fakeStorage();
  assert.deepEqual(loadLocalInventory(s), []);
  assert.equal(saveLocalInventory(s, [{ key: "nacl", name: "NaCl" }, { key: "에탄올", name: "에탄올" }]), true);
  assert.deepEqual(loadLocalInventory(s), [{ key: "nacl", name: "NaCl" }, { key: "에탄올", name: "에탄올" }]);

  s.setItem("ep:inventory", JSON.stringify([{ name: "NaCl" }, { name: "nacl" }, { name: "" }, null, { name: 5 }, { name: "KCl" }]));
  assert.deepEqual(loadLocalInventory(s).map((i) => i.name), ["NaCl", "KCl"]);
  s.setItem("ep:inventory", "{not json");
  assert.deepEqual(loadLocalInventory(s), []);
  s.setItem("ep:inventory", JSON.stringify({ a: 1 }));
  assert.deepEqual(loadLocalInventory(s), []);
});

test("브라우저 보관: 저장소를 못 쓰는 환경에서도 조용히 넘어간다", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
  assert.deepEqual(loadLocalInventory(broken), []);
  assert.equal(saveLocalInventory(broken, [{ key: "a", name: "a" }]), false);
  assert.equal(saveLocalInventory(null, []), false);
  assert.deepEqual(loadLocalInventory(null), []);
});
