import * as XLSX from "xlsx";
import { Employee, Shift, SHIFT_LABELS } from "./types";
import { ShiftDefaultsMap } from "./useShiftDefaults";
import { getMonthDates } from "./dateUtils";

// ERP 업로드 양식("근무유형" 시트)에 등록된 시간대 템플릿 전체 목록.
// 우리 쪽 근무시간 설정이 이 중 하나와 정확히 일치해야 ERP에 올릴 수 있다.
interface ErpShiftTemplate {
  code: string;
  label: string;
  start: string; // HH:mm
  end: string; // HH:mm, 자정은 "00:00"
}

const ERP_WORK_TEMPLATES: ErpShiftTemplate[] = [
  { code: "1", label: "09:00 ~ 18:00", start: "09:00", end: "18:00" },
  { code: "2", label: "(스케줄, IT) 06:00 ~ 15:00", start: "06:00", end: "15:00" },
  { code: "3", label: "(스케줄) 07:30 ~ 16:30", start: "07:30", end: "16:30" },
  { code: "4", label: "(스케줄, IT) 14:00 ~ 23:00", start: "14:00", end: "23:00" },
  { code: "6", label: "(스케줄, IT) 15:00 ~ 00:00", start: "15:00", end: "00:00" },
  { code: "8", label: "(스케줄, 기타) 13:00 ~ 22:00", start: "13:00", end: "22:00" },
  { code: "14", label: "(IT) 16:00 ~ 01:00", start: "16:00", end: "01:00" },
  { code: "15", label: "(IT) 17:00 ~ 02:00", start: "17:00", end: "02:00" },
  { code: "16", label: "(IT) 18:00 ~ 03:00", start: "18:00", end: "03:00" },
  { code: "17", label: "(IT) 22:00 ~ 07:00", start: "22:00", end: "07:00" },
  { code: "37", label: "(유연) 08:00 ~ 17:00", start: "08:00", end: "17:00" },
  { code: "38", label: "(유연) 08:30 ~ 17:30", start: "08:30", end: "17:30" },
  { code: "39", label: "(유연) 09:30 ~ 18:30", start: "09:30", end: "18:30" },
  { code: "40", label: "(유연) 10:00 ~ 19:00", start: "10:00", end: "19:00" },
  { code: "41", label: "(스케줄, IT) 06:30 ~ 15:30", start: "06:30", end: "15:30" },
  { code: "42", label: "(IT) 11:00 ~ 20:00", start: "11:00", end: "20:00" },
  { code: "43", label: "(IT) 12:00 ~ 21:00", start: "12:00", end: "21:00" },
  { code: "45", label: "(상품) 06:30 ~ 23:00", start: "06:30", end: "23:00" },
];

const ERP_OFF_TEMPLATE = { code: "44", label: "(스케줄) 휴무" };

const ERP_HEADER = [
  "사원코드",
  "사원명",
  "근무일자",
  "휴일여부",
  "휴일여부코드",
  "근무구분",
  "근무구분코드",
  "근무시작",
  "근무종료",
  "근무유형",
  "근무순번",
];

function findWorkTemplate(start: string, end: string): ErpShiftTemplate | undefined {
  return ERP_WORK_TEMPLATES.find((t) => t.start === start && t.end === end);
}

function toCompactDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function toCompactTime(hhmm: string): string {
  return hhmm.replace(":", "");
}

export interface ErpExportResult {
  error?: string;
}

// ERP 업로드 양식 그대로 한 직원의 한 달치 근무를 내보낸다.
// 연차/본인대휴/기타 등 근무 중 부분사용 내역은 반영하지 않고(별도로 ERP에서 상신),
// 공휴일/대휴/휴무는 전부 동일한 "휴무" 패턴으로, 새벽/주간/야간은 현재 설정된 기본
// 근무시각을 그대로 사용한다. 근무기록이 없는 날짜는 행 자체를 건너뛴다.
export function exportErpExcel(
  employee: Employee,
  year: number,
  month: number,
  shifts: Shift[],
  holidayDates: Set<string>,
  shiftDefaults: ShiftDefaultsMap
): ErpExportResult {
  const templates: Record<"dawn" | "day" | "night", ErpShiftTemplate | undefined> = {
    dawn: findWorkTemplate(shiftDefaults.dawn.start, shiftDefaults.dawn.end),
    day: findWorkTemplate(shiftDefaults.day.start, shiftDefaults.day.end),
    night: findWorkTemplate(shiftDefaults.night.start, shiftDefaults.night.end),
  };

  const missing = (["dawn", "day", "night"] as const).filter((t) => !templates[t]);
  if (missing.length > 0) {
    const labels = missing.map((t) => SHIFT_LABELS[t]).join(", ");
    return {
      error: `${labels} 근무의 기본 시간이 ERP 근무유형 목록에 없는 값이에요. "근무시간 설정"에서 ERP에 등록된 시간대로 맞춰주세요.`,
    };
  }

  const monthDates = getMonthDates(year, month);
  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) {
    if (s.employee_id === employee.id) shiftMap.set(s.work_date, s);
  }

  const rows: string[][] = [ERP_HEADER];

  for (const date of monthDates) {
    const shift = shiftMap.get(date);
    if (!shift) continue; // 미배정일은 행을 건너뜀

    const isOffLike =
      holidayDates.has(date) ||
      shift.shift_type === "leave" ||
      shift.shift_type === "off" ||
      shift.shift_type === "annual";

    if (isOffLike) {
      rows.push([
        employee.employee_number ?? "",
        employee.name,
        toCompactDate(date),
        "휴일",
        "20",
        "휴무",
        "07",
        "",
        "",
        ERP_OFF_TEMPLATE.label,
        ERP_OFF_TEMPLATE.code,
      ]);
      continue;
    }

    // 이 시점에는 dawn/day/night만 남는다
    const type = shift.shift_type as "dawn" | "day" | "night";
    const def = shiftDefaults[type];
    const template = templates[type]!;

    rows.push([
      employee.employee_number ?? "",
      employee.name,
      toCompactDate(date),
      "평일",
      "10",
      "근무",
      "00",
      toCompactTime(def.start),
      toCompactTime(def.end),
      template.label,
      template.code,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "양식");
  XLSX.writeFile(wb, `ERP업로드_${employee.name}_${year}년${month}월.xlsx`);

  return {};
}
