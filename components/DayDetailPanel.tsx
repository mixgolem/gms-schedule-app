"use client";

import { Employee, Shift, ShiftLeaveUsage, ShiftType, SHIFT_LABELS } from "@/lib/types";
import { weekdayLabel } from "@/lib/dateUtils";
import { computeShiftDisplay } from "@/lib/shiftDisplay";

interface Props {
  date: string;
  employees: Employee[];
  shifts: Shift[];
  leaveUsages: ShiftLeaveUsage[];
  isHoliday: boolean;
  canEdit: boolean;
  onToggleHoliday: () => Promise<void>;
}

const GROUP_ORDER: ShiftType[] = ["dawn", "night", "day", "leave", "off"];

export default function DayDetailPanel({
  date,
  employees,
  shifts,
  leaveUsages,
  isHoliday,
  canEdit,
  onToggleHoliday,
}: Props) {
  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) {
    if (s.work_date === date) shiftMap.set(s.employee_id, s);
  }

  const leaveUsageMap = new Map<string, ShiftLeaveUsage[]>();
  for (const u of leaveUsages) {
    if (u.work_date !== date) continue;
    const arr = leaveUsageMap.get(u.employee_id) ?? [];
    arr.push(u);
    leaveUsageMap.set(u.employee_id, arr);
  }

  const unassigned = employees.filter((e) => !shiftMap.has(e.id));

  return (
    <div className="space-y-4">
      <p className="text-lg font-bold text-black">
        {date} ({weekdayLabel(date)}){isHoliday && <span className="text-red-700"> 공휴일</span>}
      </p>

      <label className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2 bg-gray-50 transition-colors duration-150 hover:bg-gray-100">
        <input
          type="checkbox"
          checked={isHoliday}
          disabled={!canEdit}
          onChange={() => onToggleHoliday()}
          className="accent-gray-900"
        />
        공휴일로 지정
      </label>

      <div className="space-y-3">
        {GROUP_ORDER.map((type) => {
          const members = employees.filter((e) => shiftMap.get(e.id)?.shift_type === type);
          return (
            <div key={type}>
              <p className="text-xs font-semibold text-black mb-1">
                {SHIFT_LABELS[type]} ({members.length}명)
              </p>
              {members.length === 0 ? (
                <p className="text-xs text-black">-</p>
              ) : (
                <ul className="space-y-1">
                  {members.map((e) => {
                    const shift = shiftMap.get(e.id) ?? null;
                    const isMain = shift?.is_main ?? false;
                    const usages = leaveUsageMap.get(e.id) ?? [];
                    const { timeLabel, usageDetails } = computeShiftDisplay(shift, usages);

                    return (
                      <li
                        key={e.id}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-black">{e.name}</span>
                          {isMain && (
                            <span title={type === "dawn" ? "새벽 메인당직" : "메인당직"}>
                              ★
                            </span>
                          )}
                          {timeLabel && (
                            <span className="text-xs text-black ml-auto whitespace-nowrap">
                              {timeLabel}
                            </span>
                          )}
                        </div>
                        {usageDetails.length > 0 && (
                          <ul className="mt-1 space-y-0.5 border-t border-dashed border-gray-200 pt-1">
                            {usageDetails.map((u, i) => (
                              <li key={i} className="text-xs text-blue-900">
                                {u.label} · {u.start}~{u.end} ({u.hours}h)
                                {u.reason && ` — ${u.reason}`}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-black mb-1">미배정</p>
            <ul className="space-y-1">
              {unassigned.map((e) => (
                <li key={e.id} className="text-sm text-black">
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
