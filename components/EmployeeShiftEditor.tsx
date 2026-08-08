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

interface Props {
  employee: Employee;
  date: string;
  shift: Shift | null;
  canEdit: boolean;
  onSave: (
    shiftType: ShiftType,
    isMain: boolean,
    startTime: string | null,
    endTime: string | null
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
  const [saving, setSaving] = useState(false);

  const handleTypeClick = (t: ShiftType) => {
    setType(t);
    if (t !== "dawn" && t !== "night") setIsMain(false);
    const d = defaultTimesFor(t);
    setStart(d.start);
    setEnd(d.end);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(type, isMain, hasHours(type) ? start : null, hasHours(type) ? end : null);
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
            <button
              key={t}
              type="button"
              disabled={!canEdit}
              onClick={() => handleTypeClick(t)}
              className={`text-sm rounded border px-2 py-1.5 ${
                type === t
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              {SHIFT_LABELS[t]}
            </button>
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
          />
          메인당직으로 지정 (★)
        </label>
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
                className="w-full border rounded px-2 py-1 text-sm"
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
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-gray-900 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
