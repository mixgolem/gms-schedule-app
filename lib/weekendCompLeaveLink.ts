import { addDays, format, startOfWeek } from "date-fns";
import { supabase } from "./supabaseClient";
import { isWeekend, parseLocalDate } from "./dateUtils";

export interface WeekendCompLeaveResult {
  matchedCount: number;
  unmatchedWorkCount: number; // 짝이 되는 대휴를 못 찾은 주말근무일 수
  unlinkedCount: number; // 이번 계산으로 연결이 풀린(주 범위 밖 등) 대휴 건수
  error: string | null;
}

// 주말 근무일 기준으로 "해당 주(월~금)"와 "다음 주(월~금)" 범위를 'yyyy-MM-dd' 문자열로 반환.
// 주는 월요일 시작 기준(startOfWeek weekStartsOn:1)으로 계산한다.
function weekdayRange(workDate: Date, weekOffset: 0 | 1): { start: string; end: string } {
  const monday = addDays(startOfWeek(workDate, { weekStartsOn: 1 }), weekOffset * 7);
  const friday = addDays(monday, 4);
  return { start: format(monday, "yyyy-MM-dd"), end: format(friday, "yyyy-MM-dd") };
}

// candidates 중 [start, end] 범위(문자열 비교, 'yyyy-MM-dd'라 사전순=날짜순) 안에 있으면서
// workDate와 날짜 차이가 가장 작은 것의 인덱스. 없으면 -1.
function findClosestInRange<T extends { work_date: string }>(
  candidates: T[],
  start: string,
  end: string,
  workDate: string
): number {
  let bestIdx = -1;
  let bestDiff = Infinity;
  const workTime = parseLocalDate(workDate).getTime();
  for (let i = 0; i < candidates.length; i++) {
    const d = candidates[i].work_date;
    if (d < start || d > end) continue;
    const diff = Math.abs(parseLocalDate(d).getTime() - workTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Supabase/PostgREST는 한 번의 select 요청에 기본 최대 1000행까지만 돌려준다. 몇 달치,
// 특히 1년 단위로 기간을 잡으면 shifts 행 수가 쉽게 1000을 넘어서, 페이지네이션 없이
// 조회하면 뒤쪽 데이터가 조용히 잘려나간다. 그 상태로 매칭을 돌리면 "이미 다른 대휴가
// 찜해둔 근무일"을 못 알아채고 다시 배정하려다 유니크 제약(23505)에 걸릴 수 있었다.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, error: null };
}

// 주말(토/일)에 근무(새벽/주간/야간)한 날과 대휴(대)를 근무자별로 날짜가 이른 순서대로
// 하나씩 연결한다. 각 주말근무일마다: ① 해당 주(월~금)에 대휴가 있으면 그중 날짜가 가장
// 가까운 것으로, ② 없으면 다음 주(월~금)에서 같은 방식으로, ③ 그래도 없으면 연결하지 않는다.
// - 공휴일 근무는 대체휴무시간으로 별도 관리되니 이 매핑 대상에서 제외한다.
// - 지정한 기간 안의 대휴는 이미 연결돼 있었는지 상관없이 매번 처음부터 다시 계산한다.
//   그래서 이번 기준으로 짝이 안 맞으면 기존 연결도 바뀌거나 풀릴 수 있다.
// - 기간 밖에서(이전 실행이나 수동으로) 이미 대휴가 찜해둔 근무일은 건드리지 않는다.
export async function linkWeekendCompLeave(
  startDate: string,
  endDate: string
): Promise<WeekendCompLeaveResult> {
  const emptyResult = { matchedCount: 0, unmatchedWorkCount: 0, unlinkedCount: 0 };

  const [
    { rows: shiftRows, error: shiftError },
    { rows: holidayRows, error: holidayError },
    { rows: externalClaimRows, error: externalClaimError },
  ] = await Promise.all([
    fetchAllRows<{
      employee_id: string;
      work_date: string;
      shift_type: string;
      is_main: boolean;
      start_time: string | null;
      end_time: string | null;
      leave_for_date: string | null;
    }>((from, to) =>
      supabase
        .from("shifts")
        .select("employee_id, work_date, shift_type, is_main, start_time, end_time, leave_for_date")
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: true })
        .order("employee_id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ work_date: string }>((from, to) =>
      supabase
        .from("holidays")
        .select("work_date")
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: true })
        .range(from, to)
    ),
    // 이번 기간 밖에 있는(그래서 이번 계산 대상이 아닌) 대휴가 이미 찜해둔 근무일은
    // 다시 다른 대휴에 중복으로 배정되지 않도록 미리 알아둬야 한다.
    fetchAllRows<{ employee_id: string; work_date: string; leave_for_date: string | null }>(
      (from, to) =>
        supabase
          .from("shifts")
          .select("employee_id, work_date, leave_for_date")
          .eq("shift_type", "leave")
          .not("leave_for_date", "is", null)
          .gte("leave_for_date", startDate)
          .lte("leave_for_date", endDate)
          .order("work_date", { ascending: true })
          .order("employee_id", { ascending: true })
          .range(from, to)
    ),
  ]);

  if (shiftError) return { ...emptyResult, error: shiftError };
  if (holidayError) return { ...emptyResult, error: holidayError };
  if (externalClaimError) return { ...emptyResult, error: externalClaimError };

  const holidaySet = new Set(holidayRows.map((h) => h.work_date));
  const rows = shiftRows;
  const inRangeDates = new Set(rows.map((r) => r.work_date));

  const externalClaims = new Set(
    externalClaimRows
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

    const remainingLeave = [...leaveDays];
    const matchedLeaveRows = new Set<Row>();

    // workDays는 이미 work_date 오름차순이라(원본 조회 정렬 유지), 이른 주말근무일부터
    // 순서대로 그 주 → 다음 주 순으로 대휴 후보를 찾아 하나씩 확정해 나간다.
    for (const work of workDays) {
      const workDateObj = parseLocalDate(work.work_date);
      const sameWeek = weekdayRange(workDateObj, 0);
      const nextWeek = weekdayRange(workDateObj, 1);

      let idx = findClosestInRange(remainingLeave, sameWeek.start, sameWeek.end, work.work_date);
      if (idx === -1) {
        idx = findClosestInRange(remainingLeave, nextWeek.start, nextWeek.end, work.work_date);
      }

      if (idx === -1) {
        unmatchedWorkCount += 1;
        continue;
      }

      const leaveRow = remainingLeave[idx];
      toUpdate.push({ row: leaveRow, matchedWorkDate: work.work_date });
      matchedLeaveRows.add(leaveRow);
      remainingLeave.splice(idx, 1);
    }

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

  const toRow = ({ row, matchedWorkDate }: (typeof toUpdate)[number]) => ({
    employee_id: row.employee_id,
    work_date: row.work_date,
    shift_type: row.shift_type,
    is_main: row.is_main,
    start_time: row.start_time,
    end_time: row.end_time,
    leave_for_date: matchedWorkDate,
    updated_at: new Date().toISOString(),
  });

  // 연결 해제(null)와 새 연결(날짜 지정)을 한 번의 upsert에 같이 넣으면, 같은 원래근무일을
  // "예전 대휴에서는 빼고 새 대휴에 붙이는" 경우 DB가 그 안에서 어떤 행부터 처리할지
  // 보장해주지 않아 일시적으로 같은 원래근무일이 두 번 잡힌 것처럼 보여 유니크 제약(23505)에
  // 걸릴 수 있다. 그래서 먼저 전부 해제(null)한 뒤, 그다음에 새 연결을 확정해서
  // 저장 시점에 항상 "먼저 비우고 나서 채우는" 순서가 되도록 나눈다.
  const clearRows = toUpdate.filter((u) => u.matchedWorkDate === null).map(toRow);
  const assignRows = toUpdate.filter((u) => u.matchedWorkDate !== null).map(toRow);

  if (clearRows.length > 0) {
    const { error } = await supabase
      .from("shifts")
      .upsert(clearRows, { onConflict: "work_date,employee_id" });
    if (error) return { ...emptyResult, unmatchedWorkCount, error: error.message };
  }

  if (assignRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("shifts")
      .upsert(assignRows, { onConflict: "work_date,employee_id" });

    if (upsertError) {
      // 로직상 같은 원래근무일을 두 번 짝짓지는 않지만, 혹시라도 DB의 1:1 제약에 걸리면
      // 원인을 바로 안내한다.
      const message =
        upsertError.code === "23505"
          ? "대휴 원래근무일이 중복돼서 저장하지 못했어요. 다시 시도해주세요."
          : upsertError.message;
      return { ...emptyResult, unmatchedWorkCount, error: message };
    }
  }

  const matchedCount = toUpdate.filter((u) => u.matchedWorkDate !== null).length;
  const unlinkedCount = toUpdate.filter((u) => u.matchedWorkDate === null).length;
  return { matchedCount, unmatchedWorkCount, unlinkedCount, error: null };
}

export interface UnlinkWeekendCompLeaveResult {
  unlinkedCount: number;
  error: string | null;
}

// 지정한 기간 안에서 대휴로 사용된(work_date 기준) 근무 기록의 "보상 원래근무일" 연결을
// 전부 해제한다. null로 비우는 건 유니크 제약(employee_id, leave_for_date)과 절대
// 충돌하지 않으니(그 인덱스가 leave_for_date is not null인 행만 대상) 굳이 미리 조회해서
// 매칭할 필요 없이 조건에 맞는 행을 한 번의 update로 바로 처리하면 된다.
export async function unlinkWeekendCompLeave(
  startDate: string,
  endDate: string
): Promise<UnlinkWeekendCompLeaveResult> {
  const { data, error } = await supabase
    .from("shifts")
    .update({ leave_for_date: null, updated_at: new Date().toISOString() })
    .eq("shift_type", "leave")
    .not("leave_for_date", "is", null)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .select("id");

  if (error) return { unlinkedCount: 0, error: error.message };
  return { unlinkedCount: data?.length ?? 0, error: null };
}
