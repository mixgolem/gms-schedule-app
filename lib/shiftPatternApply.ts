import { addDays, format } from "date-fns";
import { Employee } from "./types";
import { ShiftDefaultsMap } from "./useShiftDefaults";
import { PatternDays } from "./shiftPatternImport";
import { ParsedRow, ClearedCell, applyParsedSchedule } from "./scheduleImport";
import { parseLocalDate } from "./dateUtils";

export interface GeneratedPattern {
  rows: ParsedRow[];
  clearedCells: ClearedCell[];
}

function hoursFor(
  type: "dawn" | "day" | "night",
  shiftDefaults: ShiftDefaultsMap
): { start: string; end: string } {
  const h = shiftDefaults[type];
  return { start: h.start, end: h.end === "24:00" ? "00:00" : h.end };
}

// 시작일부터 종료일까지 매일, 패턴의 요일 순서를 (날짜수 % 패턴길이)로 반복 적용해
// 실제 근무표 행(ParsedRow)을 만든다. 근무자는 슬롯 인덱스(A=0,B=1...)와 같은
// sort_order를 지금 가진 직원으로, 적용하는 시점 기준 최신 명단에서 다시 찾는다
// (패턴을 올려둔 뒤 직원이 늘거나 줄어도 항상 지금 명단 기준으로 정확히 맞는다).
export function generatePatternRows(
  pattern: PatternDays,
  presentSlots: boolean[],
  employees: Employee[],
  startDate: string,
  endDate: string,
  shiftDefaults: ShiftDefaultsMap
): GeneratedPattern {
  if (pattern.length === 0) return { rows: [], clearedCells: [] };

  const bySortOrder = new Map<number, Employee>();
  for (const e of employees) bySortOrder.set(e.sort_order, e);

  const rows: ParsedRow[] = [];
  const clearedCells: ClearedCell[] = [];

  let cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  let dayIndex = 0;

  while (cursor <= end) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const dayCells = pattern[dayIndex % pattern.length];

    for (let col = 0; col < dayCells.length; col++) {
      if (!presentSlots[col]) continue; // 이 패턴 파일에 아예 없던 슬롯 - 절대 건드리지 않음

      const employee = bySortOrder.get(col + 1);
      if (!employee) continue; // 지금 이 글자를 가진 직원이 없음

      const cell = dayCells[col];

      // 빈칸 = 그 근무자의 그 날짜 기존 근무 기록을 지운다
      if (!cell) {
        clearedCells.push({ employee_id: employee.id, work_date: dateStr });
        continue;
      }

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

  return { rows, clearedCells };
}

const CHUNK_SIZE = 300;

// 한 번에 너무 많은 행을 upsert하면 요청이 무거워질 수 있어 나눠서 순차 적용한다.
export async function applyPatternRows(
  rows: ParsedRow[],
  clearedCells: ClearedCell[] = []
): Promise<{ error: string | null }> {
  if (clearedCells.length > 0) {
    const { error } = await applyParsedSchedule([], clearedCells);
    if (error) return { error };
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await applyParsedSchedule(chunk);
    if (error) return { error };
  }
  return { error: null };
}
