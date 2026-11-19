// 로그인하지 않았을 때 보유 시약 목록을 이 브라우저(localStorage)에 보관한다.
// 로그인하면 계정(Supabase)에 저장하고, 로그인 전에 보관한 목록은 계정으로 옮길 수 있다.

import { MAX_INVENTORY, MAX_NAME_LENGTH, inventoryKey } from "./inventory.mjs";

const KEY = "ep:inventory";

export function localStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 보관한 목록 → [{ key, name }]. 없거나 깨졌으면 빈 목록 */
export function loadLocalInventory(storage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    const items = [];
    for (const row of data) {
      const name = typeof row?.name === "string" ? row.name.trim().slice(0, MAX_NAME_LENGTH) : "";
      const key = inventoryKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push({ key, name });
      if (items.length >= MAX_INVENTORY) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function saveLocalInventory(storage, items) {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(items.map(({ name }) => ({ name }))));
    return true;
  } catch {
    return false;
  }
}
