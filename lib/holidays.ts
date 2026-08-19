import { supabase } from "./supabaseClient";

// 공휴일로 새로 지정하면, 그날 주간·대휴로 잡혀있던 사람은 전부 휴무로 바꾼다
// (관련 부분사용 기록도 함께 지운다). 캘린더 날짜 클릭 토글(useSchedule.ts)과
// 공휴일 관리 모달(useHolidayManager.ts) 양쪽에서 같은 부작용을 공유해서 쓴다.
export async function convertDayAndLeaveShiftsToOff(workDate: string) {
  const { data: affected } = await supabase
    .from("shifts")
    .select("id")
    .eq("work_date", workDate)
    .in("shift_type", ["day", "leave"]);

  if (!affected || affected.length === 0) return;

  const ids = affected.map((s) => s.id);
  await supabase.from("shift_leave_usage").delete().in("shift_id", ids);
  await supabase
    .from("shifts")
    .update({
      shift_type: "off",
      is_main: false,
      start_time: null,
      end_time: null,
      leave_for_date: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
}
