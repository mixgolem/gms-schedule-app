import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { serialToDateStr } from "./scheduleImport";
import { convertDayAndLeaveShiftsToOff } from "./holidays";

export interface ParsedHolidayRow {
  work_date: string;
  name: string | null;
}

export interface ParseHolidayResult {
  rows: ParsedHolidayRow[];
  warnings: string[];
}

const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

// 엑셀 날짜 셀이 진짜 날짜 형식이면 일련번호(number)로 들어오고, 텍스트로 입력했으면
// 문자열로 들어온다 — 둘 다 받아준다. "YYYY-MM-DD" 형식이 아닌 문자열은 못 읽는다.
function readDateCell(cell: unknown): string | null {
  if (typeof cell === "number") return serialToDateStr(cell);
  if (typeof cell === "string" && DATE_STRING_RE.test(cell.trim())) return cell.trim();
  return null;
}

// A열: 날짜, B열: 공휴일 이름. 1행은 제목행으로 보고 2행부터 읽는다.
export async function parseHolidayFile(file: File): Promise<ParseHolidayResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

  const warnings: string[] = [];
  const dedupedMap = new Map<string, ParsedHolidayRow>();

  for (let r = 1; r < raw.length; r++) {
    const line = raw[r] ?? [];
    const dateCell = line[0];
    if (!dateCell && dateCell !== 0) continue;

    const date = readDateCell(dateCell);
    if (!date) {
      warnings.push(`${r + 1}행: 날짜를 읽을 수 없어요`);
      continue;
    }

    if (dedupedMap.has(date)) {
      warnings.push(`${r + 1}행: ${date}는 앞에서도 나온 날짜예요 (마지막 값으로 반영돼요)`);
    }

    const nameCell = line[1];
    const name = nameCell || nameCell === 0 ? String(nameCell).trim() : "";
    dedupedMap.set(date, { work_date: date, name: name || null });
  }

  const rows = [...dedupedMap.values()].sort((a, b) => a.work_date.localeCompare(b.work_date));
  return { rows, warnings };
}

export async function applyParsedHolidays(
  rows: ParsedHolidayRow[]
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from("holidays")
    .upsert(
      rows.map((r) => ({ work_date: r.work_date, name: r.name })),
      { onConflict: "work_date" }
    );
  if (error) return { error: error.message };

  // 새로 공휴일이 된 날짜에 주간/대휴로 잡혀있던 근무는 자동으로 휴무로 바꾼다
  // (공휴일 관리 모달에서 하나씩 추가할 때와 동일한 동작).
  for (const r of rows) {
    await convertDayAndLeaveShiftsToOff(r.work_date);
  }

  return { error: null };
}
