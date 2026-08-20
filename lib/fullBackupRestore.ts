import { supabase } from "./supabaseClient";
import { BACKUP_TABLE_CONFIG } from "./backupTables";

export interface FullBackupPayload {
  app?: string;
  exportedAt?: string;
  tables: Record<string, unknown[]>;
}

// 자식 → 부모 순서로 삭제해야 외래키 문제 없이 안전하게 지울 수 있다
const DELETE_ORDER = [
  "shift_leave_usage",
  "shifts",
  "comp_leave_monthly",
  "comp_leave_summary",
  "annual_leave_allocation",
  "holidays",
  "shift_type_defaults",
  "notice",
  "shift_pattern_applications",
  "shift_patterns",
  "user_preferences",
  "employees",
];

// 부모 → 자식 순서로 넣어야 참조하는 id가 먼저 존재한다
const INSERT_ORDER = [
  "employees",
  "shifts",
  "shift_leave_usage",
  "holidays",
  "shift_type_defaults",
  "comp_leave_monthly",
  "comp_leave_summary",
  "annual_leave_allocation",
  "notice",
  "shift_patterns",
  "shift_pattern_applications",
  "user_preferences",
];

const CHUNK_SIZE = 500;

export function tableConfigList() {
  return BACKUP_TABLE_CONFIG;
}

export function parseBackupFile(text: string): { data?: FullBackupPayload; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "JSON 형식이 아니에요. 올바른 백업 파일인지 확인해주세요." };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("tables" in parsed) ||
    typeof (parsed as { tables?: unknown }).tables !== "object" ||
    (parsed as { tables?: unknown }).tables === null
  ) {
    return { error: "백업 파일 형식이 올바르지 않아요 (tables 항목이 없어요)." };
  }

  const tables = (parsed as FullBackupPayload).tables;
  const missing = BACKUP_TABLE_CONFIG.filter((c) => !Array.isArray(tables[c.table]));
  if (missing.length > 0) {
    return {
      error: `백업 파일에 다음 테이블 데이터가 없어요: ${missing.map((m) => m.label).join(", ")}`,
    };
  }

  return { data: parsed as FullBackupPayload };
}

export async function fetchCurrentCounts(): Promise<Record<string, number>> {
  const results = await Promise.all(
    BACKUP_TABLE_CONFIG.map((c) => supabase.from(c.table).select("*", { count: "exact", head: true }))
  );
  const counts: Record<string, number> = {};
  BACKUP_TABLE_CONFIG.forEach((c, i) => {
    counts[c.table] = results[i].count ?? 0;
  });
  return counts;
}

export async function restoreFromBackup(
  backup: FullBackupPayload,
  onProgress?: (message: string) => void
): Promise<{ error?: string }> {
  const pkMap = new Map(BACKUP_TABLE_CONFIG.map((c) => [c.table, c.pk]));

  for (const table of DELETE_ORDER) {
    onProgress?.(`${table} 기존 데이터 삭제 중...`);
    const pk = pkMap.get(table);
    if (!pk) continue;
    const { error } = await supabase.from(table).delete().not(pk, "is", null);
    if (error) return { error: `${table} 삭제 실패: ${error.message}` };
  }

  for (const table of INSERT_ORDER) {
    const rows = backup.tables[table] ?? [];
    if (rows.length === 0) continue;
    onProgress?.(`${table} 복원 중... (${rows.length}건)`);
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from(table).insert(chunk);
      if (error) return { error: `${table} 복원 실패: ${error.message}` };
    }
  }

  return {};
}
