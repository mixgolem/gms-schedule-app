import * as XLSX from "xlsx";
import { Employee, Shift, SHIFT_LABELS } from "./types";
import { weekdayLabel, getMonthDates } from "./dateUtils";

export function exportScheduleToExcel(
  year: number,
  month: number,
  employees: Employee[],
  shifts: Shift[],
  filterEmployeeId: string | null
) {
  const monthDates = new Set(getMonthDates(year, month));
  const targetEmployees = filterEmployeeId
    ? employees.filter((e) => e.id === filterEmployeeId)
    : employees;
  const targetIds = new Set(targetEmployees.map((e) => e.id));
  const sortOrderMap = new Map(employees.map((e) => [e.id, e.sort_order]));
  const nameMap = new Map(employees.map((e) => [e.id, e.name]));

  const rows = shifts
    .filter((s) => targetIds.has(s.employee_id) && monthDates.has(s.work_date))
    .sort((a, b) => {
      if (a.work_date !== b.work_date) return a.work_date < b.work_date ? -1 : 1;
      return (sortOrderMap.get(a.employee_id) ?? 0) - (sortOrderMap.get(b.employee_id) ?? 0);
    })
    .map((s) => {
      const time =
        s.start_time && s.end_time
          ? `${s.start_time.slice(0, 5)}~${s.end_time.slice(0, 5)}`
          : "";
      const note =
        s.shift_type === "leave" && s.leave_for_date
          ? `${s.leave_for_date} 근무에 대한 대휴`
          : "";

      return {
        직원명: nameMap.get(s.employee_id) ?? "",
        날짜: s.work_date,
        요일: weekdayLabel(s.work_date),
        근무형태: SHIFT_LABELS[s.shift_type],
        근무시간: time,
        메인당직: s.is_main ? "O" : "",
        비고: note,
      };
    });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "근무표");

  const employeeSuffix = filterEmployeeId ? `_${nameMap.get(filterEmployeeId) ?? ""}` : "";
  XLSX.writeFile(wb, `GMS_근무표_${year}년${month}월${employeeSuffix}.xlsx`);
}
