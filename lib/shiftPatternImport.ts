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

// 양식: 1행은 헤더(직원 순번 글자 A,B,C...), 2행부터 파일에 있는 만큼 며칠치든 그대로 읽는다.
// A열(날짜)은 참고용일 뿐이라 순서만 쓰고 무시한다. 헤더 글자로 직원을 매칭하므로 열 순서가
// 달라도, 직원이 몇 명이든·패턴이 며칠짜리든 그대로 올릴 수 있다(근무표 업로드와 동일한 방식).
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

  for (let r = 1; r < raw.length; r++) {
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

  if (days.length === 0) {
    warnings.unshift("읽을 수 있는 패턴 데이터가 없어요. 2행부터 근무코드를 채워주세요.");
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

// 근무표 업로드 양식(헤더 남색 바탕 흰 글씨 + 근무형태별 색칠)과 같은 모양으로 꾸며서
// 내려받는다. sheetjs(xlsx) 무료판은 셀 스타일을 저장하지 못해서(써봐도 그냥 사라짐),
// 이 함수만 스타일 저장이 되는 exceljs를 번들 크기 때문에 그때그때 동적 import해서 쓴다.
const CODE_FILL_ARGB: Record<string, string> = {
  메: "FFFEF08A", // 새벽(메인) - 노랑, 실제 근무표와 동일
  조: "FFFEF08A", // 새벽(보조)
  야: "FFBFDBFE", // 야간(메인) - 파랑
  여: "FFBFDBFE", // 야간(보조)
  주: "FFC6D59F", // 주간 - 초록
  휴: "FFE5E7EB", // 휴무 - 회색
  대: "FFE5E7EB", // 대휴 - 회색
};

const PATTERN_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export async function downloadPatternExcel(
  days: PatternDays,
  presentSlots: boolean[],
  filename: string
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("패턴");

  const slotCount = days[0]?.length ?? 0;
  const headerRow = sheet.addRow([
    "일차",
    ...Array.from({ length: slotCount }, (_, i) => employeeLabel(i)),
  ]);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  days.forEach((row, dayIdx) => {
    const line = [`${dayIdx + 1}(${PATTERN_WEEKDAY_LABELS[dayIdx % 7]})`];
    for (let slot = 0; slot < slotCount; slot++) {
      line.push(presentSlots[slot] ? cellCode(row[slot]) ?? "" : "");
    }
    const excelRow = sheet.addRow(line);
    excelRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (colNumber === 1) return; // 일차 열은 색칠하지 않음
      const fill = CODE_FILL_ARGB[String(cell.value ?? "")];
      if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    });
  });

  sheet.getColumn(1).width = 10;
  for (let i = 0; i < slotCount; i++) sheet.getColumn(i + 2).width = 6;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 하루(행)에 정확히 1개씩 있어야 하는 코드 - 새벽/야간 각각 메인+보조 1명씩
const REQUIRED_DAILY_ONCE = ["메", "조", "야", "여"] as const;

// 근무패턴이 며칠짜리든·몇 명이든 상관없이 지켜야 하는 하루 단위 규칙(새벽/야간 2인1조)만
// 확인한다. 인원수·일수별 개수 총합은 패턴마다 다를 수 있어 검증 대상이 아니다 — 저장을
// 막지 않는 참고용 안내이며, 헤더에 없던 슬롯(열)은 검증 대상에서 뺀다.
export function validatePattern(days: PatternDays): string[] {
  const warnings: string[] = [];

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
        warnings.push(`${dayIdx + 1}일차: '${code}'가 ${count}개예요 (하루에 정확히 1개씩 있는 게 보통이에요)`);
      }
    }
  });

  return warnings;
}
