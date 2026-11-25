// PDF 에서 읽어 낸 글자 조각들을 사람이 읽는 글로 바꾸고, 논문의 Methods(실험 방법) 부분을 찾아낸다.
// pdf.js 에 의존하지 않는 순수 함수라서, 브라우저 없이도 테스트할 수 있다. (pdf.js 를 부르는 쪽은 pdf-read.mjs)
//
// 찾는 순서: ① 'Methods'·'Experimental'·'실험 방법' 같은 제목 → ② 제목이 없으면 수량·조작 동사가 많은 문단(추정) → ③ 그래도 없으면 비워 둔다.
// Methods 는 소제목 단위의 구간(sections)으로도 나눠서, 사용자가 필요한 구간만 고를 수 있게 한다.

const METHODS_WORDS = [
  "(?:materials?|reagents?|chemicals?)\\s*(?:and|&)\\s*(?:methods?|procedures?|experiments?)",
  "experimental(?:\\s+(?:sections?|procedures?|details?|methods?|parts?|work))?",
  "(?:online\\s+|supplementary\\s+|supporting\\s+)?methods?",
  "methodology",
  "(?:실험|연구|탐구)\\s*(?:방법|과정|절차)(?:\\s*(?:및|와)\\s*(?:방법|과정|절차|결과))?",
  "실험\\s*재료(?:\\s*(?:및|와)\\s*방법)?",
  "재료\\s*(?:및|와)\\s*방법",
  "실\\s*험",
].join("|");
const METHODS_HEADING = new RegExp(`^(?:${METHODS_WORDS})$`, "i");

const END_WORDS = [
  "results?(?:\\s*(?:and|&)\\s*discussions?)?",
  "discussions?",
  "conclusions?(?:\\s+and\\s+outlook)?",
  "summary",
  "acknowledg(?:e)?ments?",
  "references?(?:\\s+and\\s+notes)?",
  "notes\\s+and\\s+references",
  "bibliography",
  "data\\s+availability(?:\\s+statement)?",
  "code\\s+availability",
  "availability\\s+of\\s+data(?:\\s+and\\s+materials)?",
  "supporting\\s+information",
  "supplementary\\s+(?:information|data|material)",
  "author\\s+(?:contributions?|information)",
  "competing\\s+(?:financial\\s+)?interests?",
  "conflicts?\\s+of\\s+interests?",
  "additional\\s+information",
  "reporting\\s+summary",
  "funding",
  "associated\\s+content",
  "appendix",
  "(?:연구|탐구|실험)?\\s*결과(?:\\s*(?:및|와)\\s*(?:고찰|분석|논의))?",
  "고찰",
  "결론(?:\\s*(?:및|와)\\s*(?:제언|고찰|한계))?",
  "(?:느낀|배운)\\s*점",
  "참고\\s*(?:문헌|자료)",
].join("|");
const END_HEADING = new RegExp(`^(?:${END_WORDS})$`, "i");
// 제목 바로 뒤에 본문이 이어 붙은 형식: "ACKNOWLEDGMENTS. We thank …", "Methods. Synthesis of …"
const RUN_IN = new RegExp(`^(${METHODS_WORDS}|${END_WORDS})\\s*[.:]\\s+(\\S.*)$`, "i");
// "Received: 27 September 2016 Accepted: 23 August 2017" 같은 논문 끝의 날짜 줄
const END_DATES = /^received\b.*\baccepted\b/i;

const normalizeKey = (line) => line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * pdf.js 가 글꼴 매핑을 못 해 내보내는 제어문자(U+0000~U+001F)는 대부분 빼기 부호('−')다. (예: "mg L\u00011" → "mg L−1")
 * 부호와 숫자 사이의 공백은 없앤다.
 */
export function cleanChars(str) {
  return String(str ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "−")
    .replace(/−\s+(?=\d)/g, "−");
}

