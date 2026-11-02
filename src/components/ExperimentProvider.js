"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft, sessionStore } from "../lib/draft.mjs";
import { namesNeedingLookup, normalizeName } from "../lib/chem.mjs";
import { getSupabase } from "../lib/supabase";
import { defaultTitle, fromRecord, toRecord } from "../lib/experiments.mjs";
import {
  deleteExperiment,
  friendlyDbError,
  libraryToMwMap,
  listExperiments,
  listUserReagents,
  loadExperiment,
  mergeLibrary,
  saveExperiment,
  saveUserReagents,
} from "../lib/db.mjs";
import { ExtractError, MAX_CHARS_OWN_KEY, MAX_CHARS_SERVER } from "../lib/gemini.mjs";
import {
  extractViaOwnKey,
  extractViaServer,
  hashText,
  loadCachedExtraction,
  saveCachedExtraction,
} from "../lib/extract-client.mjs";
import { useSessionPref } from "../lib/use-session-pref";
import { useAccount } from "./AuthProvider";

const ExperimentContext = createContext(null);

const AUTOSAVE_MS = 400;
const emptyRow = (id) => ({ id, name: "", concentration: "", volume: "" });
const EMPTY_LIST = { items: [], loading: false, error: "", loaded: false };

/**
 * 한 번의 실험 준비(입력 → 확인 → 결과)에 필요한 모든 상태와 동작을 한곳에 둔다.
 * 화면(페이지)은 단계마다 나뉘어 있지만 이 상태는 페이지를 옮겨도 이어지고, 새로고침이나 로그인 화면에
 * 다녀와도 사라지지 않도록 탭 안에 자동으로 임시 보관한다(sessionStorage, 탭을 닫으면 사라짐).
 */
