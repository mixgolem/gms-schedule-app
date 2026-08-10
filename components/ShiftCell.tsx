"use client";

import { Shift, SHIFT_LABELS, SHIFT_COLORS } from "@/lib/types";
import { weekdayLabel } from "@/lib/dateUtils";

interface Props {
  employeeName: string;
  shift: Shift | null;
  canEdit: boolean;
  invalid?: boolean; // 2인1조 원칙 미충족 등, 빨간색으로 경고 표시
  showColors: boolean; // 근무형태별 색상 표시 on/off
  onClick: () => void;
}

export default function ShiftCell({
  employeeName,
  shift,
  canEdit,
  invalid,
  showColors,
  onClick,
}: Props) {
  const current = shift?.shift_type ?? null;
  const isMain = shift?.is_main ?? false;
  const timeLabel =
    current === "leave" && shift?.leave_for_date
      ? `${Number(shift.leave_for_date.slice(5, 7))}/${Number(
          shift.leave_for_date.slice(8, 10)
        )}(${weekdayLabel(shift.leave_for_date)})`
      : shift?.start_time && shift?.end_time
      ? `${shift.start_time.slice(0, 5)}~${shift.end_time.slice(0, 5)}`
      : null;

  const colorClass = invalid
    ? "bg-red-100 text-red-800 border-red-400"
    : !current
    ? "bg-white text-gray-300 border-gray-200"
    : showColors
    ? SHIFT_COLORS[current]
    : "bg-white text-gray-600 border-gray-200";

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs whitespace-nowrap transition-all duration-150 ease-out ${colorClass} ${
        canEdit
          ? "cursor-pointer hover:shadow-sm hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 active:shadow-none"
          : "cursor-default"
      }`}
      title={invalid ? "2인1조 원칙 미충족" : undefined}
    >
      <span className="font-medium">{employeeName}</span>
      {timeLabel && <span className="opacity-80">{timeLabel}</span>}
      <span className="flex items-center gap-0.5 ml-auto">
        {current ? SHIFT_LABELS[current] : "-"}
        {isMain && <span title="메인당직">★</span>}
      </span>
    </button>
  );
}
