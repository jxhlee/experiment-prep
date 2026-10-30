// Supabase 호출 모음. 클라이언트(sb)를 인자로 받아서, 가짜 클라이언트로 테스트할 수 있다.

/** Supabase 인증 오류 → 쉬운 한국어 문구 */
export function authErrorMessage(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return "메일 인증이 아직 안 됐어요. 받은 편지함의 확인 링크를 눌러 주세요.";
  if (code === "user_already_exists" || /already (been )?registered/i.test(msg)) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (code === "weak_password" || /password should be at least|weak password/i.test(msg)) return "비밀번호가 너무 짧거나 약해요. 8자 이상으로 정해 주세요.";
  if (/rate limit|too many requests/i.test(msg) || code.startsWith("over_") || error?.status === 429) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  if (code === "email_address_invalid" || code === "validation_failed" || /invalid.*email|unable to validate email/i.test(msg)) return "이메일 형식이 올바르지 않아요.";
  if (code === "signup_disabled" || /signups? (not allowed|disabled)/i.test(msg)) return "지금은 회원가입을 받지 않고 있어요.";
  if (/failed to fetch|networkerror|fetch failed|load failed/i.test(msg)) return "서버에 연결하지 못했어요. 네트워크를 확인해 주세요.";
  return "로그인/회원가입 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

/** DB 오류 → 쉬운 한국어 문구 */
export function friendlyDbError(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  if (msg.includes("저장 한도")) return msg;
  if (code === "PGRST205" || code === "42P01" || /schema cache|does not exist/i.test(msg)) return "저장소 테이블이 아직 만들어지지 않았어요. 마이그레이션 SQL을 실행해 주세요.";
  if (code === "PGRST301" || /jwt/i.test(msg)) return "로그인이 만료됐어요. 다시 로그인해 주세요.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "권한이 없어요. 다시 로그인해 주세요.";
  if (code === "23514") return "저장할 수 없는 값이 있어요 (이름·텍스트 길이 등 크기 제한).";
  if (code === "PGRST116") return "저장된 실험을 찾을 수 없어요.";
  if (/failed to fetch|networkerror|fetch failed|load failed/i.test(msg)) return "서버에 연결하지 못했어요. 네트워크를 확인해 주세요.";
  return "저장소 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function listExperiments(sb) {
  return check(
    await sb
      .from("experiments")
      .select("id, title, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(100),
  );
}

export async function loadExperiment(sb, id) {
  return check(await sb.from("experiments").select("*").eq("id", id).single());
}

/** id 가 있으면 그 실험을 덮어쓰고, 없거나(다른 곳에서 삭제됨) 처음이면 새로 저장한다 */
export async function saveExperiment(sb, userId, record, id = null) {
  if (id) {
    const updated = check(await sb.from("experiments").update(record).eq("id", id).select("id, updated_at").maybeSingle());
    if (updated) return updated;
  }
  return check(await sb.from("experiments").insert({ ...record, user_id: userId }).select("id, updated_at").single());
}

export async function deleteExperiment(sb, id) {
  check(await sb.from("experiments").delete().eq("id", id));
}

export async function listUserReagents(sb) {
  return check(await sb.from("user_reagents").select("key, name, mw, formula, source").limit(1000));
}

/**
 * 시약 분자량을 내 목록에 저장한다.
 * overwrite=false: 이미 있으면 그대로 둔다(PubChem 조회 결과) / true: 덮어쓴다(직접 입력)
 */
export async function saveUserReagents(sb, userId, entries, { overwrite = false } = {}) {
  const rows = entries
    .filter((e) => e.key && Number.isFinite(e.mw) && e.mw > 0)
    .map((e) => ({
      user_id: userId,
      key: e.key,
      name: String(e.name || e.key).slice(0, 120),
      mw: e.mw,
      formula: e.formula ? String(e.formula).slice(0, 60) : null,
      source: e.source === "user" ? "user" : "pubchem",
    }));
  if (rows.length === 0) return;
  check(await sb.from("user_reagents").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: !overwrite }));
}

/** 내 시약 목록 → 계산기가 쓰는 mwMap 형태 */
export function libraryToMwMap(rows) {
  const map = {};
  for (const r of rows ?? []) {
    const mw = Number(r.mw);
    if (r.key && Number.isFinite(mw) && mw > 0) map[r.key] = { mw, formula: r.formula ?? undefined, source: r.source };
  }
  return map;
}

/** 로그인 직후 불러온 목록을 합친다. 이번 방문에서 이미 확정된 값(조회 성공·직접 입력)은 그대로 둔다 */
export function mergeLibrary(current, library) {
  const merged = { ...current };
  for (const [key, entry] of Object.entries(library)) {
    if (!merged[key]?.mw) merged[key] = entry;
  }
  return merged;
}
