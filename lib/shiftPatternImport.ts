import * as XLSX from "xlsx";
import { ShiftType } from "./types";

// 근무 코드 매핑은 기존 근무표 엑셀 업로드(scheduleImport.ts)와 동일한 기준을 쓴다.
const CODE_MAP: Record<string, { type: ShiftType; main: boolean }> = {
  메: { type: "dawn", main: true },
  조: { type: "dawn", main: false },
  야: { type: "night", main: true },
  여: { type: "night", main: false },
  주: { type: "day", main: false },
  휴: { type: "off", main: false },
  대: { type: "leave", main: false },
};

export const PATTERN_DAYS = 49;
export const PATTERN_EMPLOYEES = 7; // B~H = A~G 순번 7명

export interface PatternCell {
  shiftType: ShiftType;
  isMain: boolean;
}

export type PatternDays = (PatternCell | null)[][]; // [dayIndex 0~48][col 0~6]

export interface ParsedPattern {
  days: PatternDays;
  warnings: string[];
}

// 양식: 1행은 헤더(A~G), 2행부터 49일치. A열(날짜)은 참고용일 뿐이라 순서만 쓰고 무시한다.
export async function parsePatternFile(file: File): Promise<ParsedPattern> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

  const warnings: string[] = [];
  const days: PatternDays = [];

  for (let r = 1; r < raw.length && days.length < PATTERN_DAYS; r++) {
    const line = raw[r] ?? [];
    const rowCells: (PatternCell | null)[] = [];

    for (let col = 0; col < PATTERN_EMPLOYEES; col++) {
      const rawCode = line[col + 1];
      const code = rawCode ? String(rawCode).trim() : "";
      if (!code) {
        rowCells.push(null);
        continue;
      }
      const mapping = CODE_MAP[code];
      if (!mapping) {
        warnings.push(`${days.length + 1}일차 ${String.fromCharCode(65 + col)}열: 알 수 없는 코드 '${code}'`);
        rowCells.push(null);
        continue;
      }
      rowCells.push({ shiftType: mapping.type, isMain: mapping.main });
    }

    days.push(rowCells);
  }

  if (days.length < PATTERN_DAYS) {
    warnings.unshift(
      `${PATTERN_DAYS}일치 데이터가 필요한데 ${days.length}일치만 읽었어요. 2행부터 ${PATTERN_DAYS + 1}행까지 채워주세요.`
    );
  }

  return { days, warnings };
}

// PatternCell → 원래 한 글자 코드로 되돌리기 (CODE_MAP의 역매핑)
const CODE_BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_MAP).map(([code, { type, main }]) => [`${type}:${main}`, code])
);

function cellCode(cell: PatternCell | null): string | null {
  if (!cell) return null;
  return CODE_BY_KEY[`${cell.shiftType}:${cell.isMain}`] ?? null;
}

// 하루(행)에 정확히 1개씩 있어야 하는 코드 - 새벽/야간 각각 메인+보조 1명씩
const REQUIRED_DAILY_ONCE = ["메", "조", "야", "여"] as const;

// 한 명(열)의 49일 동안 코드별로 정확히 몇 번씩 있어야 하는지
const EXPECTED_COLUMN_COUNTS: Record<string, number> = {
  메: 7,
  조: 7,
  야: 7,
  여: 7,
  주: 7,
  대: 8,
  휴: 6,
};

// 근무패턴이 실제로 돌아가는 규칙(하루 새벽/야간 2인1조, 사람별 근무 배분)에 맞는지 검증한다.
// 어긋나는 게 있으면 이유를 사람이 읽을 수 있는 문장으로 돌려준다.
export function validatePattern(days: PatternDays): string[] {
  const errors: string[] = [];

  days.forEach((row, dayIdx) => {
    const counts: Record<string, number> = {};
    for (const cell of row) {
      const code = cellCode(cell);
      if (!code) continue;
      counts[code] = (counts[code] ?? 0) + 1;
    }
    for (const code of REQUIRED_DAILY_ONCE) {
      const count = counts[code] ?? 0;
      if (count !== 1) {
        errors.push(`${dayIdx + 1}일차: '${code}'가 ${count}개예요 (하루에 정확히 1개씩 있어야 해요)`);
      }
    }
  });

  const columnCount = days[0]?.length ?? PATTERN_EMPLOYEES;
  for (let col = 0; col < columnCount; col++) {
    const counts: Record<string, number> = {};
    for (const row of days) {
      const code = cellCode(row[col]);
      if (!code) continue;
      counts[code] = (counts[code] ?? 0) + 1;
    }
    for (const [code, expected] of Object.entries(EXPECTED_COLUMN_COUNTS)) {
      const count = counts[code] ?? 0;
      if (count !== expected) {
        errors.push(
          `${String.fromCharCode(65 + col)}열(${col + 1}번째 근무자): '${code}'가 ${count}개예요 (${expected}개여야 해요)`
        );
      }
    }
  }

  return errors;
}
