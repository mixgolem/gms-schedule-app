// Supabase 무료 플랜은 약 7일간 활동이 없으면 프로젝트를 일시정지한다. 그래서 Vercel 예약
// 작업(vercel.json의 crons)이 매일 이 주소를 불러 DB에 아주 가벼운 조회를 한 번 보낸다.
// 비로그인(anon) 조회라 권한(RLS) 때문에 데이터는 하나도 안 나오지만, DB까지 요청이 가므로
// "활동"으로 잡힌다. Vercel에 CRON_SECRET 환경변수를 넣어두면 Vercel 예약 작업만 부를 수 있다.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ ok: false, error: "Supabase 환경변수 없음" }, { status: 500 });
  }

  const started = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/shift_type_defaults?select=shift_type&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
    });
    const ms = Date.now() - started;
    return Response.json({ ok: res.ok, status: res.status, ms }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
