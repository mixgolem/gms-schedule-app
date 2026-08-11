"use client";

import { Shift, ShiftLeaveUsage, SHIFT_LABELS, SHIFT_COLORS } from "@/lib/types";
import { computeShiftDisplay } from "@/lib/shiftDisplay";

interface Props {
  employeeName: string;
  shift: Shift | null;
  leaveUsages: ShiftLeaveUsage[];
  canEdit: boolean;
  invalid?: boolean; // 2인1조 원칙 미충족 등, 빨간색으로 경고 표시
  showColors: boolean; // 근무형태별 색상 표시 on/off
  onClick: () => void;
}

export default function ShiftCell({
  employeeName,
  shift,
  leaveUsages,
  canEdit,
  invalid,
  showColors,
  onClick,
}: Props) {
  const current = shift?.shift_type ?? null;
  const isMain = shift?.is_main ?? false;

  const { timeLabel, usageSuffix, isFullyOnLeave } = computeShiftDisplay(shift, leaveUsages);

  // 근무시간 전체를 연차/대휴/기타로 써서 실제로는 출근하지 않은 날은 대휴/휴무와 같은
  // 회색으로 보이게 하고, 일부만 쓴 경우(반차/시차 등)는 평소 근무형태 색을 그대로 쓴다.
  const colorKey = isFullyOnLeave ? "off" : current;

  // 2인1조 미충족 시 칸 배경은 평소와 동일하게 두고, 글자만 진한 빨간색으로 강조한다.
  const baseColorClass = !colorKey
    ? "bg-white text-gray-300 border-gray-200"
    : showColors
    ? SHIFT_COLORS[colorKey]
    : "bg-white text-gray-600 border-gray-200";
  const bgBorderClass = baseColorClass
    .split(" ")
    .filter((c) => !c.startsWith("text-"))
    .join(" ");
  const colorClass = invalid ? `${bgBorderClass} text-red-800 font-bold` : baseColorClass;

  const isWhiteBg = !current || !showColors;
  const hoverClass = isWhiteBg ? "hover:bg-gray-100" : "hover:brightness-95";

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs whitespace-nowrap transition-all duration-150 ease-out ${colorClass} ${
        canEdit
          ? `cursor-pointer hover:shadow-sm hover:-translate-y-0.5 ${hoverClass} active:translate-y-0 active:shadow-none`
          : "cursor-default"
      }`}
      title={invalid ? "2인1조 원칙 미충족" : undefined}
    >
      <span className="font-medium">{employeeName}</span>
      {timeLabel && <span className="font-medium">{timeLabel}</span>}
      <span className="flex items-center gap-0.5 ml-auto">
        {current === "annual" ? "연차사용" : current ? SHIFT_LABELS[current] : "-"}
        {usageSuffix}
        {isMain && (
          <span title={current === "dawn" ? "새벽 메인당직" : "야간 메인당직"}>★</span>
        )}
      </span>
    </button>
  );
}
