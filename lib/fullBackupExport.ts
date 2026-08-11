import { supabase } from "./supabaseClient";
import { downloadBlob } from "./captureImage";
import { BACKUP_TABLE_CONFIG } from "./backupTables";

// Supabase/PostgREST는 한 번의 select 요청에 기본적으로 최대 1000행까지만 돌려준다.
// 데이터가 그보다 많아지면 무조건 range()로 나눠서 끝까지 읽어야 조용히 잘려나가는 걸 막을 수 있다.
const PAGE_SIZE = 1000;

async function fetchAllRows(table: string, pk: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(pk, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows };
}

export interface FullBackupResult {
  error?: string;
}

// 나중에 복원(재적재)까지 염두에 둔 전체 DB 스냅샷이라, 사람이 보기 좋은 형태(엑셀)가 아니라
// 모든 컬럼(id, 생성/수정 시각 등 포함)을 원본 그대로, 행 수 제한 없이 보존하는 JSON으로 내보낸다.
export async function exportFullBackupJson(): Promise<FullBackupResult> {
  const results = await Promise.all(
    BACKUP_TABLE_CONFIG.map((c) => fetchAllRows(c.table, c.pk))
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { error: `백업 실패: ${failed.error}` };
  }

  const tables: Record<string, unknown[]> = {};
  BACKUP_TABLE_CONFIG.forEach((c, i) => {
    tables[c.table] = results[i].rows;
  });

  const payload = {
    app: "gms-schedule-app",
    exportedAt: new Date().toISOString(),
    tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const stamp = `${y}${mo}${d}_${hh}${mm}`;
  downloadBlob(blob, `GMSSCHEDULEAPP_BACKUP_${stamp}.json`);

  return {};
}
