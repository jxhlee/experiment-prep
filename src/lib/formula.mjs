// 화학식 → 원소 개수·분자량. 수화물 후보의 분자량을 손으로 적지 않고 화학식에서 계산하려고 쓴다.
// 원자량은 IUPAC 표준 원자량(시약 라벨에 쓰는 소수 셋째 자리 수준).

export const ATOMIC_WEIGHT = {
  H: 1.008, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078, Ti: 47.867, V: 50.942, Cr: 51.996,
  Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922,
  Se: 78.971, Br: 79.904, Rb: 85.468, Sr: 87.62, Zr: 91.224, Mo: 95.95, Ru: 101.07, Rh: 102.906, Pd: 106.42,
  Ag: 107.868, Cd: 112.414, In: 114.818, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.904, Cs: 132.905, Ba: 137.327,
  La: 138.905, Ce: 140.116, W: 183.84, Pt: 195.084, Au: 196.967, Hg: 200.592, Tl: 204.38, Pb: 207.2, Bi: 208.98,
};

export const WATER_MASS = 2 * ATOMIC_WEIGHT.H + ATOMIC_WEIGHT.O;

function parseGroup(s) {
  let i = 0;
  const readNumber = () => {
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  const add = (into, from, times) => {
    for (const [el, n] of Object.entries(from)) into[el] = (into[el] ?? 0) + n * times;
  };
  function group(closing) {
    const counts = {};
    while (i < s.length) {
      const c = s[i];
      if (c === "(" || c === "[") {
        i += 1;
        const inner = group(c === "(" ? ")" : "]");
        add(counts, inner, readNumber());
      } else if (c === ")" || c === "]") {
        if (c !== closing) throw new Error("괄호가 맞지 않음");
        i += 1;
        return counts;
      } else if (/[A-Z]/.test(c)) {
        let sym = c;
        i += 1;
        if (/[a-z]/.test(s[i] ?? "")) {
          sym += s[i];
          i += 1;
        }
        if (!Object.hasOwn(ATOMIC_WEIGHT, sym)) throw new Error(`모르는 원소: ${sym}`);
        counts[sym] = (counts[sym] ?? 0) + readNumber();
      } else {
        throw new Error(`해석할 수 없는 글자: ${c}`);
      }
    }
    if (closing) throw new Error("괄호가 닫히지 않음");
    return counts;
  }
  return group(null);
}

/** "MgCl2·6H2O", "K4[Fe(CN)6]·3H2O" → { Mg: 1, Cl: 2, H: 12, O: 6 }. 해석할 수 없으면 null. */
export function parseFormula(formula) {
  try {
    const cleaned = String(formula ?? "")
      .normalize("NFKC")
      .replace(/[•∙⋅・*]/g, "·")
      .replace(/\s+/g, "");
    if (!cleaned) return null;
    const total = {};
    for (const part of cleaned.split("·")) {
      const m = /^(\d+(?:\.\d+)?)?(.*)$/.exec(part);
      const times = m[1] ? Number(m[1]) : 1;
      if (!m[2]) return null;
      const counts = parseGroup(m[2]);
      for (const [el, n] of Object.entries(counts)) total[el] = (total[el] ?? 0) + n * times;
    }
    return total;
  } catch {
    return null;
  }
}

/** 화학식의 분자량(g/mol). 해석할 수 없으면 null. */
export function formulaMass(formula) {
  const counts = parseFormula(formula);
  if (!counts) return null;
  let mass = 0;
  for (const [el, n] of Object.entries(counts)) mass += ATOMIC_WEIGHT[el] * n;
  // 203.295 같은 경계값이 부동소수점 오차로 아래로 내려가지 않게 아주 작은 값을 더한다
  return Math.round((mass + 1e-9) * 100) / 100;
}

/** 결정수(·nH2O)의 n. 없으면 0. */
export function hydrateCount(formula) {
  const m = /·\s*(\d+(?:\.\d+)?)?\s*H2O\s*$/.exec(String(formula ?? "").normalize("NFKC").replace(/[•∙⋅・*]/g, "·"));
  if (!m) return 0;
  return m[1] ? Number(m[1]) : 1;
}
