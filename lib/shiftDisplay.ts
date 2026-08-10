import { Shift, ShiftLeaveUsage, LeaveUsageType } from "./types";
import { computeRemainingRanges } from "./timeRanges";
import { weekdayLabel } from "./dateUtils";

export const USAGE_SHORT_LABELS: Record<LeaveUsageType, string> = {
  annual: "연차",
  personal_leave: "대휴",
  other: "기타",
};

export interface UsageDetail {
  label: string;
  hours: number;
  start: string;
  end: string;
}

export interface ShiftDisplay {
  hasPartialUsage: boolean;
  timeLabel: string | null;
  usageSuffix: string; // "(연차,대휴)" 형태, 없으면 ""
  usageDetails: UsageDetail[]; // 부분사용 항목별 상세 (라벨/시간/구간)
}

// 근무 셀 하나에 대해 표시할 시간 라벨과 연차/대휴/기타 사용 내역을 계산.
// ShiftCell(캘린더 칸)과 DayDetailPanel(일자 상세)에서 공통으로 사용한다.
export function computeShiftDisplay(
  shift: Shift | null,
  leaveUsages: ShiftLeaveUsage[]
): ShiftDisplay {
  const current = shift?.shift_type ?? null;

  const hasPartialUsage = Boolean(
    (current === "dawn" || current === "day" || current === "night") &&
      leaveUsages.length > 0 &&
      shift?.start_time &&
      shift?.end_time
  );

  const remainingRanges =
    hasPartialUsage && shift?.start_time && shift?.end_time
      ? computeRemainingRanges(
          { start: shift.start_time.slice(0, 5), end: shift.end_time.slice(0, 5) },
          leaveUsages.map((u) => ({
            start: u.start_time.slice(0, 5),
            end: u.end_time.slice(0, 5),
          }))
        )
      : [];

  const timeLabel = hasPartialUsage
    ? remainingRanges.length > 0
      ? remainingRanges.map((r) => `${r.start}~${r.end}`).join(", ")
      : null
    : (current === "annual" || (current === "leave" && shift?.is_personal_leave)) &&
      shift?.start_time &&
      shift?.end_time
    ? `${shift.start_time.slice(0, 5)} ~ ${shift.end_time.slice(0, 5)}`
    : current === "leave" && shift?.leave_for_date
    ? `${Number(shift.leave_for_date.slice(5, 7))}/${Number(
        shift.leave_for_date.slice(8, 10)
      )}(${weekdayLabel(shift.leave_for_date)})`
    : shift?.start_time && shift?.end_time
    ? `${shift.start_time.slice(0, 5)}~${shift.end_time.slice(0, 5)}`
    : null;

  const usageSuffix = hasPartialUsage
    ? `(${[...new Set(leaveUsages.map((u) => USAGE_SHORT_LABELS[u.usage_type]))].join(",")})`
    : "";

  const usageDetails: UsageDetail[] = hasPartialUsage
    ? leaveUsages.map((u) => ({
        label: USAGE_SHORT_LABELS[u.usage_type],
        hours: u.hours,
        start: u.start_time.slice(0, 5),
        end: u.end_time.slice(0, 5),
      }))
    : [];

  return { hasPartialUsage, timeLabel, usageSuffix, usageDetails };
}
