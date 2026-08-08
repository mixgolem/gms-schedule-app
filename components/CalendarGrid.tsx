"use client";

import { Employee, Shift } from "@/lib/types";
import { CalendarDay, weekdayLabel, dayOfMonth, getDayColor } from "@/lib/dateUtils";
import { countByTypeForDate } from "@/lib/validation";
import ShiftCell from "./ShiftCell";

interface Props {
  employees: Employee[];
  shifts: Shift[];
  holidayDates: Set<string>;
  weeks: CalendarDay[][];
  canEdit: boolean;
  showColors: boolean;
  filterEmployeeId: string | null; // null이면 전체 표시
  onCellClick: (employeeId: string, date: string) => void;
  onDateClick: (date: string) => void;
}

const DAY_BADGE_CLASS: Record<string, string> = {
  default: "text-gray-600",
  saturday: "bg-sky-100 text-sky-700",
  sunday: "bg-red-100 text-red-700",
  holiday: "bg-red-500 text-white",
};

export default function CalendarGrid({
  employees,
  shifts,
  holidayDates,
  weeks,
  canEdit,
  showColors,
  filterEmployeeId,
  onCellClick,
  onDateClick,
}: Props) {
  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) shiftMap.set(`${s.employee_id}_${s.work_date}`, s);

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
      {weeks.map((week, wi) => (
        <div key={wi} className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[1500px]">
            {week.map((day) => {
              const dayColor = getDayColor(day.date, holidayDates.has(day.date));
              return (
                <div
                  key={day.date}
                  className={`border rounded ${
                    day.inMonth ? "bg-white" : "bg-gray-50 opacity-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onDateClick(day.date)}
                    className={`w-full px-2 py-1 border-b text-xs font-medium flex items-baseline gap-1 hover:opacity-80 ${DAY_BADGE_CLASS[dayColor]}`}
                  >
                    <span className="font-bold">{dayOfMonth(day.date)}</span>
                    <span className="text-[10px]">{weekdayLabel(day.date)}</span>
                  </button>
                  <div className="p-1.5 space-y-1">
                    {visibleEmployees.map((emp) => {
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
      ))}
    </div>
  );
}
