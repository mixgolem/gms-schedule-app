"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface AnnualLeaveRow {
  employeeId: string;
  employeeName: string;
  sortOrder: number;
  allocatedHours: number;
  usedHoursYear: number; // 연간(1~12월) 합계
  usedDatesThisMonth: number[]; // 현재 보고 있는 달의 사용일
  remainingHours: number;
  remainingDaysLabel: string; // 정수면 정수, 아니면 소수 첫째자리
}

function formatRemainingDays(hours: number): string {
  const days = hours / 8;
  return `${Number.isInteger(days) ? String(days) : days.toFixed(1)}일`;
}

export function useAnnualLeaveLedger(year: number, month: number) {
  const [rows, setRows] = useState<AnnualLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;

    const [{ data: emp }, { data: alloc }, { data: usedShifts }] = await Promise.all([
      supabase.from("employees").select("id, name, sort_order").eq("active", true).order("sort_order"),
      supabase
        .from("annual_leave_allocation")
        .select("employee_id, allocated_hours")
        .eq("year", year),
      supabase
        .from("shift_leave_usage")
        .select("employee_id, work_date, hours")
        .eq("usage_type", "annual")
        .gte("work_date", yearStart)
        .lte("work_date", yearEnd),
    ]);

    const employees = emp ?? [];
    const allocMap = new Map<string, number>(
      (alloc ?? []).map((a) => [a.employee_id, Number(a.allocated_hours)])
    );

    const usedTotalMap = new Map<string, number>();
    const usedDatesMap = new Map<string, number[]>();
    for (const s of usedShifts ?? []) {
      usedTotalMap.set(
        s.employee_id,
        (usedTotalMap.get(s.employee_id) ?? 0) + Number(s.hours ?? 0)
      );
      if (s.work_date.startsWith(monthPrefix)) {
        const arr = usedDatesMap.get(s.employee_id) ?? [];
        arr.push(Number(s.work_date.slice(8, 10)));
        usedDatesMap.set(s.employee_id, arr);
      }
    }

    const result: AnnualLeaveRow[] = employees.map((e) => {
      const allocatedHours = allocMap.get(e.id) ?? 0;
      const usedHoursYear = usedTotalMap.get(e.id) ?? 0;
      const remainingHours = allocatedHours - usedHoursYear;
      return {
        employeeId: e.id,
        employeeName: e.name,
        sortOrder: e.sort_order,
        allocatedHours,
        usedHoursYear,
        usedDatesThisMonth: (usedDatesMap.get(e.id) ?? []).sort((a, b) => a - b),
        remainingHours,
        remainingDaysLabel: formatRemainingDays(remainingHours),
      };
    });

    setRows(result);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`annual-leave-ledger-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "annual_leave_allocation" },
        () => {
          fetchData();
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_leave_usage" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const setAllocatedHours = useCallback(
    async (employeeId: string, targetYear: number, hours: number) => {
      const { error } = await supabase
        .from("annual_leave_allocation")
        .upsert(
          { employee_id: employeeId, year: targetYear, allocated_hours: hours },
          { onConflict: "employee_id,year" }
        );
      await fetchData();
      return { error };
    },
    [fetchData]
  );

  return { rows, loading, setAllocatedHours };
}
