import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { Employee, ShiftType, DEFAULT_SHIFT_HOURS } from "./types";

const CODE_MAP: Record<string, { type: ShiftType; main: boolean }> = {
  메: { type: "dawn", main: true },
  조: { type: "dawn", main: false },
  야: { type: "night", main: true },
  여: { type: "night", main: false },
  주: { type: "day", main: false },
  휴: { type: "off", main: false },
  대: { type: "leave", main: false },
};

const EMPLOYEE_COLUMNS = 7; // B~H = A~G 직원 7명

interface ParsedRow {
  employee_id: string;
  work_date: string;
  shift_type: ShiftType;
  is_main: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
}

function hoursFor(type: ShiftType): { start: string | null; end: string | null } {
  if (type === "dawn" || type === "day" || type === "night") {
    const h = DEFAULT_SHIFT_HOURS[type];
    return { start: h.start, end: h.end === "24:00" ? "00:00" : h.end };
  }
  return { start: null, end: null };
}

// 엑셀 날짜 셀을 JS Date로 바꾸면(cellDates) 브라우저 타임존에 따라 하루가 밀릴 수 있어서
// (KST에서는 8/1 0시가 UTC로 7/31 15시가 됨), 셀의 원본 일련번호를 SSF로 직접 변환해 y/m/d를 얻는다.
function serialToDateStr(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  const m = String(parsed.m).padStart(2, "0");
  const d = String(parsed.d).padStart(2, "0");
  return `${parsed.y}-${m}-${d}`;
}

export async function parseScheduleFile(
  file: File,
  employees: Employee[]
): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  // cellDates는 쓰지 않는다 — 타임존에 따라 날짜가 밀리는 문제가 있어 원본 일련번호를 직접 변환한다.
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const sorted = [...employees].sort((a, b) => a.sort_order - b.sort_order);

  // 1행은 헤더(A, B, C ...)라 건너뛰고 2행부터 데이터로 읽는다
  for (let r = 1; r < raw.length; r++) {
    const line = raw[r] ?? [];
    const dateCell = line[0];
    if (!dateCell && dateCell !== 0) continue;

    const date = typeof dateCell === "number" ? serialToDateStr(dateCell) : null;
    if (!date) {
      warnings.push(`${r + 1}행: 날짜를 읽을 수 없어요`);
      continue;
    }

    for (let col = 0; col < EMPLOYEE_COLUMNS; col++) {
      const rawCode = line[col + 1];
      if (!rawCode) continue;
      const code = String(rawCode).trim();
      if (!code) continue;

      const employee = sorted[col];
      if (!employee) {
        warnings.push(`${date} ${String.fromCharCode(65 + col)}열: 매칭되는 직원이 없어요`);
        continue;
      }

      const mapping = CODE_MAP[code];
      if (!mapping) {
        warnings.push(`${date} ${employee.name}: 알 수 없는 코드 '${code}'`);
        continue;
      }

      const hours = hoursFor(mapping.type);
      rows.push({
        employee_id: employee.id,
        work_date: date,
        shift_type: mapping.type,
        is_main: mapping.main,
        start_time: hours.start,
        end_time: hours.end,
      });
    }
  }

  return { rows, warnings };
}

export async function applyParsedSchedule(
  rows: ParsedRow[]
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };

  // 1단계: 전부 is_main=false로 업서트 (메인당직 유니크 제약 충돌 방지)
  const { error: upsertError } = await supabase.from("shifts").upsert(
    rows.map((r) => ({ ...r, is_main: false, updated_at: new Date().toISOString() })),
    { onConflict: "work_date,employee_id" }
  );
  if (upsertError) return { error: upsertError.message };

  // 2단계: 메인당직자만 병렬로 true 처리 (1단계에서 이미 전부 false라 서로 충돌 없음)
  const mainRows = rows.filter((r) => r.is_main);
  const results = await Promise.all(
    mainRows.map((r) =>
      supabase
        .from("shifts")
        .update({ is_main: true })
        .eq("work_date", r.work_date)
        .eq("employee_id", r.employee_id)
    )
  );
  const failed = results.find((res) => res.error);
  if (failed?.error) return { error: failed.error.message };

  return { error: null };
}
