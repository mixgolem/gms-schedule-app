import { randomInt } from "node:crypto";
import { requireAdmin } from "@/lib/server/supabaseAdmin";

// 헷갈리는 글자(0/O, 1/l/I)는 빼서, 관리자가 말이나 메신저로 불러줘도 틀리지 않게 한다.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

// 대문자·소문자·숫자가 최소 하나씩 들어간 10자리 임시 비밀번호
function generateTempPassword(): string {
  const all = UPPER + LOWER + DIGIT;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// 관리자 전용: 선택한 계정의 비밀번호를 임시 비밀번호로 바꾸고, 다음 로그인 때 본인이
// 새 비밀번호로 바꾸도록 표시(user_metadata.must_change_password)해 둔다.
export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;

  let userId: unknown;
  try {
    ({ userId } = await request.json());
  } catch {
    return Response.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  }
  if (typeof userId !== "string" || !userId) {
    return Response.json({ error: "어떤 계정인지 알 수 없어요." }, { status: 400 });
  }
  if (userId === check.userId) {
    return Response.json(
      { error: "본인 계정은 여기서 말고 계정 메뉴의 '비밀번호 변경'으로 바꿔주세요." },
      { status: 400 }
    );
  }

  const { data: existing, error: getError } = await check.admin.auth.admin.getUserById(userId);
  if (getError || !existing.user) {
    return Response.json({ error: "계정을 찾을 수 없어요." }, { status: 404 });
  }

  const tempPassword = generateTempPassword();
  const { error } = await check.admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
    user_metadata: { ...existing.user.user_metadata, must_change_password: true },
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ email: existing.user.email, tempPassword });
}
