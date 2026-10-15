import { requireAdmin } from "@/lib/server/supabaseAdmin";

// 관리자 전용: 로그인 계정 목록(이메일·권한·마지막 로그인). 비밀번호 초기화 화면에서 쓴다.
export async function GET(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;

  const { data, error } = await check.admin.auth.admin.listUsers({ perPage: 200 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const users = data.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      isAdmin: u.app_metadata?.role === "admin",
      lastSignInAt: u.last_sign_in_at ?? null,
      mustChangePassword: u.user_metadata?.must_change_password === true,
      isMe: u.id === check.userId,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return Response.json({ users });
}
