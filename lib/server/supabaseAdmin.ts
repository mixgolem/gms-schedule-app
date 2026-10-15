import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 서버(API 라우트) 전용. 관리자용 비밀키(service role key)는 모든 권한(RLS 무시)을 가진
// 키라서 절대 브라우저 코드에서 불러오면 안 된다 — NEXT_PUBLIC_ 이 아닌 환경변수로만 받는다.

type AdminCheck =
  | { ok: true; admin: SupabaseClient; userId: string }
  | { ok: false; response: Response };

function fail(status: number, error: string): AdminCheck {
  return { ok: false, response: Response.json({ error }, { status }) };
}

// 요청을 보낸 사람이 로그인한 관리자(app_metadata.role = 'admin')인지 확인하고, 맞으면
// 관리자용 Supabase 클라이언트를 돌려준다. 브라우저는 Authorization: Bearer <access token>을 보낸다.
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) return fail(500, "Supabase 환경변수가 없어요.");

  // 관리자인지부터 확인한다 — 관리자가 아닌 사람에게는 서버 설정 상태도 알려주지 않는다.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "로그인이 필요해요.");

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return fail(401, "로그인 정보가 만료됐어요. 다시 로그인해주세요.");
  if (data.user.app_metadata?.role !== "admin") return fail(403, "관리자만 할 수 있어요.");

  if (!serviceKey) {
    return fail(500, "서버에 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요. Vercel 환경변수에 등록해주세요.");
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { ok: true, admin, userId: data.user.id };
}