export function ExperimentProvider({ children }) {
  const auth = useAccount();
  const userId = auth.user?.id ?? null;

  const [methodText, setMethodText] = useState("");
  const [scaleFactor, setScaleFactor] = useState(1);
  const [sigFigs, setSigFigs] = useState(3);
  const [reagents, setReagents] = useState([emptyRow(1)]);
  const [timeline, setTimeline] = useState([]);
  const [mwMap, setMwMap] = useState({});
  const [analysisMeta, setAnalysisMeta] = useState(null);
  const [reached, setReached] = useState(1);
  const [apiMode, setApiMode] = useSessionPref("ep:api-mode", "server");
  const [apiKey, setApiKey] = useSessionPref("ep:api-key", "");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const [saveTitle, setSaveTitle] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [experiments, setExperiments] = useState(EMPTY_LIST);
  const [liveMessage, setLiveMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const rowIdRef = useRef(1);
  const stepIdRef = useRef(0);
  const libraryRef = useRef({});
  const lookupRef = useRef(null);
  const latest = useRef({});

  // 동작들이 항상 최신 값을 읽도록 매 렌더 뒤에 갱신한다 (동작 함수는 모양이 바뀌지 않게 둔다)
  useEffect(() => {
    latest.current = { methodText, scaleFactor, sigFigs, reagents, timeline, mwMap, apiMode, apiKey, saveTitle, currentId, user: auth.user, userId };
  });

  const notify = useCallback((message) => setLiveMessage(message), []);
  const newRowId = useCallback(() => ++rowIdRef.current, []);
  const newStepId = useCallback(() => ++stepIdRef.current, []);
  const markReached = useCallback((n) => setReached((r) => Math.max(r, n)), []);

  const hasWork =
    methodText.trim() !== "" ||
    reagents.some((r) => r.name.trim() || r.concentration.trim() || r.volume.trim()) ||
    timeline.length > 0;

  // 처음 열 때 이전에 하던 작업을 복원한다
  useEffect(() => {
    const draft = loadDraft(sessionStore());
    Promise.resolve().then(() => {
      if (draft) {
        setMethodText(draft.methodText);
        rowIdRef.current = Math.max(1, ...draft.reagents.map((r) => r.id));
        setReagents(draft.reagents.length > 0 ? draft.reagents : [emptyRow(1)]);
        stepIdRef.current = Math.max(0, ...draft.timeline.map((s) => s.id));
        setTimeline(draft.timeline);
        setSigFigs(draft.sigFigs);
        setScaleFactor(draft.scaleFactor);
        setSaveTitle(draft.saveTitle);
        setMwMap(draft.mwMap);
        setAnalysisMeta(draft.analysisMeta);
        setReached(draft.reached);
        setCurrentId(draft.currentId);
      }
      setHydrated(true);
    });
  }, []);

  // 바뀔 때마다 잠깐 기다렸다가 임시 보관한다. 할 일이 아무것도 없으면 보관한 것도 지운다.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      const store = sessionStore();
      if (!hasWork) return clearDraft(store);
      saveDraft(store, {
        step: reached,
        reached,
        currentId,
        methodText,
        scale: scaleFactor,
        customScale: "",
        scaleFactor,
        sigFigs,
        saveTitle,
        reagents,
        timeline,
        mwMap,
        analysisMeta,
      });
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, hasWork, reached, currentId, methodText, scaleFactor, sigFigs, saveTitle, reagents, timeline, mwMap, analysisMeta]);

  // 로그인하면 내 시약 목록(저장해 둔 분자량)을 불러와, 이후 계산에서 PubChem 조회 없이 재사용한다
  useEffect(() => {
    if (!userId) return;
    let active = true;
    listUserReagents(getSupabase())
      .then((rows) => {
        if (!active) return;
        libraryRef.current = libraryToMwMap(rows);
        setMwMap((prev) => mergeLibrary(prev, libraryRef.current));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const resetWork = useCallback(() => {
    rowIdRef.current = 1;
    stepIdRef.current = 0;
    setMethodText("");
    setReagents([emptyRow(1)]);
    setTimeline([]);
    setMwMap({ ...libraryRef.current });
    setAnalysisMeta(null);
    setAnalyzeError(null);
    setScaleFactor(1);
    setSaveTitle("");
    setCurrentId(null);
    setSaveStatus(null);
    setReached(1);
    clearDraft(sessionStore());
  }, []);

  /** 글에서 시약과 단계를 읽어 낸다. 성공하면 true (이동은 화면이 한다) */
  const analyze = useCallback(async ({ force = false } = {}) => {
    const { methodText: raw, apiMode: mode, apiKey: key } = latest.current;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    notify("AI가 분석하는 중이에요. 잠시만 기다려 주세요.");
    try {
      const text = raw.trim();
      if (!text) throw new ExtractError("empty", { message: "분석할 텍스트를 먼저 붙여넣어 주세요." });
      const hash = await hashText(text);
      let data = force ? null : loadCachedExtraction(hash);
      const fromCache = Boolean(data);

      if (!data) {
        const limit = mode === "own" ? MAX_CHARS_OWN_KEY : MAX_CHARS_SERVER;
        if (text.length > limit) {
          throw new ExtractError("too-long", {
            message: `한 번에 ${limit.toLocaleString("ko-KR")}자까지 분석할 수 있어요 (현재 ${text.length.toLocaleString("ko-KR")}자).`,
          });
        }
        if (mode === "own") {
          const k = key.trim();
          if (k.length < 20 || /\s/.test(k)) throw new ExtractError("auth", { message: "Gemini API 키를 입력해 주세요." });
          data = await extractViaOwnKey(k, text);
        } else {
          data = await extractViaServer(text);
        }
        saveCachedExtraction(hash, data);
      }

      const extractedReagents = (data.reagents || []).map((r, i) => ({
        id: i + 1,
        name: r.name || "",
        concentration: r.concentration || "",
        volume: r.volume || "",
      }));
      rowIdRef.current = extractedReagents.length;
      setReagents(extractedReagents.length > 0 ? extractedReagents : [emptyRow(1)]);

      const extractedSteps = (data.steps || []).map((s, i) => ({
        id: i + 1,
        label: s.label || "",
        duration: s.duration || "",
        repeat: s.repeat || 1,
        details: s.details || "",
        isWaiting: Boolean(s.isWaiting),
      }));
      stepIdRef.current = extractedSteps.length;
      setTimeline(extractedSteps);

      setAnalysisMeta({ fromCache, model: data.model || "" });
      if (!force) {
        // 새로 분석하면 새 실험이다. 불러왔던 실험을 덮어쓰지 않도록 연결을 끊는다.
        setCurrentId(null);
        setSaveStatus(null);
        setSaveTitle("");
      }
      // 새 분석 결과는 아직 계산 전이므로 결과 단계로 곧장 가는 길은 닫는다
      setReached(2);
      notify(`분석을 마쳤어요. 시약 ${extractedReagents.length}개와 실행 단계 ${extractedSteps.length}개를 찾았어요.`);
      return true;
    } catch (err) {
      setAnalyzeError({ message: err.message || "분석 중 오류가 발생했습니다.", kind: err.kind });
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  }, [notify]);

  /** 분자량이 필요한 시약만 조회한다(내 시약 목록에 있으면 조회하지 않는다). 동시에 여러 번 불려도 한 번만 조회한다. */
  const prepareResults = useCallback((list) => {
    if (lookupRef.current) return lookupRef.current;
    const run = async () => {
      const { reagents: current, mwMap: map, userId: uid } = latest.current;
      setIsCalculating(true);
      try {
        const targets = namesNeedingLookup(list ?? current, map);
        if (targets.length === 0) return;
        notify("시약의 분자량을 조회하는 중이에요.");
        const found = await Promise.all(
          targets.map(async ({ key, name }) => {
            try {
              const res = await fetch(`/api/mw?name=${encodeURIComponent(name)}`);
              const data = await res.json();
              return { key, name, entry: res.ok ? { mw: data.mw, formula: data.formula, source: "pubchem" } : { notFound: true } };
            } catch {
              return { key, name, entry: { notFound: true } };
            }
          }),
        );
        setMwMap((prev) => ({ ...prev, ...Object.fromEntries(found.map((f) => [f.key, f.entry])) }));
        if (uid) {
          const hits = found
            .filter((f) => f.entry.mw)
            .map((f) => ({ key: f.key, name: f.name, mw: f.entry.mw, formula: f.entry.formula, source: "pubchem" }));
          // 내 시약 목록에 이미 있던 값(직접 입력)은 PubChem 값으로 덮지 않는다
          for (const h of hits) {
            libraryRef.current[h.key] ??= { mw: h.mw, formula: h.formula, source: "pubchem" };
          }
          saveUserReagents(getSupabase(), uid, hits).catch(() => {});
        }
      } finally {
        setIsCalculating(false);
        lookupRef.current = null;
      }
    };
    lookupRef.current = run();
    return lookupRef.current;
  }, [notify]);

  /** 사용자가 분자량을 직접 입력한다. 로그인 상태면 내 시약 목록에도 저장한다. */
  const setMw = useCallback((name, mw) => {
    const { key, clean } = normalizeName(name);
    if (!key) return Promise.resolve();
    setMwMap((prev) => ({ ...prev, [key]: { mw, source: "user" } }));
    notify(`${clean || name}의 분자량을 ${mw} g/mol로 적용했어요.`);
    const uid = latest.current.userId;
    if (!uid) return Promise.resolve();
    libraryRef.current = { ...libraryRef.current, [key]: { mw, source: "user" } };
    return saveUserReagents(getSupabase(), uid, [{ key, name: clean || name, mw, source: "user" }], { overwrite: true }).catch(() => {});
  }, [notify]);

  const loadExperiments = useCallback(async () => {
    setExperiments((s) => ({ ...s, loading: true, error: "" }));
    try {
      setExperiments({ items: await listExperiments(getSupabase()), loading: false, error: "", loaded: true });
    } catch (err) {
      setExperiments({ items: [], loading: false, error: friendlyDbError(err), loaded: true });
    }
  }, []);

  const save = useCallback(async (asNew = false) => {
    const L = latest.current;
    if (!L.user) return false;
    setSaveStatus({ kind: "saving" });
    try {
      const title = L.saveTitle.trim() || defaultTitle();
      const record = toRecord({ title, methodText: L.methodText, reagents: L.reagents, steps: L.timeline, scaleFactor: L.scaleFactor, sigFigs: L.sigFigs, mwMap: L.mwMap });
      const saved = await saveExperiment(getSupabase(), L.user.id, record, asNew ? null : L.currentId);
      setCurrentId(saved.id);
      setSaveTitle(title);
      const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      setSaveStatus({ kind: "saved", message: `저장했어요 · ${time}` });
      setExperiments((s) => (s.loaded ? { ...s, loaded: false } : s));
      return true;
    } catch (err) {
      setSaveStatus({ kind: "error", message: friendlyDbError(err) });
      return false;
    }
  }, []);

  /** 저장해 둔 실험을 불러와 작업 상태로 만든다. 성공하면 true (결과 화면으로 가는 건 화면이 한다) */
  const openExperiment = useCallback(async (id) => {
    setExperiments((s) => ({ ...s, error: "" }));
    try {
      const exp = fromRecord(await loadExperiment(getSupabase(), id));
      setMethodText(exp.methodText);
      rowIdRef.current = Math.max(1, exp.reagents.length);
      setReagents(exp.reagents.length > 0 ? exp.reagents : [emptyRow(1)]);
      stepIdRef.current = exp.steps.length;
      setTimeline(exp.steps);
      setScaleFactor(exp.scaleFactor);
      setSigFigs(exp.sigFigs);
      setSaveTitle(exp.title);
      setCurrentId(exp.id);
      setSaveStatus(null);
      setAnalysisMeta(null);
      setAnalyzeError(null);
      await prepareResults(exp.reagents);
      setReached(3);
      return true;
    } catch (err) {
      setExperiments((s) => ({ ...s, error: friendlyDbError(err) }));
      return false;
    }
  }, [prepareResults]);

  const removeExperiment = useCallback(async (id) => {
    try {
      await deleteExperiment(getSupabase(), id);
      setCurrentId((cur) => (cur === id ? null : cur));
      await loadExperiments();
      notify("실험을 삭제했어요.");
      return true;
    } catch (err) {
      setExperiments((s) => ({ ...s, error: friendlyDbError(err) }));
      return false;
    }
  }, [loadExperiments, notify]);

  const authSignOut = auth.signOut;
  const signOut = useCallback(async () => {
    try {
      await authSignOut();
    } catch {}
    libraryRef.current = {};
    setMwMap({});
    setExperiments(EMPTY_LIST);
    setCurrentId(null);
    setSaveStatus(null);
    notify("로그아웃했어요.");
  }, [authSignOut, notify]);

  const value = {
    // 계정
    auth: { configured: auth.configured, ready: auth.ready, user: auth.user, signIn: auth.signIn, signUp: auth.signUp },
    signOut,
    // 입력과 결과
    methodText, setMethodText,
    scaleFactor, setScaleFactor,
    sigFigs, setSigFigs,
    reagents, setReagents,
    timeline, setTimeline,
    mwMap,
    analysisMeta,
    reached, markReached,
    apiMode, setApiMode,
    apiKey, setApiKey,
    hasWork,
    hydrated,
    newRowId, newStepId,
    // 동작
    analyze, isAnalyzing, analyzeError,
    prepareResults, isCalculating,
    setMw,
    resetWork,
    // 저장
    saveTitle, setSaveTitle, currentId, saveStatus, save,
    experiments, loadExperiments, openExperiment, removeExperiment,
    // 알림(화면 낭독기용)
    liveMessage, notify,
  };

  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>;
}

export function useExperiment() {
  const value = useContext(ExperimentContext);
  if (!value) throw new Error("useExperiment 는 ExperimentProvider 안에서만 쓸 수 있어요.");
  return value;
}
