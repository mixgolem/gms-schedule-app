import { Shift, ShiftType, ShiftLeaveUsage } from "./types";
import { parseLocalDate } from "./dateUtils";
import { computeShiftDisplay } from "./shiftDisplay";

export function countByTypeForDate(
  shifts: Shift[],
  workDate: string,
  shiftType: ShiftType
): number {
  return shifts.filter(
    (s) => s.work_date === workDate && s.shift_type === shiftType
  ).length;
}

const WORK_TYPES: ShiftType[] = ["dawn", "day", "night"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CONSECUTIVE_WORK_LIMIT = 7;

function buildLeaveUsageMap(leaveUsages: ShiftLeaveUsage[]): Map<string, ShiftLeaveUsage[]> {
  const map = new Map<string, ShiftLeaveUsage[]>();
  for (const u of leaveUsages) {
    const key = `${u.employee_id}_${u.work_date}`;
    const arr = map.get(key) ?? [];
    arr.push(u);
    map.set(key, arr);
  }
  return map;
}

// 새벽/주간/야간이어도 그 시간 전체를 연차·대휴·기타로 써서 실제로는 출근하지 않은 날은
// "실제 근무"로 치지 않는다(연속근무일수·야간→새벽 연속 체크 등에서 제외).
function isActuallyWorked(shift: Shift, leaveUsageMap: Map<string, ShiftLeaveUsage[]>): boolean {
  if (!WORK_TYPES.includes(shift.shift_type)) return false;
  const usages = leaveUsageMap.get(`${shift.employee_id}_${shift.work_date}`) ?? [];
  return !computeShiftDisplay(shift, usages).isFullyOnLeave;
}

// 근무자별로 새벽/주간/야간 근무(대휴·연차·휴무는 물론, 근무시간 전체를 연차/대휴/기타로
// 써서 실제로는 출근하지 않은 날도 제외)가 하루도 안 빠지고 7일 이상 이어지는 날짜들을 찾아
// `${employeeId}_${workDate}` 키 집합으로 돌려준다. shifts는 화면에 로드된 범위 전체(달력
// 앞뒤로 삐져나온 날짜 포함)를 넘겨야 경계에서 놓치는 일이 없다.
export function findConsecutiveWorkStreaks(
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[] = []
): Set<string> {
  const leaveUsageMap = buildLeaveUsageMap(leaveUsages);
  const byEmployee = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!isActuallyWorked(s, leaveUsageMap)) continue;
    const set = byEmployee.get(s.employee_id) ?? new Set<string>();
    set.add(s.work_date);
    byEmployee.set(s.employee_id, set);
  }

  const flagged = new Set<string>();

  for (const [employeeId, dateSet] of byEmployee) {
    const dates = [...dateSet].sort();
    let streak: string[] = [];

    const flushStreak = () => {
      if (streak.length >= CONSECUTIVE_WORK_LIMIT) {
        for (const d of streak) flagged.add(`${employeeId}_${d}`);
      }
    };

    for (const date of dates) {
      const prev = streak[streak.length - 1];
      const isConsecutive =
        prev !== undefined &&
        Math.round((parseLocalDate(date).getTime() - parseLocalDate(prev).getTime()) / MS_PER_DAY) === 1;

      if (isConsecutive) {
        streak.push(date);
      } else {
        flushStreak();
        streak = [date];
      }
    }
    flushStreak();
  }

  return flagged;
}

// 야간 근무(15:00~24:00) 다음날 바로 새벽 근무(06:30~)가 이어지면 쉬는 시간이 너무 짧다.
// 그런 경우 야간일과 다음날 새벽일 둘 다 `${employeeId}_${workDate}` 키로 돌려준다.
// (근무시간 전체를 연차/대휴/기타로 써서 실제로는 출근하지 않은 날은 제외)
export function findNightThenDawnPairs(
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[] = []
): Set<string> {
  const leaveUsageMap = buildLeaveUsageMap(leaveUsages);
  const byEmployee = new Map<string, { date: string; type: "night" | "dawn" }[]>();
  for (const s of shifts) {
    if (s.shift_type !== "night" && s.shift_type !== "dawn") continue;
    if (!isActuallyWorked(s, leaveUsageMap)) continue;
    const arr = byEmployee.get(s.employee_id) ?? [];
    arr.push({ date: s.work_date, type: s.shift_type });
    byEmployee.set(s.employee_id, arr);
  }

  const flagged = new Set<string>();

  for (const [employeeId, entries] of byEmployee) {
    entries.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < entries.length - 1; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      if (cur.type !== "night" || next.type !== "dawn") continue;
      const diffDays = Math.round(
        (parseLocalDate(next.date).getTime() - parseLocalDate(cur.date).getTime()) / MS_PER_DAY
      );
      if (diffDays === 1) {
        flagged.add(`${employeeId}_${cur.date}`);
        flagged.add(`${employeeId}_${next.date}`);
      }
    }
  }

  return flagged;
}

// 새벽/야간은 2인1조가 원칙이라 2명이 아니면 경고 메시지를 반환한다 (저장은 막지 않음).
export function checkPairRule(
  shifts: Shift[],
  workDate: string,
  shiftType: ShiftType
): string | null {
  if (shiftType !== "dawn" && shiftType !== "night") return null;

  const count = countByTypeForDate(shifts, workDate, shiftType);
  if (count !== 2) {
    const label = shiftType === "dawn" ? "새벽" : "야간";
    return `${workDate} ${label} 근무자가 ${count}명입니다. (2인1조 원칙 미충족)`;
  }
  return null;
}
