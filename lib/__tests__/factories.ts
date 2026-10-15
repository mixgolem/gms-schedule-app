import { Employee, Shift, ShiftLeaveUsage } from "../types";

// 테스트용 데이터 만들기 — 필요한 값만 넘기고 나머지는 기본값으로 채운다.
let seq = 0;

export function makeShift(
  fields: Pick<Shift, "employee_id" | "work_date" | "shift_type"> & Partial<Shift>
): Shift {
  seq += 1;
  return {
    id: `shift-${seq}`,
    is_main: false,
    start_time: null,
    end_time: null,
    leave_for_date: null,
    is_personal_leave: false,
    leave_hours: null,
    annual_hours: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...fields,
  };
}

export function makeUsage(
  shift: Shift,
  fields: Pick<ShiftLeaveUsage, "usage_type" | "hours" | "start_time" | "end_time"> &
    Partial<ShiftLeaveUsage>
): ShiftLeaveUsage {
  seq += 1;
  return {
    id: `usage-${seq}`,
    shift_id: shift.id,
    employee_id: shift.employee_id,
    work_date: shift.work_date,
    reason: null,
    ...fields,
  };
}

export function makeEmployee(id: string, name = id, sortOrder = 1): Employee {
  return { id, name, employee_number: null, sort_order: sortOrder, active: true };
}

// "2026-10-01"부터 n일치 날짜 문자열
export function dates(start: string, n: number): string[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  });
}
