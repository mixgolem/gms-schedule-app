import { supabase } from "./supabaseClient";
import { fetchCurrentCounts, tableConfigList } from "./fullBackupRestore";
import { TABLE_LABELS, OPERATION_LABELS, AuditOperation } from "./auditLog";

// DEV 메뉴(관리자 전용)에서 보여줄 배포·DB 상태 정보.

export const BUILD_INFO = {
  commitSha: process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA ?? "",
  commitMessage: process.env.NEXT_PUBLIC_BUILD_COMMIT_MESSAGE ?? "",
  repo: process.env.NEXT_PUBLIC_BUILD_REPO ?? "",
  env: process.env.NEXT_PUBLIC_BUILD_ENV ?? "local",
  builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
};

export const BUILD_ENV_LABELS: Record<string, string> = {
  production: "운영 서버 (Vercel)",
  preview: "미리보기 서버 (Vercel)",
  development: "개발 서버 (Vercel)",
  local: "로컬 PC",
};

// https://<ref>.supabase.co → <ref> (대시보드 바로가기 링크용)
export function supabaseProjectRef(): string | null {
  const match = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/^https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
}

export interface CommitSummary {
  sha: string;
  message: string;
  date: string;
  url: string;
}

// 저장소가 공개(public)라 로그인 없이 GitHub API로 최근 커밋을 읽는다(IP당 시간당 60회 한도).
export async function fetchRecentCommits(repo: string, count = 15): Promise<CommitSummary[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?sha=main&per_page=${count}`);
  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub 조회 한도를 넘었어요. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) throw new Error(`GitHub 조회 실패 (${res.status})`);

  const data = (await res.json()) as {
    sha: string;
    html_url: string;
    commit: { message: string; committer: { date: string } };
  }[];
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message.split("\n")[0],
    date: c.commit.committer.date,
    url: c.html_url,
  }));
}

export async function pingDatabase(): Promise<{ ms: number; error?: string }> {
  const started = performance.now();
  const { error } = await supabase.from("shift_type_defaults").select("shift_type").limit(1);
  return { ms: Math.round(performance.now() - started), error: error?.message };
}

export interface LastDbChange {
  changedAt: string;
  changedByEmail: string | null;
  summary: string;
  daysAgo: number; // 불러온 시점 기준 경과 일수
}

// 변경 이력(audit_log) 기준 마지막으로 데이터가 바뀐 시각. 근무표·공휴일·직원·부분사용
// 변경만 기록되고, 조회만 한 것은 남지 않는다.
export async function fetchLastDbChange(): Promise<LastDbChange | null> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("table_name, operation, changed_by_email, changed_at")
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    daysAgo: Math.floor((Date.now() - new Date(data.changed_at).getTime()) / (24 * 60 * 60 * 1000)),
    changedAt: data.changed_at,
    changedByEmail: data.changed_by_email,
    summary: `${TABLE_LABELS[data.table_name] ?? data.table_name} ${
      OPERATION_LABELS[data.operation as AuditOperation] ?? data.operation
    }`,
  };
}

// 앱이 쓰는 테이블·컬럼이 실제 DB에 있는지 — migration SQL을 빠뜨리고 배포한 경우를 잡는다.
// (제약조건·권한(RLS)만 바꾸는 migration은 화면에서 확인할 방법이 없어 목록에 없다.)
const SCHEMA_CHECKS: { version: string; label: string; table: string; columns: string }[] = [
  { version: "v2", label: "근무 출퇴근 시각", table: "shifts", columns: "start_time, end_time" },
  { version: "v2", label: "공휴일", table: "holidays", columns: "work_date" },
  { version: "v4", label: "대휴 원래근무일", table: "shifts", columns: "leave_for_date" },
  { version: "v4", label: "공지사항", table: "notice", columns: "id" },
  {
    version: "v5",
    label: "본인대휴 사용",
    table: "shifts",
    columns: "is_personal_leave, leave_hours",
  },
  { version: "v5", label: "대휴 월별발생/누적", table: "comp_leave_monthly", columns: "id" },
  { version: "v6", label: "연차 시간·할당", table: "annual_leave_allocation", columns: "id" },
  { version: "v6", label: "연차 사용 시간", table: "shifts", columns: "annual_hours" },
  { version: "v7", label: "근무 중 부분사용", table: "shift_leave_usage", columns: "id" },
  { version: "v8", label: "근무시간 설정", table: "shift_type_defaults", columns: "shift_type" },
  { version: "v10", label: "직원 사번", table: "employees", columns: "employee_number" },
  { version: "v11", label: "사용자별 화면 설정", table: "user_preferences", columns: "sort_mode" },
  { version: "v12", label: "근무패턴", table: "shift_patterns", columns: "id" },
  { version: "v13", label: "근무패턴 적용이력", table: "shift_pattern_applications", columns: "id" },
  { version: "v15", label: "부분사용 사유", table: "shift_leave_usage", columns: "reason" },
  { version: "v16", label: "변경 이력", table: "audit_log", columns: "id" },
  { version: "v20", label: "시간 막대 설정", table: "user_preferences", columns: "show_time_bar" },
];

export interface SchemaCheckResult {
  version: string;
  label: string;
  target: string;
  ok: boolean;
  error?: string;
}

export async function runSchemaChecks(): Promise<SchemaCheckResult[]> {
  return Promise.all(
    SCHEMA_CHECKS.map(async (c) => {
      const { error } = await supabase.from(c.table).select(c.columns).limit(0);
      return {
        version: c.version,
        label: c.label,
        target: `${c.table}(${c.columns})`,
        ok: !error,
        error: error?.message,
      };
    })
  );
}

export async function fetchRowCounts(): Promise<{ label: string; count: number }[]> {
  const [counts, audit] = await Promise.all([
    fetchCurrentCounts(),
    supabase.from("audit_log").select("*", { count: "exact", head: true }),
  ]);
  return [
    ...tableConfigList().map((c) => ({ label: c.label, count: counts[c.table] ?? 0 })),
    { label: "변경 이력", count: audit.count ?? 0 },
  ];
}
