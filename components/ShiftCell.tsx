"use client";

import { Shift, ShiftLeaveUsage, SHIFT_LABELS, SHIFT_COLORS } from "@/lib/types";
import { computeShiftDisplay } from "@/lib/shiftDisplay";

interface Props {
  employeeName: string;
  shift: Shift | null;
  leaveUsages: ShiftLeaveUsage[];
  compLeaveDate?: string | null; // 이 근무일을 보상하는 대휴의 날짜(있으면 역방향으로 표시)
  canEdit: boolean;
  invalidReason?: string | null; // 2인1조 미충족, 대휴-공휴일 매핑 등 문제 있으면 사유 문구, 빨간색으로 경고 표시
  // 연속 7일 이상 근무, 야간→새벽 연속처럼 근무자 건강에 직접 영향을 주는 심각한 문제는
  // 2인1조 미충족 같은 일반 경고보다 눈에 더 띄게(칸 전체를 빨갛게) 표시한다.
  severeInvalid?: boolean;
  showColors: boolean; // 근무형태별 색상 표시 on/off
  onClick: () => void;
}

export default function ShiftCell({
  employeeName,
  shift,
  leaveUsages,
  compLeaveDate,
  canEdit,
  invalidReason,
  severeInvalid,
  showColors,
  onClick,
}: Props) {
  const current = shift?.shift_type ?? null;
  const isMain = shift?.is_main ?? false;
  const invalid = !!invalidReason;
  const severe = !!severeInvalid;
  // 대휴인데 원래근무일이 아직 지정 안 된 경우 - 파란 글자로 눈에 띄게 표시
  const unassignedLeave = current === "leave" && !shift?.leave_for_date;

  const { timeLabel, usageSuffix, isFullyOnLeave } = computeShiftDisplay(shift, leaveUsages);

  // 근무시간 전체를 연차/대휴/기타로 써서 실제로는 출근하지 않은 날은 대휴/휴무와 같은
  // 회색으로 보이게 하고, 일부만 쓴 경우(반차/시차 등)는 평소 근무형태 색을 그대로 쓴다.
  const colorKey = isFullyOnLeave ? "off" : current;

  // 배경/테두리는 근무형태별 색을 그대로 쓰되, 글자색은 항상 검은색으로 고정한다
  // (2인1조 미충족 등 문제가 있을 때만 예외로 진한 빨간색으로 강조).
  const bgBorderClass = !colorKey
    ? "bg-white border-gray-200"
    : showColors
    ? SHIFT_COLORS[colorKey]
        .split(" ")
        .filter((c) => !c.startsWith("text-"))
        .join(" ")
    : "bg-white border-gray-200";
  // 근무 색상 표시가 꺼져 있으면 경고 강조(빨강/파랑)도 함께 끈다 — 색을 아예 안 보이게
  // 하고 싶어서 끈 건데 경고색만 남아있으면 그 의도와 어긋난다.
  const showSevere = severe && showColors;
  const showInvalid = invalid && showColors;
  const showUnassignedLeave = unassignedLeave && showColors;

  const colorClass = showSevere
    ? "bg-red-50 border-2 border-red-400 text-red-700 font-extrabold"
    : showInvalid
    ? `${bgBorderClass} text-red-800 font-bold`
    : showUnassignedLeave
    ? `${bgBorderClass} text-blue-600 font-bold`
    : `${bgBorderClass} text-black`;

  const isWhiteBg = !current || !showColors;
  const hoverClass = showSevere ? "hover:bg-red-100" : isWhiteBg ? "hover:bg-gray-100" : "hover:brightness-95";

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
      title={invalidReason ?? (unassignedLeave ? "대휴 원래근무일이 아직 지정 안 됐어요" : undefined)}
    >
      {showSevere && <span aria-hidden>⚠️</span>}
      <span className="font-bold text-[13px]">{employeeName}</span>
      {timeLabel && <span className="font-medium">{timeLabel}</span>}
      {compLeaveDate && (
        <span
          className="text-[10px] text-blue-700 font-semibold"
          title="이 근무일을 보상하는 대휴 날짜"
        >
          →{Number(compLeaveDate.slice(5, 7))}/{Number(compLeaveDate.slice(8, 10))}
        </span>
      )}
      <span className="flex items-center gap-0.5 ml-auto font-bold text-[13px]">
        {isMain && (
          <span title={current === "dawn" ? "새벽 메인당직" : "야간 메인당직"}>★</span>
        )}
        {current === "annual" ? "연차사용" : current ? SHIFT_LABELS[current] : "-"}
        {usageSuffix && <span className="whitespace-normal break-words">{usageSuffix}</span>}
      </span>
    </button>
  );
}
