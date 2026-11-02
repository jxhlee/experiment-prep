"use client";

import { useRouter } from "next/navigation";
import { MAX_CHARS_OWN_KEY, MAX_CHARS_SERVER } from "../../lib/gemini.mjs";
import { SAMPLE_METHODS } from "../../lib/sample.mjs";
import { ScaleControl } from "../controls";
import { useExperiment } from "../ExperimentProvider";
import { Icon } from "../icons";
import { Alert, Button, Card, CardTitle, Field, PageHeader, Segmented, inputClass } from "../ui";
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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="새 실험"
        description="논문의 Methods를 붙여넣으면 시약과 실행 단계를 읽어 정리해요. 계량값과 시간은 다음 단계에서 코드가 계산해요."
        actions={
          hasWork && (
            <Button
              variant="secondary"
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card as="section" aria-labelledby="text-title">
          <CardTitle id="text-title" icon="clipboard">
            논문 Methods
          </CardTitle>
          <Field
            id="method-text"
            label="붙여넣을 텍스트"
            hint="시약과 실험 순서가 나오는 문단만 붙여넣으면 더 정확해요. 영어 원문 그대로 괜찮아요."
            className="mt-3"
          >
            <textarea
              rows={14}
              value={methodText}
              onChange={(e) => setMethodText(e.target.value)}
              className={`${inputClass} resize-y py-2.5 leading-relaxed`}
            />
          </Field>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Button variant="secondary" size="sm" onClick={() => setMethodText(SAMPLE_METHODS)}>
              <Icon name="sparkles" size={16} />
              예시 문단 넣어 보기
            </Button>
            <p className={`text-sm ${overLimit ? "font-semibold text-danger" : "text-ink-muted"}`}>
              {fmt(length)} / {fmt(limit)}자{overLimit && " — 한도를 넘었어요. 합성·준비 부분만 붙여넣어 주세요."}
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card as="section" aria-labelledby="api-title">
            <CardTitle id="api-title" icon="key">
              AI 호출 방식
            </CardTitle>
            <Segmented
              legend="AI 호출 방식"
              hideLegend
              name="api-mode"
              value={apiMode}
              onChange={setApiMode}
              className="mt-3"
              options={[
                { value: "server", label: "서비스 API" },
                { value: "own", label: "내 Gemini 키" },
              ]}
            />
            {apiMode === "server" ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                운영자의 API를 써요. 하루 호출 한도가 있어 한 번에 {fmt(MAX_CHARS_SERVER)}자까지 분석하고, 막히면 다른 모델로 자동 전환해요.
                같은 텍스트는 저장된 결과를 다시 써요.
              </p>
            ) : (
              <div className="mt-3">
                <Field
                  id="api-key"
                  label="Gemini API 키"
                  hint="이 브라우저에서 Google(Gemini)로만 보내고 우리 서버에는 보내지 않아요. 탭을 닫으면 지워져요."
                >
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className={inputClass}
                  />
                </Field>
                <p className="mt-2 text-sm text-ink-muted">내 키의 한도를 쓰므로 {fmt(MAX_CHARS_OWN_KEY)}자까지 분석할 수 있어요.</p>
              </div>
            )}
          </Card>

          <Card as="section" aria-labelledby="scale-title">
            <CardTitle id="scale-title" icon="layers">
              실험 규모
            </CardTitle>
            <div className="mt-3">
              <ScaleControl id="scale-input" value={scaleFactor} onChange={setScaleFactor} />
            </div>
          </Card>

          <div>
            <Button size="lg" className="w-full" aria-disabled={isAnalyzing} aria-busy={isAnalyzing} onClick={onAnalyze}>
              <Icon name="sparkles" size={18} />
              {isAnalyzing ? "분석하는 중…" : "분석하기"}
            </Button>
            <p className="mt-2 text-center text-sm text-ink-muted">
              AI 없이 직접 적으려면{" "}
              <Button variant="link" size="sm" onClick={() => router.push("/new/review")}>
                직접 입력하기
              </Button>
            </p>
          </div>

          {analyzeError && (
            <Alert kind="error">
              <p>{analyzeError.message}</p>
              {apiMode === "server" && SUGGEST_OWN_KEY.has(analyzeError.kind) && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => setApiMode("own")}>
                  내 Gemini API 키로 분석하기
                </Button>
              )}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
