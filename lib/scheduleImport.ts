import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { Employee, ShiftType, DEFAULT_SHIFT_HOURS, employeeLabel } from "./types";
import { resolveEmployeeColumns } from "./employeeColumns";

const CODE_MAP: Record<string, { type: ShiftType; main: boolean }> = {
  메: { type: "dawn", main: true },
  조: { type: "dawn", main: false },
  야: { type: "night", main: true },
  여: { type: "night", main: false },
  주: { type: "day", main: false },
  휴: { type: "off", main: false },
  대: { type: "leave", main: false },
};

export interface ParsedRow {
  employee_id: string;
  work_date: string;
  shift_type: ShiftType;
  is_main: boolean;
  start_time: string | null;
  end_time: string | null;
}

// 빈칸으로 둔 근무자·날짜 - 기존에 있던 근무 기록을 지운다
export interface ClearedCell {
  employee_id: string;
  work_date: string;
}

export interface ParsePreviewRow {
  date: string;
  codes: (string | null)[]; // A,B,C... 순서, 헤더에 있는 만큼(인원수 제한 없음)
}

export interface ParseResult {
  rows: ParsedRow[];
  clearedCells: ClearedCell[];
  warnings: string[];
  preview: ParsePreviewRow[];
  employeeNames: (string | null)[]; // A,B,C... 순서, 매칭된 직원 없으면 null
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
export function serialToDateStr(serial: number): string | null {
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
  const clearedCells: ClearedCell[] = [];
  const preview: ParsePreviewRow[] = [];

  // 헤더(1행)의 A,B,C... 글자를 읽어서 각 열이 어떤 직원인지 정한다 — 위치가 아니라
  // 글자로 매칭하므로 열 순서를 바꿔 입력해도 안전하고, 인원수 제한도 없다(A~Z).
  const columns = resolveEmployeeColumns(raw[0] ?? [], employees);
  const employeeNames: (string | null)[] = columns.map((c) => c.employee?.name ?? null);

  // 2행부터 데이터로 읽는다
  for (let r = 1; r < raw.length; r++) {
    const line = raw[r] ?? [];
    const dateCell = line[0];
    if (!dateCell && dateCell !== 0) continue;

    const date = typeof dateCell === "number" ? serialToDateStr(dateCell) : null;
    if (!date) {
      warnings.push(`${r + 1}행: 날짜를 읽을 수 없어요`);
      continue;
    }

    const previewCodes: (string | null)[] = new Array(columns.length).fill(null);

    for (let col = 0; col < columns.length; col++) {
      const c = columns[col];
      if (c.fileCol === null) continue; // 이 글자는 파일 헤더에 아예 없음 - 건드리지 않는다

      const rawCode = line[c.fileCol + 1];
      const code = rawCode ? String(rawCode).trim() : "";
      previewCodes[col] = code || null;

      if (!c.employee) {
        if (code) warnings.push(`${date} ${employeeLabel(col)}열: 매칭되는 직원이 없어요`);
        continue;
      }

      // 빈칸 = 그 근무자의 그 날짜 기존 근무 기록을 지운다 (실수로 지우는 걸 막으려면
      // 알 수 없는 코드처럼 건너뛰면 안 되고, 명확히 비운 칸만 삭제 대상으로 취급한다)
      if (!code) {
        clearedCells.push({ employee_id: c.employee.id, work_date: date });
        continue;
      }

      const mapping = CODE_MAP[code];
      if (!mapping) {
        warnings.push(`${date} ${c.employee.name}: 알 수 없는 코드 '${code}'`);
        continue;
      }

      const hours = hoursFor(mapping.type);
      rows.push({
        employee_id: c.employee.id,
        work_date: date,
        shift_type: mapping.type,
        is_main: mapping.main,
        start_time: hours.start,
        end_time: hours.end,
      });
    }

    preview.push({ date, codes: previewCodes });
  }

  return { rows, clearedCells, warnings, preview, employeeNames };
}

export async function applyParsedSchedule(
  rows: ParsedRow[],
  clearedCells: ClearedCell[] = []
): Promise<{ error: string | null }> {
  // 빈칸으로 지정된 근무자·날짜는 기존 기록을 삭제한다. 근무자별로 묶어서 한 번에
  // 지우면(개별 요청 대신) 최대 근무자 수만큼의 요청으로 끝난다.
  if (clearedCells.length > 0) {
    const datesByEmployee = new Map<string, string[]>();
    for (const c of clearedCells) {
      const arr = datesByEmployee.get(c.employee_id) ?? [];
      arr.push(c.work_date);
      datesByEmployee.set(c.employee_id, arr);
    }
    for (const [employeeId, dates] of datesByEmployee) {
      const { error } = await supabase
        .from("shifts")
        .delete()
        .eq("employee_id", employeeId)
        .in("work_date", dates);
      if (error) return { error: error.message };
    }
  }

  if (rows.length === 0) return { error: null };

  // 이미 공휴일로 지정된 날짜에 주간/대휴로 쓰려는 행은 자동으로 휴무로 바꾼다.
  // (공휴일 지정 체크박스를 켤 때는 그 시점에 있던 기록만 바뀌는데, 그 이후에 근무표
  // 업로드나 근무패턴 적용으로 같은 날짜에 새로 주간/대휴를 쓰면 그때는 안 걸리던 문제)
  const dates = rows.map((r) => r.work_date).sort();
  const { data: holidayRows, error: holidayError } = await supabase
    .from("holidays")
    .select("work_date")
    .gte("work_date", dates[0])
    .lte("work_date", dates[dates.length - 1]);
  if (holidayError) return { error: holidayError.message };

  const holidaySet = new Set((holidayRows ?? []).map((h) => h.work_date));
  const finalRows: ParsedRow[] =
    holidaySet.size === 0
      ? rows
      : rows.map((r) =>
          holidaySet.has(r.work_date) && (r.shift_type === "day" || r.shift_type === "leave")
            ? { ...r, shift_type: "off", is_main: false, start_time: null, end_time: null }
            : r
        );

  // 1단계: 전부 is_main=false로 업서트 (메인당직 유니크 제약 충돌 방지)
  const { error: upsertError } = await supabase.from("shifts").upsert(
    finalRows.map((r) => ({ ...r, is_main: false, updated_at: new Date().toISOString() })),
    { onConflict: "work_date,employee_id" }
  );
  if (upsertError) return { error: upsertError.message };

  // 2단계: 메인당직자만 true로 (1단계에서 이미 전부 false라 서로 충돌 없음)
  // row마다 개별 요청을 보내면 근무패턴처럼 건수가 많을 때 동시 요청이 폭증해
  // (realtime 변경 이벤트까지 겹치면) 브라우저가 ERR_INSUFFICIENT_RESOURCES로 죽을 수 있어
  // 한 번의 upsert로 묶어 보낸다.
  const mainRows = finalRows.filter((r) => r.is_main);
  if (mainRows.length > 0) {
    const { error: mainError } = await supabase.from("shifts").upsert(
      mainRows.map((r) => ({ ...r, is_main: true, updated_at: new Date().toISOString() })),
      { onConflict: "work_date,employee_id" }
    );
    if (mainError) return { error: mainError.message };
  }

  return { error: null };
}
