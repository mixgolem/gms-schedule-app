"use client";

import { Employee, Shift, ShiftType, SHIFT_LABELS } from "@/lib/types";
import { weekdayLabel } from "@/lib/dateUtils";

interface Props {
  date: string;
  employees: Employee[];
  shifts: Shift[];
  isHoliday: boolean;
  canEdit: boolean;
  onToggleHoliday: () => Promise<void>;
}

const GROUP_ORDER: ShiftType[] = ["dawn", "night", "day", "leave", "off"];

export default function DayDetailPanel({
  date,
  employees,
  shifts,
  isHoliday,
  canEdit,
  onToggleHoliday,
}: Props) {
  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) {
    if (s.work_date === date) shiftMap.set(s.employee_id, s);
  }
  const unassigned = employees.filter((e) => !shiftMap.has(e.id));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-400">{weekdayLabel(date)}요일</p>
        <p className="text-base font-semibold">{date}</p>
      </div>

      <label className="flex items-center gap-2 text-sm border rounded px-3 py-2 bg-gray-50">
        <input
          type="checkbox"
          checked={isHoliday}
          disabled={!canEdit}
          onChange={() => onToggleHoliday()}
        />
        공휴일로 지정
      </label>

      <div className="space-y-3">
        {GROUP_ORDER.map((type) => {
          const members = employees.filter((e) => shiftMap.get(e.id)?.shift_type === type);
          return (
            <div key={type}>
              <p className="text-xs font-medium text-gray-500 mb-1">
                {SHIFT_LABELS[type]} ({members.length}명)
              </p>
              {members.length === 0 ? (
                <p className="text-xs text-gray-300">-</p>
              ) : (
                <ul className="space-y-1">
                  {members.map((e) => (
                    <li key={e.id} className="text-sm flex items-center gap-1">
                      {e.name}
                      {shiftMap.get(e.id)?.is_main && <span title="메인당직">★</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">미배정</p>
            <ul className="space-y-1">
              {unassigned.map((e) => (
                <li key={e.id} className="text-sm text-gray-400">
                  {e.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
