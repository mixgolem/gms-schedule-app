import * as XLSX from "xlsx";
import { Employee, ShiftType } from "./types";
import { parseLocalDate, isWeekend } from "./dateUtils";
import { ParseResult, ParsePreviewRow, hoursFor, serialToDateStr } from "./scheduleImport";

export interface LegacyParseResult extends ParseResult {
  // 범례에는 있지만 지금 직원 목록에서 이름이 매칭 안 된 것들 (중복 제거된 이름 목록).
  // 업로드 화면에서 이 이름들을 직접 특정 직원으로 지정해 다시 매칭할 수 있게 노출한다.
  unmatchedLegendNames: string[];
  // 이번에 실제로 반영 대상이 된 월('yyyy-MM'). 파일에 여러 달이 섞여 있어도 이 근무표는
  // 항상 월 단위로 올리는 거라, 건수가 가장 많은 달 하나만 남기고 나머지는 제외한다.
  keptMonth: string | null;
}

// 예전에 쓰던 엑셀 근무표(요일별 7칸 블록이 가로로 반복되고, 그 밑에 06:30~24:00을
// 잘게 쪼갠 8개 슬롯 행에 O를 찍는 방식)를 지금 앱의 근무표 형식으로 변환한다.
//
// 레이아웃(사용자 확인 완료):
// - 1행 어딘가에 "A : 이름(전화)" 같은 범례가 직원 수만큼, 왼쪽부터 코드 순서(A,B,C...)로 있다.
//   → 이 순서가 곧 각 요일 블록 안에서 그 직원이 몇 번째 열인지를 정한다.
// - 날짜 행(“일자”)마다 요일 7개(월~일) 블록이 가로로 있고, 블록 너비 = 직원 수.
// - 맨 처음 날짜 블록 바로 아래에만 "당직자"(A,B,C...) 헤더 행이 한 번 있고, 그다음부터는 없다.
// - 그 아래 8개 슬롯 행(새벽/오전1/오전2/오후1/오후2/오후3/야간1/야간2)에 O가 찍혀 있으면
//   그 시간대에 일한 것 — 새벽 슬롯이 있으면 새벽, 야간 슬롯이 있으면 야간, 그 외엔 주간.
// - "적용 일자" 행: "9/5"처럼 M/D 날짜가 적혀 있으면 그날은 주말근무 대휴이고 그 날짜가
//   보상하는 원래근무일. 그 외 텍스트(연차/대휴/건강검진 등)는 전부 주간근무로 취급한다.
// - "메인당직자" 행: ☆=새벽 메인, ★=야간 메인.
// 인원수·이름·날짜 범위는 파일마다 다를 수 있어 전부 이 파일에서 읽어서 알아낸다.

const SLOT_COUNT = 8; // 새벽,오전1,오전2,오후1,오후2,오후3,야간1,야간2
const DAWN_SLOT = 0;
const NIGHT_SLOTS = [6, 7];

function isDateSerial(v: unknown): v is number {
  return typeof v === "number" && v > 0 && !!serialToDateStr(v);
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// 1행 근처에서 "A : 이름(전화)" 같은 범례를 왼쪽→오른쪽 순서로 모두 찾는다.
// 이 순서가 각 요일 블록 안의 직원 열 순서와 같다.
function extractLegend(raw: unknown[][]): { code: string; name: string }[] {
  const RE = /^([A-Za-z])\s*[:：]\s*(.+?)(?:\s*\([^)]*\))?\s*$/;
  for (let r = 0; r < Math.min(5, raw.length); r++) {
    const row = raw[r] ?? [];
    const found: { code: string; name: string }[] = [];
    for (let c = 0; c < row.length; c++) {
      const s = cellText(row[c]);
      if (!s) continue;
      const m = s.match(RE);
      if (m) found.push({ code: m[1].toUpperCase(), name: m[2].trim() });
    }
    if (found.length > 0) return found;
  }
  return [];
}

function findFirstDateRow(raw: unknown[][]): number {
  for (let r = 0; r < raw.length; r++) {
    const row = raw[r] ?? [];
    if (isDateSerial(row[1])) return r;
  }
  return -1;
}

// O가 찍힌 슬롯 인덱스 집합으로 근무형태를 판별. 새벽 슬롯이 있으면 새벽, 야간 슬롯이
// 있으면 야간(둘 다 없이 중간 슬롯만 있으면 주간), 아무것도 없으면 근무 아님.
function classifySlots(onIdx: Set<number>): "dawn" | "day" | "night" | null {
  if (onIdx.has(DAWN_SLOT)) return "dawn";
  if (NIGHT_SLOTS.some((i) => onIdx.has(i))) return "night";
  if (onIdx.size > 0) return "day";
  return null;
}

