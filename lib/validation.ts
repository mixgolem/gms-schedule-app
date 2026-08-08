import { Shift, ShiftType } from "./types";

export function countByTypeForDate(
  shifts: Shift[],
  workDate: string,
  shiftType: ShiftType
): number {
  return shifts.filter(
    (s) => s.work_date === workDate && s.shift_type === shiftType
  ).length;
}

// 새벽/야간은 2인1조가 원칙이라 2명이 아니면 경고 메시지를 반환한다 (저장은 막지 않음).
export function checkPairRule(
  shifts: Shift[],
  workDate: string,
  shiftType: ShiftType
): string | null {
  if (shiftType !== "dawn" && shiftType !== "night") return null;

  const count = countByTypeForDate(shifts, workDate, shiftType);
  if (count !== 2) {
    const label = shiftType === "dawn" ? "새벽" : "야간";
    return `${workDate} ${label} 근무자가 ${count}명입니다. (2인1조 원칙 미충족)`;
  }
  return null;
}
