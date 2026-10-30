import { useCallback, useSyncExternalStore } from "react";

// 탭을 닫으면 사라지는 sessionStorage 값을 React 상태처럼 쓴다. 서버 렌더링과 어긋나지 않도록 useSyncExternalStore를 쓴다.
const listeners = new Set();

function subscribe(callback) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function read(name) {
  try {
    return window.sessionStorage.getItem(name);
  } catch {
    return null;
  }
}

export function useSessionPref(name, fallback) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(name) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (next) => {
      try {
        if (next) window.sessionStorage.setItem(name, next);
        else window.sessionStorage.removeItem(name);
      } catch {}
      listeners.forEach((l) => l());
    },
    [name],
  );
  return [value, set];
}
