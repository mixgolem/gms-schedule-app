import * as XLSX from "xlsx";
import { ShiftType, Employee, employeeLabel } from "./types";
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

export const PATTERN_DAYS = 49;

export interface PatternCell {
  shiftType: ShiftType;
  isMain: boolean;
}

// [dayIndex 0~48][slotIndex]. slotIndex는 항상 A=0,B=1,C=2... 글자 순번과 일치한다
// (실제 열 순서가 아니라 헤더 글자로 정렬됐기 때문에, generatePatternRows에서
// employeeLabel(slotIndex)로 항상 정확한 직원을 다시 찾을 수 있다).
export type PatternDays = (PatternCell | null)[][];

export interface ParsedPattern {
  days: PatternDays;
  // days와 같은 길이 — 이 패턴 파일의 헤더에 그 슬롯(글자)이 실제로 있었는지.
  // false인 슬롯은 그 직원을 이 패턴이 아예 언급하지 않는다는 뜻이라, 나중에 적용할 때도
  // 절대 건드리지 않는다(days의 null과는 의미가 다르다 — null은 "그 날짜만 비움"의 뜻).
  presentSlots: boolean[];
  warnings: string[];
}

// 양식: 1행은 헤더(직원 순번 글자 A,B,C...), 2행부터 49일치. A열(날짜)은 참고용일 뿐이라
// 순서만 쓰고 무시한다. 헤더 글자로 직원을 매칭하므로 열 순서가 달라도, 직원이 몇 명이든 된다.
export async function parsePatternFile(
  file: File,
  employees: Employee[]
): Promise<ParsedPattern> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

  const columns = resolveEmployeeColumns(raw[0] ?? [], employees);
  const presentSlots = columns.map((c) => c.fileCol !== null);

  const warnings: string[] = [];
  const days: PatternDays = [];

  for (let r = 1; r < raw.length && days.length < PATTERN_DAYS; r++) {
    const line = raw[r] ?? [];
    const rowCells: (PatternCell | null)[] = new Array(columns.length).fill(null);

    for (let col = 0; col < columns.length; col++) {
      const c = columns[col];
      if (c.fileCol === null) continue; // 이 글자는 파일 헤더에 없음 - 항상 null(적용시 건드리지 않음)

      const rawCode = line[c.fileCol + 1];
      const code = rawCode ? String(rawCode).trim() : "";
      if (!code) continue; // 빈칸 - 적용시 그 직원의 그 날짜 기록 삭제 대상

      const mapping = CODE_MAP[code];
      if (!mapping) {
        warnings.push(`${days.length + 1}일차 ${employeeLabel(col)}열: 알 수 없는 코드 '${code}'`);
        continue;
      }
      rowCells[col] = { shiftType: mapping.type, isMain: mapping.main };
    }

    days.push(rowCells);
  }

  if (days.length < PATTERN_DAYS) {
    warnings.unshift(
      `${PATTERN_DAYS}일치 데이터가 필요한데 ${days.length}일치만 읽었어요. 2행부터 ${PATTERN_DAYS + 1}행까지 채워주세요.`
    );
  }

  return { days, presentSlots, warnings };
}

// PatternCell → 원래 한 글자 코드로 되돌리기 (미리보기 표시용)
const CODE_BY_KEY: Record<string, string> = {
  "dawn:true": "메",
  "dawn:false": "조",
  "night:true": "야",
  "night:false": "여",
  "day:false": "주",
  "off:false": "휴",
  "leave:false": "대",
};

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
// 어긋나는 게 있으면 이유를 사람이 읽을 수 있는 문장으로 돌려준다. 헤더에 없던 슬롯(열)은
// 이 패턴이 아예 다루지 않는 자리라 검증 대상에서 뺀다.
export function validatePattern(days: PatternDays, presentSlots: boolean[]): string[] {
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

  const columnCount = days[0]?.length ?? 0;
  for (let col = 0; col < columnCount; col++) {
    if (!presentSlots[col]) continue; // 이 패턴에 없는 자리는 건너뜀

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
          `${employeeLabel(col)}열: '${code}'가 ${count}개예요 (${expected}개여야 해요)`
        );
      }
    }
  }

  return errors;
}
