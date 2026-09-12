"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Employee, Shift, ShiftLeaveUsage } from "@/lib/types";
import { debounce } from "@/lib/debounce";

// Supabase/PostgREST는 한 번의 select 요청에 기본 최대 1000행까지만 돌려준다. 1년치
// shifts는 직원 수·근무일수에 따라 쉽게 1000행을 넘을 수 있어, 페이지네이션 없이 조회하면
// 뒤쪽 데이터가 조용히 잘려나간다(예: 하반기 통계가 빠짐).
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, error: null };
}

// 연간 근무 통계(월별 근무시간 통계 12개월치)를 위한 1년치 데이터 로딩.
export function useYearlyStats(year: number) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [leaveUsages, setLeaveUsages] = useState<ShiftLeaveUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();
  // 연도 이동 중 이전 요청이 늦게 끝나 최신 화면을 덮어쓰는 경쟁 상태 방지.
  const requestIdRef = useRef(0);

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    const [{ data: emp }, { rows: sh }, { rows: usages }] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).order("sort_order"),
      fetchAllRows<Shift>((from, to) =>
        supabase
          .from("shifts")
          .select("*")
          .gte("work_date", startDate)
          .lte("work_date", endDate)
          .order("work_date", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<ShiftLeaveUsage>((from, to) =>
        supabase
          .from("shift_leave_usage")
          .select("*")
          .gte("work_date", startDate)
          .lte("work_date", endDate)
          .order("work_date", { ascending: true })
          .range(from, to)
      ),
    ]);

    // 이 요청 중에 더 최신 fetchData가 시작됐다면(예: 그 사이 연도 이동), 낡은 응답으로
    // 최신 상태를 덮어쓰지 않는다.
    if (requestId !== requestIdRef.current) return;

    setEmployees(emp ?? []);
    setShifts(sh);
    setLeaveUsages(usages);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`yearly-stats-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_leave_usage" }, () => {
        debounced.run();
      })
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  return { employees, shifts, leaveUsages, loading };
}
