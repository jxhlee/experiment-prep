"use client";

import { useRouter } from "next/navigation";
import { MAX_CHARS_OWN_KEY, MAX_CHARS_SERVER } from "../../lib/gemini.mjs";
import { SAMPLE_METHODS } from "../../lib/sample.mjs";
import { ScaleControl } from "../controls";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Alert, Button, Card, Disclosure, Field, PageHeader, Segmented, inputClass } from "../ui";
import { focusSoon } from "./focus";
import Stepper from "./Stepper";

// 서비스 API가 한도·혼잡으로 막혔을 때 "내 API 키"로 바꿔 보라고 안내할 오류 종류
const SUGGEST_OWN_KEY = new Set(["quota", "rate", "busy", "timeout", "too-long"]);

const fmt = (n) => n.toLocaleString("ko-KR");

export default function StepInput() {
  const router = useRouter();
  const {
    methodText, setMethodText, scaleFactor, setScaleFactor,
    analyze, isAnalyzing, analyzeError,
    apiMode, setApiMode, apiKey, setApiKey,
    hasWork, resetWork, notify,
  } = useExperiment();

  const limit = apiMode === "own" ? MAX_CHARS_OWN_KEY : MAX_CHARS_SERVER;
  const length = methodText.trim().length;
  const overLimit = length > limit;

  async function onAnalyze() {
    if (isAnalyzing) return;
    const ok = await analyze();
    if (ok) router.push("/new/review");
    else if (!methodText.trim()) focusSoon("method-text");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="새 실험"
        description="논문의 Methods를 붙여넣으면 시약과 실행 단계를 정리해요."
        actions={
          hasWork && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetWork();
                notify("작업을 비웠어요.");
                focusSoon("method-text");
              }}
            >
              <Icon name="refresh" size={16} />
              비우고 새로 시작
            </Button>
          )
        }
      />
      <Stepper step={1} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div>
          <Field id="method-text" label="논문 Methods" hint="시약과 실험 순서가 나오는 문단만 붙여넣으면 더 정확해요.">
            <textarea
              rows={16}
              value={methodText}
              onChange={(e) => setMethodText(e.target.value)}
              className={`${inputClass} resize-y py-3 leading-relaxed`}
            />
          </Field>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Button variant="ghost" size="sm" onClick={() => setMethodText(SAMPLE_METHODS)}>
              <Icon name="sparkles" size={16} />
              예시 문단 넣어 보기
            </Button>
            <p className={`text-sm ${overLimit ? "font-semibold text-danger" : "text-ink-muted"}`}>
              {fmt(length)} / {fmt(limit)}자{overLimit && " — 한도를 넘었어요"}
            </p>
          </div>
        </div>

        <Card className="flex flex-col gap-6 self-start">
          <div className="flex flex-col gap-3">
            <Segmented
              legend="AI 호출 방식"
              name="api-mode"
              value={apiMode}
              onChange={setApiMode}
              options={[
                { value: "server", label: "서비스 API" },
                { value: "own", label: "내 Gemini 키" },
              ]}
            />
            {apiMode === "server" ? (
              <div className="text-sm text-ink-muted">
                <p>하루 호출 한도가 있어 {fmt(MAX_CHARS_SERVER)}자까지 분석해요.</p>
                <Disclosure summary="자세히" className="mt-0.5">
                  막히면 다른 모델로 자동 전환하고, 같은 텍스트는 저장된 결과를 다시 써요.
                </Disclosure>
              </div>
            ) : (
              <>
                <Field id="api-key" label="Gemini API 키" hint="이 브라우저에서 Google로만 보내요. 탭을 닫으면 지워져요.">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className={inputClass}
                  />
                </Field>
                <p className="text-sm text-ink-muted">내 키의 한도로 {fmt(MAX_CHARS_OWN_KEY)}자까지 분석해요.</p>
              </>
            )}
          </div>

          <div className="border-t border-line pt-5">
            <ScaleControl id="scale-input" value={scaleFactor} onChange={setScaleFactor} />
          </div>

          <div className="border-t border-line pt-5">
            <Button size="lg" className="w-full" aria-disabled={isAnalyzing} aria-busy={isAnalyzing} onClick={onAnalyze}>
              {isAnalyzing ? "분석하는 중…" : "분석하기"}
              {!isAnalyzing && <Icon name="arrowRight" size={18} />}
            </Button>
            <p className="mt-2 text-center text-sm text-ink-muted">
              AI 없이 적으려면{" "}
              <Button variant="link" size="sm" onClick={() => router.push("/new/review")}>
                직접 입력하기
              </Button>
            </p>
            {analyzeError && (
              <Alert kind="error" className="mt-3">
                <p>{analyzeError.message}</p>
                {apiMode === "server" && SUGGEST_OWN_KEY.has(analyzeError.kind) && (
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => setApiMode("own")}>
                    내 Gemini API 키로 분석하기
                  </Button>
                )}
              </Alert>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
