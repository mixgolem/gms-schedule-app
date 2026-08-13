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
  reason: string | null;
}

export interface ShiftDisplay {
  hasPartialUsage: boolean;
  isFullyOnLeave: boolean; // 근무시간 전체를 연차/대휴/기타로 써서 실제로는 출근하지 않은 경우
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

  // 괄호 안 표시는 보통 사용유형 이름(연차/대휴/기타)을 쓰지만, "기타"에 사유를 적어뒀으면
  // "기타" 대신 그 사유를 짧게(3글자) 보여준다.
  const usageLabel = (u: ShiftLeaveUsage): string =>
    u.usage_type === "other" && u.reason ? u.reason.slice(0, 3) : USAGE_SHORT_LABELS[u.usage_type];

  const usageSuffix = hasPartialUsage
    ? `(${[...new Set(leaveUsages.map(usageLabel))].join(",")})`
    : "";

  const usageDetails: UsageDetail[] = hasPartialUsage
    ? leaveUsages.map((u) => ({
        label: USAGE_SHORT_LABELS[u.usage_type],
        hours: u.hours,
        start: u.start_time.slice(0, 5),
        end: u.end_time.slice(0, 5),
        reason: u.reason,
      }))
    : [];

  const isFullyOnLeave = hasPartialUsage && remainingRanges.length === 0;

  return { hasPartialUsage, isFullyOnLeave, timeLabel, usageSuffix, usageDetails };
}

// 시간대 정렬 모드에서의 우선순위 - 출근시간이 이른 순서(새벽 < 주간 < 야간)로 정렬하고,
// 새벽/야간은 메인당직이 보조보다 먼저 오게 한다. 주간인데 연차/대휴/기타로 근무시간
// 전체를 써서 실제로는 출근하지 않는 경우는 "출근 안 함"이니 야간 다음으로 보낸다:
// 새벽메인 → 새벽 → 주간(근무) → 야간메인 → 야간 → 주간(전부휴가) → 대휴/연차 → 휴무 → 미배정.
// 캘린더 그리드(데스크탑)와 하루보기(모바일)에서 공통으로 쓴다.
export function shiftPriority(shift: Shift | null, leaveUsages: ShiftLeaveUsage[] = []): number {
  if (!shift) return 8;
  switch (shift.shift_type) {
    case "dawn":
      return shift.is_main ? 0 : 1;
    case "day": {
      const { isFullyOnLeave } = computeShiftDisplay(shift, leaveUsages);
      return isFullyOnLeave ? 5 : 2;
    }
    case "night":
      return shift.is_main ? 3 : 4;
    case "leave":
    case "annual":
      return 6;
    case "off":
      return 7;
    default:
      return 8;
  }
}
