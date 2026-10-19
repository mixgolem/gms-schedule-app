"use client";

import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "./supabaseClient";
import { parseLocalDate, todayStr } from "./dateUtils";
import { detectCycleFromShifts, DetectedCycle, PatternCandidate } from "./patternCycle";

// 최근 이만큼의 실제 근무 기록으로 지금 돌아가는 패턴 주기를 찾는다(49일 패턴 한 바퀴 이상).
const LOOKBACK_DAYS = 56;

// 근무패턴 관리 창용: 저장된 패턴들과 최근 근무표를 맞춰 "지금 어떤 패턴이 며칠차인지" 알아낸다.
// refreshKey가 바뀌면(예: 방금 패턴을 적용함) 다시 계산한다.
export function useDetectedCycle(enabled: boolean, refreshKey: unknown) {
  const [detected, setDetected] = useState<DetectedCycle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const today = todayStr();
      const from = format(addDays(parseLocalDate(today), -(LOOKBACK_DAYS - 1)), "yyyy-MM-dd");
      const [{ data: employees }, { data: shifts }, { data: patterns }] = await Promise.all([
        supabase.from("employees").select("id, sort_order").eq("active", true),
        supabase
          .from("shifts")
          .select("employee_id, work_date, shift_type, is_main")
          .gte("work_date", from)
          .lte("work_date", today),
        supabase
          .from("shift_patterns")
          .select("id, pattern")
          .order("uploaded_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;

      const candidates: PatternCandidate[] = (patterns ?? [])
        .map((p) => ({ id: p.id, days: (p.pattern as { days?: PatternCandidate["days"] })?.days ?? [] }))
        .filter((p) => p.days.length > 0);
      const slotByEmployee = new Map((employees ?? []).map((e) => [e.id, e.sort_order - 1]));

      setDetected(detectCycleFromShifts(candidates, shifts ?? [], slotByEmployee, today));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return { detected, loading };
}
