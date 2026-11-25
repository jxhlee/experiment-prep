"use client";

import { useRef, useState } from "react";
import { autoSelect, joinSections, textForPages } from "../../lib/pdf-text.mjs";
import { readPdfMethods } from "../../lib/pdf-read.mjs";
import { Icon } from "../icons";
import { Alert, Badge, Button, inputClass } from "../ui";
import { focusSoon } from "./focus";

const fmt = (n) => n.toLocaleString("ko-KR");
const pagesLabel = (s) => (s.firstPage ? (s.lastPage > s.firstPage ? `${s.firstPage}~${s.lastPage}쪽` : `${s.firstPage}쪽`) : "");
const IDLE = { phase: "idle", progress: "", error: "", result: null, selected: [], range: { from: "1", to: "1" }, open: false, applied: "" };

/**
 * 논문 PDF 에서 Methods 를 가져오는 동작과 화면.
 * 파일은 서버로 보내지 않고 이 브라우저에서만 읽는다. 읽은 결과가 한도 안에 다 들어오면 바로 입력칸에 넣고,
 * 아니면 구간(소제목 단위)을 고르는 화면을 연다. Methods 를 못 찾으면 쪽 범위를 직접 고르게 한다.
 *
 * 반환: { fileInput, openPicker, busy, dragging, dropProps, panel }
 *   fileInput  숨겨 둔 <input type=file>   openPicker  파일 고르는 창을 연다   panel  상태·선택 화면
 */
