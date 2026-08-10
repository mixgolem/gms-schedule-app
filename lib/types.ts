export type ShiftType = "dawn" | "day" | "night" | "off" | "leave";

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
  leave_for_date: string | null; // 대휴일 때, 보상 대상인 원래 근무일 (YYYY-MM-DD)
  updated_at: string;
}

export interface Holiday {
  work_date: string; // YYYY-MM-DD
  name: string | null;
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
};

export const SHIFT_COLORS: Record<ShiftType, string> = {
  dawn: "bg-yellow-50 text-yellow-700 border-yellow-200",
  day: "bg-green-50 text-green-700 border-green-100",
  night: "bg-blue-50 text-blue-700 border-blue-200",
  off: "bg-gray-200 text-gray-700 border-gray-300",
  leave: "bg-gray-200 text-gray-700 border-gray-300",
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
