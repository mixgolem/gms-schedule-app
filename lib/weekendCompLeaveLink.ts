import { supabase } from "./supabaseClient";
import { isWeekend, parseLocalDate } from "./dateUtils";

export interface WeekendCompLeaveResult {
  matchedCount: number;
  unmatchedWorkCount: number; // 짝이 되는 평일대휴를 못 찾은 주말근무일 수
  error: string | null;
}

// 주말(토/일)에 근무(새벽/주간/야간)한 날과, leave_for_date가 아직 비어있는 대휴(대)를
// 근무자별로 날짜가 가장 가까운 쌍부터 순서대로 자동 연결한다.
// - 공휴일 근무는 대체휴무시간으로 별도 관리되니 이 매핑 대상에서 제외한다.
// - 이미 leave_for_date가 채워진 대휴는 건드리지 않는다(수동으로 이미 지정한 경우 보존).
export async function linkWeekendCompLeave(
  startDate: string,
  endDate: string
): Promise<WeekendCompLeaveResult> {
  const [{ data: shiftRows, error: shiftError }, { data: holidayRows, error: holidayError }] =
    await Promise.all([
      supabase
        .from("shifts")
        .select("employee_id, work_date, shift_type, is_main, start_time, end_time, leave_for_date")
        .gte("work_date", startDate)
        .lte("work_date", endDate),
      supabase
        .from("holidays")
        .select("work_date")
        .gte("work_date", startDate)
        .lte("work_date", endDate),
    ]);

  if (shiftError) return { matchedCount: 0, unmatchedWorkCount: 0, error: shiftError.message };
  if (holidayError) return { matchedCount: 0, unmatchedWorkCount: 0, error: holidayError.message };

  const holidaySet = new Set((holidayRows ?? []).map((h) => h.work_date));
  const rows = shiftRows ?? [];

  const byEmployee = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byEmployee.get(r.employee_id) ?? [];
    arr.push(r);
    byEmployee.set(r.employee_id, arr);
  }

  type Row = (typeof rows)[number];
  const toUpdate: { row: Row; matchedWorkDate: string }[] = [];
  let unmatchedWorkCount = 0;

  for (const empRows of byEmployee.values()) {
    // 이미 다른 대휴가 원래근무일로 찜해둔 근무일은 다시 짝짓기 대상에서 빼야
    // 같은 근무일이 대휴 두 개에 중복으로 연결되는 걸 막을 수 있다.
    const alreadyClaimedWorkDates = new Set(
      empRows.filter((r) => r.shift_type === "leave" && r.leave_for_date).map((r) => r.leave_for_date!)
    );

    const workDays = empRows.filter(
      (r) =>
        (r.shift_type === "dawn" || r.shift_type === "day" || r.shift_type === "night") &&
        isWeekend(r.work_date) &&
        !holidaySet.has(r.work_date) &&
        !alreadyClaimedWorkDates.has(r.work_date)
    );
    const leaveDays = empRows.filter((r) => r.shift_type === "leave" && !r.leave_for_date);

    const remainingWork = [...workDays];
    const remainingLeave = [...leaveDays];

    // 남은 후보 중 날짜 차이가 가장 작은 쌍부터 하나씩 확정해 나간다.
    while (remainingWork.length > 0 && remainingLeave.length > 0) {
      let bestWorkIdx = -1;
      let bestLeaveIdx = -1;
      let bestDiff = Infinity;
      for (let wi = 0; wi < remainingWork.length; wi++) {
        for (let li = 0; li < remainingLeave.length; li++) {
          const diff = Math.abs(
            parseLocalDate(remainingWork[wi].work_date).getTime() -
              parseLocalDate(remainingLeave[li].work_date).getTime()
          );
          if (diff < bestDiff) {
            bestDiff = diff;
            bestWorkIdx = wi;
            bestLeaveIdx = li;
          }
        }
      }
      toUpdate.push({
        row: remainingLeave[bestLeaveIdx],
        matchedWorkDate: remainingWork[bestWorkIdx].work_date,
      });
      remainingWork.splice(bestWorkIdx, 1);
      remainingLeave.splice(bestLeaveIdx, 1);
    }

    unmatchedWorkCount += remainingWork.length;
  }

  if (toUpdate.length === 0) {
    return { matchedCount: 0, unmatchedWorkCount, error: null };
  }

  // row마다 개별 update를 보내면(과거에 겪은 문제) 요청이 몰릴 수 있어 upsert로 한 번에 묶는다.
  const { error: upsertError } = await supabase.from("shifts").upsert(
    toUpdate.map(({ row, matchedWorkDate }) => ({
      employee_id: row.employee_id,
      work_date: row.work_date,
      shift_type: row.shift_type,
      is_main: row.is_main,
      start_time: row.start_time,
      end_time: row.end_time,
      leave_for_date: matchedWorkDate,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "work_date,employee_id" }
  );

  if (upsertError) {
    // 로직상 같은 원래근무일을 두 번 짝짓지는 않지만, 혹시라도 DB의 1:1 제약에 걸리면
    // 원인을 바로 알 수 있게 안내한다.
    const message =
      upsertError.code === "23505"
        ? "대휴 원래근무일이 중복돼서 저장하지 못했어요. 다시 시도해주세요."
        : upsertError.message;
    return { matchedCount: 0, unmatchedWorkCount, error: message };
  }

  return { matchedCount: toUpdate.length, unmatchedWorkCount, error: null };
}