/**
 * pdf.js 글자 조각 → 줄 목록. 조각마다 { str, x, w, h, eol }.
 * eol(줄 끝)을 줄 경계로 쓴다. 조각 사이가 벌어져 있으면 공백을 넣고, 'fi' 같은 합자 조각처럼 붙어 있으면 그대로 잇는다.
 */
export function itemsToLines(items) {
  const lines = [];
  let line = "";
  let prev = null;
  for (const item of items) {
    const str = cleanChars(item.str);
    if (str !== "") {
      if (prev) {
        const gap = item.x - (prev.x + prev.w);
        const needsSpace = gap > Math.max(0.25 * (item.h || prev.h || 8), 1) && !line.endsWith(" ") && !str.startsWith(" ");
        if (needsSpace) line += " ";
      }
      line += str;
      prev = item;
    }
    if (item.eol) {
      const text = line.replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
      line = "";
      prev = null;
    }
  }
  const tail = line.replace(/\s+/g, " ").trim();
  if (tail) lines.push(tail);
  return lines;
}

/** 쪽마다 되풀이되는 머리글·바닥글과 쪽 번호를 없앤다 */
export function dropRepeatedLines(pages) {
  const seenOnPages = new Map();
  pages.forEach((lines) => {
    for (const key of new Set(lines.filter((l) => l.length < 120).map(normalizeKey))) {
      seenOnPages.set(key, (seenOnPages.get(key) ?? 0) + 1);
    }
  });
  const threshold = Math.max(3, Math.ceil(pages.length * 0.35));
  return pages.map((lines) =>
    lines.filter((l) => !(l.length < 120 && seenOnPages.get(normalizeKey(l)) >= threshold) && !/^\d{1,4}$/.test(l)),
  );
}

/**
 * 소제목처럼 보여도 사실은 문장 조각·수식인 줄: 닫히지 않은 괄호, 동사(was·were …), 등호·특수기호가 있으면 제목이 아니다.
 * (예: "The CPD images of samples were measured by KPFM (Bruker", "Charge separation efficiency ð%Þ = ARNa")
 */
