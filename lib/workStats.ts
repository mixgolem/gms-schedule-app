import { Employee, Shift, ShiftLeaveUsage } from "./types";

const DAILY_BASE_HOURS = 8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function usageHoursByShiftId(leaveUsages: ShiftLeaveUsage[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const u of leaveUsages) {
    map.set(u.shift_id, (map.get(u.shift_id) ?? 0) + Number(u.hours));
  }
  return map;
}

export interface MonthlyStatsRow {
  employeeId: string;
  employeeName: string;
  sortOrder: number;
  totalHours: number;
  workDays: number;
  avgHoursPerDay: number;
  dawnMainCount: number;
  nightMainCount: number;
  dawnAttendance: number;
  nightAttendance: number;
  dayAttendance: number;
}

// 근무 기준(새벽/주간/야간)으로 출근한 날짜에 한해, 하루 기본 8시간에서
// 그날 사용한 연차/본인대휴 시간을 뺀 값을 근무시간으로 집계한다.
// 8시간을 전부 연차/대휴로 쓴 날은 실제 출근으로 치지 않는다.
export function computeMonthlyStats(
  monthDates: string[],
  employees: Employee[],
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[]
): MonthlyStatsRow[] {
  const dateSet = new Set(monthDates);
  const usageMap = usageHoursByShiftId(leaveUsages);

  return employees.map((e) => {
    let totalHours = 0;
    let dawnMainCount = 0;
    let nightMainCount = 0;
    let dawnAttendance = 0;
    let nightAttendance = 0;
    let dayAttendance = 0;

    for (const s of shifts) {
      if (s.employee_id !== e.id || !dateSet.has(s.work_date)) continue;
      if (s.shift_type !== "dawn" && s.shift_type !== "day" && s.shift_type !== "night") continue;

      const used = usageMap.get(s.id) ?? 0;
      totalHours += DAILY_BASE_HOURS - used;

      if (s.shift_type === "dawn" && s.is_main) dawnMainCount += 1;
      if (s.shift_type === "night" && s.is_main) nightMainCount += 1;

      if (used < DAILY_BASE_HOURS) {
        if (s.shift_type === "dawn") dawnAttendance += 1;
        else if (s.shift_type === "night") nightAttendance += 1;
        else dayAttendance += 1;
      }
    }

    const workDays = dawnAttendance + nightAttendance + dayAttendance;

    return {
      employeeId: e.id,
      employeeName: e.name,
      sortOrder: e.sort_order,
      totalHours: round2(totalHours),
      workDays,
      avgHoursPerDay: workDays > 0 ? round2(totalHours / workDays) : 0,
      dawnMainCount,
      nightMainCount,
      dawnAttendance,
      nightAttendance,
      dayAttendance,
    };
  });
}

export interface WeeklyHoursRow {
  employeeId: string;
  employeeName: string;
  hours: number;
}

// 월~일 한 주 동안의 순 근무시간(연차/대휴 차감 반영) 합계
export function computeWeeklyHours(
  weekDates: string[],
  employees: Employee[],
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[]
): WeeklyHoursRow[] {
  const dateSet = new Set(weekDates);
  const usageMap = usageHoursByShiftId(leaveUsages);

  return employees.map((e) => {
    let hours = 0;
    for (const s of shifts) {
      if (s.employee_id !== e.id || !dateSet.has(s.work_date)) continue;
      if (s.shift_type !== "dawn" && s.shift_type !== "day" && s.shift_type !== "night") continue;
      const used = usageMap.get(s.id) ?? 0;
      hours += DAILY_BASE_HOURS - used;
    }
    return { employeeId: e.id, employeeName: e.name, hours: round2(hours) };
  });
}
