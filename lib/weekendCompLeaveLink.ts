import { supabase } from "./supabaseClient";
import { isWeekend, parseLocalDate } from "./dateUtils";

export interface WeekendCompLeaveResult {
  matchedCount: number;
  unmatchedWorkCount: number; // 짝이 되는 대휴를 못 찾은 주말근무일 수
  unlinkedCount: number; // 이번 계산으로 연결이 풀린(7일 초과 등) 대휴 건수
  error: string | null;
}

const MAX_DIFF_MS = 7 * 24 * 60 * 60 * 1000; // 기준일 앞뒤 7일까지만 연결

// 주말(토/일)에 근무(새벽/주간/야간)한 날과 대휴(대)를 근무자별로 날짜가 가장 가까운
// 쌍부터(단, 최대 7일 차이까지만) 순서대로 자동 연결한다.
// - 공휴일 근무는 대체휴무시간으로 별도 관리되니 이 매핑 대상에서 제외한다.
// - 지정한 기간 안의 대휴는 이미 연결돼 있었는지 상관없이 매번 처음부터 다시 계산한다.
//   그래서 7일을 넘거나 더 가까운 짝이 생기면 기존 연결도 바뀌거나 풀릴 수 있다.
// - 기간 밖에서(이전 실행이나 수동으로) 이미 대휴가 찜해둔 근무일은 건드리지 않는다.
export async function linkWeekendCompLeave(
  startDate: string,
  endDate: string
): Promise<WeekendCompLeaveResult> {
  const emptyResult = { matchedCount: 0, unmatchedWorkCount: 0, unlinkedCount: 0 };

  const [
    { data: shiftRows, error: shiftError },
    { data: holidayRows, error: holidayError },
    { data: externalClaimRows, error: externalClaimError },
  ] = await Promise.all([
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
    // 이번 기간 밖에 있는(그래서 이번 계산 대상이 아닌) 대휴가 이미 찜해둔 근무일은
    // 다시 다른 대휴에 중복으로 배정되지 않도록 미리 알아둬야 한다.
    supabase
      .from("shifts")
      .select("employee_id, work_date, leave_for_date")
      .eq("shift_type", "leave")
      .not("leave_for_date", "is", null)
      .gte("leave_for_date", startDate)
      .lte("leave_for_date", endDate),
  ]);

  if (shiftError) return { ...emptyResult, error: shiftError.message };
  if (holidayError) return { ...emptyResult, error: holidayError.message };
  if (externalClaimError) return { ...emptyResult, error: externalClaimError.message };

  const holidaySet = new Set((holidayRows ?? []).map((h) => h.work_date));
  const rows = shiftRows ?? [];
  const inRangeDates = new Set(rows.map((r) => r.work_date));

  const externalClaims = new Set(
    (externalClaimRows ?? [])
      .filter((r) => !inRangeDates.has(r.work_date)) // 자기 work_date가 이번 기간 안이면 이번에 다시 계산되니 제외
      .map((r) => `${r.employee_id}_${r.leave_for_date}`)
  );

  const byEmployee = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byEmployee.get(r.employee_id) ?? [];
    arr.push(r);
    byEmployee.set(r.employee_id, arr);
  }

  type Row = (typeof rows)[number];
  const toUpdate: { row: Row; matchedWorkDate: string | null }[] = [];
  let unmatchedWorkCount = 0;

  for (const empRows of byEmployee.values()) {
    const workDays = empRows.filter(
      (r) =>
        (r.shift_type === "dawn" || r.shift_type === "day" || r.shift_type === "night") &&
        isWeekend(r.work_date) &&
        !holidaySet.has(r.work_date) &&
        !externalClaims.has(`${r.employee_id}_${r.work_date}`)
    );
    // 이번 기간의 대휴는 기존 연결 여부와 상관없이 전부 다시 계산 대상이다.
    const leaveDays = empRows.filter((r) => r.shift_type === "leave");

    const remainingWork = [...workDays];
    const remainingLeave = [...leaveDays];
    const matchedLeaveRows = new Set<Row>();

    // 남은 후보 중 7일 이내로 날짜 차이가 가장 작은 쌍부터 하나씩 확정해 나간다.
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
          if (diff <= MAX_DIFF_MS && diff < bestDiff) {
            bestDiff = diff;
            bestWorkIdx = wi;
            bestLeaveIdx = li;
          }
        }
      }
      if (bestWorkIdx === -1) break; // 7일 이내로 남은 짝이 더 없음

      const leaveRow = remainingLeave[bestLeaveIdx];
      toUpdate.push({ row: leaveRow, matchedWorkDate: remainingWork[bestWorkIdx].work_date });
      matchedLeaveRows.add(leaveRow);
      remainingWork.splice(bestWorkIdx, 1);
      remainingLeave.splice(bestLeaveIdx, 1);
    }

    unmatchedWorkCount += remainingWork.length;

    // 이번에 짝을 못 찾은 대휴는(예전엔 연결돼 있었더라도) 연결을 해제한다.
    for (const leaveRow of leaveDays) {
      if (matchedLeaveRows.has(leaveRow)) continue;
      if (leaveRow.leave_for_date === null) continue; // 원래도 비어있었으면 건드릴 필요 없음
      toUpdate.push({ row: leaveRow, matchedWorkDate: null });
    }
  }

  if (toUpdate.length === 0) {
    return { ...emptyResult, unmatchedWorkCount, error: null };
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
    return { ...emptyResult, unmatchedWorkCount, error: message };
  }

  const matchedCount = toUpdate.filter((u) => u.matchedWorkDate !== null).length;
  const unlinkedCount = toUpdate.filter((u) => u.matchedWorkDate === null).length;
  return { matchedCount, unmatchedWorkCount, unlinkedCount, error: null };
}