function isSentenceFragment(line) {
  if ((line.match(/\(/g) ?? []).length > (line.match(/\)/g) ?? []).length) return true;
  if (/\b(?:was|were|is|are|has|have|had)\b/i.test(line)) return true;
  if (/[=±×∼≈≥≤]/.test(line)) return true;
  const odd = line.replace(/[A-Za-z0-9가-힣\s\-–:,.'’()/&·−]/g, "");
  return odd.length >= 2;
}

/**
 * 줄 목록 → 글 덩어리 목록. 줄 끝 하이픈으로 갈라진 단어를 잇고, 문장이 끝난 짧은 줄 뒤에서 문단을 나눈다.
 * 덩어리마다 { text, heading(소제목이면 true), start, end(줄 번호) }.
 */
export function linesToBlocks(lines) {
  const body = lines.filter((l) => l.length > 0);
  const typical = median(body.map((l) => l.length));
  const blocks = [];
  let current = "";
  let startLine = 0;
  const flush = (endLine, heading = false) => {
    if (current.trim()) blocks.push({ text: current.trim(), heading, start: startLine, end: endLine });
    current = "";
  };
  const SENTENCE_END = /[.!?:。]$/;
  body.forEach((line, i) => {
    const next = body[i + 1];
    // 소제목: 짧고, 쉼표·괄호로 끝나지 않고(문장 중간이 아니고), 앞 줄이 문장으로 끝났으며, 다음 줄이 새로 시작하는 줄
    const isHeading =
      line.length < 60 &&
      !SENTENCE_END.test(line) &&
      !/[,;(\-]$/.test(line) &&
      !isSentenceFragment(line) &&
      (i === 0 || SENTENCE_END.test(body[i - 1])) &&
      Boolean(next) &&
      /^[A-Z0-9가-힣]/.test(next);
    if (isHeading) {
      flush(i - 1);
      startLine = i;
      current = line;
      flush(i, true);
      return;
    }

    if (current) {
      // "syn-" + "thesis" → "synthesis" (하이픈 앞이 글자, 다음 줄이 소문자로 시작할 때만)
      if (/[A-Za-z]-$/.test(current) && /^[a-z]/.test(line)) current = current.slice(0, -1) + line;
      else current += ` ${line}`;
    } else {
      current = line;
      startLine = i;
    }

    const short = typical > 0 && line.length < typical * 0.7;
    if (SENTENCE_END.test(line) && short && next && /^[A-Z0-9가-힣([]/.test(next)) flush(i);
  });
  flush(body.length - 1);
  return blocks;
}

/** 줄 목록 → 문단 글 목록 (linesToBlocks 의 글만) */
export function linesToParagraphs(lines) {
  return linesToBlocks(lines).map((b) => b.text);
}

const stripNumbering = (line) => line.replace(/^(?:\d{1,2}(?:\.\d{1,2})*\.?|[IVX]{1,4}\.)\s+/, "").replace(/[.:]+$/, "").trim();

/** 제목 바로 뒤에 본문이 이어 붙은 줄을 [제목, 본문] 두 줄로 나눈다 (Methods·Acknowledgments 같은 제목만) */
export function splitRunInHeadings(lines) {
  const out = [];
  for (const line of lines) {
    // 소문자로 시작하는 "method. The nucleation…"은 앞 문장의 끝이 줄바꿈으로 남은 것이지 제목이 아니다
    const m = /^[A-Z가-힣]/.test(line) ? RUN_IN.exec(line) : null;
    if (m && line.length > m[1].length + 3) out.push(m[1], m[2]);
    else out.push(line);
  }
  return out;
}

const isEndLine = (line) => (line.length <= 60 && END_HEADING.test(stripNumbering(line))) || END_DATES.test(line);

/**
 * 줄 목록에서 Methods 부분을 찾는다: 'Methods'·'Experimental' 같은 제목 줄부터 다음 큰 제목(Results·References 등) 전까지.
 * 제목 줄이 여럿이면 가장 긴 구간을 고른다. 못 찾으면 null.
 */
export function findMethodsRange(lines) {
  const starts = [];
  lines.forEach((l, i) => {
    if (l.length <= 60 && METHODS_HEADING.test(stripNumbering(l))) starts.push(i);
  });
  // 같은 끝(Results·References 같은 다음 큰 제목)을 가진 후보들을 한 묶음으로 본다.
  // 가장 끝에 가까운 제목이 진짜 시작이고, 그 앞의 후보는 그 사이 글에 실험 문단이 충분할 때만 포함한다.
  // (예: '2 Materials and methods' 아래에 '2.2 Method' 가 있으면 시약 목록이 있는 앞부분까지 포함하고,
  // 서론 쪽에 우연히 있는 'Methods' 줄은 실험 문단이 없으므로 걸러 낸다.)
  const byEnd = new Map();
  for (const start of starts) {
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (isEndLine(lines[j])) {
        end = j;
        break;
      }
    }
    byEnd.set(end, [...(byEnd.get(end) ?? []), start]);
  }
  const density = (from, to) => {
    const text = lines.slice(from, to).join(" ");
    return { score: procedureScore(text).score, per1000: (procedureScore(text).score * 1000) / Math.max(1, text.length) };
  };
  const candidates = [];
  for (const [end, group] of byEnd) {
    const sorted = [...group].sort((x, y) => x - y);
    let start = sorted[sorted.length - 1];
    for (let i = sorted.length - 2; i >= 0; i--) {
      const gap = density(sorted[i] + 1, start);
      const own = density(start + 1, end);
      if (gap.score >= 3 && gap.per1000 >= 0.25 * own.per1000) start = sorted[i];
      else break;
    }
    candidates.push({ start, end, score: density(start + 1, end).score });
  }
  // 후보가 여럿이면 실험 문단(수량·조작 동사)이 가장 많은 구간, 같으면 더 긴 구간을 고른다
  let best = null;
  for (const c of candidates) {
    if (!best || c.score > best.score || (c.score === best.score && c.end - c.start > best.end - best.start)) best = c;
  }
  return best ? { start: best.start, end: best.end } : null;
}
// ───────────────────────── 구간(소제목 단위) ─────────────────────────

// 특성 분석·계산·통계 구간은 실험 준비(시약 계량)와 거리가 멀어서 기본 선택에서 뺀다
const SKIP_TITLE =
  /characteri[sz]ations?|computational|calculations?|simulations?|\bDFT\b|density functional|statistic|data analysis|instrument|\bXRD\b|\bXPS\b|\bSEM\b|\bTEM\b|spectroscop|microscop|diffraction|특성\s*분석|분석\s*방법|통계|계산/i;
const IMPERATIVE_START =
  /^(?:add|stir|mix|heat|cool|wash|dry|filter|dissolve|place|transfer|centrifuge|incubate|dilute|weigh|prepare|take|pour|measure|record|use|then|next|after|before|finally|subsequently|typically|briefly|the|we|all|each|a|an|in|to)\b/i;

/** 문단 맨 앞의 짧은 제목("Synthesis of BiVO4:Mo. Mo-doped …")을 떼어 낸다. 본문 문장이면 null. */
export function runInTitle(text) {
  // "2.1. Photocatalysts Preparation. All reagents…" 처럼 앞에 번호가 붙어도 된다
  const m = /^(?:\d+(?:\.\d+)*\.?\s+)?([A-Z][^.!?\n]{2,80}?)\.\s+(?=[A-Z0-9(])/.exec(text);
  if (!m) return null;
  const title = m[1].trim();
  const words = title.split(/\s+/);
  if (words.length > 10) return null;
  if (/\b(?:was|were|is|are|had|has|been|be|can|could|will|would)\b/i.test(title)) return null;
  if (/\d+(?:\.\d+)?\s*(?:mmol|mol|mg|µg|μg|g|kg|ml|µl|μl|l|mm|µm|μm|m|wt%|vol%|%|°c|k|rpm|min|h|hours?|s|w|nm|kv|v|ma|hz)\b/i.test(title)) return null;
  if (IMPERATIVE_START.test(title)) return null;
  if (/[,;]\s*$/.test(title)) return null;
  return title;
}

// "Catalyst preparation and characterization"처럼 준비도 함께 다루는 구간은 빼지 않는다
const PREP_TITLE = /prepar|synthes|fabricat|deposit|reagents?|chemicals?|materials?|culture|제조|합성|준비|시약|재료/i;
const kindOf = (title) => (SKIP_TITLE.test(title) && !PREP_TITLE.test(title) ? "skip" : "prep");

/**
 * 글 덩어리 → 구간 목록. 소제목 줄이나 문단 맨 앞의 짧은 제목에서 새 구간을 시작한다.
 * 구간마다 { id, title, text, chars, kind: "prep" | "skip", firstPage, lastPage }.
 * pageOfBlock(i) 는 i 번째 덩어리가 놓인 쪽 번호.
 */
export function blocksToSections(blocks, pageOfBlock = () => 0) {
  const sections = [];
  let cur = null;
  const open = (title, firstPage) => {
    cur = { title, parts: [], firstPage, lastPage: firstPage, headingOnly: false };
    sections.push(cur);
  };
  blocks.forEach((b, i) => {
    const page = pageOfBlock(i);
    if (b.heading) {
      open(b.text, page);
      cur.parts.push(b.text);
      cur.headingOnly = true;
      return;
    }
    const title = runInTitle(b.text);
    if (title || !cur) open(title ?? "", page);
    cur.parts.push(b.text);
    cur.headingOnly = false;
    cur.lastPage = page;
  });

  // 내용 없이 제목 한 줄뿐인 구간은 다음 구간 앞에 붙인다. (예: "Catalyst preparation" 바로 뒤에 또 소제목이 오는 경우,
  // 줄마다 제목으로 잡히는 한국어 목록 글)
  const merged = [];
  let carry = null;
  for (const s of sections) {
    if (s.headingOnly) {
      carry = carry ? { parts: [...carry.parts, ...s.parts], firstPage: carry.firstPage } : { parts: [...s.parts], firstPage: s.firstPage };
      continue;
    }
    if (carry) {
      s.parts = [...carry.parts, ...s.parts];
      s.firstPage = carry.firstPage;
      carry = null;
    }
    merged.push(s);
  }
  if (carry) {
    if (merged.length) merged[merged.length - 1].parts.push(...carry.parts);
    else merged.push({ title: carry.parts[0], parts: carry.parts, firstPage: carry.firstPage, lastPage: carry.firstPage });
  }

  return merged
    .filter((s) => s.parts.some((p) => p.length > 0))
    .map((s, idx) => {
      const text = s.parts.join("\n\n");
      // 제목이 없는 구간은 글의 첫머리를 이름으로 쓴다
      const title = s.title || `${text.slice(0, 40).trim()}${text.length > 40 ? "…" : ""}` || `구간 ${idx + 1}`;
      return { id: idx, title, text, chars: text.length, kind: kindOf(title), firstPage: s.firstPage, lastPage: s.lastPage };
    });
}

/** 한도 안에서 앞쪽 구간부터 이어서 골라 담는다. 특성 분석 같은 구간(skip)은 기본에서 뺀다. 선택한 구간의 id 목록을 돌려준다. */
export function autoSelect(sections, limit) {
  const chosen = [];
  let total = 0;
  for (const s of sections) {
    if (s.kind === "skip") continue;
    const add = s.chars + (chosen.length ? 2 : 0);
    if (total + add > limit) break; // 과정이 듬성듬성해지지 않도록, 안 들어가는 구간을 만나면 거기서 멈춘다
    chosen.push(s.id);
    total += add;
  }
  // 첫 구간 하나가 한도보다 길어서 아무것도 못 골랐으면, 그 구간이라도 선택해 두고 한도를 넘었다고 알린다
  if (chosen.length === 0) {
    const first = sections.find((s) => s.kind !== "skip") ?? sections[0];
    if (first) chosen.push(first.id);
  }
  return chosen;
}
/** 고른 구간들을 글 순서대로 이어 붙인다 */
export function joinSections(sections, ids) {
  const set = new Set(ids);
  return sections.filter((s) => set.has(s.id)).map((s) => s.text).join("\n\n");
}

// ───────────────────────── 제목이 없을 때: 실험 문단 추정 ─────────────────────────

const QUANTITY =
  /\d+(?:\.\d+)?\s*(?:mmol|mol|mg|µg|μg|ng|g|kg|ml|µl|μl|l|mm|µm|μm|m|wt\s?%|vol\s?%|%|°\s?c|k|rpm|min|h|hours?|s|w|nm|kv|v|ma|hz|×\s?g|x\s?g)(?![a-z])/gi;
const PROCEDURE_VERBS =
  /\b(?:dissolved|stirred|added|heated|cooled|centrifuged|washed|dried|filtered|calcined|annealed|sonicated|incubated|diluted|mixed|prepared|synthesi[sz]ed|transferred|collected|evaporated|irradiated|titrated|autoclaved|refluxed|purchased|dispersed|precipitated|deposited|immersed|rinsed|loaded|eluted)\b|넣|녹여|녹인|섞|가열|냉각|교반|세척|여과|건조|희석|혼합|첨가|적정|원심분리|배양|제조/gi;

/** 문단이 실험 조작처럼 보이는 정도: 수량 표기와 조작 동사의 개수 */
export function procedureScore(text) {
  const quantities = (text.match(QUANTITY) ?? []).length;
  const verbs = (text.match(PROCEDURE_VERBS) ?? []).length;
  return { quantities, verbs, score: quantities + verbs };
}

// 참고문헌 줄: 번호로 시작하거나, 저자·DOI 표기가 있는데 실험 동사가 하나도 없는 짧은 글
const looksLikeReference = (text) =>
  /^\[?\d{1,3}\]?[.)]?\s+[A-Z][a-z]+,?\s+[A-Z]\./.test(text) ||
  (/\b(?:et al\.|doi:|DOI:|https?:\/\/)/.test(text) && text.length < 400 && procedureScore(text).verbs === 0);

/** 제목을 못 찾았을 때, 실험 조작이 몰려 있는 문단만 골라 구간으로 만든다. 마땅한 문단이 없으면 빈 배열. */
export function guessProcedureSections(blocks, pageOfBlock = () => 0) {
  const flags = blocks.map((b) => {
    if (b.heading || looksLikeReference(b.text)) return false;
    const { quantities, verbs, score } = procedureScore(b.text);
    const words = Math.max(1, b.text.split(/\s+/).length);
    return score >= 3 && quantities >= 1 && verbs >= 1 && score / words >= 0.04;
  });
  const strong = blocks.some((b, i) => flags[i] && procedureScore(b.text).score >= 8);
  if (flags.filter(Boolean).length < 2 && !strong) return [];

  // 이어지는 문단은 한 구간으로 묶고, 사이에 낀 짧은 문단(소제목 등)은 같이 넣는다
  const sections = [];
  let cur = null;
  let gap = 0;
  blocks.forEach((b, i) => {
    if (flags[i]) {
      if (!cur) {
        cur = { parts: [], firstPage: pageOfBlock(i), lastPage: pageOfBlock(i) };
        sections.push(cur);
      }
      cur.parts.push(b.text);
      cur.lastPage = pageOfBlock(i);
      gap = 0;
    } else if (cur && b.text.length < 80 && gap === 0 && flags.slice(i + 1, i + 3).some(Boolean)) {
      cur.parts.push(b.text);
      gap = 1;
    } else {
      cur = null;
      gap = 0;
    }
  });
  return sections.map((s, idx) => {
    const text = s.parts.join("\n\n");
    const title = `실험으로 보이는 글 ${idx + 1}`;
    return { id: idx, title, text, chars: text.length, kind: "prep", firstPage: s.firstPage, lastPage: s.lastPage };
  });
}

// ───────────────────────── 글자 품질 ─────────────────────────

const FUNCTION_WORDS = new Set(
  "the of and in to for with was were is are by at as on from that this then or into after until under over which had has be been using used".split(" "),
);

/**
 * 스캔한 문서의 OCR 글자층처럼 깨진 글인지 가늠한다.
 * odd: 보통의 글자·숫자·한글·흔한 기호가 아닌 글자의 비율.
 * functionWords: 영어 낱말 중 the·of·was 같은 기능어의 비율. 정상적인 영어 글은 높고, 깨진 글은 거의 0 이다. (영어 낱말이 많을 때만 본다)
 */
export function textQuality(text) {
  const s = String(text ?? "");
  if (s.length < 40) return { odd: 0, functionWords: 1, suspicious: false };
  const common = s.match(/[A-Za-z0-9가-힣\s.,;:()[\]%°/\-−±µμ·'"“”‘’+=×<>→_&@#*{}|?!~∼≈≥≤]/g) ?? [];
  const odd = 1 - common.length / s.length;
  const hangul = (s.match(/[가-힣]/g) ?? []).length / s.length;
  const latin = s.split(/\s+/).filter((t) => /^[A-Za-z]+[.,;:)]?$/.test(t));
  const fn = latin.length ? latin.filter((t) => FUNCTION_WORDS.has(t.toLowerCase().replace(/[^a-z]/g, ""))).length / latin.length : 1;
  const garbledEnglish = latin.length >= 40 && fn < 0.04 && hangul < 0.2;
  // 글꼴 인코딩이 맞지 않아 한글이 '!"# ()* ,#' 같은 기호 덩어리로 나오는 PDF
  const tokens = s.split(/\s+/).filter((t) => t.length >= 2);
  const symbolTokens = tokens.length ? tokens.filter((t) => /^[^A-Za-z0-9가-힣]+$/.test(t)).length / tokens.length : 0;
  return { odd, functionWords: fn, symbolTokens, suspicious: odd > 0.03 || garbledEnglish || symbolTokens > 0.06 };
}

// ───────────────────────── 전체 ─────────────────────────

/**
 * 쪽별 글자 조각 → {
 *   text(찾은 구간을 모두 이어 붙인 글, maxChars 까지), found(true: 제목으로 찾음 | "guess": 실험 문단을 추정 | false: 못 찾음),
 *   sections, truncated, pages, firstPage, lastPage, pageTexts(쪽마다 글), warnings
 * }.
 */
export function extractMethods(pageItems, { maxChars = 30000 } = {}) {
  const pageLines = dropRepeatedLines(pageItems.map(itemsToLines)).map(splitRunInHeadings);
  const lines = [];
  const pageOf = [];
  pageLines.forEach((ls, p) => ls.forEach((l) => (lines.push(l), pageOf.push(p + 1))));
  const base = { text: "", found: false, sections: [], truncated: false, pages: pageItems.length, firstPage: 0, lastPage: 0, pageTexts: [], warnings: [] };
  if (lines.length === 0) return base;

  const pageTexts = pageLines.map((ls) => linesToParagraphs(ls).join("\n\n"));
  const range = findMethodsRange(lines);

  let sections = [];
  let found = false;
  if (range) {
    const blocks = linesToBlocks(lines.slice(range.start + 1, range.end));
    sections = blocksToSections(blocks, (i) => pageOf[range.start + 1 + blocks[i].start] ?? 0);
    found = sections.length > 0;
  }
  if (!found) {
    const blocks = linesToBlocks(lines);
    sections = guessProcedureSections(blocks, (i) => pageOf[blocks[i].start] ?? 0);
    found = sections.length > 0 ? "guess" : false;
  }

  let text = "";
  let truncated = false;
  for (const sec of sections) {
    for (const p of sec.text.split("\n\n")) {
      const gap = text ? 2 : 0;
      if (text.length + gap + p.length > maxChars) {
        truncated = true;
        // 문단 하나가 한도보다 길면(짧은 줄이 없는 PDF) 문장 경계에서 잘라 넣는다
        const room = maxChars - text.length - gap;
        if (room > 300) {
          const cut = p.slice(0, room);
          const lastStop = cut.lastIndexOf(". ");
          text += (text ? "\n\n" : "") + (lastStop > 150 ? cut.slice(0, lastStop + 1) : cut);
        }
        break;
      }
      text += (text ? "\n\n" : "") + p;
    }
    if (truncated) break;
  }

  const warnings = [];
  if (textQuality(found ? text : pageTexts.join("\n\n")).suspicious) warnings.push("low-quality");
  return {
    ...base,
    text,
    found,
    sections,
    truncated,
    firstPage: sections.length ? Math.min(...sections.map((s) => s.firstPage)) : 0,
    lastPage: sections.length ? Math.max(...sections.map((s) => s.lastPage)) : 0,
    pageTexts,
    warnings,
  };
}

/** 쪽 범위(1부터, 양 끝 포함)의 글을 이어 붙인다. 범위가 이상하면 알맞게 고친다. */
export function textForPages(pageTexts, from, to) {
  const a = Math.min(Math.max(1, Math.floor(Number(from)) || 1), pageTexts.length || 1);
  const b = Math.min(Math.max(a, Math.floor(Number(to)) || a), pageTexts.length || 1);
  return { text: pageTexts.slice(a - 1, b).filter(Boolean).join("\n\n"), from: a, to: b };
}
