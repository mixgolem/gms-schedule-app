"use client";

import { useState } from "react";
import {
  Employee,
  Shift,
  ShiftType,
  SHIFT_LABELS,
  DEFAULT_SHIFT_HOURS,
} from "@/lib/types";
import { weekdayLabel } from "@/lib/dateUtils";
import { useSpecialNotes } from "@/lib/useSpecialNotes";
import Button from "./ui/Button";

interface Props {
  employee: Employee;
  date: string;
  shift: Shift | null;
  canEdit: boolean;
  onSave: (
    shiftType: ShiftType,
    isMain: boolean,
    startTime: string | null,
    endTime: string | null,
    leaveForDate: string | null
  ) => Promise<void>;
  onClose: () => void;
}

const TYPES: ShiftType[] = ["dawn", "day", "night", "leave", "off"];

function hasHours(type: ShiftType): type is "dawn" | "day" | "night" {
  return type === "dawn" || type === "day" || type === "night";
}

// <input type="time">은 24:00을 표현할 수 없어 실제 입력값은 다음날 00:00으로 대체
function timeForInput(value: string): string {
  return value === "24:00" ? "00:00" : value;
}

// 퇴근시간이 출근시간보다 같거나 빠르면 자정을 넘겨 다음날로 퇴근하는 근무형태
function crossesMidnight(start: string, end: string): boolean {
  return start !== "" && end !== "" && end <= start;
}

function defaultTimesFor(type: ShiftType): { start: string; end: string } {
  if (!hasHours(type)) return { start: "", end: "" };
  const d = DEFAULT_SHIFT_HOURS[type];
  return { start: timeForInput(d.start), end: timeForInput(d.end) };
}

export default function EmployeeShiftEditor({
  employee,
  date,
  shift,
  canEdit,
  onSave,
  onClose,
}: Props) {
  const initialType = shift?.shift_type ?? "day";
  const [type, setType] = useState<ShiftType>(initialType);
  const [isMain, setIsMain] = useState(shift?.is_main ?? false);
  const [start, setStart] = useState(
    shift?.start_time ? timeForInput(shift.start_time.slice(0, 5)) : defaultTimesFor(initialType).start
  );
  const [end, setEnd] = useState(
    shift?.end_time ? timeForInput(shift.end_time.slice(0, 5)) : defaultTimesFor(initialType).end
  );
  const [leaveForDate, setLeaveForDate] = useState(shift?.leave_for_date ?? "");
  const [saving, setSaving] = useState(false);
  const { groups: specialNoteGroups } = useSpecialNotes();
  const myUnresolvedDates =
    specialNoteGroups.find((g) => g.employeeId === employee.id)?.dates ?? [];

  const handleTypeClick = (t: ShiftType) => {
    setType(t);
    if (t !== "dawn" && t !== "night") setIsMain(false);
    const d = defaultTimesFor(t);
    setStart(d.start);
    setEnd(d.end);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(
      type,
      isMain,
      hasHours(type) ? start : null,
      hasHours(type) ? end : null,
      type === "leave" && leaveForDate ? leaveForDate : null
    );
    setSaving(false);
    onClose();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-400">
          {date} ({weekdayLabel(date)})
        </p>
        <p className="text-base font-semibold">{employee.name}</p>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">근무형태</p>
        <div className="grid grid-cols-5 gap-1">
          {TYPES.map((t) => (
            <Button
              key={t}
              disabled={!canEdit}
              onClick={() => handleTypeClick(t)}
              active={type === t}
              className="px-2 py-1.5"
            >
              {SHIFT_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      {(type === "dawn" || type === "night") && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMain}
            disabled={!canEdit}
            onChange={(e) => setIsMain(e.target.checked)}
            className="accent-gray-900"
          />
          메인당직으로 지정 (★)
        </label>
      )}

      {type === "leave" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 block">이 대휴가 보상하는 날짜</label>
            <input
              type="date"
              value={leaveForDate}
              disabled={!canEdit}
              onChange={(e) => setLeaveForDate(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>

          {myUnresolvedDates.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400">대휴 미지정 근무일</p>
              <div className="flex flex-wrap gap-1">
                {myUnresolvedDates.map((d) => (
                  <Button
                    key={d}
                    disabled={!canEdit}
                    onClick={() => setLeaveForDate(d)}
                    active={leaveForDate === d}
                    className="text-xs px-2 py-1"
                  >
                    {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}({weekdayLabel(d)})
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasHours(type) && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            근무시간 · 기본 {DEFAULT_SHIFT_HOURS[type].start} ~{" "}
            {DEFAULT_SHIFT_HOURS[type].end === "24:00"
              ? "익일 00:00"
              : DEFAULT_SHIFT_HOURS[type].end}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-0.5">출근</label>
              <input
                type="time"
                value={start}
                disabled={!canEdit}
                onChange={(e) => setStart(e.target.value)}
                className="w-full border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-0.5">
                퇴근{crossesMidnight(start, end) ? " (익일)" : ""}
              </label>
              <input
                type="time"
                value={end}
                disabled={!canEdit}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full border rounded-lg px-2 py-1 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1 py-2">
            {saving ? "저장 중..." : "저장"}
          </Button>
          <Button onClick={onClose} className="py-2">
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
