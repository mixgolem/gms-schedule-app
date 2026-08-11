import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { LeaveUsageType } from "./types";

const USAGE_LABELS: Record<LeaveUsageType, string> = {
  annual: "연차",
  personal_leave: "본인 대휴",
  other: "기타",
};

// 수기 입력값(대휴 발생/사용누적, 연차 할당)과 연차/대휴/기타 사용내역을 전부 모아
// 하나의 엑셀 파일로 내보낸다. resetMonth는 shifts만 지우지만, 만약을 대비한 백업용.
export async function exportBackupToExcel() {
  const [
    { data: employees },
    { data: compMonthly },
    { data: compSummary },
    { data: annualAlloc },
    { data: leaveUsage },
  ] = await Promise.all([
    supabase.from("employees").select("id, name").order("sort_order"),
    supabase.from("comp_leave_monthly").select("employee_id, year, month, hours"),
    supabase.from("comp_leave_summary").select("employee_id, fiscal_year, used_hours"),
    supabase.from("annual_leave_allocation").select("employee_id, year, allocated_hours"),
    supabase
      .from("shift_leave_usage")
      .select("employee_id, work_date, usage_type, hours, start_time, end_time")
      .order("work_date"),
  ]);

  const nameMap = new Map((employees ?? []).map((e) => [e.id, e.name]));
  const nameOf = (id: string) => nameMap.get(id) ?? id;

  const wb = XLSX.utils.book_new();

  const compMonthlyRows = (compMonthly ?? [])
    .map((r) => ({ 이름: nameOf(r.employee_id), 연도: r.year, 월: r.month, 발생시간: Number(r.hours) }))
    .sort((a, b) => a.이름.localeCompare(b.이름) || a.연도 - b.연도 || a.월 - b.월);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(compMonthlyRows),
    "대휴_월별발생(수기)"
  );

  const compSummaryRows = (compSummary ?? [])
    .map((r) => ({ 이름: nameOf(r.employee_id), 회계연도: r.fiscal_year, 사용누적시간: Number(r.used_hours) }))
    .sort((a, b) => a.이름.localeCompare(b.이름) || a.회계연도 - b.회계연도);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(compSummaryRows),
    "대휴_사용누적(수기)"
  );

  const annualRows = (annualAlloc ?? [])
    .map((r) => ({ 이름: nameOf(r.employee_id), 연도: r.year, 할당시간: Number(r.allocated_hours) }))
    .sort((a, b) => a.이름.localeCompare(b.이름) || a.연도 - b.연도);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(annualRows), "연차_할당(수기)");

  const usageRows = (leaveUsage ?? [])
    .map((r) => ({
      이름: nameOf(r.employee_id),
      날짜: r.work_date,
      구분: USAGE_LABELS[r.usage_type as LeaveUsageType] ?? r.usage_type,
      시간: Number(r.hours),
      시작시각: r.start_time?.slice(0, 5) ?? "",
      종료시각: r.end_time?.slice(0, 5) ?? "",
    }))
    .sort((a, b) => a.날짜.localeCompare(b.날짜) || a.이름.localeCompare(b.이름));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(usageRows),
    "연차대휴기타_사용내역"
  );

  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
    today.getDate()
  ).padStart(2, "0")}`;
  XLSX.writeFile(wb, `GMS_대휴연차백업_${stamp}.xlsx`);
}
