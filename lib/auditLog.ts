import { supabase } from "./supabaseClient";
import { SHIFT_LABELS, ShiftType, LeaveUsageType } from "./types";
import { weekdayLabel } from "./dateUtils";
import { USAGE_SHORT_LABELS } from "./shiftDisplay";

export type AuditTableName = "shifts" | "holidays" | "employees" | "shift_leave_usage";
export type AuditOperation = "INSERT" | "UPDATE" | "DELETE";

export interface AuditLogEntry {
  id: number;
  tableName: string;
  rowId: string;
  operation: AuditOperation;
  changedByEmail: string | null;
  changedAt: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

export async function fetchAuditLog(limit = 300): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, table_name, row_id, operation, changed_by_email, changed_at, old_data, new_data")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    tableName: r.table_name,
    rowId: r.row_id,
    operation: r.operation,
    changedByEmail: r.changed_by_email,
    changedAt: r.changed_at,
    oldData: r.old_data as Record<string, unknown> | null,
    newData: r.new_data as Record<string, unknown> | null,
  }));
}

export interface AuditBatch {
  id: string; // 배치 안 첫(가장 최근) 항목의 id
  changedByEmail: string | null;
  changedAt: string; // 배치 안 첫(가장 최근) 항목의 시각
  entries: AuditLogEntry[];
}

// 근무패턴 적용처럼 한 번의 작업이 수백 건씩 개별 행을 건드리면 로그도 그만큼 여러
// 줄로 남는다. 같은 사용자가 짧은 시간(기본 5초) 안에 연달아 남긴 기록은 하나의
// "일괄 작업" 묶음으로 접어서 보여줄 수 있게, entries는 이미 changedAt 내림차순으로
// 정렬돼 있다고 가정하고 인접한 항목끼리 묶는다.
export function groupIntoBatches(entries: AuditLogEntry[], windowMs = 5000): AuditBatch[] {
  const batches: AuditBatch[] = [];

  for (const entry of entries) {
    const current = batches[batches.length - 1];
    const last = current?.entries[current.entries.length - 1];
    const withinWindow =
      last &&
      current!.changedByEmail === entry.changedByEmail &&
      Math.abs(new Date(last.changedAt).getTime() - new Date(entry.changedAt).getTime()) <= windowMs;

    if (withinWindow) {
      current!.entries.push(entry);
    } else {
      batches.push({
        id: String(entry.id),
        changedByEmail: entry.changedByEmail,
        changedAt: entry.changedAt,
        entries: [entry],
      });
    }
  }

  return batches;
}

// 배치 요약 - "근무표 추가 320건, 부분사용 추가 3건" 형태
export function summarizeBatch(entries: AuditLogEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = `${TABLE_LABELS[e.tableName] ?? e.tableName} ${OPERATION_LABELS[e.operation]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => `${k} ${n}건`).join(", ");
}

export const TABLE_LABELS: Record<string, string> = {
  shifts: "근무표",
  holidays: "공휴일",
  employees: "직원",
  shift_leave_usage: "부분사용",
};

export const OPERATION_LABELS: Record<AuditOperation, string> = {
  INSERT: "추가",
  UPDATE: "수정",
  DELETE: "삭제",
};

function formatDate(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}(${weekdayLabel(dateStr)})`;
}

// old→new 값이 실제로 달라진 필드만 "라벨: old→new" 문장으로 뽑아낸다.
function diffFields(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fields: { key: string; label: string; format?: (v: unknown) => string }[]
): string[] {
  const lines: string[] = [];
  for (const { key, label, format } of fields) {
    const before = oldData[key];
    const after = newData[key];
    if (before === after) continue;
    const fmt = format ?? ((v: unknown) => (v === null || v === undefined ? "없음" : String(v)));
    lines.push(`${label}: ${fmt(before)} → ${fmt(after)}`);
  }
  return lines;
}

const yesNo = (v: unknown) => (v ? "예" : "아니오");
const shiftTypeLabel = (v: unknown) =>
  v ? SHIFT_LABELS[v as ShiftType] ?? String(v) : "없음";
const dateOrNone = (v: unknown) => (v ? formatDate(String(v)) : "없음");

