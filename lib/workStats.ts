import { Employee, Shift, ShiftLeaveUsage } from "./types";
import { computeShiftDisplay } from "./shiftDisplay";

const DAILY_BASE_HOURS = 8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// 시간을 8시간=1일 기준으로 환산한 라벨("2일", "1.5일" 등)
function daysLabel(hours: number): string {
  const days = hours / DAILY_BASE_HOURS;
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

// 연차·기타는 근무시간/업무일 집계에서 아예 차감하지 않는다(하루 전부 연차·기타로
// 쉬어도 업무일로 그대로 인정). 본인 대휴 사용시간만 실제로 일을 안 한 시간으로 보고 뺀다.
function personalLeaveHoursByShiftId(leaveUsages: ShiftLeaveUsage[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const u of leaveUsages) {
    if (u.usage_type !== "personal_leave") continue;
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
// 그날 사용한 본인대휴 시간만 뺀 값을 근무시간으로 집계한다(연차·기타는 차감 없음).
// 8시간을 전부 본인대휴로 쓴 날은 실제 출근으로 치지 않는다(연차·기타는 전부 써도 업무일 인정).
export function computeMonthlyStats(
  monthDates: string[],
  employees: Employee[],
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[]
): MonthlyStatsRow[] {
  const dateSet = new Set(monthDates);
  const usageMap = personalLeaveHoursByShiftId(leaveUsages);

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

export interface WorkSummaryRow {
  employeeId: string;
  employeeName: string;
  sortOrder: number;
  scheduledDays: number; // 근무일: 새벽/주간/야간으로 잡혀 있던 날 전체(연차·본인대휴 쓴 날도 포함)
  actualWorkDays: number; // 실근무일: 그중 연차·본인대휴로 하루 전체를 쉰 날을 뺀, 실제 출근일
  totalHours: number; // 근무시간합계(일 기준 8시간, 본인대휴 사용시간만 차감·연차·기타는 차감 없음)
  avgHoursPerDay: number; // 일평균근무시간(근무시간합계 ÷ 업무일 — 연차는 8h 그대로 인정한 날수)
  dawnMainCount: number;
  nightMainCount: number;
  dawnAttendance: number;
  nightAttendance: number;
  dayAttendance: number;
  personalLeaveHours: number; // 대휴(본인대휴) 사용 시간
  personalLeaveDaysLabel: string; // 대휴 사용 일수(8시간=1일 기준)
  annualLeaveHours: number; // 연차 사용 시간
  annualLeaveDaysLabel: string; // 연차 사용 일수(8시간=1일 기준)
}

// 근무일/실근무일/근무시간/메인당직/출근 형태별/대휴·연차 사용량을 한 번에 모은 통계.
// dates에 월 하루치를 넘기면 월별, 1/1~12/31 전체를 넘기면 연간 집계가 된다 — 연차도
// (연차 내역표의 7월~6월 회계연도와 달리) 그냥 dates 범위 그대로(달력 기준 월/연도)로 집계한다.
export function computeWorkSummaryStats(
  dates: string[],
  employees: Employee[],
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[]
): WorkSummaryRow[] {
  const dateSet = new Set(dates);
  const usagesByShiftId = new Map<string, ShiftLeaveUsage[]>();
  for (const u of leaveUsages) {
    const arr = usagesByShiftId.get(u.shift_id) ?? [];
    arr.push(u);
    usagesByShiftId.set(u.shift_id, arr);
  }

  return employees.map((e) => {
    let scheduledDays = 0;
    let actualWorkDays = 0;
    let totalHours = 0;
    let dawnMainCount = 0;
    let nightMainCount = 0;
    let dawnAttendance = 0;
    let nightAttendance = 0;
    let dayAttendance = 0;
    let personalLeaveHours = 0;
    let annualLeaveHours = 0;

    for (const s of shifts) {
      if (s.employee_id !== e.id || !dateSet.has(s.work_date)) continue;
      if (s.shift_type !== "dawn" && s.shift_type !== "day" && s.shift_type !== "night") continue;

      scheduledDays += 1;

      const usages = usagesByShiftId.get(s.id) ?? [];
      let dayPersonalHours = 0;
      for (const u of usages) {
        if (u.usage_type === "personal_leave") {
          dayPersonalHours += Number(u.hours);
          personalLeaveHours += Number(u.hours);
        } else if (u.usage_type === "annual") {
          annualLeaveHours += Number(u.hours);
        }
      }

      // 근무시간합계: 하루 기본 8시간에서 그날 사용한 본인대휴 시간만 뺀다(연차·기타는 차감 없음).
      totalHours += DAILY_BASE_HOURS - dayPersonalHours;

      if (s.shift_type === "dawn" && s.is_main) dawnMainCount += 1;
      if (s.shift_type === "night" && s.is_main) nightMainCount += 1;

      // 업무일(일평균근무시간의 분모): 본인대휴로 하루 전체를 쓴 날만 제외(연차는 포함).
      if (dayPersonalHours < DAILY_BASE_HOURS) {
        if (s.shift_type === "dawn") dawnAttendance += 1;
        else if (s.shift_type === "night") nightAttendance += 1;
        else dayAttendance += 1;
      }

      // 실근무일 판정은 연차·본인대휴 사용분만 본다("기타"로 하루를 다 채운 경우는
      // 실근무일에서 빼지 않는다). computeShiftDisplay의 부분사용 시간 계산을 재사용.
      const leaveOnlyUsages = usages.filter(
        (u) => u.usage_type === "annual" || u.usage_type === "personal_leave"
      );
      const { isFullyOnLeave } = computeShiftDisplay(s, leaveOnlyUsages);
      if (!isFullyOnLeave) actualWorkDays += 1;
    }

    const attendanceDays = dawnAttendance + nightAttendance + dayAttendance;

    return {
      employeeId: e.id,
      employeeName: e.name,
      sortOrder: e.sort_order,
      scheduledDays,
      actualWorkDays,
      totalHours: round2(totalHours),
      avgHoursPerDay: attendanceDays > 0 ? round2(totalHours / attendanceDays) : 0,
      dawnMainCount,
      nightMainCount,
      dawnAttendance,
      nightAttendance,
      dayAttendance,
      personalLeaveHours: round2(personalLeaveHours),
      personalLeaveDaysLabel: daysLabel(personalLeaveHours),
      annualLeaveHours: round2(annualLeaveHours),
      annualLeaveDaysLabel: daysLabel(annualLeaveHours),
    };
  });
}

export interface WeeklyHoursRow {
  employeeId: string;
  employeeName: string;
  hours: number;
}

// 월~일 한 주 동안의 순 근무시간(본인대휴 사용시간만 차감, 연차·기타는 차감 없음) 합계
export function computeWeeklyHours(
  weekDates: string[],
  employees: Employee[],
  shifts: Shift[],
  leaveUsages: ShiftLeaveUsage[]
): WeeklyHoursRow[] {
  const dateSet = new Set(weekDates);
  const usageMap = personalLeaveHoursByShiftId(leaveUsages);

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
