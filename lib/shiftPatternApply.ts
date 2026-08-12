import { addDays, format } from "date-fns";
import { Employee } from "./types";
import { ShiftDefaultsMap } from "./useShiftDefaults";
import { PatternDays } from "./shiftPatternImport";
import { ParsedRow, applyParsedSchedule } from "./scheduleImport";
import { parseLocalDate } from "./dateUtils";

function hoursFor(
  type: "dawn" | "day" | "night",
  shiftDefaults: ShiftDefaultsMap
): { start: string; end: string } {
  const h = shiftDefaults[type];
  return { start: h.start, end: h.end === "24:00" ? "00:00" : h.end };
}

// 시작일부터 종료일까지 매일, 패턴의 요일 순서를 (날짜수 % 패턴길이)로 반복 적용해
// 실제 근무표 행(ParsedRow)을 만든다. 근무자 열 순서는 sort_order 기준 A~G와 동일하게 매칭.
export function generatePatternRows(
  pattern: PatternDays,
  employees: Employee[],
  startDate: string,
  endDate: string,
  shiftDefaults: ShiftDefaultsMap
): ParsedRow[] {
  if (pattern.length === 0) return [];

  const sorted = [...employees].sort((a, b) => a.sort_order - b.sort_order);
  const rows: ParsedRow[] = [];

  let cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  let dayIndex = 0;

  while (cursor <= end) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const dayCells = pattern[dayIndex % pattern.length];

    for (let col = 0; col < sorted.length && col < dayCells.length; col++) {
      const cell = dayCells[col];
      if (!cell) continue;
      const employee = sorted[col];
      const type = cell.shiftType;
      const hours: { start: string | null; end: string | null } =
        type === "dawn" || type === "day" || type === "night"
          ? hoursFor(type, shiftDefaults)
          : { start: null, end: null };

      rows.push({
        employee_id: employee.id,
        work_date: dateStr,
        shift_type: cell.shiftType,
        is_main: cell.isMain,
        start_time: hours.start,
        end_time: hours.end,
      });
    }

    cursor = addDays(cursor, 1);
    dayIndex++;
  }

  return rows;
}

const CHUNK_SIZE = 300;

// 한 번에 너무 많은 행을 upsert하면 요청이 무거워질 수 있어 나눠서 순차 적용한다.
export async function applyPatternRows(rows: ParsedRow[]): Promise<{ error: string | null }> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await applyParsedSchedule(chunk);
    if (error) return { error };
  }
  return { error: null };
}