// 로그 한 줄의 "무엇이 바뀌었는지" 설명 문장을 만든다. 근무자 이름은 employee_id로
// 찾아야 해서 employeeNameById 맵을 받는다(비활성/삭제된 직원도 표시할 수 있게
// audit_log에 남은 스냅샷에서 직접 이름을 못 찾으면 employee_id를 그대로 보여준다).
export function describeAuditEntry(
  entry: AuditLogEntry,
  employeeNameById: Map<string, string>
): string {
  const { operation, oldData, newData, tableName } = entry;
  const row = newData ?? oldData ?? {};

  if (tableName === "shifts") {
    const empId = String(row.employee_id ?? "");
    const empName = employeeNameById.get(empId) ?? empId.slice(0, 8);
    const workDate = row.work_date ? formatDate(String(row.work_date)) : "";
    const who = `${empName} ${workDate}`;

    if (operation === "INSERT" && newData) {
      const main = newData.is_main ? "(메인)" : "";
      return `${who} → ${shiftTypeLabel(newData.shift_type)}${main} 등록`;
    }
    if (operation === "DELETE" && oldData) {
      return `${who} ${shiftTypeLabel(oldData.shift_type)} 기록 삭제`;
    }
    if (operation === "UPDATE" && oldData && newData) {
      const changes = diffFields(oldData, newData, [
        { key: "shift_type", label: "근무형태", format: shiftTypeLabel },
        { key: "is_main", label: "메인당직", format: yesNo },
        { key: "start_time", label: "출근시각" },
        { key: "end_time", label: "퇴근시각" },
        { key: "leave_for_date", label: "대휴 원래근무일", format: dateOrNone },
      ]);
      return changes.length > 0 ? `${who}: ${changes.join(", ")}` : `${who}: 변경 없음`;
    }
    return who;
  }

  if (tableName === "holidays") {
    const workDate = row.work_date ? formatDate(String(row.work_date)) : "";
    if (operation === "INSERT" && newData) {
      return `${workDate} 공휴일로 지정${newData.name ? ` (${newData.name})` : ""}`;
    }
    if (operation === "DELETE") {
      return `${workDate} 공휴일 해제`;
    }
    if (operation === "UPDATE" && oldData && newData) {
      const changes = diffFields(oldData, newData, [{ key: "name", label: "공휴일 이름" }]);
      return changes.length > 0 ? `${workDate}: ${changes.join(", ")}` : `${workDate}: 변경 없음`;
    }
    return workDate;
  }

  if (tableName === "employees") {
    const name = String(row.name ?? entry.rowId.slice(0, 8));
    if (operation === "INSERT") {
      return `직원 추가: ${name}`;
    }
    if (operation === "DELETE") {
      return `직원 삭제: ${name}`;
    }
    if (operation === "UPDATE" && oldData && newData) {
      const changes = diffFields(oldData, newData, [
        { key: "name", label: "이름" },
        { key: "employee_number", label: "사번" },
        { key: "sort_order", label: "순번" },
        { key: "active", label: "활성 상태", format: yesNo },
      ]);
      return changes.length > 0 ? `${name}: ${changes.join(", ")}` : `${name}: 변경 없음`;
    }
    return name;
  }

  if (tableName === "shift_leave_usage") {
    const empId = String(row.employee_id ?? "");
    const empName = employeeNameById.get(empId) ?? empId.slice(0, 8);
    const workDate = row.work_date ? formatDate(String(row.work_date)) : "";
    const who = `${empName} ${workDate}`;

    const usageDesc = (r: Record<string, unknown>) => {
      const usageLabel = USAGE_SHORT_LABELS[r.usage_type as LeaveUsageType] ?? String(r.usage_type);
      const hours = r.hours ?? "?";
      const start = r.start_time ? String(r.start_time).slice(0, 5) : "?";
      const end = r.end_time ? String(r.end_time).slice(0, 5) : "?";
      const reason = r.reason ? ` - ${r.reason}` : "";
      return `${usageLabel} ${hours}시간(${start}~${end})${reason}`;
    };

    if (operation === "INSERT" && newData) {
      return `${who} 근무 중 ${usageDesc(newData)} 사용 등록`;
    }
    if (operation === "DELETE" && oldData) {
      return `${who} ${usageDesc(oldData)} 사용 취소`;
    }
    if (operation === "UPDATE" && oldData && newData) {
      const changes = diffFields(oldData, newData, [
        { key: "usage_type", label: "사용유형", format: (v) => USAGE_SHORT_LABELS[v as LeaveUsageType] ?? String(v) },
        { key: "hours", label: "시간" },
        { key: "start_time", label: "시작시각" },
        { key: "end_time", label: "종료시각" },
        { key: "reason", label: "사유" },
      ]);
      return changes.length > 0 ? `${who}: ${changes.join(", ")}` : `${who}: 변경 없음`;
    }
    return who;
  }

  return JSON.stringify(row);
}
