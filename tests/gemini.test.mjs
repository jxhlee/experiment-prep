import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ExtractError,
  buildRequestBody,
  classifyFailure,
  endpoint,
  failureMessage,
  parseExtraction,
  parseRetryAfterSec,
} from "../src/lib/gemini.mjs";

const respond = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

test("parseExtraction: 공백 제거, 반복 횟수 보정, 배열이 아니면 빈 목록", () => {
  const r = parseExtraction(
    respond({
      reagents: [{ name: " NaCl ", concentration: "150 mM", solutionVolume: " 100 mL " }],
      steps: [
        { label: "배양", duration: "30 min", repeat: 0, details: null, isWaiting: 1 },
        { label: "세척", duration: "10 min", repeat: "3" },
      ],
    }),
  );
  assert.deepEqual(r.reagents, [{ name: "NaCl", concentration: "150 mM", volume: "100 mL" }]);
  assert.deepEqual(r.steps[0], { label: "배양", duration: "30 min", repeat: 1, details: "", isWaiting: true });
  assert.equal(r.steps[1].repeat, 3);
  assert.deepEqual(parseExtraction(respond({ reagents: "x", steps: null })), { reagents: [], steps: [] });
});

test("parseExtraction: 추론(thought) 부분은 무시하고, 해석 못 하면 bad-response", () => {
  const withThought = {
    candidates: [{ content: { parts: [{ text: "생각 중...", thought: true }, { text: JSON.stringify({ reagents: [], steps: [] }) }] } }],
  };
  assert.deepEqual(parseExtraction(withThought), { reagents: [], steps: [] });

  for (const bad of [null, {}, { candidates: [] }, { candidates: [{ content: { parts: [{ text: "not json" }] } }] }]) {
    assert.throws(() => parseExtraction(bad), (e) => e instanceof ExtractError && e.kind === "bad-response");
  }
});

test("parseRetryAfterSec / failureMessage", () => {
  assert.ok(Math.abs(parseRetryAfterSec("Please retry in 23h53m8.762830144s.") - (23 * 3600 + 53 * 60 + 8.762830144)) < 0.001);
  assert.equal(parseRetryAfterSec("retry in 12.5s"), 12.5);
  assert.equal(parseRetryAfterSec("retry in 45m"), 2700);
  assert.equal(parseRetryAfterSec("no hint here"), null);
  assert.ok(failureMessage("quota", 3 * 3600 + 120).includes("3시간 2분"));
  assert.ok(failureMessage("quota").includes("한도"));
});

test("classifyFailure: HTTP 상태를 사용자용 분류로", () => {
  assert.deepEqual(classifyFailure(429, "Please retry in 23h53m8s"), { kind: "quota", waitSec: 23 * 3600 + 53 * 60 + 8 });
  assert.equal(classifyFailure(429, "retry in 12s").kind, "rate");
  assert.equal(classifyFailure(429, "").kind, "rate");
  assert.equal(classifyFailure(503).kind, "busy");
  assert.equal(classifyFailure(500).kind, "busy");
  assert.equal(classifyFailure(403).kind, "auth");
  assert.equal(classifyFailure(400, "API key not valid. Please pass a valid API key.").kind, "auth");
  assert.equal(classifyFailure(400, "something else").kind, "other");
  assert.equal(classifyFailure(404).kind, "model");
});

test("요청 본문: 입력 텍스트(앞뒤 공백 제거)와 JSON 스키마를 담는다", () => {
  const body = buildRequestBody("  Cells were lysed.  ");
  assert.ok(body.contents[0].parts[0].text.includes('Cells were lysed.\n"""'));
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseSchema.required, ["reagents", "steps"]);
  assert.equal(endpoint("m"), "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent");
});

test("시약 양/용액 부피 분리: 농도가 없는 시약에는 용액 부피를 쓰지 않는다", () => {
  const { reagents } = parseExtraction(
    respond({
      reagents: [
        { name: "Tris-HCl", concentration: "50 mM", amount: "", solutionVolume: "100 mL" },
        { name: "Na3RhCl6", concentration: "", amount: "", solutionVolume: "100 mL" }, // 용액 부피가 시약 양으로 둔갑하면 안 된다
        { name: "ethylene glycol", concentration: "", amount: "10 mL", solutionVolume: "" },
        { name: "Bi(NO3)3·5H2O", concentration: "", amount: "1.213 g", solutionVolume: "20 mL" },
        { name: "EcoRI", amount: "20 units" },
        { name: "NaOH", concentration: "2 M", amount: "0.8 g", solutionVolume: "" }, // 용액 부피가 없으면 양을 대신 쓴다
      ],
      steps: [],
    }),
  );
  assert.deepEqual(
    reagents.map((r) => r.volume),
    ["100 mL", "", "10 mL", "1.213 g", "20 units", "0.8 g"],
  );
});