export function usePdfImport({ limit, ownKey, methodText, setMethodText, notify }) {
  const fileRef = useRef(null);
  const [st, setSt] = useState(IDLE);
  const [dragging, setDragging] = useState(false);

  const busy = st.phase === "reading";
  const hasText = methodText.trim() !== "";

  function put(text, applied) {
    setMethodText(text);
    setSt((s) => ({ ...s, open: false, applied }));
    notify("PDF에서 글을 가져왔어요.");
    focusSoon("method-text");
  }

  async function readFile(file) {
    if (!file || busy) return;
    setSt({ ...IDLE, phase: "reading" });
    try {
      const r = await readPdfMethods(file, { onProgress: (n, total) => setSt((s) => ({ ...s, progress: `${n}/${total}쪽` })) });
      const all = r.sections.map((x) => x.id);
      const allText = joinSections(r.sections, all);
      const fits = r.found === true && allText.length > 0 && allText.length <= limit && r.warnings.length === 0;
      const overwrites = hasText && methodText.trim() !== allText.trim();
      const base = { ...IDLE, phase: "ready", result: r, selected: autoSelect(r.sections, limit), range: r.firstPage ? { from: String(r.firstPage), to: String(r.lastPage) } : { from: "1", to: String(Math.min(r.totalPages, 3)) } };

      if (fits && !overwrites) {
        setSt({ ...base, applied: describe(r, all) });
        setMethodText(allText);
        notify("PDF에서 글을 가져왔어요.");
        focusSoon("method-text");
      } else {
        setSt({ ...base, open: true });
        notify(r.found ? "PDF를 읽었어요. 가져올 부분을 골라 주세요." : "PDF를 읽었지만 Methods를 찾지 못했어요. 쪽을 직접 골라 주세요.");
        focusSoon("pdf-panel-title");
      }
    } catch (err) {
      setSt({ ...IDLE, phase: "error", error: err.message || "PDF를 읽지 못했어요." });
    }
  }

  const describe = (r, ids) => {
    const picked = r.sections.filter((x) => ids.includes(x.id));
    const first = Math.min(...picked.map((x) => x.firstPage));
    const last = Math.max(...picked.map((x) => x.lastPage));
    const where = Number.isFinite(first) ? `${first === last ? `${first}쪽` : `${first}~${last}쪽`}, ` : "";
    const chars = joinSections(r.sections, ids).length;
    return `${r.found === "guess" ? "실험 조작으로 보이는 글" : "「Methods」로 보이는 부분"}을 가져왔어요 (${where}구간 ${picked.length}개, ${fmt(chars)}자).`;
  };

  const toggle = (id) =>
    setSt((s) => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] }));

  const dropProps = {
    onDragOver: (e) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
    },
    onDrop: (e) => {
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      readFile(file);
    },
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/pdf,.pdf"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // 같은 파일을 다시 골라도 읽도록
        readFile(file);
      }}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  const r = st.result;
  const picked = r ? joinSections(r.sections, st.selected) : "";
  const range = r ? textForPages(r.pageTexts, st.range.from, st.range.to) : { text: "", from: 1, to: 1 };
  const replaceNote = hasText && methodText.trim() !== picked.trim();
  const over = (n) => n > limit;

  const overHint = ownKey
    ? `한도(${fmt(limit)}자)를 넘었어요. 구간을 더 줄여 주세요.`
    : `한도(${fmt(limit)}자)를 넘었어요. 구간을 줄이거나 「내 Gemini 키」(30,000자까지)를 쓰세요.`;

  const panel = (
    <div className="mt-3 flex flex-col gap-3">
      {/* 읽는 중 문구만 상태 영역으로 두어, 선택 화면의 체크박스가 바뀔 때마다 전체를 다시 읽지 않게 한다 */}
      <div role="status" aria-live="polite" aria-busy={busy}>
        {st.phase === "reading" && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Icon name="file" size={16} />
            PDF를 읽는 중이에요… {st.progress}
          </p>
        )}
      </div>

      {st.phase === "error" && (
        <Alert kind="error">{st.error}</Alert>
      )}

      {st.phase === "ready" && !st.open && st.applied && (
        <p className="text-sm text-ink-muted">
          {st.applied} 맞는지 확인하고, 필요 없는 부분은 지워 주세요.{" "}
          <button
            type="button"
            className="text-accent underline underline-offset-4 hover:no-underline"
            onClick={() => {
              setSt((s) => ({ ...s, open: true }));
              focusSoon("pdf-panel-title");
            }}
          >
            구간 다시 고르기
          </button>
        </p>
      )}

      {st.phase === "ready" && st.open && r && (
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <h2 id="pdf-panel-title" tabIndex={-1} className="text-[15px] font-semibold text-ink focus:outline-none focus-visible:outline-2">
            PDF에서 가져올 부분
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {r.found === true && `「Methods」로 보이는 부분을 찾았어요. (${r.totalPages}쪽 중 ${pagesLabel({ firstPage: r.firstPage, lastPage: r.lastPage })})`}
            {r.found === "guess" && "Methods 제목을 찾지 못해서, 수량과 조작이 몰려 있는 글을 골라 봤어요 (추정). 맞는지 꼭 확인해 주세요."}
            {r.found === false && "Methods나 실험 방법으로 보이는 글을 찾지 못했어요. 리뷰 논문이거나, 실험 방법이 다른 파일(보충 자료)에 있을 수 있어요. 필요한 쪽을 직접 골라 가져올 수 있어요."}
          </p>

          {r.warnings.includes("low-quality") && (
            <Alert kind="warn" className="mt-3">
              글자가 깨져 있을 수 있어요. 스캔한 문서이거나 글꼴 문제로 읽은 글이 엉망일 수 있으니, 가져온 글을 꼭 확인하거나 직접 입력해 주세요.
            </Alert>
          )}
          {r.warnings.includes("limited-pages") && (
            <Alert kind="info" className="mt-3">
              문서가 길어서 앞 {r.readPages}쪽만 읽었어요 (전체 {r.totalPages}쪽).
            </Alert>
          )}

          {r.sections.length > 0 && (
            <fieldset className="mt-3 min-w-0">
              <legend className="text-sm font-medium text-ink">구간 ({r.sections.length}개)</legend>
              <ul className="mt-1 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface px-3">
                {r.sections.map((sec) => {
                  const checked = st.selected.includes(sec.id);
                  return (
                    <li key={sec.id}>
                      <label className="flex min-h-9 cursor-pointer items-start gap-2.5 py-2 text-sm pointer-coarse:min-h-11">
                        <input type="checkbox" checked={checked} onChange={() => toggle(sec.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand pointer-coarse:h-5 pointer-coarse:w-5" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-medium text-ink">{sec.title}</span>
                          <span className="text-ink-muted">
                            {pagesLabel(sec)} · {fmt(sec.chars)}자
                          </span>
                          {sec.kind === "skip" && <Badge className="ml-2">특성 분석 · 기본 제외</Badge>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className={`mt-2 text-sm ${over(picked.length) ? "font-medium text-danger" : "text-ink-muted"}`}>
                선택 {st.selected.length}개 · {fmt(picked.length)}자 / 한도 {fmt(limit)}자
                {over(picked.length) && <span> — {overHint}</span>}
              </p>
              {replaceNote && picked.length > 0 && <p className="mt-1 text-sm text-warn-ink">지금 입력칸의 글({fmt(methodText.trim().length)}자)은 사라지고 이 글로 바뀌어요.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  aria-disabled={picked.length === 0}
                  onClick={() => picked.length > 0 && put(picked, describe(r, st.selected))}
                >
                  입력칸에 넣기
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSt((s) => ({ ...s, open: false }))}>
                  닫기
                </Button>
              </div>
            </fieldset>
          )}

          <details {...(r.sections.length === 0 ? { open: true } : {})} className="group mt-3 border-t border-line pt-1 text-sm">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-ink-muted marker:hidden hover:text-ink pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              <Icon name="chevronRight" size={14} className="transition-transform group-open:rotate-90" />
              {r.sections.length > 0 ? "쪽으로 직접 가져오기" : "쪽을 골라 가져오기"}
            </summary>
          <fieldset className="mt-1 min-w-0">
            <legend className="sr-only">가져올 쪽 범위</legend>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2">
              <div>
                <label htmlFor="pdf-from" className="block text-sm text-ink-muted">시작 쪽</label>
                <input
                  id="pdf-from"
                  type="number"
                  min="1"
                  max={r.totalPages}
                  inputMode="numeric"
                  value={st.range.from}
                  onChange={(e) => setSt((s) => ({ ...s, range: { ...s.range, from: e.target.value } }))}
                  className={`${inputClass} w-24`}
                />
              </div>
              <div>
                <label htmlFor="pdf-to" className="block text-sm text-ink-muted">끝 쪽</label>
                <input
                  id="pdf-to"
                  type="number"
                  min="1"
                  max={r.totalPages}
                  inputMode="numeric"
                  value={st.range.to}
                  onChange={(e) => setSt((s) => ({ ...s, range: { ...s.range, to: e.target.value } }))}
                  className={`${inputClass} w-24`}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                aria-disabled={range.text.length === 0}
                onClick={() => range.text.length > 0 && put(range.text, `${range.from === range.to ? `${range.from}쪽` : `${range.from}~${range.to}쪽`}의 글을 가져왔어요 (${fmt(range.text.length)}자).`)}
              >
                이 쪽의 글 넣기
              </Button>
            </div>
            <p className={`mt-1 text-sm ${over(range.text.length) ? "font-medium text-danger" : "text-ink-muted"}`}>
              {range.from}~{range.to}쪽 · {range.text.length > 0 ? `${fmt(range.text.length)}자` : "글자가 없어요"} / 한도 {fmt(limit)}자
              {over(range.text.length) && <span> — {overHint}</span>}
            </p>
          </fieldset>
          </details>
        </div>
      )}
    </div>
  );

  return {
    fileInput,
    openPicker: () => !busy && fileRef.current?.click(),
    busy,
    dragging,
    dropProps,
    panel,
  };
}
