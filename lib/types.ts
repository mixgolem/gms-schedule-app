export type ShiftType = "dawn" | "day" | "night" | "off" | "leave" | "annual";

export interface Employee {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface Shift {
  id: string;
  work_date: string; // YYYY-MM-DD
  employee_id: string;
  shift_type: ShiftType;
  is_main: boolean;
  start_time: string | null; // HH:mm[:ss]
  end_time: string | null;
  leave_for_date: string | null; // 주말근무 대휴일 때, 보상 대상인 원래 근무일 (YYYY-MM-DD)
  is_personal_leave: boolean; // 본인이 보유한 대휴 시간을 차감하는 경우
  leave_hours: number | null; // is_personal_leave일 때 사용한 시간
  annual_hours: number | null; // shift_type이 annual(연차)일 때 사용한 시간
  updated_at: string;
}

export interface Holiday {
  work_date: string; // YYYY-MM-DD
  name: string | null;
}

export type LeaveUsageType = "annual" | "personal_leave" | "other";

// 새벽/야간/주간 근무 중 일부 시간을 연차 또는 본인 대휴로 빼서 쓰는 경우의 서브엔트리
export interface ShiftLeaveUsage {
  id: string;
  shift_id: string;
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  usage_type: LeaveUsageType;
  hours: number;
  start_time: string; // HH:mm[:ss]
  end_time: string;
}

// 부분사용 항목을 저장할 때 쓰는 입력 형태 (id 없이 값만)
export interface LeaveUsageInput {
  usageType: LeaveUsageType;
  hours: number;
  start: string;
  end: string;
}

export interface Notice {
  content: string;
  updated_at: string;
}

export const SHIFT_LABELS: Record<ShiftType, string> = {
  dawn: "새벽",
  day: "주간",
  night: "야간",
  off: "휴무",
  leave: "대휴",
  annual: "연차",
};

export const SHIFT_COLORS: Record<ShiftType, string> = {
  dawn: "bg-yellow-100 text-yellow-800 border-yellow-300",
  day: "bg-white text-gray-700 border-gray-300",
  night: "bg-blue-100 text-blue-800 border-blue-300",
  off: "bg-gray-200 text-gray-700 border-gray-300",
  leave: "bg-gray-200 text-gray-700 border-gray-300",
  annual: "bg-gray-200 text-gray-700 border-gray-300",
};

export const DEFAULT_SHIFT_HOURS: Record<
  "dawn" | "day" | "night",
  { start: string; end: string }
> = {
  dawn: { start: "06:30", end: "15:30" },
  day: { start: "09:00", end: "18:00" },
  night: { start: "15:00", end: "24:00" },
};

// sort_order로 정렬된 목록에서의 인덱스(0-based)를 A, B, C ... 라벨로 변환
export function employeeLabel(index: number): string {
  return String.fromCharCode(65 + index);
}
