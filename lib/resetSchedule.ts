import { supabase } from "./supabaseClient";

export async function countScheduleRange(
  startDate: string,
  endDate: string
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("shifts")
    .select("*", { count: "exact", head: true })
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

// 직원/공휴일/근무패턴 등은 그대로 두고, 지정한 기간의 근무표(shifts)만 전부 삭제
export async function deleteScheduleRange(
  startDate: string,
  endDate: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("shifts")
    .delete()
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (error) return { error: error.message };
  return { error: null };
}
