"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// 마지막 JSON 백업이 이 일수 이상 지났으면(또는 기록이 아예 없으면) 백업하라고 알린다.
export const BACKUP_STALE_DAYS = 14;

export interface LastBackup {
  createdAt: string;
  createdByEmail: string | null;
  daysAgo: number; // 불러온 시점 기준 경과 일수
}

// migration v22의 backup_log 기준. 테이블이 아직 없으면(SQL 미실행) null과 함께 error를 돌려준다.
export async function fetchLastBackup(): Promise<{ last: LastBackup | null; error: string | null }> {
  const { data, error } = await supabase
    .from("backup_log")
    .select("created_at, created_by_email")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { last: null, error: error.message };
  if (!data) return { last: null, error: null };
  return {
    last: {
      createdAt: data.created_at,
      createdByEmail: data.created_by_email,
      daysAgo: Math.floor((Date.now() - new Date(data.created_at).getTime()) / (24 * 60 * 60 * 1000)),
    },
    error: null,
  };
}

export async function recordBackup(email: string | null): Promise<void> {
  const { error } = await supabase.from("backup_log").insert({ created_by_email: email });
  if (error) console.error("백업 기록 저장 실패:", error);
}

// 관리자 헤더의 "JSON 백업" 버튼 알림용. enabled가 false(일반 사용자)면 조회하지 않는다.
export function useLastBackup(enabled: boolean) {
  const [last, setLast] = useState<LastBackup | null>(null);
  // 기록이 없는 것과 아직 못 불러온 것(또는 테이블이 없는 것)을 구분해서, 불러오기 전에는 알림을 안 띄운다.
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { last: fetched, error } = await fetchLastBackup();
    setLast(fetched);
    setLoaded(!error);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [enabled, refresh]);

  const stale = loaded && (!last || last.daysAgo >= BACKUP_STALE_DAYS);
  return { last, loaded, stale, refresh };
}