// "9/5" 같은 M/D 문자열을, 기준 날짜와 가장 가까운 연도로 채워 'yyyy-MM-dd'로.
// 연말/연초 경계(예: 기준 12/30, 대상 1/2)에서도 가장 가까운 해를 고른다.
function resolveMonthDayNear(monthDay: string, referenceDateStr: string): string | null {
  const m = monthDay.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12) return null;

  const ref = parseLocalDate(referenceDateStr);
  let best: Date | null = null;
  let bestDiff = Infinity;
  for (const yearOffset of [-1, 0, 1]) {
    const candidate = new Date(ref.getFullYear() + yearOffset, month - 1, day);
    if (candidate.getMonth() !== month - 1) continue; // 그 달에 없는 날짜(2/30 등)
    const diff = Math.abs(candidate.getTime() - ref.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  if (!best) return null;
  const y = best.getFullYear();
  const mo = String(best.getMonth() + 1).padStart(2, "0");
  const d = String(best.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

const CODE_FOR = (type: "dawn" | "day" | "night" | "leave" | "off", isMain: boolean): string => {
  if (type === "off") return "휴";
  if (type === "leave") return "대";
  if (type === "day") return "주";
  if (type === "dawn") return isMain ? "메" : "조";
  return isMain ? "야" : "여";
};

export async function parseLegacyScheduleFile(
  file: File,
  employees: Employee[],
  // 이름이 매칭 안 된 범례 이름 → 지정할 직원 id. 업로드 화면에서 사용자가 직접 골라
  // 넘겨주면 이름이 달라도(예: 개명·오타) 그 직원으로 매칭해서 다시 파싱한다.
  nameOverrides?: Record<string, string>
): Promise<LegacyParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // 이 양식은 블록 사이 절대 행 위치로 구조를 파악하니, blankrows를 걸러내지 않고 그대로 읽는다.
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const warnings: string[] = [];
  const rows: ParseResult["rows"] = [];
  const previewMap = new Map<string, (string | null)[]>();

  const legend = extractLegend(raw);
  if (legend.length === 0) {
    return {
      rows: [],
      clearedCells: [],
      warnings: ["직원 범례(예: A : 이름(전화))를 찾지 못했어요. 양식이 맞는지 확인해주세요."],
      preview: [],
      employeeNames: [],
      unmatchedLegendNames: [],
      keptMonth: null,
    };
  }
  const employeeCount = legend.length;

  const idToEmployee = new Map(employees.map((e) => [e.id, e]));
  const nameToEmployee = new Map(employees.map((e) => [e.name.trim(), e]));
  const matchedEmployees: (Employee | null)[] = legend.map((l) => {
    const overrideId = nameOverrides?.[l.name];
    if (overrideId) return idToEmployee.get(overrideId) ?? null;
    return nameToEmployee.get(l.name) ?? null;
  });
  const employeeNames: (string | null)[] = legend.map((l, i) => matchedEmployees[i]?.name ?? l.name);
  const unmatchedLegendNames = [...new Set(legend.filter((l, i) => !matchedEmployees[i]).map((l) => l.name))];
  legend.forEach((l, i) => {
    if (!matchedEmployees[i]) warnings.push(`${l.code}(${l.name}): 매칭되는 직원을 찾지 못했어요`);
  });

  const firstDateRow = findFirstDateRow(raw);
  if (firstDateRow === -1) {
    return {
      rows: [],
      clearedCells: [],
      warnings: [...warnings, "날짜가 적힌 행을 찾지 못했어요. 양식이 맞는지 확인해주세요."],
      preview: [],
      employeeNames,
      unmatchedLegendNames,
      keptMonth: null,
    };
  }

  // 같은 직원이 같은 원래근무일을 두 번 대휴로 찜하면 저장 시 유니크 제약에 걸리니 미리 걸러낸다.
  const claimedLeaveDates = new Map<string, Set<string>>();

  let dateRow = firstDateRow;
  let isFirstBlock = true;

  while (dateRow < raw.length) {
    const headRow = raw[dateRow] ?? [];
    if (!isDateSerial(headRow[1])) break; // 더 이상 날짜 블록이 없으면 종료

    const slotStart = dateRow + (isFirstBlock ? 2 : 1); // 첫 블록만 "당직자" 헤더 행이 하나 더 있음
    const applyRow = slotStart + SLOT_COUNT;
    const mainRow = applyRow + 1;

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const baseCol = 1 + dayIdx * employeeCount;
      const dateVal = headRow[baseCol];
      if (!isDateSerial(dateVal)) continue;
      const dateStr = serialToDateStr(dateVal as number);
      if (!dateStr) continue;

      const codes = previewMap.get(dateStr) ?? new Array<string | null>(employeeCount).fill(null);

      for (let ei = 0; ei < employeeCount; ei++) {
        const col = baseCol + ei;

        const slotsOn = new Set<number>();
        for (let si = 0; si < SLOT_COUNT; si++) {
          if (cellText((raw[slotStart + si] ?? [])[col])) slotsOn.add(si);
        }
        const applyVal = cellText((raw[applyRow] ?? [])[col]);
        const mainVal = cellText((raw[mainRow] ?? [])[col]);

        let shiftType: ShiftType | null = null;
        let isMain = false;
        let leaveForDate: string | null = null;

        const dateMatch = applyVal.match(/^\d{1,2}\/\d{1,2}$/);
        if (dateMatch) {
          shiftType = "leave";
          leaveForDate = resolveMonthDayNear(applyVal, dateStr);
          if (!leaveForDate) {
            warnings.push(
              `${dateStr} ${legend[ei].name}: 대휴 원래근무일 '${applyVal}'을 읽을 수 없어요`
            );
          }
        } else if (applyVal) {
          shiftType = "day"; // 연차/대휴(참조 없음)/건강검진 등 텍스트는 전부 주간근무로 취급
        } else {
          shiftType = classifySlots(slotsOn);
          if (shiftType === "dawn") isMain = mainVal === "☆";
          else if (shiftType === "night") isMain = mainVal === "★";
          else if (shiftType === null) {
            // 슬롯도 적용값도 완전히 빈 날 — 보통 공휴일 휴무라, 평일이면 대휴(원래근무일
            // 미지정)로, 주말이면 휴무로 채운다. 평일이 실제로 공휴일이면 저장할 때 기존
            // 공휴일 자동 변환 로직이 다시 휴무로 바꿔준다.
            shiftType = isWeekend(dateStr) ? "off" : "leave";
          }
        }

        codes[ei] = CODE_FOR(shiftType as "dawn" | "day" | "night" | "leave" | "off", isMain);

        const emp = matchedEmployees[ei];
        if (!emp) continue; // 매칭 안 된 직원은 위에서 이미 경고했으니 반영은 건너뜀

        if (shiftType === "leave" && leaveForDate) {
          const used = claimedLeaveDates.get(emp.id) ?? new Set<string>();
          if (used.has(leaveForDate)) {
            warnings.push(
              `${dateStr} ${emp.name}: 대휴 원래근무일 ${leaveForDate}가 다른 날짜와 중복돼서 건너뛰었어요`
            );
            continue;
          }
          used.add(leaveForDate);
          claimedLeaveDates.set(emp.id, used);
        }

        const hours = hoursFor(shiftType);
        rows.push({
          employee_id: emp.id,
          work_date: dateStr,
          shift_type: shiftType,
          is_main: isMain,
          start_time: hours.start,
          end_time: hours.end,
          leave_for_date: leaveForDate,
        });
      }

      previewMap.set(dateStr, codes);
    }

    dateRow = mainRow + 1;
    isFirstBlock = false;
  }

  // 원본 엑셀에 같은 날짜·같은 근무형태(새벽/야간)에 ★나 ☆가 실수로 두 명 이상 찍혀 있으면
  // 저장할 때 유니크 제약(같은 날 메인당직 1명)에 걸리니, 먼저 나온 사람만 메인으로 남기고
  // 나머지는 미리 메인 해제한다.
  const mainSeen = new Set<string>();
  for (const r of rows) {
    if (!r.is_main) continue;
    const key = `${r.work_date}|${r.shift_type}`;
    if (mainSeen.has(key)) {
      r.is_main = false;
      warnings.push(
        `${r.work_date}: 같은 날 메인당직(${r.shift_type === "dawn" ? "새벽" : "야간"})이 중복돼서 하나만 남겼어요`
      );
    } else {
      mainSeen.add(key);
    }
  }

  // 이 근무표는 항상 월 단위로만 올리는 거라, 파일에 여러 달이 섞여 있어도 건수가 가장
  // 많은 달 하나만 반영 대상으로 남기고 나머지는 제외한다(예: 표 맨 앞뒤로 살짝 삐져나온
  // 인접 월의 며칠치가 실수로 같이 반영되는 걸 막는다).
  const monthCounts = new Map<string, number>();
  for (const r of rows) {
    const ym = r.work_date.slice(0, 7);
    monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1);
  }
  let keptMonth: string | null = null;
  let bestCount = -1;
  for (const [ym, count] of monthCounts) {
    if (count > bestCount) {
      bestCount = count;
      keptMonth = ym;
    }
  }

  const filteredRows = keptMonth ? rows.filter((r) => r.work_date.startsWith(keptMonth as string)) : rows;
  const excludedRowCount = rows.length - filteredRows.length;
  if (keptMonth && excludedRowCount > 0) {
    warnings.push(`${keptMonth} 월만 반영 대상이라, 다른 달 기록 ${excludedRowCount}건은 제외했어요.`);
  }

  const previewEntries = keptMonth
    ? [...previewMap.entries()].filter(([date]) => date.startsWith(keptMonth as string))
    : [...previewMap.entries()];
  const preview: ParsePreviewRow[] = previewEntries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, codes]) => ({ date, codes }));

  return {
    rows: filteredRows,
    clearedCells: [],
    warnings,
    preview,
    employeeNames,
    unmatchedLegendNames,
    keptMonth,
  };
}
