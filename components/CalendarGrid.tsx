"use client";

import { Employee, Shift, ShiftLeaveUsage } from "@/lib/types";
import { CalendarDay, weekdayLabel, dayOfMonth, getDayColor } from "@/lib/dateUtils";
import { countByTypeForDate } from "@/lib/validation";
import { computeWeeklyHours } from "@/lib/workStats";
import ShiftCell from "./ShiftCell";

export type SortMode = "default" | "byShiftType";

interface Props {
  employees: Employee[];
  shifts: Shift[];
  leaveUsages: ShiftLeaveUsage[];
  holidayDates: Set<string>;
  weeks: CalendarDay[][];
  canEdit: boolean;
  showColors: boolean;
  filterEmployeeId: string | null; // null이면 전체 표시
  sortMode: SortMode;
  onCellClick: (employeeId: string, date: string) => void;
  onDateClick: (date: string) => void;
}

const DAY_BADGE_CLASS: Record<string, string> = {
  default: "text-gray-600 hover:bg-gray-100",
  saturday: "bg-sky-100 text-sky-700 hover:bg-sky-200",
  sunday: "bg-red-100 text-red-700 hover:bg-red-200",
  holiday: "bg-red-500 text-white hover:bg-red-600",
};

// 시간대 정렬 모드에서의 우선순위: 새벽메인 → 새벽 → 주간 → 야간 → 대휴 → 휴무 → 미배정
function shiftPriority(shift: Shift | null): number {
  if (!shift) return 6;
  switch (shift.shift_type) {
    case "dawn":
      return shift.is_main ? 0 : 1;
    case "day":
      return 2;
    case "night":
      return 3;
    case "leave":
    case "annual":
      return 4;
    case "off":
      return 5;
    default:
      return 6;
  }
}

export default function CalendarGrid({
  employees,
  shifts,
  leaveUsages,
  holidayDates,
  weeks,
  canEdit,
  showColors,
  filterEmployeeId,
  sortMode,
  onCellClick,
  onDateClick,
}: Props) {
  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) shiftMap.set(`${s.employee_id}_${s.work_date}`, s);

  const leaveUsageMap = new Map<string, ShiftLeaveUsage[]>();
  for (const u of leaveUsages) {
    const key = `${u.employee_id}_${u.work_date}`;
    const arr = leaveUsageMap.get(key) ?? [];
    arr.push(u);
    leaveUsageMap.set(key, arr);
  }

  // 2인1조 집계는 화면에 실제로 보이는(활성) 직원 것만 세야 한다.
  // shifts에는 비활성 직원의 기록도 섞여 있어서 그대로 세면 "혼자인데 경고가 안 뜨는" 일이 생긴다.
  // (직원 필터와는 별개로 항상 전체 활성 직원 기준으로 계산해야 정확하다)
  const activeIds = new Set(employees.map((e) => e.id));
  const activeShifts = shifts.filter((s) => activeIds.has(s.employee_id));

  const visibleEmployees = filterEmployeeId
    ? employees.filter((e) => e.id === filterEmployeeId)
    : employees;

  return (
    <div className="space-y-3">
      {weeks.map((week, wi) => {
        const weekDates = week.map((d) => d.date);
        const weeklyHours = computeWeeklyHours(weekDates, visibleEmployees, shifts, leaveUsages);

        return (
          <div key={wi} className="flex flex-col md:flex-row gap-2">
            <div className="overflow-x-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2 min-w-full md:min-w-[1400px]">
                {week.map((day) => {
                  const dayColor = getDayColor(day.date, holidayDates.has(day.date));
                  const dayEmployees =
                    sortMode === "byShiftType"
                      ? [...visibleEmployees].sort(
                          (a, b) =>
                            shiftPriority(shiftMap.get(`${a.id}_${day.date}`) ?? null) -
                            shiftPriority(shiftMap.get(`${b.id}_${day.date}`) ?? null)
                        )
                      : visibleEmployees;

                  return (
                    <div
                      key={day.date}
                      className={`border rounded-lg overflow-hidden transition-shadow duration-150 hover:shadow-md ${
                        day.inMonth ? "bg-white" : "bg-gray-50 opacity-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onDateClick(day.date)}
                        className={`w-full px-2 py-1.5 border-b border-black/5 text-sm font-medium flex items-baseline gap-1.5 transition-colors duration-150 ${DAY_BADGE_CLASS[dayColor]}`}
                      >
                        <span className="text-base font-bold">{dayOfMonth(day.date)}</span>
                        <span className="text-xs">{weekdayLabel(day.date)}</span>
                      </button>
                      <div className="p-1.5 space-y-1">
                        {dayEmployees.map((emp) => {
                          const shift = shiftMap.get(`${emp.id}_${day.date}`) ?? null;
                          const invalid =
                            !!shift &&
                            (shift.shift_type === "dawn" || shift.shift_type === "night") &&
                            countByTypeForDate(activeShifts, day.date, shift.shift_type) !== 2;

                          return (
                            <ShiftCell
                              key={emp.id}
                              employeeName={emp.name}
                              shift={shift}
                              leaveUsages={leaveUsageMap.get(`${emp.id}_${day.date}`) ?? []}
                              canEdit={canEdit}
                              invalid={invalid}
                              showColors={showColors}
                              onClick={() => onCellClick(emp.id, day.date)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w-full md:w-36 shrink-0 border rounded-lg p-2 bg-gray-50 transition-shadow duration-150 hover:shadow-sm">
              <p className="text-[11px] font-medium text-gray-500 px-0.5 mb-1">주간 근무시간</p>
              <div className="space-y-1">
                {weeklyHours.map((r) => (
                  <div
                    key={r.employeeId}
                    className="flex items-center justify-between gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs transition-colors duration-150 hover:bg-gray-100"
                  >
                    <span className="font-medium truncate">{r.employeeName}</span>
                    <span className="text-gray-500 shrink-0">{r.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
